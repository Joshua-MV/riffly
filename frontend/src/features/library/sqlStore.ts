/**
 * SQLite-backed song library, shared by the Windows app (Tauri SQL plugin) and the Android
 * app (expo-sqlite). Only small adapters differ per platform.
 *
 *   songs table   one row per song: searchable columns + the full record as JSON
 *   MP3 files     stored next to the database (BLOBs would bloat it and slow every query)
 *
 * The database is a single file in the app's private data folder. No server and no account.
 */

import { parseSong, sortByNewest, type LocalSong } from './model';
import type { SongStorage } from './storage.types';
import type { UploadSource } from '@/services/api';

/** Minimal async SQL interface; both platform drivers are adapted to this. */
export interface SqlDb {
  exec(sql: string): Promise<void>;
  run(sql: string, params: SqlValue[]): Promise<void>;
  all<T>(sql: string, params: SqlValue[]): Promise<T[]>;
}
export type SqlValue = string | number | null;

/** Where MP3s live (app data folder) and how the user gets them out. */
export interface AudioFiles {
  write(id: string, mp3: Uint8Array): Promise<void>;
  remove(id: string): Promise<void>;
  /** URI the audio player can load. */
  uri(id: string): Promise<string>;
  uploadSource(song: LocalSong): Promise<UploadSource>;
  exportMp3(song: LocalSong): Promise<void>;
}

export const SCHEMA_VERSION = 1;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS songs (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  artist       TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  is_favourite INTEGER NOT NULL DEFAULT 0,
  audio_bytes  INTEGER NOT NULL,
  record       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS songs_created ON songs (created_at DESC);
CREATE INDEX IF NOT EXISTS songs_favourite ON songs (is_favourite) WHERE is_favourite = 1;
PRAGMA user_version = ${SCHEMA_VERSION};
`;

interface SongRow {
  record: string;
}

const UPSERT = `
INSERT INTO songs (id, title, artist, created_at, updated_at, is_favourite, audio_bytes, record)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (id) DO UPDATE SET
  title = excluded.title, artist = excluded.artist, updated_at = excluded.updated_at,
  is_favourite = excluded.is_favourite, audio_bytes = excluded.audio_bytes, record = excluded.record`;

function rowParams(song: LocalSong): SqlValue[] {
  return [
    song.id, song.title, song.artist, song.createdAt, song.updatedAt,
    song.isFavourite ? 1 : 0, song.audioBytes, JSON.stringify(song),
  ];
}

function fromRow(row: SongRow): LocalSong | null {
  try {
    return parseSong(JSON.parse(row.record));
  } catch {
    return null; // a corrupt row must not break the whole library
  }
}

export function createSqlStorage(open: () => Promise<SqlDb>, files: AudioFiles, location: string): SongStorage {
  let ready: Promise<SqlDb> | null = null;
  const db = () => {
    if (!ready) {
      ready = open().then(async (d) => {
        await d.exec(SCHEMA);
        return d;
      });
      ready.catch(() => {
        ready = null;
      });
    }
    return ready;
  };

  return {
    location,

    async list() {
      const rows = await (await db()).all<SongRow>('SELECT record FROM songs ORDER BY created_at DESC', []);
      return sortByNewest(rows.map(fromRow).filter((s): s is LocalSong => s !== null));
    },

    async get(id) {
      const rows = await (await db()).all<SongRow>('SELECT record FROM songs WHERE id = ?', [id]);
      return rows[0] ? fromRow(rows[0]) : null;
    },

    async add(song, mp3) {
      // Audio first: a row without audio is worse than a stray file.
      await files.write(song.id, new Uint8Array(mp3));
      await (await db()).run(UPSERT, rowParams(song));
    },

    async put(song) {
      await (await db()).run(UPSERT, rowParams(song));
    },

    async remove(id) {
      await (await db()).run('DELETE FROM songs WHERE id = ?', [id]);
      await files.remove(id);
    },

    audioUri: (id) => files.uri(id),
    uploadSource: (song) => files.uploadSource(song),
    exportMp3: (song) => files.exportMp3(song),
  };
}
