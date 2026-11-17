# Riffly — Implementation Plan

_Last updated: 2026-11-17_

## 1. Assessment

The repository started **empty** (no code, no git history). The development machine had no
Node.js or Python; Node.js LTS and Python 3.12 were installed via winget. FFmpeg is **not**
installed (needed only for M4A decoding on the backend — see Risks).

Riffly has two genuinely hard technical cores, and everything else is good product
engineering around them:

1. **Chord recognition from mixed audio.** This is an open research problem (MIREX ACE).
   State-of-the-art systems score ~80–85% weighted chord symbol recall on major/minor
   vocabularies; simple DSP baselines score ~60–75%. We must present results as
   *estimated harmony of the whole mix*, never as a verified guitar transcription.
2. **Real-time pitch detection on every platform.** The browser has the Web Audio API.
   React Native has no built-in raw-PCM microphone stream, so native tuning requires a
   native module and therefore an Expo **development build** (it cannot run in Expo Go).

## 2. Architecture

```
┌──────────────────────── Expo app (iOS / Android / Web) ────────────────────────┐
│ expo-router screens ─► feature hooks ─► on-device library (MP3 + JSON per song) │
│        │                    │            web: IndexedDB · native: app documents │
│  design system        src/lib/music  (pure TS: notes, tunings, chords,         │
│  (tokens + ui)        voicings, transpose, YIN pitch detection) — unit tested   │
└───────────┬────────────────────────────────────────────────────────────────────┘
            │ REST: upload → poll → download MP3 → DELETE
┌───────────▼──────────── FastAPI analysis server (stateless) ──────────────────┐
│ routers ─► in-memory job store ─► worker: audio engine (librosa) + MP3 (LAME)  │
│ temp files only; deleted on collection, after 30 min, and on startup           │
└────────────────────────────────────────────────────────────────────────────────┘
```

**No database (decided 2026-11-17).** Each user's library lives only on their device. That is
simpler, free, private, and keeps copyrighted audio off our servers. The cost is no
cross-device sync and no accounts. If sync is wanted later, export/import of the library
(a zip of the MP3 + JSON files) is the database-free path.

Key decisions and trade-offs:

| Decision | Why | Trade-off |
|---|---|---|
| Tuner runs fully on-device (TS YIN) | Offline, low latency, no audio leaves the device | Needs native module on iOS/Android |
| Music theory in pure TS (`src/lib/music`) | Shared by tuner, chord library, play-along, transposition; trivially testable; instrument-agnostic (`Instrument` = tuning + string count) | — |
| Chord voicings generated from movable CAGED shapes + curated open chords | Hundreds of correct voicings without hand-typing errors; validated by tests (every note is a chord tone, bass is the root, fret span ≤ 4) | Generated fingerings are standard but not always the "friendliest" |
| Baseline chord engine = HPSS → CQT chroma → template matching → HMM/Viterbi → beat snapping | Real, explainable, license-clean, CPU-only | Lower accuracy than deep models; documented |
| `ChordRecognizer` protocol | A pretrained model can be swapped in without touching the API | — |
| On-device library (`SongStorage`: IndexedDB on web, files on native) | No database, works offline, user owns their files | No sync between devices; uninstalling deletes it (MP3 export mitigates) |
| Server converts everything to MP3 (lameenc, 192 kbps); MP3 uploads pass through | One format on every device, roughly 5× smaller than WAV | Lossy for WAV sources |
| Stateless in-memory job store | Nothing to back up, migrate or secure at rest | Restarting the server cancels in-flight jobs (the app shows "try again") |
| expo-audio for playback | One API across platforms; supports pitch-preserving rate changes | Loop/seek precision is ~50 ms (fine for play-along) |

### Pretrained chord models — licence review

| Model | Code licence | Weights / data | Verdict |
|---|---|---|---|
| madmom CNN/CRF chord recognizer | BSD | Models CC BY-NC-SA 4.0 | **Non-commercial only** — not bundled |
| BTC (ISMIR 2019) | MIT | Trained on copyrighted audio; weights redistribution unclear | Research use; needs legal review |
| Chordino / NNLS-Chroma | GPL-2 | — | Copyleft; would force GPL on the backend |
| Essentia chord models | AGPL-3 | — | Copyleft over network — not suitable |
| Demucs (source separation) | MIT | MIT | **Good candidate** to strip drums/vocals before chroma (CPU cost ~1× realtime). Planned optional stage |

Conclusion: ship the DSP baseline now, add Demucs pre-separation as an optional stage, and
train/licence a proprietary model later. The PyTorch dependency is deferred until a model is
actually integrated.

### Cost: everything is free

| Piece | Cost |
|---|---|
| Expo / React Native / expo-router, FastAPI, librosa, NumPy, SciPy | Open source (MIT/BSD/ISC) |
| Fonts (Inter, Space Grotesk via Google Fonts), Ionicons | Open licences (OFL/MIT) |
| Storage | The user's own device; no database or cloud storage at all |
| MP3 encoding (lameenc / LAME) | Open source (LGPL) |
| Native builds | Free locally (`npx expo run:*`); EAS Build also has a free tier |
| Backend hosting | Any free tier able to run a Python container, or self-hosted |

No paid API (AI or otherwise) is used. Audio analysis runs on our own server with open-source DSP.

## 3. Directory structure

```
MusicApp/
├── docs/                   PLAN.md, API.md, AUDIO_ENGINE.md
├── frontend/               Expo app (TypeScript, expo-router)
│   ├── app/                routes: (tabs)/{index,analyze,tuner,chords,library}, song/[id], chords/[id], profile
│   └── src/
│       ├── theme/          tokens, ThemeProvider, typography
│       ├── components/     ui/ (Button, Card, Text…), music/ (Fretboard, TunerGauge, Waveform…), layout/
│       ├── features/       library/ (on-device storage, importer), songs/, tuner/ (mic adapters)
│       ├── lib/music/      notes, tunings, chords, voicings, transpose, pitch (YIN) + __tests__
│       ├── lib/audio/      synth (Karplus-Strong), chord playback
│       └── services/       analysis API client
└── backend/                FastAPI (stateless)
    ├── app/                main, config, schemas, routers/analyses, jobs (in-memory), uploads, audio/
    ├── tests/              engine tests on synthesised audio, API integration tests
    └── scripts/evaluate.py WCSR evaluation against annotated .lab files
```

## 4. Milestones

1. **Foundations** — design tokens (dark/light), UI kit, responsive navigation (bottom tabs ↔
   sidebar ≥ 1024 px), music-theory core with tests.
2. **Tuner** — YIN, web microphone adapter, gauge UI, presets, string selection, stability
   detection. Native adapter behind the same interface (dev build).
3. **Chord library** — generated + curated voicings, search, filters, diagrams, synthesized playback.
4. **Backend + audio engine** — stateless FastAPI, job store, chord/key/BPM engine, MP3
   conversion, synthetic-audio tests. ✅
5. **Analyzer UI + Play Along** — upload (drag-drop on web), progress, results timeline synced
   to playback, loop, speed, transpose, manual corrections. ✅
6. **My Music (on device)** — local library, favourites, notes, MP3 export. ✅ Next: notes UI
   and library export/import (zip) for moving to a new device.
7. **Hardening** — run on iOS/Android hardware, Demucs stage, Docker image with FFmpeg, free hosting.

## 5. Major risks

| Risk | Mitigation |
|---|---|
| Chord accuracy on dense mixes | Honest confidence scores + "estimated" labelling, user corrections, evaluation script, separation stage planned |
| Native microphone PCM needs native module | Interface-based adapter; requires Expo dev build; web works today |
| M4A decoding requires FFmpeg on the server | Validate early and return a clear error if FFmpeg is missing; Docker image includes it |
| Long CPU-bound analysis (≈5–20 s per song) | Background jobs, status polling, duration cap (12 min), file-size cap (50 MB) |
| Copyrighted uploads | The server keeps nothing after collection; audio lives only on the user's device; no sharing features |
| Losing a library (uninstall, cleared browser data) | "Save/Download MP3" per song; browser persistent-storage request; library zip export planned |
| Low-frequency strings (E2 ≈ 82 Hz) on phone mics | 4096-sample window, YIN with parabolic interpolation, median smoothing |
