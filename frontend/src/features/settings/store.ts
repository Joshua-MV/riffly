/**
 * App settings, saved on this device (the Windows app's web storage; a JSON file on Android).
 * A tiny external store so any screen can read them without a provider.
 */

import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';

export interface Settings {
  theme: 'dark' | 'light' | 'system';
  /** Tuner: preset selected when it opens, and the reference pitch. */
  defaultTuning: string;
  a4: number;
  /** Metronome over the song: louder click on beat 1. */
  accentFirstBeat: boolean;
  /** Playback speed a song starts at. */
  defaultSpeed: number;
  /** Tone the motion down to colour changes. */
  reduceMotion: boolean;
  /**
   * How far (ms) the beat lamp, strum highlight and metronome sit behind the player's raw
   * position, so they land on what you actually hear (sound reaches the speakers a little late).
   */
  syncDelayMs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  defaultTuning: 'standard',
  a4: 440,
  accentFirstBeat: true,
  defaultSpeed: 1,
  reduceMotion: false,
  syncDelayMs: 120,
};

const KEY = 'riffly.settings';
let state: Settings = { ...DEFAULT_SETTINGS, ...readSync() };
const listeners = new Set<() => void>();

function readSync(): Partial<Settings> {
  if (Platform.OS !== 'web') return {};
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return raw ? (JSON.parse(raw) as Partial<Settings>) : {};
  } catch {
    return {};
  }
}

const nativeFile = () => new File(Paths.document, 'settings.json');

// Android/iOS: load from the settings file once.
if (Platform.OS !== 'web') {
  void (async () => {
    try {
      const f = nativeFile();
      if (f.exists) {
        state = { ...state, ...(JSON.parse(await f.text()) as Partial<Settings>) };
        listeners.forEach((l) => l());
      }
    } catch {
      // Unreadable settings: keep the defaults.
    }
  })();
}

function persist() {
  const json = JSON.stringify(state);
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(KEY, json);
    } catch {
      // Storage blocked: settings last until the app closes.
    }
  } else {
    void nativeFile().write(json);
  }
}

export function getSettings(): Settings {
  return state;
}

export function updateSettings(patch: Partial<Settings>) {
  state = { ...state, ...patch };
  persist();
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
