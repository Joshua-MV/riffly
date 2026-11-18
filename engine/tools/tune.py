"""Evaluate engine parameter settings.

Usage (from backend/ with its venv):  python ..\\engine\\tools\\tune.py [--real]

Synthetic songs have exact ground truth. Scores:
  exact  - time where the label matches exactly (G/B must be G/B, Cadd9 must be Cadd9)
  root   - time where the chord's root matches (G and G/B and Gsus4 all count)
With --real, also scores songs from the Windows app's library that have a known chord set in
REAL_SONGS (the share of chord time whose label belongs to that set).
"""
import io
import itertools
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "backend"))
from tests.synth import SR, render_progression  # noqa: E402

CLI = HERE.parent / "build" / "riffly_cli.exe"

SONGS = [
    # (chords, bpm, repeats, seed, melody, drone)
    (["G", "D", "Em", "C"], 120, 3, 7, False, None),
    (["Am", "F", "C", "G"], 96, 3, 3, True, None),
    (["E", "A", "B", "C#m"], 140, 4, 9, True, None),
    (["Dm", "Bb", "F", "C"], 84, 3, 13, False, None),
    (["G", "D/F#", "Em", "C"], 110, 3, 21, True, None),
    (["Cadd9", "G/B", "Dsus4", "G"], 116, 3, 5, True, 2),     # drone D, like open-string rock parts
    (["Csus2", "Em7", "Dsus4", "G"], 100, 3, 17, False, 7),
    (["A7", "D7", "E7", "A7"], 128, 3, 11, True, None),
    (["Fmaj7", "Em7", "Dm7", "Cmaj7"], 90, 3, 19, True, None),
]

# Real songs in the user's library: the sounding chords (capo/tuning applied) they use, reduced
# to root + major/minor, with the expected tempo when known. "core" chords must each cover a
# real share of the song (catches one chord swallowing another).
REAL_SONGS = {
    # From the user: capo 1, Cadd9 G/B Dsus4 G Csus2 Em7 Dadd2/F#.
    "Goo Goo Dolls": {"set": {"C#", "Ab", "Eb", "Fm"}, "core": {"C#", "Ab", "Eb"}, "bpm": None},
    # Am G C (F, Em in the bridge) with capo 1, ~102 BPM.
    "Riptide": {"set": {"Bbm", "Ab", "C#", "F#", "Fm"}, "core": {"Bbm", "Ab", "C#"}, "bpm": 102},
    # G#m E B F# (vi IV I V in B).
    "Atlantis": {"set": {"Abm", "E", "B", "F#"}, "core": {"Abm", "E", "B", "F#"}, "bpm": None},
}

ROOTS = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def root_of(label: str):
    if label == "N":
        return None
    return ROOTS[label[:2]] if len(label) > 1 and label[1] in "#b" else ROOTS[label[:1]]


MINOR = ("m", "m7", "dim")


def majmin(label: str):
    """'Bbm7' -> 'Bbm', 'C#add9/F' -> 'C#', 'Ebsus4' -> 'Eb'."""
    if label == "N":
        return "N"
    base = label.split("/")[0]
    r = base[:2] if len(base) > 1 and base[1] in "#b" else base[:1]
    names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
    q = base[len(r):]
    return names[ROOTS[r]] + ("m" if q.startswith("m") and not q.startswith("maj") or q == "dim" else "")


def write_wav(y):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype("<i2").tobytes())
    p = Path(tempfile.mkdtemp()) / "s.wav"
    p.write_bytes(buf.getvalue())
    return p


def score(pred, truth, step=0.05):
    exact = root = total = 0
    for t in np.arange(0, truth[-1][1], step):
        ref = next((lab for s, e, lab in truth if s <= t < e), None)
        if ref is None:
            continue
        p = next((c["label"] for c in pred if c["start"] <= t < c["end"]), "N")
        total += 1
        exact += p == ref
        root += root_of(p) == root_of(ref)
    return exact / total, root / total


def run(path, env):
    return json.loads(subprocess.run([str(CLI), str(path)], capture_output=True, env=env).stdout)


cases = []
for chords, bpm, reps, seed, melody, drone in SONGS:
    y, truth = render_progression(chords, bpm=bpm, repeats=reps, seed=seed, melody=melody, drone=drone)
    cases.append((write_wav(y), truth, " ".join(chords)))

real = []
if "--real" in sys.argv:
    data = Path(os.environ["APPDATA"]) / "app.riffly"
    db = sqlite3.connect(data / "riffly.db")
    for needle, info in REAL_SONGS.items():
        row = db.execute("SELECT id, title FROM songs WHERE title LIKE ?", (f"%{needle}%",)).fetchone()
        if row:
            real.append((data / "songs" / f"{row[0]}.mp3", info, needle))

# GRID="RIFFLY_A=1,2;RIFFLY_B=0.1,0.2" tries every combination.
grid = {}
for part in filter(None, os.environ.get("GRID", "").split(";")):
    k, v = part.split("=")
    grid[k] = v.split(",")
for combo in itertools.product(*grid.values()) if grid else [()]:
    env = dict(os.environ, **dict(zip(grid.keys(), combo)))
    ex, ro = [], []
    for path, truth, name in cases:
        e, r = score(run(path, env)["chords"], truth)
        ex.append(e); ro.append(r)
        if "-v" in sys.argv:
            print(f"    {name:32s} exact {e:5.1%} root {r:5.1%}")
    line = " ".join(f"{k[7:]}={v}" for k, v in zip(grid.keys(), combo)) + f" | synth exact {np.mean(ex):5.1%} root {np.mean(ro):5.1%}"
    scores = []
    for path, info, name in real:
        a = run(path, env)
        chords = [c for c in a["chords"] if c["label"] != "N"]
        total = sum(c["end"] - c["start"] for c in chords) or 1
        share = {}
        for c in chords:
            share[majmin(c["label"])] = share.get(majmin(c["label"]), 0) + (c["end"] - c["start"]) / total
        in_set = sum(v for k, v in share.items() if k in info["set"])
        core_min = min(share.get(k, 0) for k in info["core"])
        changes = sum(1 for i in range(1, len(chords)) if majmin(chords[i]["label"]) != majmin(chords[i - 1]["label"]))
        per_min = changes / (a["duration"] / 60)
        scores.append(in_set * min(1, core_min / 0.1))
        labels = len({c["label"] for c in chords})
        line += f" | {name[:8]} set {in_set:4.0%} core {core_min:4.0%} chg/min {per_min:4.1f} labels {labels} bpm {a['bpm']}"
        if "-v" in sys.argv:
            top = sorted(share.items(), key=lambda kv: -kv[1])[:7]
            line += " [" + " ".join(f"{k}:{v:.0%}" for k, v in top) + "]"
    if scores:
        line += f" || real {np.mean(scores):5.1%}"
    print(line, flush=True)
