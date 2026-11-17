/**
 * Song import pipeline:
 *   upload → server analyses + converts to MP3 → download MP3 → save on device → server forgets.
 * Imports live in a small module-level store, so they continue while the user navigates.
 */

import { useSyncExternalStore } from 'react';

import { api, uploadForAnalysis, type UploadSource } from '@/services/api';

import { createSong } from './model';
import { storage } from './storage';

export type ImportPhase = 'uploading' | 'analysing' | 'saving' | 'done' | 'failed';

export interface ImportTask {
  id: string;
  name: string;
  phase: ImportPhase;
  /** 0..1 within the current phase (upload progress); other phases are indeterminate. */
  progress: number;
  error: string | null;
  songId: string | null;
}

const POLL_MS = 1200;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

let tasks: ImportTask[] = [];
const listeners = new Set<() => void>();
const aborts = new Map<string, () => void>();

function emit() {
  for (const l of listeners) l();
}

function update(id: string, patch: Partial<ImportTask>) {
  tasks = tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
  emit();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function startImport(source: UploadSource, onSaved: (songId: string) => void): string {
  const id = `import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const title = source.name.replace(/\.[^.]+$/, '');
  tasks = [{ id, name: source.name, phase: 'uploading', progress: 0, error: null, songId: null }, ...tasks];
  emit();

  void (async () => {
    let jobId: string | null = null;
    try {
      const upload = uploadForAnalysis(source, title, (p) => update(id, { progress: p }));
      aborts.set(id, upload.abort);
      const created = await upload.promise;
      aborts.delete(id);
      jobId = created.id;
      update(id, { phase: 'analysing', progress: 0 });

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      let job = created;
      while (job.status === 'processing') {
        if (Date.now() > deadline) throw new Error('Analysis is taking too long. Please try again.');
        await sleep(POLL_MS);
        job = await api.getJob(created.id);
      }
      if (job.status === 'failed' || !job.result || !job.audio_url) throw new Error(job.error ?? 'Analysis failed.');

      update(id, { phase: 'saving' });
      const mp3 = await api.downloadAudio(job.audio_url);
      const song = createSong({ title: job.title, originalFilename: job.original_filename, audioBytes: mp3.byteLength, analysis: job.result });
      await storage.add(song, mp3);
      update(id, { phase: 'done', songId: song.id });
      onSaved(song.id);
    } catch (e) {
      update(id, { phase: 'failed', error: e instanceof Error ? e.message : 'Import failed.' });
    } finally {
      aborts.delete(id);
      if (jobId) void api.forgetJob(jobId);
    }
  })();
  return id;
}

export function cancelImport(id: string) {
  aborts.get(id)?.();
}

export function dismissImport(id: string) {
  tasks = tasks.filter((t) => t.id !== id);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useImports(): ImportTask[] {
  return useSyncExternalStore(subscribe, () => tasks, () => tasks);
}

export const IMPORT_PHASE_LABEL: Record<ImportPhase, string> = {
  uploading: 'Uploading',
  analysing: 'Finding chords, key and tempo',
  saving: 'Saving MP3 to this device',
  done: 'Saved',
  failed: 'Failed',
};
