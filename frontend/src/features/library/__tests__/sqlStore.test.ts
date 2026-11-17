/**
 * Runs the shared storage layer against real SQLite (sql.js, SQLite compiled to WebAssembly).
 */
import initSqlJs, { type Database } from 'sql.js';

import type { AnalysisResult } from '@/services/api';

import { applyPatch, createSong, upsertCorrection } from '../model';
import { createSqlStorage, SCHEMA_VERSION, type AudioFiles, type SqlDb } from '../sqlStore';

const analysis: AnalysisResult = {
  duration: 10, key: 'G major', key_confidence: 0.8, bpm: 120, bpm_confidence: 0.9,
  chords: [{ start: 0, end: 2, label: 'G', root: 7, quality: 'maj', confidence: 0.9 }],
  progression: ['G'], beats: [], waveform: [], model_version: 't', processing_seconds: 1, notes: [],
};

function adapt(raw: Database): SqlDb {
  return {
    exec: async (sql) => void raw.exec(sql),
    run: async (sql, params) => void raw.run(sql, params),
    all: async <T,>(sql: string, params: (string | number | null)[]) => {
      const stmt = raw.prepare(sql);
      stmt.bind(params);
      const out: T[] = [];
      while (stmt.step()) out.push(stmt.getAsObject() as T);
      stmt.free();
      return out;
    },
  };
}

function memoryFiles(): AudioFiles & { store: Map<string, Uint8Array> } {
  const store = new Map<string, Uint8Array>();
  return {
    store,
    write: async (id, mp3) => void store.set(id, mp3),
    remove: async (id) => void store.delete(id),
    uri: async (id) => {
      if (!store.has(id)) throw new Error('missing');
      return `mem://${id}`;
    },
    uploadSource: async (song) => ({ kind: 'native', uri: `mem://${song.id}`, name: song.title, mimeType: 'audio/mpeg' }),
    exportMp3: async () => undefined,
  };
}

describe('SQLite song storage', () => {
  let raw: Database;
  let files: ReturnType<typeof memoryFiles>;
  let storage: ReturnType<typeof createSqlStorage>;

  beforeEach(async () => {
    const SQL = await initSqlJs();
    raw = new SQL.Database();
    files = memoryFiles();
    storage = createSqlStorage(async () => adapt(raw), files, 'test');
  });

  const song = (id: string, createdAt: string) =>
    ({ ...createSong({ id, title: `Song ${id}`, originalFilename: `${id}.mp3`, audioBytes: 3, analysis }), createdAt });

  it('creates the schema and stores songs with their MP3', async () => {
    await storage.add(song('a', '2026-01-01'), new Uint8Array([1, 2, 3]).buffer);
    expect(raw.exec('PRAGMA user_version')[0].values[0][0]).toBe(SCHEMA_VERSION);
    expect(files.store.get('a')).toEqual(new Uint8Array([1, 2, 3]));
    const got = await storage.get('a');
    expect(got?.title).toBe('Song a');
    expect(got?.analysis.key).toBe('G major');
    expect(await storage.audioUri('a')).toBe('mem://a');
  });

  it('lists newest first and keeps columns in sync with the record', async () => {
    await storage.add(song('old', '2026-01-01'), new ArrayBuffer(1));
    await storage.add(song('new', '2026-03-01'), new ArrayBuffer(1));
    expect((await storage.list()).map((s) => s.id)).toEqual(['new', 'old']);

    const fav = applyPatch((await storage.get('old'))!, { isFavourite: true, title: 'Renamed' });
    await storage.put(upsertCorrection(fav, { start: 0, originalLabel: 'G', correctedLabel: 'G7' }));
    const row = raw.exec("SELECT title, is_favourite FROM songs WHERE id = 'old'")[0].values[0];
    expect(row).toEqual(['Renamed', 1]);
    expect((await storage.get('old'))?.corrections[0].correctedLabel).toBe('G7');
    expect((await storage.list())).toHaveLength(2);
  });

  it('deletes the row and the MP3', async () => {
    await storage.add(song('x', '2026-01-01'), new ArrayBuffer(1));
    await storage.remove('x');
    expect(await storage.get('x')).toBeNull();
    expect(files.store.has('x')).toBe(false);
  });

  it('skips corrupt rows instead of failing', async () => {
    await storage.add(song('ok', '2026-01-01'), new ArrayBuffer(1));
    raw.run("INSERT INTO songs VALUES ('bad','t',NULL,'2026-02-01','2026-02-01',0,1,'{not json')");
    expect((await storage.list()).map((s) => s.id)).toEqual(['ok']);
  });

  it('survives reopening the same database', async () => {
    await storage.add(song('keep', '2026-01-01'), new ArrayBuffer(1));
    const again = createSqlStorage(async () => adapt(raw), files, 'test');
    expect((await again.list()).map((s) => s.id)).toEqual(['keep']);
  });
});
