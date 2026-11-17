/**
 * Web-bundle storage. The same bundle runs in two places:
 *  - the Windows app (Tauri), which uses SQLite plus MP3 files in the app's data folder;
 *  - a normal browser (`npm run dev`), which uses IndexedDB.
 */

import { isTauri } from '@tauri-apps/api/core';

import { indexedDbStorage } from './storage.indexeddb';
import { tauriStorage } from './storage.tauri';
import type { SongStorage } from './storage.types';

export const storage: SongStorage = isTauri() ? tauriStorage : indexedDbStorage;
