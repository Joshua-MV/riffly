/**
 * Pitch, note-name and frequency utilities. Instrument-agnostic.
 * Pitch classes are integers 0–11 with C = 0. MIDI note 69 = A4.
 */

export type PitchClass = number;

/** Spelling most guitarists use: sharps for C#/F#, flats for Eb/Ab/Bb. */
export const COMMON_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

export type Spelling = 'common' | 'sharps' | 'flats';

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const mod12 = (n: number): PitchClass => ((n % 12) + 12) % 12;

export function pitchClassName(pc: PitchClass, spelling: Spelling = 'common'): string {
  const table = spelling === 'sharps' ? SHARP_NAMES : spelling === 'flats' ? FLAT_NAMES : COMMON_NAMES;
  return table[mod12(pc)];
}

/** Parse "C", "F#", "Bb", "E#", "Cb" (with ♯/♭ accepted) into a pitch class. */
export function parsePitchClass(name: string): PitchClass | null {
  const m = /^([A-Ga-g])([#♯b♭]*)$/.exec(name.trim());
  if (!m) return null;
  let pc = LETTER_PC[m[1].toUpperCase()];
  for (const acc of m[2]) pc += acc === '#' || acc === '♯' ? 1 : -1;
  return mod12(pc);
}

/** Parse scientific pitch notation ("E2", "Eb4", "C#3") into a MIDI note number. */
export function parseScientificPitch(note: string): number | null {
  const m = /^([A-Ga-g][#♯b♭]*)(-?\d)$/.exec(note.trim());
  if (!m) return null;
  const pc = parsePitchClass(m[1]);
  if (pc === null) return null;
  // Octave boundaries are by letter: Cb4 is B3, B#3 is C4.
  const letterPc = LETTER_PC[m[1][0].toUpperCase()];
  const accidental = pc - letterPc;
  const wrapped = accidental > 6 ? accidental - 12 : accidental < -6 ? accidental + 12 : accidental;
  return (Number(m[2]) + 1) * 12 + letterPc + wrapped;
}

export function midiToFrequency(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

export function frequencyToMidi(frequency: number, a4 = 440): number {
  return 69 + 12 * Math.log2(frequency / a4);
}

export function centsBetween(frequency: number, reference: number): number {
  return 1200 * Math.log2(frequency / reference);
}

export function midiToNoteName(midi: number, spelling: Spelling = 'common'): { name: string; octave: number } {
  const rounded = Math.round(midi);
  return { name: pitchClassName(rounded, spelling), octave: Math.floor(rounded / 12) - 1 };
}

export interface NoteReading {
  frequency: number;
  /** Nearest equal-tempered MIDI note. */
  midi: number;
  name: string;
  octave: number;
  /** Deviation from the nearest note, -50..+50. */
  cents: number;
}

export function describeFrequency(frequency: number, a4 = 440, spelling: Spelling = 'common'): NoteReading {
  const exact = frequencyToMidi(frequency, a4);
  const midi = Math.round(exact);
  const { name, octave } = midiToNoteName(midi, spelling);
  return { frequency, midi, name, octave, cents: (exact - midi) * 100 };
}
