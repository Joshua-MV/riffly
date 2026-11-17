"""Transcription API wiring, plus a real end-to-end run when the optional models are installed."""

from __future__ import annotations

import time

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.audio import transcribe
from app.config import Settings
from app.main import create_app

from .synth import SR
from .test_api import _wav_bytes


def _melody(midis: list[int], note_s: float = 0.5) -> np.ndarray:
    """Plucked-string-like single notes (harmonics + decay) with exact pitches."""
    out = []
    for m in midis:
        f = 440 * 2 ** ((m - 69) / 12)
        t = np.arange(int(note_s * SR)) / SR
        tone = sum((0.7 ** (k - 1)) * np.sin(2 * np.pi * f * k * t) for k in range(1, 6))
        out.append(0.3 * tone * np.exp(-t * 4))
    y = np.concatenate(out + [np.zeros(SR // 2)])
    return (y / np.abs(y).max() * 0.8).astype(np.float32)


@pytest.fixture()
def client(tmp_path):
    settings = Settings(app_env="test", work_dir=tmp_path / "work", analysis_executor="thread", analysis_workers=1)
    with TestClient(create_app(settings)) as c:
        yield c


def _wait(client, job_id, timeout=900):
    deadline = time.time() + timeout
    while time.time() < deadline:
        body = client.get(f"/api/transcriptions/{job_id}").json()
        if body["status"] != "processing":
            return body
        time.sleep(0.5)
    raise TimeoutError


def test_reports_missing_dependencies(client, monkeypatch):
    monkeypatch.setattr(transcribe, "missing_dependencies", lambda: ["torch"])
    res = client.post("/api/transcriptions", files={"file": ("a.wav", _wav_bytes(_melody([60])), "audio/wav")})
    assert res.status_code == 501
    assert "requirements-transcribe.txt" in res.json()["detail"]
    assert client.get("/api/health").json()["transcription_available"] in (True, False)


def test_job_lifecycle_with_stubbed_models(client, monkeypatch):
    monkeypatch.setattr(transcribe, "missing_dependencies", lambda: [])
    fake = {"notes": [{"start": 0.0, "end": 0.4, "midi": 64, "velocity": 0.8}], "source": "guitar-stem",
            "model_version": "stub", "processing_seconds": 0.1}
    monkeypatch.setattr(transcribe, "transcribe_file", lambda path, separate=True: fake)
    job = client.post("/api/transcriptions", files={"file": ("a.wav", _wav_bytes(_melody([64])), "audio/wav")}).json()
    done = _wait(client, job["id"])
    assert done["status"] == "completed" and done["result"]["notes"][0]["midi"] == 64
    # Analysis and transcription jobs are separate namespaces.
    assert client.get(f"/api/analyses/{job['id']}").status_code == 404
    assert client.delete(f"/api/transcriptions/{job['id']}").status_code == 204
    assert client.get(f"/api/transcriptions/{job['id']}").status_code == 404


@pytest.mark.skipif(not transcribe.available(), reason="optional transcription models not installed")
def test_real_models_transcribe_a_melody(tmp_path):
    """Basic Pitch on a clean synthesized melody (no separation) should find the pitches."""
    melody = [52, 55, 59, 64, 59, 55]  # E3 G3 B3 E4 B3 G3
    path = tmp_path / "melody.wav"
    path.write_bytes(_wav_bytes(_melody(melody)))
    result = transcribe.transcribe_file(path, separate=False)
    found = [n["midi"] for n in result["notes"]]
    hits = sum(1 for m in melody if m in found)
    assert hits >= len(melody) - 1, found
    starts = sorted(n["start"] for n in result["notes"] if n["midi"] in melody)
    assert starts[0] < 0.2
