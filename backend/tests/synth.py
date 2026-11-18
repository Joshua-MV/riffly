"""Synthesise licence-free test audio with exactly known chords and tempo.

Each chord is strummed on every beat with harmonic-rich decaying tones, over a kick on
every beat and a noisy hi-hat on off-beats. Ground truth is therefore known exactly.
"""

from __future__ import annotations

import numpy as np

SR = 22050
NOTE_INDEX = {"C": 0, "C#": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "Ab": 8,
              "A": 9, "Bb": 10, "B": 11}


QUALITY_INTERVALS = {
    "": [0, 4, 7], "m": [0, 3, 7], "7": [0, 4, 7, 10], "maj7": [0, 4, 7, 11], "m7": [0, 3, 7, 10],
    "sus2": [0, 2, 7], "sus4": [0, 5, 7], "add9": [0, 4, 7, 14], "5": [0, 7, 12], "dim": [0, 3, 6],
}


def parse_chord(label: str) -> tuple[int, list[int], int]:
    """'C#m7/G#' -> (root pc, intervals, bass pc)."""
    main, _, bass_name = label.partition("/")
    name = main[:2] if len(main) > 1 and main[1] in "#b" else main[:1]
    root = NOTE_INDEX[name]
    intervals = QUALITY_INTERVALS[main[len(name):]]
    bass = NOTE_INDEX[bass_name] if bass_name else root
    return root, intervals, bass


def midi_to_hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def _tone(freq: float, n: int, rng: np.random.Generator) -> np.ndarray:
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, 7):
        if freq * k > SR / 2:
            break
        out += (0.8 ** (k - 1)) * np.sin(2 * np.pi * freq * k * t + rng.uniform(0, 2 * np.pi))
    return out * np.exp(-t * 2.5)


def render_progression(
    chords: list[str], bpm: float = 120.0, beats_per_chord: int = 4, repeats: int = 3,
    seed: int = 7, melody: bool = False, drone: int | None = None,
) -> tuple[np.ndarray, list[tuple[float, float, str]]]:
    """Strummed chords over a kick and hi-hat.

    melody: add a vocal-like line (vibrato, chord tones and passing notes) on top.
    drone:  pitch class of a high open string left ringing through every chord, as in
            guitar parts that keep strings open across changes (common in rock/pop).
    """
    rng = np.random.default_rng(seed)
    beat = 60.0 / bpm
    total_beats = len(chords) * beats_per_chord * repeats
    n_total = int((total_beats * beat + 1.0) * SR)
    y = np.zeros(n_total)
    truth: list[tuple[float, float, str]] = []
    beat_samples = int(beat * SR)

    for b in range(total_beats):
        label = chords[(b // beats_per_chord) % len(chords)]
        start = int(b * beat * SR)
        if b % beats_per_chord == 0:
            truth.append((b * beat, (b + beats_per_chord) * beat, label))
        root, intervals, bass_pc = parse_chord(label)
        bass = 36 + bass_pc  # MIDI 36 = C2, so bass spans C2..B2
        voicing = [bass, 48 + root] + [52 + ((root + iv - 4) % 12) + (12 if iv >= 12 else 0) for iv in intervals]
        if drone is not None:
            voicing.append(64 + ((drone - 4) % 12))  # around the top strings
        n = min(beat_samples * 2, n_total - start)
        strum = sum(_tone(midi_to_hz(m), n, rng) for m in voicing)
        y[start : start + n] += 0.15 * strum
        if melody:
            # One sung note per beat: mostly chord tones, sometimes a passing note, with vibrato.
            pool = [(root + iv) % 12 for iv in intervals] + [(root + 2) % 12, (root + 9) % 12]
            pc = pool[rng.integers(len(pool))]
            f = midi_to_hz(67 + ((pc - 7) % 12))
            tm = np.arange(beat_samples) / SR
            m = min(beat_samples, n_total - start)
            vib = 0.004 * np.sin(2 * np.pi * 5.5 * tm[:m])
            env = np.minimum(1, tm[:m] / 0.05) * np.exp(-tm[:m] * 0.8)
            y[start : start + m] += 0.22 * env * sum((0.6 ** (k - 1)) * np.sin(2 * np.pi * f * k * tm[:m] * (1 + vib)) for k in range(1, 5))
        # Kick: decaying 55 Hz sine on every beat.
        kn = min(int(0.15 * SR), n_total - start)
        tk = np.arange(kn) / SR
        y[start : start + kn] += 0.6 * np.sin(2 * np.pi * 55 * tk) * np.exp(-tk * 30)
        # Hi-hat: short noise burst on the off-beat.
        off = start + beat_samples // 2
        hn = min(int(0.04 * SR), n_total - off)
        if hn > 0:
            y[off : off + hn] += 0.08 * rng.standard_normal(hn) * np.exp(-np.arange(hn) / 200)

    y /= np.abs(y).max()
    return y.astype(np.float32), truth


def overlap_accuracy(
    predicted: list[dict], truth: list[tuple[float, float, str]], step: float = 0.05
) -> float:
    """Fraction of annotated time where the predicted label equals the reference label."""
    end = truth[-1][1]
    correct = total = 0
    for t in np.arange(0, end, step):
        ref = next((lab for s, e, lab in truth if s <= t < e), None)
        if ref is None:
            continue
        pred = next((c["label"] for c in predicted if c["start"] <= t < c["end"]), "N")
        total += 1
        correct += int(pred == ref)
    return correct / total if total else 0.0
