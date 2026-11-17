/**
 * Browser storage (used by `npm run dev` in a normal browser): IndexedDB. Two object stores: `songs` (JSON records)
 * and `audio` (MP3 blobs keyed by song id). Data stays on this computer, in this browser.
 */

import { exportFilename, parseSong, sortByNewest, type LocalSong } from './model';
import type { SongStorage } from './storage.types';

const DB_NAME = 'riffly';
const DB_VERSION = 1;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('This browser does not support local storage for songs (IndexedDB).'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('songs')) db.createObjectStore('songs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('Could not open local storage'));
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Storage write failed'));
    tx.onabort = () => reject(tx.error ?? new Error('Storage write was aborted (is the disk full?)'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const objectUrls = new Map<string, string>();

async function audioBlob(id: string): Promise<Blob> {
  const db = await openDb();
  const blob = await request<Blob | undefined>(db.transaction('audio').objectStore('audio').get(id));
  if (!blob) throw new Error('The audio for this song is missing from this browser.');
  return blob;
}

export const indexedDbStorage: SongStorage = {
  location: 'This browser (IndexedDB)',

  async list() {
    const db = await openDb();
    const rows = await request<unknown[]>(db.transaction('songs').objectStore('songs').getAll());
    return sortByNewest(rows.map(parseSong).filter((s): s is LocalSong => s !== null));
  },

  async get(id) {
    const db = await openDb();
    return parseSong(await request(db.transaction('songs').objectStore('songs').get(id)));
  },

  async add(song, mp3) {
    // Ask the browser not to evict our data under storage pressure (best effort).
    void navigator.storage?.persist?.();
    const db = await openDb();
    const tx = db.transaction(['songs', 'audio'], 'readwrite');
    tx.objectStore('audio').put(new Blob([mp3], { type: 'audio/mpeg' }), song.id);
    tx.objectStore('songs').put(song);
    await done(tx);
  },

  async put(song) {
    const db = await openDb();
    const tx = db.transaction('songs', 'readwrite');
    tx.objectStore('songs').put(song);
    await done(tx);
  },

  async remove(id) {
    const db = await openDb();
    const tx = db.transaction(['songs', 'audio'], 'readwrite');
    tx.objectStore('songs').delete(id);
    tx.objectStore('audio').delete(id);
    await done(tx);
    const url = objectUrls.get(id);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(id);
  },

  async audioUri(id) {
    const cached = objectUrls.get(id);
    if (cached) return cached;
    const url = URL.createObjectURL(await audioBlob(id));
    objectUrls.set(id, url);
    return url;
  },

  async uploadSource(song) {
    return { kind: 'web', file: await audioBlob(song.id), name: exportFilename(song) };
  },

  async exportMp3(song) {
    const url = URL.createObjectURL(await audioBlob(song.id));
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFilename(song);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};
