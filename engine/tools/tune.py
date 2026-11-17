"""Evaluate engine parameter combinations on synthetic songs with exact ground truth.

Usage (from backend/ with its venv):  python ..\\engine\\tools\\tune.py
Runs riffly_cli.exe with RIFFLY_* overrides and reports mean/min chord accuracy and the worst
chord-boundary error. Only used to pick defaults; the shipped engine reads no environment.
"""
import io
import itertools
import json
import os
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "backend"))
from tests.synth import SR, overlap_accuracy, render_progression  # noqa: E402

CLI = HERE.parent / "build" / "riffly_cli.exe"

SONGS = [
    (["G", "D", "Em", "C"], 120, 3, 7),
    (["G", "D", "Em", "C"], 120, 3, 11),
    (["Am", "F", "C", "G"], 96, 3, 3),
    (["C", "G", "Am", "F"], 110, 3, 5),
    (["G", "D", "Em", "C", "Am", "F", "C", "G"], 112, 6, 7),
    (["E", "A", "B", "C#m"], 140, 4, 9),
    (["Dm", "Bb", "F", "C"], 84, 3, 13),
]


def write_wav(y):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype("<i2").tobytes())
    p = Path(tempfile.mkdtemp()) / "s.wav"
    p.write_bytes(buf.getvalue())
    return p


cases = []
for chords, bpm, reps, seed in SONGS:
    y, truth = render_progression(chords, bpm=bpm, repeats=reps, seed=seed)
    cases.append((write_wav(y), truth))

grid = {
    "RIFFLY_CHROMA_FFT": ["16384", "8192"],
    "RIFFLY_REFINE": ["0", "1", "2"],
    "RIFFLY_SNAP": ["0.12", "0.25"],
}
for combo in itertools.product(*grid.values()):
    env = dict(os.environ, **dict(zip(grid.keys(), combo)))
    accs, worst = [], 0.0
    for path, truth in cases:
        r = json.loads(subprocess.run([str(CLI), str(path)], capture_output=True, env=env).stdout)
        accs.append(overlap_accuracy(r["chords"], truth))
        starts = [c["start"] for c in r["chords"] if c["label"] != "N"]
        for t0, _, _ in truth[1:]:
            worst = max(worst, min(abs(s - t0) for s in starts))
    print(f"{' '.join(combo):22s} mean {np.mean(accs):.1%}  min {min(accs):.1%}  worst boundary {worst:.2f}s")
