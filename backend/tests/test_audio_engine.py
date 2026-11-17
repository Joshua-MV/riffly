"""Audio-engine tests on synthesised audio with exact ground truth."""

from __future__ import annotations

import numpy as np
import pytest

from app.audio.analysis import main_progression
from app.audio.chords import ChordSegment, build_chord_states, snap_to_beats
from app.audio.pipeline import analyze_audio, waveform_peaks

from .synth import SR, overlap_accuracy, render_progression


@pytest.fixture(scope="module")
def pop_progression():
    y, truth = render_progression(["G", "D", "Em", "C"], bpm=120)
    return analyze_audio(y, SR), truth


def test_recognises_major_minor_progression(pop_progression):
    result, truth = pop_progression
    accuracy = overlap_accuracy(result.chords, truth)
    assert accuracy >= 0.85, f"chord overlap accuracy {accuracy:.2%}"


def test_estimates_key(pop_progression):
    result, _ = pop_progression
    assert result.key == "G major"
    assert 0 < (result.key_confidence or 0) <= 1


def test_estimates_tempo(pop_progression):
    result, _ = pop_progression
    assert result.bpm is not None
    assert abs(result.bpm - 120) <= 3, result.bpm


def test_finds_main_progression(pop_progression):
    result, _ = pop_progression
    assert result.progression == ["G", "D", "Em", "C"]


def test_chord_boundaries_close_to_truth(pop_progression):
    result, truth = pop_progression
    starts = [c["start"] for c in result.chords if c["label"] != "N"]
    for t0, _, _ in truth[1:]:
        assert min(abs(s - t0) for s in starts) < 0.3


def test_minor_key_progression():
    y, truth = render_progression(["Am", "F", "C", "G"], bpm=96, repeats=3, seed=3)
    result = analyze_audio(y, SR)
    assert overlap_accuracy(result.chords, truth) >= 0.8
    # Am–F–C–G is ambiguous between A minor and C major; either is musically defensible.
    assert result.key in {"A minor", "C major"}


def test_silence_yields_no_chords():
    y = np.zeros(SR * 5, dtype=np.float32)
    result = analyze_audio(y, SR)
    assert all(c["label"] == "N" for c in result.chords)
    assert result.progression == []


def test_templates_cover_24_triads():
    states = build_chord_states()
    assert len(states.labels) == 24
    assert {"C", "Cm", "F#", "Bbm"} <= set(states.labels)
    assert np.allclose(np.linalg.norm(states.templates, axis=1), 1)


def test_snap_to_beats_moves_boundaries_and_merges():
    segs = [
        ChordSegment(0.0, 1.93, "C", 0, "maj", 0.8),
        ChordSegment(1.93, 2.05, "C", 0, "maj", 0.6),
        ChordSegment(2.05, 4.0, "G", 7, "maj", 0.7),
    ]
    out = snap_to_beats(segs, np.array([0.0, 1.0, 2.0, 3.0]))
    assert [s.label for s in out] == ["C", "G"]
    assert out[0].end == pytest.approx(2.0)


def test_main_progression_prefers_distinct_loop():
    labels = ["G", "D", "Em", "C"] * 3
    segs = [ChordSegment(i, i + 1, lab, 0, "maj", 1.0) for i, lab in enumerate(labels)]
    assert main_progression(segs) == ["G", "D", "Em", "C"]


def test_waveform_peaks_normalised():
    peaks = waveform_peaks(np.sin(np.linspace(0, 100, 10_000)), n_points=50)
    assert len(peaks) == 50
    assert max(peaks) == pytest.approx(1.0)
