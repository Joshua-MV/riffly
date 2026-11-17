import type { LocalSong } from './model';

/** Device storage backend: IndexedDB on the web, the app's documents folder on iOS/Android. */
export interface SongStorage {
  list(): Promise<LocalSong[]>;
  get(id: string): Promise<LocalSong | null>;
  /** Save a new song together with its MP3. */
  add(song: LocalSong, mp3: ArrayBuffer): Promise<void>;
  /** Overwrite the JSON record (metadata, corrections). The MP3 is untouched. */
  put(song: LocalSong): Promise<void>;
  remove(id: string): Promise<void>;
  /** A URI the audio player can load. */
  audioUri(id: string): Promise<string>;
  /** Hand the MP3 to the user: a browser download, or the native share sheet ("Save to Files"). */
  exportMp3(song: LocalSong): Promise<void>;
  /** Where songs live, for display in settings. */
  location: string;
}
