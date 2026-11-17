/**
 * Android/iOS storage: a SQLite database (expo-sqlite) for song records and plain MP3 files
 * in the app's private documents folder:
 *   <documents>/SQLite/riffly.db          songs table (see sqlStore.ts)
 *   <documents>/riffly/songs/<id>.mp3     audio
 * Uninstalling the app deletes both, so "Save MP3" exports a copy via the share sheet.
 */

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { openDatabaseAsync } from 'expo-sqlite';

import { exportFilename, parseSong } from './model';
import { createSqlStorage, type AudioFiles, type SqlDb } from './sqlStore';

function songsDir(): Directory {
  const dir = new Directory(Paths.document, 'riffly', 'songs');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

const mp3File = (id: string) => new File(songsDir(), `${id}.mp3`);

async function openDb(): Promise<SqlDb> {
  const db = await openDatabaseAsync('riffly.db');
  const sql: SqlDb = {
    exec: (source) => db.execAsync(source),
    run: async (source, params) => void (await db.runAsync(source, params)),
    all: (source, params) => db.getAllAsync(source, params),
  };
  await migrateJsonRecords(sql);
  return sql;
}

/** Earlier versions stored each song as <id>.json next to its MP3; move those into SQLite. */
async function migrateJsonRecords(db: SqlDb) {
  const legacy = songsDir()
    .list()
    .filter((f): f is File => f instanceof File && f.name.endsWith('.json'));
  if (!legacy.length) return;
  await db.exec(
    'CREATE TABLE IF NOT EXISTS songs (id TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, is_favourite INTEGER NOT NULL DEFAULT 0, audio_bytes INTEGER NOT NULL, record TEXT NOT NULL)',
  );
  for (const f of legacy) {
    try {
      const song = parseSong(JSON.parse(await f.text()));
      if (song) {
        await db.run(
          'INSERT OR IGNORE INTO songs (id, title, artist, created_at, updated_at, is_favourite, audio_bytes, record) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [song.id, song.title, song.artist, song.createdAt, song.updatedAt, song.isFavourite ? 1 : 0, song.audioBytes, JSON.stringify(song)],
        );
      }
      f.delete();
    } catch {
      // Leave unreadable files in place rather than lose data.
    }
  }
}

const files: AudioFiles = {
  write: async (id, mp3) => {
    await mp3File(id).write(mp3);
  },
  remove: async (id) => {
    const f = mp3File(id);
    if (f.exists) f.delete();
  },
  uri: async (id) => {
    const f = mp3File(id);
    if (!f.exists) throw new Error('The audio file for this song is missing on this device.');
    return f.uri;
  },
  uploadSource: async (song) => ({ kind: 'native', uri: await files.uri(song.id), name: exportFilename(song), mimeType: 'audio/mpeg' }),
  exportMp3: async (song) => {
    // Share a copy with a friendly name ("Artist - Title.mp3").
    const copy = new File(Paths.cache, exportFilename(song));
    if (copy.exists) copy.delete();
    mp3File(song.id).copy(copy);
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
    await Sharing.shareAsync(copy.uri, { mimeType: 'audio/mpeg', UTI: 'public.mp3', dialogTitle: 'Save MP3' });
  },
};

export const storage = createSqlStorage(openDb, files, 'This device (SQLite database)');
