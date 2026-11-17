"""Small, dependency-free music-theory helpers used by the audio engine."""

from __future__ import annotations

PITCH_CLASSES = ("C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")

# Chord qualities supported by the baseline recogniser, as semitone intervals from the root.
QUALITY_INTERVALS: dict[str, tuple[int, ...]] = {
    "maj": (0, 4, 7),
    "min": (0, 3, 7),
}

QUALITY_SUFFIX = {"maj": "", "min": "m"}

NO_CHORD = "N"


def chord_name(root: int, quality: str) -> str:
    """Human-readable chord symbol, e.g. (9, 'min') -> 'Am'."""
    return f"{PITCH_CLASSES[root % 12]}{QUALITY_SUFFIX[quality]}"


def key_name(tonic: int, mode: str) -> str:
    return f"{PITCH_CLASSES[tonic % 12]} {'major' if mode == 'major' else 'minor'}"
