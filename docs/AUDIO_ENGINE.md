# Audio engine

Source: `backend/app/audio/`. Engine id: `riffly-dsp-0.1.0+template-hmm-0.1.0`. This id is
stored with every analysis, so results can be traced to the engine version that produced them.

## Pipeline

1. **Decode**: mono at 22.05 kHz with librosa/soundfile. WAV and MP3 decode natively; M4A
   needs FFmpeg. Files longer than 12 minutes are rejected.
2. **Harmonic/percussive separation**: the harmonic part feeds chroma, the percussive part
   feeds beat tracking.
3. **Chroma**: a tuning-corrected constant-Q transform (C2–C8, 36 bins per octave) folded into
   12 pitch classes, then log-compressed and median-filtered over about 0.8 s.
4. **Chord states**: cosine similarity against 24 major/minor templates (root weighted 1.2),
   plus a "no chord" state that wins on silence or weak harmony. The similarities are turned
   into per-frame probabilities with a softmax.
5. **HMM/Viterbi**: a self-transition probability of 0.97 per 93 ms frame suppresses
   flickering between chords.
6. **Beats**: librosa beat tracking. Tempo comes from a trimmed mean of the inter-beat
   intervals, which is far finer than the tempogram's lag resolution.
7. **Beat snapping**: chord boundaries within 0.25 s of a beat move onto that beat.
8. **Key**: Krumhansl–Kessler profiles correlated with a mix of mean chroma and a
   duration-weighted histogram of chord tones.
9. **Progression**: the chord n-gram (2–8 chords long) that repeats and covers the most of the song.

## Confidence scores

- **Chord**: the mean posterior of the chosen state over the segment.
- **Key**: the correlation strength, discounted when the runner-up key scores almost as well.
- **Tempo**: the regularity of the beat grid.

None of these are calibrated probabilities. Use them to rank results, not as exact percentages.

## Measured accuracy

On synthesized audio with exact ground truth (strummed triads, kick and hi-hat; `tests/synth.py`):

| Test | Result |
|---|---|
| G–D–Em–C at 120 BPM | ≥ 85% of the time labelled correctly; key G major; tempo within ±3 BPM; progression found |
| Am–F–C–G at 96 BPM | ≥ 80% labelled correctly; key A minor or C major |
| Browser end-to-end (G–D–Em–C, 25 s) | Every chord change at the right time; G major; 120 BPM |

Synthetic audio is far easier than real recordings. Published results for template/HMM systems
on real pop music (e.g. the Beatles subset of MIREX) are about 60–75% weighted chord symbol
recall on a major/minor vocabulary. Deep models reach about 80–85%. Real-world accuracy for
Riffly still has to be measured. To do it, gather recordings you have the rights to, plus
reference annotations in MIREX `.lab` format, and run the evaluation.

## Limitations (shown to users in the app)

- The engine estimates the harmony of the whole mix. It does not isolate the guitar part.
- 7th, sus, add9 and extended chords are reported as their nearest triad. Users can correct
  any of them.
- Songs with a capo, or tuned far from A440, are still reported at concert pitch. The tuning
  offset is estimated and compensated within ±50 cents.
- Modulations are not tracked: the whole song gets a single key.

## Pretrained models: licence review

| Model | Licence | Decision |
|---|---|---|
| madmom chord CRF | Model weights CC BY-NC-SA | Not usable commercially |
| BTC (ISMIR 2019) | Code MIT; training data copyrighted | Needs legal review |
| Chordino / NNLS | GPL-2 | Would force the backend under GPL |
| Essentia models | AGPL-3 | Not suitable |
| **Demucs** (source separation) | **MIT** | Planned as an optional stage before chroma |

A trained model plugs in by implementing `ChordRecognizer` in `chords.py`. The API and the
app do not change.
