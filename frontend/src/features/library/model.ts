/**
 * The on-device music library. There is no database: each song is one JSON record plus one
 * MP3 file, stored on the user's own device. These pure helpers are shared by the web
 * (IndexedDB) and native (file system) storage backends.
 */

import type { Lyrics } from '@/lib/music/lyrics';
import type { MidiNote } from '@/lib/music/placement';
import type { AnalysisResult } from '@/services/api';

export interface ChordCorrection {
  /** Start time (s) of the corrected segment, in the original key. */
  start: number;
  originalLabel: string;
  correctedLabel: string;
}

/** Per-song practice settings, remembered between sessions. */
export interface PracticeSettings {
  /** Capo fret; chord shapes are shown relative to it. */
  capo: number;
  /** Change of key in semitones (the recording does not change; for playing without it). */
  keyShift: number;
  /** Fingerpicking pattern id. */
  pattern: string;
  countIn: boolean;
  /** Guitar tuning id you play in ('standard' by default; or the song's original tuning). */
  tuning: string;
  /** Strum pattern: 'auto' (detected), a preset id, or a pattern string like "D-DU-UDU". */
  strum?: string;
  /** Show strum arrows in the chord lane. */
  showStrum?: boolean;
  /** Lyrics timing nudge in ms: positive lights each line up earlier (for words that lag). */
  lyricsOffsetMs?: number;
}

export const DEFAULT_PRACTICE: PracticeSettings = { capo: 0, keyShift: 0, pattern: 'arpeggio', countIn: false, tuning: 'standard' };

export interface LocalSong {
  /** Format version, so stored records can be migrated later. */
  version: 1;
  id: string;
  title: string;
  artist: string | null;
  originalFilename: string;
  /** Size of the saved MP3 in bytes. */
  audioBytes: number;
  createdAt: string;
  updatedAt: string;
  isFavourite: boolean;
  notes: string | null;
  analysis: AnalysisResult;
  corrections: ChordCorrection[];
  practice?: PracticeSettings;
  /** Experimental note transcription, if the user requested one. */
  transcription?: TranscriptionResult;
  /** Lyrics the user pasted or imported (never downloaded), optionally timed per line. */
  lyrics?: Lyrics;
}

/** Experimental transcription: detected notes (sounding pitch). Fret placement happens in the app. */
export interface TranscriptionResult {
  notes: MidiNote[];
  source: string;
  model_version: string;
  processing_seconds: number;
  created_at: string;
}

export type SongPatch = Partial<Pick<LocalSong, 'title' | 'artist' | 'notes' | 'isFavourite' | 'practice' | 'transcription' | 'lyrics'>>;

export const practiceOf = (song: LocalSong): PracticeSettings => ({ ...DEFAULT_PRACTICE, ...song.practice });

export function newSongId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand}`;
}

export function createSong(input: {
  id?: string;
  title: string;
  originalFilename: string;
  audioBytes: number;
  analysis: AnalysisResult;
  now?: Date;
}): LocalSong {
  const ts = (input.now ?? new Date()).toISOString();
  return {
    version: 1,
    id: input.id ?? newSongId(),
    title: input.title.trim().slice(0, 200) || 'Untitled',
    artist: null,
    originalFilename: input.originalFilename,
    audioBytes: input.audioBytes,
    createdAt: ts,
    updatedAt: ts,
    isFavourite: false,
    notes: null,
    analysis: input.analysis,
    corrections: [],
  };
}

const sameStart = (a: number, b: number) => Math.abs(a - b) < 1e-3;

export function applyPatch(song: LocalSong, patch: SongPatch, now = new Date()): LocalSong {
  return { ...song, ...patch, updatedAt: now.toISOString() };
}

/** Add or replace the correction for the segment starting at `c.start`. */
export function upsertCorrection(song: LocalSong, c: ChordCorrection, now = new Date()): LocalSong {
  const others = song.corrections.filter((x) => !sameStart(x.start, c.start));
  const corrections = c.correctedLabel === c.originalLabel ? others : [...others, c].sort((a, b) => a.start - b.start);
  return { ...song, corrections, updatedAt: now.toISOString() };
}

export function removeCorrection(song: LocalSong, start: number, now = new Date()): LocalSong {
  return { ...song, corrections: song.corrections.filter((x) => !sameStart(x.start, start)), updatedAt: now.toISOString() };
}

export function sortByNewest(songs: LocalSong[]): LocalSong[] {
  return [...songs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Validate a record read from storage; returns null for anything malformed. */
export function parseSong(raw: unknown): LocalSong | null {
  const s = raw as Partial<LocalSong> | null;
  if (!s || s.version !== 1 || typeof s.id !== 'string' || typeof s.title !== 'string' || !s.analysis || !Array.isArray(s.analysis.chords)) {
    return null;
  }
  return { ...s, corrections: Array.isArray(s.corrections) ? s.corrections : [] } as LocalSong;
}

/** A filesystem-safe MP3 filename for exports. */
export function exportFilename(song: Pick<LocalSong, 'title' | 'artist'>): string {
  const base = [song.artist, song.title].filter(Boolean).join(' - ');
  const safe = base.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return `${safe || 'song'}.mp3`;
}
