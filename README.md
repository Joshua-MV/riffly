# Riffly

An all-in-one guitar companion: upload a song to get its chords, key and tempo and play along;
tune your guitar; learn chords. Built with Expo (iOS, Android, web) and a Python audio engine.

**Free to run. No database. No accounts.** Every dependency is open source and no paid API is
used. Each user's music lives on their own device as MP3s, and the analysis server keeps
nothing once it has finished.

## How songs are stored

```
 device                                        analysis server (stateless)
 ──────                                        ───────────────────────────
 pick MP3 / WAV / M4A ── upload ─────────────► temp folder
                                               analyse chords, key, tempo
                                               convert to MP3 (MP3s pass through untouched)
 poll ◄──────────────────── result ───────────
 download MP3 ◄───────────────────────────────
 save MP3 + chords on the device
 "forget this job" ── DELETE ────────────────► temp folder deleted
```

| Platform | Where songs are saved |
|---|---|
| iOS | The app's Documents folder (`riffly/songs/<id>.mp3` + `<id>.json`). It is also visible in the Files app under *On My iPhone → Riffly* |
| Android | The app's private documents folder |
| Web | The browser's IndexedDB, for this site in this browser |

- Every song has **Save MP3** (phones: the share sheet, e.g. "Save to Files") or **Download MP3** (web), so users can keep a copy outside the app.
- Corrections, favourites and notes live in the song's JSON record on the device.
- Saved songs open and play offline. The server is only needed to analyse new songs.
- The server never keeps anything:
  - It deletes the upload once processing ends.
  - It deletes the MP3 when the app collects it, or after 30 minutes otherwise.
  - It wipes its work folder on startup.
- **Trade-offs:**
  - There is no sync between devices.
  - Deleting the app, or clearing the site's data in the browser, deletes the library. Exported MP3s are kept.

## Practising a song

Open any analysed song and everything below works while it plays. One shared player keeps the
song going as you move around the app, and a mini player shows the current chord on every screen.

| Feature | What it does |
|---|---|
| **Make it easier** | Tries every capo position and suggests the one with the easiest shapes, e.g. Ab–Eb–Fm–Db becomes *capo 1: G–D–Em–C, no barre chords*. The recording stays in its real key, so you can still play along. You can also change the key yourself, with a warning that it won't match the recording. |
| **Chords** | A timeline synced to playback, with the current and next chords plus a diagram, a loop for the current phrase, speeds of 0.5–1× that keep the pitch, and corrections. |
| **Fingerpicking tab** | Generated from the song's chords and beat in three patterns: simple arpeggio, pinch (both beginner) and Travis picking (intermediate). It scrolls in sync and highlights the note to play now. Tap a bar to jump there. It is an *arrangement* in the song's style, not a note-for-note copy. |
| **Learn** | Every chord shape in the song with diagrams, sound and how much of the song it covers. A chord-change drill switches between the song's most common pairs every bar against a click. A metronome is also included. |
| **Tempo** | The song's tempo, beat dots synced to the music (beat 1 lands on the chord changes), an optional one-bar count-in before playback, and practice speeds. |
| **Transcribe (beta)** | Experimental. Separates the guitar with Demucs and detects its notes with Basic Pitch, then lays them out as tab on the same synced grid, respecting the capo. Slow (minutes) and imperfect on full band mixes; labelled as a sketch. |

## Status

| Module | State | Verified |
|---|---|---|
| Design system (dark default + light), responsive nav (bottom tabs ↔ sidebar ≥ 1024 px) | ✅ | Web, desktop and phone widths |
| **Tuner**: YIN pitch detection, 5 tuning presets, string lock, A4 reference, stability | ✅ | Unit tests (±2 cents). Web mic path tested with a synthetic input signal |
| **Chord library**: 120 chords (12 roots × 10 types, including power chords), diagrams, instructions, synthesized strum | ✅ | Every voicing checked by tests |
| **Song analyzer**: upload, background analysis, MP3 conversion, save on device | ✅ | 20 backend tests + browser end-to-end |
| **Play along**: synced chords, waveform seek, speed (pitch kept), A–B loop, transpose, corrections | ✅ | Browser end-to-end, including playback with the server off |
| **My Music**: on-device library, favourites, search, delete, MP3 export | ✅ | Browser (IndexedDB) |
| iOS/Android | Code paths written and type-checked | **Not yet run on a device** |

## Quick start

Requirements: Node.js 20+ and Python 3.11+. FFmpeg is optional (needed only for M4A uploads).

From the project folder:

```bash
npm run dev
```

That's it. The first run installs everything it needs and builds the app, which takes a few
minutes. After that it starts in seconds, opens **http://localhost:8000** in your browser, and
Ctrl+C stops it. `npm start` does exactly the same.

In Windows PowerShell, if you see "running scripts is disabled", type `npm.cmd run dev`
instead, or use Command Prompt.

### Windows app

Riffly is also a real Windows program: its own window, installer, and a SQLite database.
It's built with Tauri (free) and needs Rust plus the Visual Studio C++ Build Tools (both free).

```bash
npm run desktop
```

That opens Riffly in its own window, together with the analysis server.

```bash
npm run desktop:build
```

That builds the installers into `frontend/src-tauri/target/release/bundle/`:
`Riffly_0.1.0_x64-setup.exe` (about 8 MB) and `Riffly_0.1.0_x64_en-US.msi` (about 10 MB).

| | Where the Windows app keeps your music |
|---|---|
| Songs, chords, corrections, settings | `%APPDATA%\app.riffly\riffly.db` (SQLite) |
| Audio | `%APPDATA%\app.riffly\songs\<id>.mp3` |

Measured: `riffly.exe` uses 30 MB, and the WebView2 that draws its screens about 217 MB
private (similar to one browser tab).

> **Not ready for the Microsoft Store yet.** Song analysis still needs the Python analysis
> server running on the PC (port 8000). The next milestone replaces it with a C++ engine
> built into the app (and into the Android app), so store users need nothing else installed.

### Android

The Android app stores songs the same way: SQLite (`expo-sqlite`) plus MP3 files in the app's
private folder. Songs saved by earlier test builds as JSON files are imported automatically.
It can't analyse songs on its own until the C++ engine lands. Publishing on Google Play needs
a developer account, which has a **one-time $25 fee**; everything else is free.

| Command | Use it for | What runs |
|---|---|---|
| `npm run dev` (or `npm start`) | **Using** Riffly | One Python process serves the built app and the analysis API. The app is rebuilt automatically only when its code has changed |
| `npm run dev:live` | **Editing** Riffly's code | The analysis server plus Expo's live-reload dev server (http://localhost:8081), about 1 GB of RAM |
| `npm run setup` | Installing without starting | Same first-run setup, then exits |

Songs are stored per browser *address*, so songs saved under `npm run dev` (localhost:8000)
are a separate library from those saved under `npm run dev:live` (localhost:8081).

### Memory use (measured on Windows)

| | Before | `npm run dev` now |
|---|---|---|
| Idle | ~1.1 GB (Expo dev bundler 933 MB, Python 86 MB, npx 78 MB) | **~190 MB** (Python 87 MB, Node launcher ~106 MB) |
| While analysing a song | +2 worker processes, ~370 MB each, kept in memory afterwards | +1 worker, 258 MB peak, which **exits after 5 idle minutes** |

The worker holds the audio libraries (librosa/numba). It is started only when a song arrives
and stops after `WORKER_IDLE_SECONDS` (default 300). Transcription loads PyTorch only when you
use it.

Optional experimental transcription (free, roughly 1 GB including PyTorch; the Demucs model
downloads on first use), run from `backend/` with its virtualenv:

```bash
.venv\Scripts\python.exe -m pip install -r requirements-transcribe.txt
```

```bash
.venv\Scripts\python.exe -m pip install --no-deps basic-pitch==0.4.0
```

On a physical phone, set `EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:8000` in `frontend/.env`.

The native tuner uses `expo-audio`'s real-time microphone stream. If Expo Go lacks it, build a
free local development build with `npx expo run:android` or `npx expo run:ios`.

## Tests

```bash
cd frontend
npm test
npm run typecheck
```

```bash
cd backend
pytest
```

Frontend: 146 tests. They cover music theory, every chord voicing, YIN accuracy, the tuner, the
synthesizer, the timeline, and the on-device library model.

Backend: 20 tests. They cover chord, key and tempo accuracy on synthesized audio; upload →
analysis → MP3 → delete; MP3 pass-through; rejecting bad uploads; job expiry; the optional API
key; and wiping state on startup.

## Analysis API (stateless)

Interactive docs at `http://localhost:8000/docs` while the backend runs.

| Method | Path | |
|---|---|---|
| GET | `/api/health` | Engine version |
| POST | `/api/analyses` | Multipart upload (`file`, `title?`) → `202` job. 413/415 on bad input, 503 when busy |
| GET | `/api/analyses/{id}` | `processing / completed / failed`, plus the result and `audio_url` when done |
| GET | `/api/analyses/{id}/audio` | The MP3 |
| DELETE | `/api/analyses/{id}` | Forget the job and delete its files |
| POST / GET / DELETE | `/api/transcriptions[/{id}]` | Experimental note transcription (501 if not installed). Returns notes only; the app places them on the fretboard |

Job ids are random UUIDs, so only the app that created a job can fetch it. If the server is
reachable from the internet, set `API_KEY` on the server and the same `EXPO_PUBLIC_API_KEY`
in the app.

## Layout

```
frontend/app/            routes: (tabs)/{index = tuner (first screen), home, analyze, chords, library}, song/[id], chord/[id], profile
frontend/src/features/   library/ (on-device storage: web IndexedDB + native files, importer), songs/, tuner/
frontend/src/lib/        pure, tested logic: music theory, voicings, YIN, tuner engine, synthesis
backend/app/             FastAPI app, in-memory job store, upload validation
backend/app/audio/       chord recognition, key, tempo, MP3 conversion
docs/                    PLAN.md, AUDIO_ENGINE.md
```

## Known limitations

- Chord recognition is a DSP baseline (major/minor triads). See [docs/AUDIO_ENGINE.md](docs/AUDIO_ENGINE.md).
- Jobs live in server memory: restarting the server cancels in-flight analyses, and the app
  shows a "failed, try again" message.
- M4A uploads need FFmpeg on the server.
- Web storage can be evicted by the browser under heavy disk pressure. Riffly asks for
  persistent storage, but browsers may still decline.
