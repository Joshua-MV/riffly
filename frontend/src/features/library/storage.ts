/**
 * iOS/Android storage: plain files in the app's private documents folder.
 *   <documents>/riffly/songs/<id>.json   song record
 *   <documents>/riffly/songs/<id>.mp3    audio
 * On iOS the folder is also visible in the Files app (UIFileSharingEnabled in app.json).
 * Uninstalling the app deletes it, so "Save MP3" exports a copy via the share sheet.
 */

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { exportFilename, parseSong, sortByNewest, type LocalSong } from './model';
import type { SongStorage } from './storage.types';

function songsDir(): Directory {
  const dir = new Directory(Paths.document, 'riffly', 'songs');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

const jsonFile = (id: string) => new File(songsDir(), `${id}.json`);
const mp3File = (id: string) => new File(songsDir(), `${id}.mp3`);

async function readSong(file: File): Promise<LocalSong | null> {
  try {
    return parseSong(JSON.parse(await file.text()));
  } catch {
    return null; // A corrupt record shouldn't break the whole library.
  }
}

export const storage: SongStorage = {
  location: 'This device (app documents folder)',

  async list() {
    const files = songsDir()
      .list()
      .filter((f): f is File => f instanceof File && f.name.endsWith('.json'));
    const songs = await Promise.all(files.map(readSong));
    return sortByNewest(songs.filter((s): s is LocalSong => s !== null));
  },

  async get(id) {
    const f = jsonFile(id);
    return f.exists ? readSong(f) : null;
  },

  async add(song, mp3) {
    // Write the audio first: a record without audio is worse than stray audio.
    await mp3File(song.id).write(new Uint8Array(mp3));
    await jsonFile(song.id).write(JSON.stringify(song));
  },

  async put(song) {
    await jsonFile(song.id).write(JSON.stringify(song));
  },

  async remove(id) {
    for (const f of [jsonFile(id), mp3File(id)]) if (f.exists) f.delete();
  },

  async audioUri(id) {
    const f = mp3File(id);
    if (!f.exists) throw new Error('The audio file for this song is missing on this device.');
    return f.uri;
  },

  async uploadSource(song) {
    return { kind: 'native', uri: await storage.audioUri(song.id), name: exportFilename(song), mimeType: 'audio/mpeg' };
  },

  async exportMp3(song) {
    // Share a copy with a friendly name ("Artist - Title.mp3").
    const copy = new File(Paths.cache, exportFilename(song));
    if (copy.exists) copy.delete();
    mp3File(song.id).copy(copy);
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
    await Sharing.shareAsync(copy.uri, { mimeType: 'audio/mpeg', UTI: 'public.mp3', dialogTitle: 'Save MP3' });
  },
};
