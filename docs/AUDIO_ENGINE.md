# Audio engine

## C++ engine (shipping, `engine/`)

The apps analyse songs on the device with a C++ port of the pipeline below. It is exposed as a
plain C API (`engine/include/riffly/engine.h`), compiled into the Windows app through Rust
(`frontend/src-tauri/build.rs`), and planned for Android through JNI.

Differences from the Python reference:
- **Chroma:** from a 16384-point STFT (1.35 Hz bins) instead of a CQT, with triangular semitone
  weighting normalised per semitone so each octave counts equally. Log compression and a
  9-frame median filter follow, as before. There's no HPSS; the time median does the same job
  cheaply.
- **Chord-change timing:** refined with a 4096-point "what is ringing" chroma. A fixed-window
  change-point search within ±0.7 s of each HMM boundary picks the split, then boundaries are
  snapped to a beat only if one is within 0.12 s. Parameters were chosen with
  `engine/tools/tune.py` over 7 synthetic songs. An attack-based variant was tried and
  rejected: 90.5% versus 99.0%.
- **Beats:** onset strength as librosa computes it (128-band Slaney mel, dB, 80 dB floor,
  positive difference, two-frame centring delay). On test audio it matches librosa's onset
  curve at r = 0.99999. Then tempo by autocorrelation with a log-normal prior around 120 BPM,
  and Ellis's dynamic-programming beat tracker with librosa's trimming.
- **MP3 decoding** uses minimp3 (CC0), **WAV** uses dr_wav (public domain). M4A isn't
  supported yet.

Measured on a 258 s synthetic song: chord accuracy 98.8% (Python 99.0%), 1.6 s versus 28.6 s,
and 60 MB peak memory.

## Python reference engine (`backend/app/audio/`)

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

## Experimental transcription (`app/audio/transcribe.py`)

1. **Demucs `htdemucs_6s`** (MIT) splits the mix into drums, bass, vocals, piano, guitar and
   other. The guitar stem is used, or "other" if the guitar stem is silent.
2. **Basic Pitch** (Spotify, Apache-2.0) detects notes, limited to the guitar range (75–1400 Hz).
   It runs its bundled ONNX model on onnxruntime, because the TensorFlow build it asks for has
   no Python 3.12 Windows wheels.
3. The app places each note on a string and fret (`src/lib/music/placement.ts`). It uses a
   greedy hand-position model, is capo-aware, puts simultaneous notes on separate strings, and
   prefers open strings and frets 0–12. It then quantises the notes onto the same 8th-note grid
   as the fingerpicking tab.

Measured on this development machine (CPU only):

| Test | Result |
|---|---|
| Clean synthesized melody, no separation | All pitches found (`test_real_models_transcribe_a_melody`) |
| Synthesized strummed G–D–Em–C mix with drums, 20 s | 48 notes from the guitar stem; every detected pitch class was a chord tone. 72 s including the first model load |
| Ab–Eb–Fm–Db mix through the app, 27 s | 142 notes in 17 s once warm; first notes Ab2, C4, Eb4, Ab3 |

Real band recordings will be much harder (stem bleed, distortion, doubled parts), so the UI
labels the result as an experimental sketch. The generated fingerpicking tab is the reliable
default.

## Pretrained models: licence review

| Model | Licence | Decision |
|---|---|---|
| madmom chord CRF | Model weights CC BY-NC-SA | Not usable commercially |
| BTC (ISMIR 2019) | Code MIT; training data copyrighted | Needs legal review |
| Chordino / NNLS | GPL-2 | Would force the backend under GPL |
| Essentia models | AGPL-3 | Not suitable |
| **Demucs** (source separation) | **MIT** | Used for experimental transcription; could also feed chord detection later |
| **Basic Pitch** (note transcription) | **Apache-2.0** | Used for experimental transcription (ONNX) |

A trained model plugs in by implementing `ChordRecognizer` in `chords.py`. The API and the
app do not change.
