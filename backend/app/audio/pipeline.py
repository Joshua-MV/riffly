"""End-to-end song analysis: decode → chords → beats → key → progression."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path

import librosa
import numpy as np

from .analysis import estimate_key, estimate_tempo, main_progression
from .chords import ChordRecognizer, TemplateHMMRecognizer, snap_to_beats

log = logging.getLogger(__name__)

ANALYSIS_SAMPLE_RATE = 22050
ENGINE_VERSION = "riffly-dsp-0.1.0"


class AudioDecodeError(Exception):
    """The file could not be decoded as audio."""


class AudioTooLongError(Exception):
    pass


@dataclass
class AnalysisResult:
    duration: float
    key: str | None
    key_confidence: float | None
    bpm: float | None
    bpm_confidence: float | None
    chords: list[dict]
    progression: list[str]
    beats: list[float]
    waveform: list[float]
    model_version: str
    processing_seconds: float
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return self.__dict__.copy()


def load_audio(path: Path, max_duration: float) -> tuple[np.ndarray, int]:
    try:
        duration = librosa.get_duration(path=str(path))
    except Exception as exc:  # soundfile/audioread raise many different types
        raise AudioDecodeError(_decode_hint(path, exc)) from exc
    if duration > max_duration:
        raise AudioTooLongError(
            f"Audio is {duration / 60:.1f} min long; the limit is {max_duration / 60:.0f} min."
        )
    try:
        y, sr = librosa.load(str(path), sr=ANALYSIS_SAMPLE_RATE, mono=True)
    except Exception as exc:
        raise AudioDecodeError(_decode_hint(path, exc)) from exc
    if y.size == 0:
        raise AudioDecodeError("The file contains no audio samples.")
    return y, int(sr)


def _decode_hint(path: Path, exc: Exception) -> str:
    if path.suffix.lower() in {".m4a", ".aac", ".mp4"}:
        return (
            "Could not decode this M4A/AAC file. M4A decoding requires FFmpeg on the "
            "analysis server."
        )
    return f"Could not decode audio ({type(exc).__name__})."


def waveform_peaks(y: np.ndarray, n_points: int = 600) -> list[float]:
    """Downsampled peak envelope (0..1) for drawing a waveform in the UI."""
    if y.size == 0:
        return []
    chunks = np.array_split(np.abs(y), min(n_points, y.size))
    peaks = np.array([c.max() for c in chunks])
    peak = peaks.max()
    if peak > 0:
        peaks = peaks / peak
    return [round(float(p), 3) for p in peaks]


def analyze_audio(
    y: np.ndarray, sr: int, recognizer: ChordRecognizer | None = None
) -> AnalysisResult:
    started = time.perf_counter()
    recognizer = recognizer or TemplateHMMRecognizer()
    duration = len(y) / sr
    notes: list[str] = [
        "Chords are estimated from the full mix (all instruments), not from an isolated "
        "guitar track. Voicings shown in the app are suggestions for playing along."
    ]

    segments, chroma, _ = recognizer.recognize(y, sr)
    tempo = estimate_tempo(y, sr)
    if tempo is not None:
        segments = snap_to_beats(segments, tempo.beats)
    else:
        notes.append("No steady beat was detected; tempo is unavailable.")
    key = estimate_key(chroma, segments)

    chords = [
        {
            "start": round(s.start, 3),
            "end": round(s.end, 3),
            "label": s.label,
            "root": s.root,
            "quality": s.quality,
            "confidence": round(s.confidence, 3),
        }
        for s in segments
    ]
    elapsed = time.perf_counter() - started
    log.info("analysed %.1fs of audio in %.2fs (%d chord segments)", duration, elapsed, len(chords))
    return AnalysisResult(
        duration=round(duration, 3),
        key=key.name if key else None,
        key_confidence=key.confidence if key else None,
        bpm=tempo.bpm if tempo else None,
        bpm_confidence=tempo.confidence if tempo else None,
        chords=chords,
        progression=main_progression(segments),
        beats=[round(float(b), 3) for b in tempo.beats] if tempo else [],
        waveform=waveform_peaks(y),
        model_version=f"{ENGINE_VERSION}+{recognizer.name}-{recognizer.version}",
        processing_seconds=round(elapsed, 2),
        notes=notes,
    )


def analyze_file(path: Path, max_duration: float = 12 * 60) -> AnalysisResult:
    y, sr = load_audio(path, max_duration)
    return analyze_audio(y, sr)
