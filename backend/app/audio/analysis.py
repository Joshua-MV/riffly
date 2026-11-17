"""Key, tempo and progression estimation helpers."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

import librosa
import numpy as np

from .chords import ChordSegment
from .theory import NO_CHORD, QUALITY_INTERVALS, key_name

# Krumhansl–Kessler key profiles (Krumhansl 1990).
_KK_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_KK_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


@dataclass(frozen=True)
class KeyEstimate:
    tonic: int
    mode: str  # "major" | "minor"
    name: str
    confidence: float  # 0..1


@dataclass(frozen=True)
class TempoEstimate:
    bpm: float
    beats: np.ndarray  # beat times in seconds
    confidence: float  # 0..1 — regularity of the tracked beat grid


def _unit(v: np.ndarray) -> np.ndarray:
    total = v.sum()
    return v / total if total > 0 else v


def chord_pitch_profile(segments: list[ChordSegment]) -> np.ndarray:
    """Duration-weighted pitch-class histogram of detected chord tones (root counted double)."""
    profile = np.zeros(12)
    for seg in segments:
        if seg.label == NO_CHORD or seg.root is None or seg.quality is None:
            continue
        dur = seg.end - seg.start
        for i, interval in enumerate(QUALITY_INTERVALS[seg.quality]):
            profile[(seg.root + interval) % 12] += dur * (2.0 if i == 0 else 1.0)
    return profile


def estimate_key(chroma: np.ndarray, segments: list[ChordSegment]) -> KeyEstimate | None:
    """Correlate a pitch-class profile with the 24 Krumhansl–Kessler key profiles.

    The profile blends average chroma (what is sounding) with the detected chord tones (what
    the harmony implies), which is more robust than either alone on melody-heavy mixes.
    """
    if chroma.size == 0:
        return None
    profile = 0.5 * _unit(chroma.mean(axis=1)) + 0.5 * _unit(chord_pitch_profile(segments))
    if not np.any(profile):
        return None
    scores: list[tuple[float, int, str]] = []
    for tonic in range(12):
        for mode, template in (("major", _KK_MAJOR), ("minor", _KK_MINOR)):
            r = float(np.corrcoef(profile, np.roll(template, tonic))[0, 1])
            scores.append((r, tonic, mode))
    scores.sort(reverse=True)
    best, runner_up = scores[0], scores[1]
    # Confidence: correlation strength, discounted when the runner-up is nearly as good.
    margin = max(0.0, best[0] - runner_up[0])
    confidence = float(np.clip(best[0], 0, 1) * np.clip(0.5 + margin * 5, 0, 1))
    return KeyEstimate(best[1], best[2], key_name(best[1], best[2]), round(confidence, 3))


def estimate_tempo(y: np.ndarray, sr: int, hop_length: int = 512) -> TempoEstimate | None:
    y_perc = librosa.effects.percussive(y, margin=1.0)
    onset_env = librosa.onset.onset_strength(y=y_perc, sr=sr, hop_length=hop_length)
    _, beats = librosa.beat.beat_track(
        onset_envelope=onset_env, sr=sr, hop_length=hop_length, units="time"
    )
    beats = np.asarray(beats, dtype=float)
    if beats.size < 4:
        return None
    intervals = np.diff(beats)
    # Trimmed mean of inter-beat intervals: far finer than the tempogram's lag resolution.
    lo, hi = np.percentile(intervals, [10, 90])
    core = intervals[(intervals >= lo) & (intervals <= hi)]
    period = float(core.mean()) if core.size else float(intervals.mean())
    bpm = 60.0 / period
    cv = float(intervals.std() / intervals.mean())
    confidence = float(np.clip(1.0 - cv * 4, 0, 1))
    return TempoEstimate(round(bpm, 1), beats, round(confidence, 3))


def main_progression(segments: list[ChordSegment], max_len: int = 8) -> list[str]:
    """Find the chord loop that covers the most of the song.

    Collapses repeated labels, then scores every n-gram (n = 2..max_len) by
    occurrences × length. Falls back to the first distinct chords when nothing repeats.
    """
    seq: list[str] = []
    for seg in segments:
        if seg.label != NO_CHORD and (not seq or seq[-1] != seg.label):
            seq.append(seg.label)
    if not seq:
        return []
    best: tuple[float, list[str]] = (0.0, [])
    for n in range(2, min(max_len, len(seq) // 2) + 1):
        grams = Counter(tuple(seq[i : i + n]) for i in range(len(seq) - n + 1))
        gram, count = grams.most_common(1)[0]
        # Prefer loops that do not repeat a chord internally (e.g. G D Em C over G D G D).
        distinct = len(set(gram)) / n
        score = count * n * distinct
        if count >= 2 and score > best[0]:
            best = (score, list(gram))
    if best[1]:
        return best[1]
    distinct_order: list[str] = []
    for label in seq:
        if label not in distinct_order:
            distinct_order.append(label)
    return distinct_order[:4]
