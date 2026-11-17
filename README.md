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
| **Chord library**: 108 chords, diagrams, instructions, synthesized strum | ✅ | Every voicing checked by tests |
| **Song analyzer**: upload, background analysis, MP3 conversion, save on device | ✅ | 20 backend tests + browser end-to-end |
| **Play along**: synced chords, waveform seek, speed (pitch kept), A–B loop, transpose, corrections | ✅ | Browser end-to-end, including playback with the server off |
| **My Music**: on-device library, favourites, search, delete, MP3 export | ✅ | Browser (IndexedDB) |
| iOS/Android | Code paths written and type-checked | **Not yet run on a device** |

## Quick start

Requirements: Node.js 20+ and Python 3.11+. FFmpeg is optional (needed only for M4A uploads).

Optional experimental transcription (free, roughly 1 GB including PyTorch; the Demucs model
downloads on first use):

```bash
pip install -r requirements-transcribe.txt
```

```bash
pip install --no-deps basic-pitch==0.4.0
```

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm install
npx expo start --web
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
