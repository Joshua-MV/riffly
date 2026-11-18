/**
 * On-device lyrics (Windows app): whisper.cpp listens to the song and writes down the words
 * with their times. Nothing is uploaded. The speech model is downloaded once, on request.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type { HeardSegment } from '@/lib/music/lyrics';

export interface ModelStatus {
  present: boolean;
  bytes: number;
}

export const lyricsEngine = {
  available: (): boolean => isTauri(),

  status: (): Promise<ModelStatus> => invoke<ModelStatus>('lyrics_model_status'),

  async download(onProgress: (done: number, total: number) => void): Promise<void> {
    const off = await listen<{ done: number; total: number }>('lyrics-model-progress', (e) => onProgress(e.payload.done, e.payload.total));
    try {
      await invoke('download_lyrics_model');
    } finally {
      off();
    }
  },

  async transcribe(bytes: Uint8Array, onProgress: (percent: number) => void): Promise<HeardSegment[]> {
    const off = await listen<number>('lyrics-progress', (e) => onProgress(e.payload));
    try {
      const json = await invoke<string>('transcribe_lyrics', bytes);
      return JSON.parse(json) as HeardSegment[];
    } finally {
      off();
    }
  },
};
