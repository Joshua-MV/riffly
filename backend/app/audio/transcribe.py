"""Experimental note transcription for "exact" tabs.

1. Demucs `htdemucs_6s` (MIT) separates the mix into stems, including a guitar stem.
2. Spotify's Basic Pitch (Apache-2.0), run through onnxruntime, detects the notes in that stem.
3. The app places the notes on the fretboard (capo-aware) and draws them as tab.

This is genuinely experimental: on full band recordings the guitar stem still carries bleed
from other instruments, and polyphonic transcription misses or invents notes. Expect a useful
sketch to correct by ear, not a finished transcription. Both models are optional installs
(`requirements-transcribe.txt`). If they're missing, the API answers 501 with instructions.
"""

from __future__ import annotations

import importlib.util
import logging
import tempfile
import time
from pathlib import Path

import numpy as np
import soundfile as sf

log = logging.getLogger(__name__)

GUITAR_MIN_HZ = 75.0  # just below drop-D low string
GUITAR_MAX_HZ = 1400.0  # ~ 22nd fret, high E string
MODEL_VERSION = "demucs-htdemucs_6s+basic-pitch-icassp2022"


def missing_dependencies() -> list[str]:
    return [m for m in ("basic_pitch", "onnxruntime", "demucs", "torch") if importlib.util.find_spec(m) is None]


def available() -> bool:
    return not missing_dependencies()


def separate_guitar(path: Path, out_wav: Path) -> str:
    """Write the guitar stem to `out_wav`. Returns the source label used."""
    import torch
    from demucs.apply import apply_model
    from demucs.audio import convert_audio
    from demucs.pretrained import get_model
    import librosa

    model = get_model("htdemucs_6s")
    model.eval()
    y, sr = librosa.load(str(path), sr=None, mono=False)
    wav = torch.from_numpy(np.atleast_2d(y).astype(np.float32))
    wav = convert_audio(wav, sr, model.samplerate, model.audio_channels)
    ref = wav.mean(0)
    mean, std = ref.mean(), ref.std() + 1e-8
    with torch.no_grad():
        sources = apply_model(model, ((wav - mean) / std)[None], device="cpu", split=True, overlap=0.1, progress=False)[0]
    sources = sources * std + mean
    stem = sources[model.sources.index("guitar")].mean(0).numpy()
    # If the guitar stem is nearly silent (no guitar, or it was put in "other"), use "other".
    if np.sqrt(np.mean(stem**2)) < 1e-3 and "other" in model.sources:
        stem = sources[model.sources.index("other")].mean(0).numpy()
        sf.write(out_wav, stem, model.samplerate)
        return "other-stem"
    sf.write(out_wav, stem, model.samplerate)
    return "guitar-stem"


def detect_notes(path: Path) -> list[dict]:
    from basic_pitch import ICASSP_2022_MODEL_PATH
    from basic_pitch.inference import predict

    _, _, events = predict(
        str(path),
        ICASSP_2022_MODEL_PATH,
        onset_threshold=0.55,
        frame_threshold=0.3,
        minimum_note_length=80,  # ms
        minimum_frequency=GUITAR_MIN_HZ,
        maximum_frequency=GUITAR_MAX_HZ,
        melodia_trick=True,
    )
    notes = [
        {"start": round(float(s), 3), "end": round(float(e), 3), "midi": int(p), "velocity": round(float(a), 3)}
        for s, e, p, a, *_ in events
        if 38 <= int(p) <= 88  # D2 … E6: playable on a 6-string guitar
    ]
    notes.sort(key=lambda n: (n["start"], n["midi"]))
    return notes


def transcribe_file(path: Path, *, separate: bool = True) -> dict:
    missing = missing_dependencies()
    if missing:
        raise RuntimeError(f"Transcription is not installed on this server (missing: {', '.join(missing)}).")
    started = time.perf_counter()
    with tempfile.TemporaryDirectory() as tmp:
        source = "full-mix"
        target = path
        if separate:
            stem = Path(tmp) / "guitar.wav"
            source = separate_guitar(path, stem)
            target = stem
        notes = detect_notes(target)
    elapsed = time.perf_counter() - started
    log.info("transcribed %s: %d notes in %.1fs (%s)", path.name, len(notes), elapsed, source)
    return {"notes": notes, "source": source, "model_version": MODEL_VERSION, "processing_seconds": round(elapsed, 1)}
