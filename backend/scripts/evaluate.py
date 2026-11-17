"""Evaluate the chord engine against reference annotations.

Usage:
    python -m scripts.evaluate <audio_dir> <labels_dir>

Each audio file `<name>.{wav,mp3,m4a}` needs a MIREX-style `<name>.lab` reference:
    <start_seconds> <end_seconds> <label>      e.g.  "12.30 14.05 A:min"

Reports weighted chord symbol recall (WCSR) on the major/minor vocabulary: the fraction of
annotated time where the estimated root and quality match. Reference chords outside maj/min
(7ths etc.) are reduced to their triad; "N" is kept; other labels (X, sus, dim…) are skipped.
Use only audio you have the rights to.
"""

from __future__ import annotations

import sys
from pathlib import Path

from app.audio.pipeline import analyze_file
from app.audio.theory import PITCH_CLASSES

_ALIASES = {"Db": "C#", "D#": "Eb", "Gb": "F#", "G#": "Ab", "A#": "Bb", "Cb": "B", "Fb": "E", "E#": "F", "B#": "C"}
_MINOR_SHORTHANDS = {"min", "min7", "minmaj7", "min6", "min9", "min11"}
_MAJOR_SHORTHANDS = {"maj", "7", "maj7", "maj6", "9", "maj9", "11", "13", ""}


def reduce_label(label: str) -> str | None:
    """MIREX label → our majmin vocabulary ('C', 'Am', 'N'), or None if not comparable."""
    if label in {"N", "X"}:
        return "N" if label == "N" else None
    root, _, quality = label.partition(":")
    root = _ALIASES.get(root, root)
    if root not in PITCH_CLASSES:
        return None
    quality = quality.split("/")[0].split("(")[0]
    if quality in _MINOR_SHORTHANDS:
        return f"{root}m"
    if quality in _MAJOR_SHORTHANDS:
        return root
    return None


def read_lab(path: Path) -> list[tuple[float, float, str]]:
    rows = []
    for line in path.read_text().splitlines():
        parts = line.split()
        if len(parts) >= 3:
            rows.append((float(parts[0]), float(parts[1]), parts[2]))
    return rows


def wcsr(predicted: list[dict], reference: list[tuple[float, float, str]], step: float = 0.01) -> tuple[float, float]:
    """Return (correct_seconds, scored_seconds)."""
    correct = scored = 0.0
    for start, end, label in reference:
        ref = reduce_label(label)
        if ref is None:
            continue
        t = start
        while t < end:
            pred = next((c["label"] for c in predicted if c["start"] <= t < c["end"]), "N")
            scored += step
            correct += step if pred == ref else 0.0
            t += step
    return correct, scored


def main(audio_dir: Path, labels_dir: Path) -> None:
    total_correct = total_scored = 0.0
    for audio in sorted(p for p in audio_dir.iterdir() if p.suffix.lower() in {".wav", ".mp3", ".m4a"}):
        lab = labels_dir / f"{audio.stem}.lab"
        if not lab.exists():
            print(f"skip {audio.name}: no {lab.name}")
            continue
        result = analyze_file(audio)
        correct, scored = wcsr(result.chords, read_lab(lab))
        total_correct += correct
        total_scored += scored
        print(f"{audio.name:40s} WCSR {correct / scored:6.1%}  key={result.key}  bpm={result.bpm}")
    if total_scored:
        print(f"\nOverall WCSR (majmin): {total_correct / total_scored:.1%} over {total_scored / 60:.1f} min")
    else:
        print("No annotated audio found.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(Path(sys.argv[1]), Path(sys.argv[2]))
