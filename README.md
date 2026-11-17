# Riffly

An all-in-one guitar companion: upload a song to get its chords, key and tempo and play along;
tune your guitar; learn chords. Built with Expo (iOS, Android, web) and a Python audio engine.

**Everything is free to run.** Every dependency is open source, and no paid API is used. The app
runs fully on your machine with no account. Supabase (planned for accounts and sync) has a free tier.

## Status: milestone 1 (foundations + all core modules, local mode)

| Module | State | Verified |
|---|---|---|
| Design system (dark default + light), responsive nav (bottom tabs ↔ sidebar ≥ 1024 px) | ✅ | Web, desktop and phone widths |
| **Tuner**: YIN pitch detection, 5 tuning presets, string lock, A4 reference, stability | ✅ | Unit tests (±2 cents, E2–E5). Web: real Web Audio mic path tested with a synthetic input signal |
| **Chord library**: 108 chords × 9 qualities, 1–4 voicings each, diagrams, instructions, synthesized strum | ✅ | Every voicing checked by tests (all notes are chord tones, root in the bass, playable span) |
| **Song analyzer**: upload (drag-drop/file picker), validation, background analysis, chords/key/BPM | ✅ | 17 backend tests + browser end-to-end |
| **Play along**: synced current/next chord, waveform seek, speed (pitch kept), A–B loop, transpose, corrections | ✅ | Browser end-to-end |
| **My Music**: library, favourites, search, delete, corrections | ✅ (local) | Browser |
| Accounts + cross-device sync (Supabase Auth/Storage, RLS) | Schema written, not wired up | — |
| iOS/Android builds | Code paths written | **Not yet run on a device** |

## Quick start

Requirements: Node.js 20+ and Python 3.11+. FFmpeg is optional (needed only for M4A uploads).

```bash
# Backend (port 8000)
cd backend
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

```bash
# App (web on port 8081; press i / a for simulators)
cd frontend
npm install
npx expo start --web
```

The tuner and chord library work without the backend. On a physical phone, set
`EXPO_PUBLIC_API_URL=http://<your-computer-LAN-IP>:8000` in `frontend/.env`.

### Native microphone

The tuner reads microphone audio through `expo-audio`'s real-time PCM stream (`useAudioStream`).
On the web it uses the Web Audio API instead, because expo-audio's web stream is a stub. The
native path compiles and type-checks but has not yet been run on a device. If Expo Go lacks the
module, build a free local development build with `npx expo run:android` or `npx expo run:ios`.

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

Frontend: 141 tests (notes, tunings, chord theory, every voicing in the library, YIN accuracy,
the tuner state machine, Karplus–Strong synthesis, timeline logic).
Backend: 17 tests (chord recognition, key, tempo and progression on synthesized audio with exact
ground truth; the API end to end with real background analysis; upload validation; isolation
between users).

## Configuration

`backend/.env` (see `backend/.env.example`): `AUTH_MODE`, `DATA_DIR`, `CORS_ORIGINS`,
`MAX_UPLOAD_MB`, `MAX_DURATION_MINUTES`, `ANALYSIS_WORKERS`. `AUTH_MODE=local` is refused when
`APP_ENV=production`.

`frontend/.env`: `EXPO_PUBLIC_API_URL`. Anything prefixed `EXPO_PUBLIC_` ends up in the app
bundle, so never put secrets there.

## Layout

```
frontend/app/          routes (expo-router): (tabs)/{index,analyze,tuner,chords,library}, song/[id], chord/[id], profile
frontend/src/lib/      pure, tested logic: music theory, voicings, YIN, tuner engine, synthesis
frontend/src/features/ tuner (mic adapters per platform), songs (API hooks, upload, playback, timeline)
frontend/src/theme/    design tokens, theme provider, responsive breakpoints
backend/app/audio/     chord recognition, key, tempo, pipeline
backend/app/           FastAPI app, auth, repository (SQLite now, Supabase next), job queue, uploads
supabase/migrations/   Postgres schema with Row Level Security and storage policies
docs/                  PLAN.md (architecture, milestones, risks), AUDIO_ENGINE.md (method, accuracy, limits)
```

## API

Interactive docs at `http://localhost:8000/docs` while the backend runs.

| Method | Path | |
|---|---|---|
| GET | `/api/health` | Engine version, auth mode |
| GET | `/api/songs` | Your songs with status, key and BPM |
| POST | `/api/songs` | Multipart upload (`file`, `title?`, `artist?`, `analyze=true`). 413/415 on bad input |
| GET / PATCH / DELETE | `/api/songs/{id}` | Detail (with analysis and corrections) / title, artist, notes, favourite / delete |
| POST | `/api/songs/{id}/analyze` | Re-run analysis (409 if already running) |
| GET | `/api/songs/{id}/analysis` | Status: `uploaded → queued → processing → completed / failed` |
| GET | `/api/songs/{id}/audio` | Audio with HTTP Range support |
| PUT / DELETE | `/api/songs/{id}/corrections[/{cid}]` | Correct a chord segment / revert a correction |

The chord library runs entirely in the app (it works offline), so there is no `/api/chords` endpoint.

## Known limitations

- Chord recognition uses a DSP baseline (major/minor triads). It handles clean harmony well. It
  will mislabel 7ths and extended chords as triads, and is less accurate on dense, distorted or
  vocal-heavy mixes. See [docs/AUDIO_ENGINE.md](docs/AUDIO_ENGINE.md).
- The job queue runs in-process and is not durable: jobs interrupted by a restart are marked
  failed with a retry hint.
- M4A uploads need FFmpeg on the server.
- Accounts are not implemented yet: local mode stores everything for one developer user.

## Next milestones

1. Supabase Auth + a Supabase repository (the schema and RLS are ready) and sign-in UI.
2. Run the native mic path on iOS/Android hardware; test low strings and noisy rooms.
3. Optional Demucs (MIT) source separation before chroma, plus 7th-chord templates; evaluate on
   annotated data with `scripts/evaluate.py`.
4. A durable queue (Redis + arq), Docker image with FFmpeg, and free-tier deployment.
