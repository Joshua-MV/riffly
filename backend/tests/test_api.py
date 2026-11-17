"""API integration tests: real uploads, real background analysis, user isolation."""

from __future__ import annotations

import io
import time
import wave

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.auth import CurrentUser, get_current_user
from app.config import Settings
from app.main import create_app

from .synth import SR, render_progression


def _wav_bytes(y: np.ndarray) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype("<i2").tobytes())
    return buf.getvalue()


@pytest.fixture()
def client(tmp_path):
    settings = Settings(
        app_env="test", data_dir=tmp_path, analysis_executor="thread", analysis_workers=1,
        max_upload_mb=5,
    )
    app = create_app(settings)
    with TestClient(app) as c:
        yield c


def _wait_for(client: TestClient, song_id: str, timeout: float = 120) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        body = client.get(f"/api/songs/{song_id}/analysis").json()
        if body["status"] in {"completed", "failed"}:
            return body
        time.sleep(0.25)
    raise TimeoutError("analysis did not finish")


def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_upload_analyse_correct_delete(client):
    y, _ = render_progression(["C", "G", "Am", "F"], bpm=110, repeats=2)
    res = client.post(
        "/api/songs",
        files={"file": ("demo.wav", _wav_bytes(y), "audio/wav")},
        data={"title": "Synth demo"},
    )
    assert res.status_code == 201, res.text
    song = res.json()
    assert song["title"] == "Synth demo"
    assert song["status"] in {"queued", "processing"}

    analysis = _wait_for(client, song["id"])
    assert analysis["status"] == "completed", analysis
    result = analysis["result"]
    labels = {c["label"] for c in result["chords"]}
    assert {"C", "G", "Am", "F"} <= labels
    assert result["bpm"] and abs(result["bpm"] - 110) < 4

    listed = client.get("/api/songs").json()
    assert listed[0]["key"] == result["key"]
    assert listed[0]["duration"] == pytest.approx(result["duration"])

    # Range requests are needed for seeking in browsers.
    audio = client.get(f"/api/songs/{song['id']}/audio", headers={"Range": "bytes=0-99"})
    assert audio.status_code == 206 and len(audio.content) == 100

    seg = next(c for c in result["chords"] if c["label"] != "N")
    corr = client.put(
        f"/api/songs/{song['id']}/corrections",
        json={"start": seg["start"], "original_label": seg["label"], "corrected_label": "Cmaj7"},
    )
    assert corr.status_code == 200, corr.text
    again = client.put(
        f"/api/songs/{song['id']}/corrections",
        json={"start": seg["start"], "original_label": seg["label"], "corrected_label": "C7"},
    ).json()
    detail = client.get(f"/api/songs/{song['id']}").json()
    assert [c["corrected_label"] for c in detail["corrections"]] == ["C7"]
    assert client.delete(f"/api/songs/{song['id']}/corrections/{again['id']}").status_code == 204

    fav = client.patch(f"/api/songs/{song['id']}", json={"is_favourite": True, "notes": "capo 2"})
    assert fav.json()["is_favourite"] is True and fav.json()["notes"] == "capo 2"

    assert client.delete(f"/api/songs/{song['id']}").status_code == 204
    assert client.get(f"/api/songs/{song['id']}").status_code == 404


def test_rejects_non_audio(client):
    res = client.post("/api/songs", files={"file": ("x.mp3", b"<html>not audio</html>", "audio/mpeg")})
    assert res.status_code == 415


def test_rejects_oversized_upload(client):
    big = b"RIFF\x00\x00\x00\x00WAVEfmt " + b"\x00" * (6 * 1024 * 1024)
    res = client.post("/api/songs", files={"file": ("big.wav", big, "audio/wav")})
    assert res.status_code == 413


def test_corrupt_audio_fails_cleanly(client):
    fake = b"RIFF\x24\x00\x00\x00WAVEfmt " + b"\x00" * 64
    song = client.post("/api/songs", files={"file": ("bad.wav", fake, "audio/wav")}).json()
    analysis = _wait_for(client, song["id"])
    assert analysis["status"] == "failed"
    assert "decode" in analysis["error"].lower()


def test_users_cannot_see_each_others_songs(client):
    y, _ = render_progression(["C", "G"], repeats=1)
    owner = CurrentUser(id="user-a")
    intruder = CurrentUser(id="user-b")
    app = client.app
    app.dependency_overrides[get_current_user] = lambda: owner
    song = client.post(
        "/api/songs", files={"file": ("a.wav", _wav_bytes(y), "audio/wav")}, data={"analyze": "false"}
    ).json()
    app.dependency_overrides[get_current_user] = lambda: intruder
    assert client.get(f"/api/songs/{song['id']}").status_code == 404
    assert client.get(f"/api/songs/{song['id']}/audio").status_code == 404
    assert client.delete(f"/api/songs/{song['id']}").status_code == 404
    assert client.get("/api/songs").json() == []
    app.dependency_overrides.pop(get_current_user)
