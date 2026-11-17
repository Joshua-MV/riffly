"""API integration tests: real uploads, real background analysis + MP3 conversion, cleanup."""

from __future__ import annotations

import io
import time
import wave

import numpy as np
import pytest
from fastapi.testclient import TestClient

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


def _settings(tmp_path, **kw) -> Settings:
    base = dict(
        app_env="test", work_dir=tmp_path / "work", analysis_executor="thread",
        analysis_workers=1, max_upload_mb=5,
    )
    return Settings(**{**base, **kw})


@pytest.fixture()
def client(tmp_path):
    with TestClient(create_app(_settings(tmp_path))) as c:
        yield c


def _wait_for(client: TestClient, job_id: str, timeout: float = 120) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        body = client.get(f"/api/analyses/{job_id}").json()
        if body["status"] in {"completed", "failed"}:
            return body
        time.sleep(0.2)
    raise TimeoutError("analysis did not finish")


def _is_mp3(data: bytes) -> bool:
    return data[:3] == b"ID3" or (data[0] == 0xFF and (data[1] & 0xE0) == 0xE0)


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok" and body["api_key_required"] is False


def test_wav_is_analysed_converted_to_mp3_and_forgotten(client, tmp_path):
    y, _ = render_progression(["C", "G", "Am", "F"], bpm=110, repeats=2)
    res = client.post("/api/analyses", files={"file": ("demo.wav", _wav_bytes(y), "audio/wav")}, data={"title": "Synth demo"})
    assert res.status_code == 202, res.text
    job = res.json()
    assert job["status"] == "processing" and job["title"] == "Synth demo"

    done = _wait_for(client, job["id"])
    assert done["status"] == "completed", done
    result = done["result"]
    assert {"C", "G", "Am", "F"} <= {c["label"] for c in result["chords"]}
    assert result["bpm"] and abs(result["bpm"] - 110) < 4
    assert done["audio_url"] and done["audio_bytes"] > 0

    audio = client.get(f"/api/analyses/{job['id']}/audio")
    assert audio.status_code == 200
    assert audio.headers["content-type"] == "audio/mpeg"
    assert "Synth%20demo.mp3" in audio.headers["content-disposition"]
    assert _is_mp3(audio.content)
    # 192 kbps MP3 is much smaller than 16-bit WAV.
    assert len(audio.content) < len(_wav_bytes(y)) / 2

    # The upload itself is deleted as soon as processing ends; only the MP3 remains.
    folder = tmp_path / "work" / job["id"]
    assert [p.name for p in folder.iterdir()] == ["audio.mp3"]

    assert client.delete(f"/api/analyses/{job['id']}").status_code == 204
    assert not folder.exists()
    assert client.get(f"/api/analyses/{job['id']}").status_code == 404


def test_mp3_upload_is_passed_through_unchanged(client):
    from app.audio.mp3 import encode_mp3

    y, _ = render_progression(["G", "D"], repeats=1)
    mp3 = encode_mp3(y, SR)
    job = client.post("/api/analyses", files={"file": ("song.mp3", mp3, "audio/mpeg")}).json()
    done = _wait_for(client, job["id"])
    assert done["status"] == "completed", done
    assert client.get(f"/api/analyses/{job['id']}/audio").content == mp3


def test_rejects_non_audio(client, tmp_path):
    res = client.post("/api/analyses", files={"file": ("x.mp3", b"<html>not audio</html>", "audio/mpeg")})
    assert res.status_code == 415
    assert list((tmp_path / "work").iterdir()) == []  # nothing left behind


def test_rejects_oversized_upload(client, tmp_path):
    big = b"RIFF\x00\x00\x00\x00WAVEfmt " + b"\x00" * (6 * 1024 * 1024)
    assert client.post("/api/analyses", files={"file": ("big.wav", big, "audio/wav")}).status_code == 413
    assert list((tmp_path / "work").iterdir()) == []


def test_corrupt_audio_fails_cleanly(client):
    fake = b"RIFF\x24\x00\x00\x00WAVEfmt " + b"\x00" * 64
    job = client.post("/api/analyses", files={"file": ("bad.wav", fake, "audio/wav")}).json()
    done = _wait_for(client, job["id"])
    assert done["status"] == "failed"
    assert "decode" in done["error"].lower()
    assert done["audio_url"] is None


def test_jobs_expire(tmp_path):
    with TestClient(create_app(_settings(tmp_path, job_ttl_minutes=0))) as c:
        y, _ = render_progression(["C", "G"], repeats=1)
        job = c.post("/api/analyses", files={"file": ("a.wav", _wav_bytes(y), "audio/wav")}).json()
        time.sleep(0.05)
        deadline = time.time() + 60
        while c.get(f"/api/analyses/{job['id']}").status_code == 200 and time.time() < deadline:
            time.sleep(0.2)
        assert c.get(f"/api/analyses/{job['id']}").status_code == 404


def test_api_key_is_enforced_when_configured(tmp_path):
    with TestClient(create_app(_settings(tmp_path, api_key="s3cret"))) as c:
        assert c.get("/api/analyses/x").status_code == 401
        assert c.get("/api/analyses/x", headers={"X-API-Key": "wrong"}).status_code == 401
        assert c.get("/api/analyses/x", headers={"X-API-Key": "s3cret"}).status_code == 404
        assert c.get("/api/health").status_code == 200


def test_workers_start_on_demand_and_stop_when_idle(tmp_path):
    app = create_app(_settings(tmp_path, worker_idle_seconds=1))
    with TestClient(app) as c:
        store = app.state.jobs
        assert not store.executor_running  # nothing loaded until a song arrives
        y, _ = render_progression(["C", "G"], repeats=1)
        job = c.post("/api/analyses", files={"file": ("a.wav", _wav_bytes(y), "audio/wav")}).json()
        assert store.executor_running
        assert _wait_for(c, job["id"])["status"] == "completed"
        deadline = time.time() + 10
        while store.executor_running and time.time() < deadline:
            time.sleep(0.1)
        assert not store.executor_running  # memory released after the idle period


def test_serves_built_web_app_with_spa_fallback(tmp_path):
    dist = tmp_path / "dist"
    (dist / "_expo").mkdir(parents=True)
    (dist / "index.html").write_text("<html>riffly</html>")
    (dist / "_expo" / "app.js").write_text("console.log(1)")
    with TestClient(create_app(_settings(tmp_path, app_dir=dist))) as c:
        assert c.get("/").text == "<html>riffly</html>"
        assert c.get("/song/abc").text == "<html>riffly</html>"  # client-side route
        assert c.get("/_expo/app.js").text == "console.log(1)"
        assert c.get("/../secrets.txt").text == "<html>riffly</html>"  # no path escape
        assert c.get("/api/nope").status_code == 404
        assert c.get("/api/health").json()["status"] == "ok"


def test_state_is_wiped_on_startup(tmp_path):
    leftover = tmp_path / "work" / "old-job"
    leftover.mkdir(parents=True)
    (leftover / "audio.mp3").write_bytes(b"x")
    with TestClient(create_app(_settings(tmp_path))):
        assert not leftover.exists()
