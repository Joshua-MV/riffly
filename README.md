# Riffly

A guitar companion **app** for Windows (Microsoft Store) and Android (Google Play):
- tune your guitar
- load any song and get its chords, key and tempo, with easier capo versions for beginners
- practise with synced chords and fingerpicking tabs while the song plays
- learn every chord shape

**Free. No website, no accounts, no database server.** Your music lives on your own device:
MP3 files plus a SQLite database. Songs are analysed **on the device** by Riffly's built-in
C++ audio engine, so nothing is uploaded.

## How to start it (Windows)

From the `MusicApp` folder, in a terminal:

```bash
npm run dev
```

In Windows PowerShell, type `npm.cmd run dev` if plain `npm` says "running scripts is disabled".

To open Riffly like any other app, run `npm.cmd run shortcut` once: it adds **Riffly** to the Start menu, so Windows search finds it. Opening it rebuilds the app first whenever the code has changed, so it always runs the latest version.

**Riffly opens in its own window.** The first time, it builds the app, which takes a few
minutes; after that it opens in about a second. Close the window to quit, and you can close the
terminal too.

To make an installer, so Riffly appears in the Start menu like any other program:

```bash
npm run build
```

Then run `frontend\src-tauri\target\release\bundle\nsis\Riffly_0.1.0_x64-setup.exe`
(about 8 MB). An `.msi` is made alongside it.

| Command | What it does |
|---|---|
| `npm run dev` (or `npm start`) | Open the Riffly app; rebuilds it only when its code has changed |
| `npm run shortcut` | Add Riffly to the Start menu (opens the latest version, rebuilding when needed) |
| `npm run build` | Build the Windows installers (.exe and .msi) |
| `npm run dev:live` | For editing Riffly's code: the app with live reload (uses about 1 GB of RAM while editing) |
| `npm run transcribe-server` | Optional: the Python server for the experimental "Transcribe" tab |
| `npm run setup` | Install dependencies only |
| `npm test` | App tests and C++ engine tests |

Requirements (all free): Node.js 20+, Rust, and Visual Studio 2022 Build Tools with the C++
workload. Python 3.11+ is only needed for the optional transcription server.

### Android

The Android app shares the same screens and stores songs the same way (SQLite plus MP3 files
in the app's private folder). **It isn't ready yet:** the C++ engine still has to be connected
to Android (that needs the Android SDK/NDK). Until then the phone build can't analyse songs.
Publishing on Google Play needs a developer account with a **one-time $25 fee**; everything
else is free.

## Where your music is kept

| | Windows app |
|---|---|
| Songs, chords, corrections, capo/practice settings, favourites | `%APPDATA%\app.riffly\riffly.db` (SQLite) |
| Audio | `%APPDATA%\app.riffly\songs\<id>.mp3` |

- Songs are converted to MP3 when you add them; MP3s are kept exactly as they are.
- **Save MP3** on any song writes a copy wherever you choose.
- Uninstalling Riffly removes its data folder, so export any songs you want to keep.
- There is no sync between devices.

## Practising a song

Open any analysed song and everything below works while it plays. The song keeps playing while
you move around the app, and a mini player shows the current chord on every screen.

| Feature | What it does |
|---|---|
| **Chord lane** | Chord blocks scroll under a playhead. Each block's width is how long to hold the chord, with beat ticks inside. The current chord fills up and shows "3 beats left", and the next chord sits right beside it. Key, tempo, capo and length are shown underneath. Tap a block to jump there. |
| **Player** | Spotify-style: drag the seek bar anywhere (backwards or forwards), a big play/pause button, ⏮ ⏭ to jump between chord changes (⏮ restarts the current chord first), loop, speed (pitch kept) and count-in. |
| **Make it easier** | Tries every capo position and suggests the one with the easiest shapes, e.g. Ab–Eb–Fm–Db becomes *capo 1: G–D–Em–C, no barre chords*. The recording stays in its real key, so you can still play along. |
| **Chords** | A timeline synced to playback, with the current and next chords plus a diagram, a loop for the current phrase, speeds of 0.5–1× that keep the pitch, and corrections. |
| **Fingerpicking tab** | Generated from the song's chords and beat in three patterns (simple arpeggio, pinch, Travis). It scrolls in sync and highlights the note to play now. It is an *arrangement* in the song's style, not a note-for-note copy. |
| **Learn** | Every chord shape in the song with diagrams and sound, a chord-change drill against a click, and a metronome. |
| **Tempo** | Detected BPM, beat dots synced to the music, an optional one-bar count-in, and practice speeds. |
| **Chord library** | 120 chords (12 roots × 10 types, including **power chords**) with diagrams, finger instructions and sound. |
| **Tuner** | Opens first. YIN pitch detection, 5 tunings, string lock, A4 reference. Works offline. |
| **Transcribe (beta)** | Experimental note transcription via Demucs + Basic Pitch. Needs `npm run transcribe-server` and the optional install below. |

## The C++ audio engine (`engine/`)

| | C++ engine (built into the app) | Previous Python engine |
|---|---|---|
| Chord accuracy, 7 synthetic test songs | 99.0% mean (worst song 98.2%) | 99% |
| Time to analyse a 4.3-minute song | **1.6 s** | 28.6 s |
| Peak memory | **60 MB** | ~400 MB |

The pipeline:
1. Decode MP3 or WAV, using minimp3 (CC0) and dr_wav (public domain).
2. Resample to 22.05 kHz.
3. Chroma from a long-window STFT.
4. Chord templates plus HMM/Viterbi smoothing.
5. Chord-change timing refined with a short window.
6. Tempo and beats with librosa's method (mel onset strength, autocorrelation, dynamic-programming beat tracker; its onset curve matches librosa at r = 0.99999).
7. Key and the main progression.

M4A isn't supported by the built-in engine yet. See [docs/AUDIO_ENGINE.md](docs/AUDIO_ENGINE.md).

```bash
engine\build.cmd
```

That builds and runs the engine's 36 checks.

## Tests

| Suite | Command | Count |
|---|---|---|
| App (music theory, voicings incl. power chords, tuner, tabs, capo helper, SQLite storage on real SQLite) | `cd frontend && npm test` | 190 |
| C++ engine (chords, key, tempo, progression, decoders, errors) | `engine\build.cmd` | 36 checks |
| Windows app bridge (WAV→MP3, MP3 pass-through, bad input) | `cd frontend\src-tauri && cargo test --lib` | 3 |
| Optional Python server (transcription, legacy analysis API) | `cd backend && .venv\Scripts\python -m pytest` | 24 |

## Optional: experimental transcription server

Free, roughly 1 GB including PyTorch; the Demucs model downloads on first use. From `backend/`:

```bash
.venv\Scripts\python.exe -m pip install -r requirements-transcribe.txt
```

```bash
.venv\Scripts\python.exe -m pip install --no-deps basic-pitch==0.4.0
```

Then start it with `npm run transcribe-server`.

## Layout

```
engine/                  C++ audio engine (C API in include/riffly/engine.h), tests, CLI, tune.py
frontend/                the app's screens and logic (React Native / Expo, TypeScript)
frontend/src-tauri/      Windows app shell (Tauri, Rust): engine bridge, MP3 encoding (LAME), SQLite
frontend/src/features/   library/ (SQLite storage + importer), songs/, player/, practice/, tuner/
frontend/src/lib/        pure, tested logic: music theory, voicings, YIN, tabs, capo helper
brand/                   brand kit: logo files, colours (JSON + CSS), type; see brand/README.md
backend/                 optional Python server (experimental transcription)
scripts/dev.mjs          the `npm run …` commands
docs/                    PLAN.md, AUDIO_ENGINE.md
```

## Known limitations

- Chord recognition covers major and minor triads; 7ths and other extended chords are shown as
  their nearest triad, and you can correct any chord.
- M4A files aren't supported by the built-in engine yet: convert them to MP3 or WAV.
- Android can't analyse songs until the engine is connected (next milestone).
