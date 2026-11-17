/**
 * Windows app storage (Tauri): SQLite through the official SQL plugin, MP3 files in the app's
 * data folder (%APPDATA%\app.riffly\songs\<id>.mp3), and "Save MP3" through a normal Windows
 * save dialog.
 */

import { save } from '@tauri-apps/plugin-dialog';
import { BaseDirectory, mkdir, readFile, remove, writeFile, exists } from '@tauri-apps/plugin-fs';
import Database from '@tauri-apps/plugin-sql';

import { exportFilename } from './model';
import { createSqlStorage, type AudioFiles, type SqlDb } from './sqlStore';

const base = { baseDir: BaseDirectory.AppData };
const mp3Path = (id: string) => `songs/${id}.mp3`;
const urls = new Map<string, string>();

async function openDb(): Promise<SqlDb> {
  const db = await Database.load('sqlite:riffly.db');
  return {
    // The driver runs one statement per call, so split the schema script.
    exec: async (script) => {
      for (const statement of script.split(';').map((s) => s.trim()).filter(Boolean)) await db.execute(statement);
    },
    run: async (sql, params) => void (await db.execute(sql, params)),
    all: <T,>(sql: string, params: unknown[]) => db.select<T[]>(sql, params),
  };
}

async function readMp3(id: string): Promise<Uint8Array<ArrayBuffer>> {
  if (!(await exists(mp3Path(id), base))) throw new Error('The audio file for this song is missing on this PC.');
  return readFile(mp3Path(id), base);
}

const files: AudioFiles = {
  write: async (id, mp3) => {
    await mkdir('songs', { ...base, recursive: true });
    await writeFile(mp3Path(id), mp3, base);
  },
  remove: async (id) => {
    if (await exists(mp3Path(id), base)) await remove(mp3Path(id), base);
    const url = urls.get(id);
    if (url) URL.revokeObjectURL(url);
    urls.delete(id);
  },
  uri: async (id) => {
    const hit = urls.get(id);
    if (hit) return hit;
    const url = URL.createObjectURL(new Blob([await readMp3(id)], { type: 'audio/mpeg' }));
    urls.set(id, url);
    return url;
  },
  uploadSource: async (song) => ({ kind: 'web', file: new Blob([await readMp3(song.id)], { type: 'audio/mpeg' }), name: exportFilename(song) }),
  exportMp3: async (song) => {
    const target = await save({ defaultPath: exportFilename(song), filters: [{ name: 'MP3 audio', extensions: ['mp3'] }] });
    if (!target) return; // cancelled
    await writeFile(target, await readMp3(song.id));
  },
};

export const tauriStorage = createSqlStorage(openDb, files, 'This PC (SQLite database)');
