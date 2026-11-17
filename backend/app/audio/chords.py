"""Chord recognition.

Baseline recogniser (``TemplateHMMRecognizer``):

1. Harmonic/percussive source separation keeps the harmonic part (drums smear chroma).
2. A constant-Q transform (36 bins/octave, tuning-corrected) is folded into a 12-bin chroma.
3. Log compression + temporal median filtering stabilise the chroma.
4. Each frame is scored against major/minor chord templates (cosine similarity) and a
   "no chord" state, converted into per-frame state probabilities.
5. An HMM with a self-loop transition matrix is decoded with Viterbi, which removes
   implausibly fast chord flicker.

This is a classical MIR approach (see Fujishima 1999; Bello & Pickens 2005; Mauch 2010). On
real mixed recordings it typically reaches ~60–75 % weighted chord symbol recall on a
major/minor vocabulary. It estimates the harmony of the *whole mix*; it does not isolate the
guitar part. Any recogniser implementing :class:`ChordRecognizer` can replace it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import librosa
import numpy as np
from scipy.ndimage import median_filter

from .theory import NO_CHORD, QUALITY_INTERVALS, chord_name


@dataclass(frozen=True)
class ChordSegment:
    start: float
    end: float
    label: str  # e.g. "Am", or "N" for no chord
    root: int | None  # pitch class 0-11, None for "N"
    quality: str | None  # "maj" | "min" | None
    confidence: float  # 0..1, mean posterior of the chosen state over the segment


@dataclass(frozen=True)
class ChordStates:
    labels: list[str]
    roots: list[int | None]
    qualities: list[str | None]
    templates: np.ndarray  # (n_chord_states, 12), L2-normalised


class ChordRecognizer(Protocol):
    name: str
    version: str

    def recognize(self, y: np.ndarray, sr: int) -> tuple[list[ChordSegment], np.ndarray, float]:
        """Return (segments, chroma (12, n_frames), frame duration in seconds)."""
        ...


def build_chord_states() -> ChordStates:
    labels: list[str] = []
    roots: list[int | None] = []
    qualities: list[str | None] = []
    rows: list[np.ndarray] = []
    for quality, intervals in QUALITY_INTERVALS.items():
        for root in range(12):
            vec = np.zeros(12)
            for i, interval in enumerate(intervals):
                # Root slightly emphasised: it is usually the strongest chord tone (and the bass).
                vec[(root + interval) % 12] = 1.0 if i else 1.2
            rows.append(vec / np.linalg.norm(vec))
            labels.append(chord_name(root, quality))
            roots.append(root)
            qualities.append(quality)
    return ChordStates(labels, roots, qualities, np.vstack(rows))


class TemplateHMMRecognizer:
    name = "template-hmm"
    version = "0.1.0"

    def __init__(
        self,
        hop_length: int = 2048,
        sharpness: float = 18.0,
        no_chord_similarity: float = 0.55,
        self_transition: float = 0.97,
        silence_ratio: float = 0.03,
    ) -> None:
        self.hop_length = hop_length
        self.sharpness = sharpness
        self.no_chord_similarity = no_chord_similarity
        self.self_transition = self_transition
        self.silence_ratio = silence_ratio
        self.states = build_chord_states()

    # -- feature extraction -------------------------------------------------------------
    def chroma(self, y: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
        """Return (L2-normalised chroma (12, T), per-frame energy (T,))."""
        y_harm = librosa.effects.harmonic(y, margin=2.0)
        tuning = float(librosa.estimate_tuning(y=y_harm, sr=sr, bins_per_octave=36))
        cqt = np.abs(
            librosa.cqt(
                y_harm,
                sr=sr,
                hop_length=self.hop_length,
                fmin=librosa.note_to_hz("C2"),
                n_bins=36 * 6,
                bins_per_octave=36,
                tuning=tuning,
            )
        )
        chroma = librosa.feature.chroma_cqt(C=cqt, sr=sr, bins_per_octave=36, norm=None)
        chroma = np.log1p(100.0 * chroma / (chroma.max() + 1e-9))
        chroma = median_filter(chroma, size=(1, 9), mode="nearest")
        energy = chroma.sum(axis=0)
        norms = np.linalg.norm(chroma, axis=0, keepdims=True)
        return chroma / np.maximum(norms, 1e-9), energy

    # -- decoding ----------------------------------------------------------------------
    def state_probabilities(self, chroma: np.ndarray, energy: np.ndarray) -> np.ndarray:
        """Per-frame posterior over [chord states..., N] — shape (n_states + 1, T)."""
        sims = self.states.templates @ chroma  # (24, T) cosine similarity
        no_chord = np.full((1, sims.shape[1]), self.no_chord_similarity)
        quiet = energy < self.silence_ratio * np.percentile(energy, 95) if energy.size else energy
        no_chord[0, quiet] = 2.0  # silence -> overwhelmingly "no chord"
        logits = self.sharpness * np.vstack([sims, no_chord])
        logits -= logits.max(axis=0, keepdims=True)
        probs = np.exp(logits)
        return probs / probs.sum(axis=0, keepdims=True)

    def recognize(self, y: np.ndarray, sr: int) -> tuple[list[ChordSegment], np.ndarray, float]:
        chroma, energy = self.chroma(y, sr)
        frame_dur = self.hop_length / sr
        if chroma.shape[1] == 0:
            return [], chroma, frame_dur
        probs = self.state_probabilities(chroma, energy)
        n_states = probs.shape[0]
        transition = librosa.sequence.transition_loop(n_states, self.self_transition)
        path = librosa.sequence.viterbi(probs, transition)
        return self._segments(path, probs, frame_dur, len(y) / sr), chroma, frame_dur

    def _segments(
        self, path: np.ndarray, probs: np.ndarray, frame_dur: float, duration: float
    ) -> list[ChordSegment]:
        n_chord_states = len(self.states.labels)
        segments: list[ChordSegment] = []
        start = 0
        for i in range(1, len(path) + 1):
            if i < len(path) and path[i] == path[start]:
                continue
            state = int(path[start])
            conf = float(probs[state, start:i].mean())
            t0 = start * frame_dur
            t1 = min(i * frame_dur, duration) if i < len(path) else duration
            if state == n_chord_states:
                segments.append(ChordSegment(t0, t1, NO_CHORD, None, None, conf))
            else:
                segments.append(
                    ChordSegment(
                        t0,
                        t1,
                        self.states.labels[state],
                        self.states.roots[state],
                        self.states.qualities[state],
                        conf,
                    )
                )
            start = i
        return segments


def snap_to_beats(
    segments: list[ChordSegment], beat_times: np.ndarray, tolerance: float = 0.25
) -> list[ChordSegment]:
    """Move chord boundaries onto the nearest beat when one is within ``tolerance`` seconds.

    Chord changes in popular music overwhelmingly land on beats; frame-level boundaries
    are ~0.1 s jittery. Segments that collapse to zero length are dropped and neighbours
    with the same label are merged.
    """
    if len(segments) < 2 or beat_times.size == 0:
        return segments
    snapped: list[ChordSegment] = []
    prev_end = segments[0].start
    for seg in segments:
        end = seg.end
        if seg is not segments[-1]:
            idx = int(np.argmin(np.abs(beat_times - end)))
            if abs(beat_times[idx] - end) <= tolerance:
                end = float(beat_times[idx])
        if end - prev_end <= 1e-6:
            continue
        candidate = ChordSegment(prev_end, end, seg.label, seg.root, seg.quality, seg.confidence)
        if snapped and snapped[-1].label == candidate.label:
            last = snapped[-1]
            total = (last.end - last.start) + (candidate.end - candidate.start)
            conf = (
                last.confidence * (last.end - last.start)
                + candidate.confidence * (candidate.end - candidate.start)
            ) / total
            snapped[-1] = ChordSegment(last.start, end, last.label, last.root, last.quality, conf)
        else:
            snapped.append(candidate)
        prev_end = end
    return snapped
