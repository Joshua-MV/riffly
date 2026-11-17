/**
 * The built-in C++ engine (engine/), available inside the Windows app. Songs are analysed and
 * converted to MP3 on this PC: nothing is uploaded and no server is needed.
 * (Android gets the same engine via a native module in a later step.)
 */

import { invoke, isTauri } from '@tauri-apps/api/core';

import type { AnalysisResult, UploadSource } from './api';

export const localEngine = {
  available: (): boolean => isTauri(),

  async readBytes(source: UploadSource): Promise<Uint8Array> {
    if (source.kind === 'web') return new Uint8Array(await source.file.arrayBuffer());
    const res = await fetch(source.uri);
    return new Uint8Array(await res.arrayBuffer());
  },

  /** Chords, key, tempo, beats and waveform: same shape as the server's result. */
  async analyze(bytes: Uint8Array): Promise<AnalysisResult> {
    const json = await invoke<string>('analyze_audio', bytes);
    return JSON.parse(json) as AnalysisResult;
  },

  /** The song as MP3 (MP3 input is returned unchanged). */
  async toMp3(bytes: Uint8Array): Promise<ArrayBuffer> {
    return invoke<ArrayBuffer>('to_mp3', bytes);
  },
};
