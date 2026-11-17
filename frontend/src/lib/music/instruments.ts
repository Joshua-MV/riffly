import { centsBetween, midiToFrequency, parseScientificPitch, type Spelling } from './notes';

/**
 * Instruments are described by data (string count, fret count, tunings), so adding bass
 * or ukulele means adding entries here — the tuner, fretboard and voicing code are generic.
 */
export type InstrumentId = 'guitar' | 'bass' | 'ukulele';

export interface Tuning {
  id: string;
  name: string;
  instrument: InstrumentId;
  /** Scientific pitch notation, lowest-pitched string first. */
  notes: readonly string[];
  spelling: Spelling;
}

export interface Instrument {
  id: InstrumentId;
  name: string;
  strings: number;
  frets: number;
  tunings: readonly Tuning[];
}

export const GUITAR_TUNINGS: readonly Tuning[] = [
  { id: 'standard', name: 'Standard', instrument: 'guitar', notes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], spelling: 'common' },
  { id: 'drop-d', name: 'Drop D', instrument: 'guitar', notes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'], spelling: 'common' },
  { id: 'half-down', name: 'Half-step down', instrument: 'guitar', notes: ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'], spelling: 'flats' },
  { id: 'full-down', name: 'Full-step down', instrument: 'guitar', notes: ['D2', 'G2', 'C3', 'F3', 'A3', 'D4'], spelling: 'common' },
  { id: 'open-g', name: 'Open G', instrument: 'guitar', notes: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'], spelling: 'common' },
];

export const GUITAR: Instrument = { id: 'guitar', name: 'Guitar', strings: 6, frets: 22, tunings: GUITAR_TUNINGS };

export interface TunedString {
  index: number;
  note: string;
  midi: number;
  frequency: number;
}

export function tuningStrings(tuning: Tuning, a4 = 440): TunedString[] {
  return tuning.notes.map((note, index) => {
    const midi = parseScientificPitch(note);
    if (midi === null) throw new Error(`Invalid note "${note}" in tuning ${tuning.id}`);
    return { index, note, midi, frequency: midiToFrequency(midi, a4) };
  });
}

/** Index of the string whose open pitch is closest (in cents) to the frequency. */
export function closestString(strings: readonly TunedString[], frequency: number): TunedString {
  let best = strings[0];
  let bestDistance = Infinity;
  for (const s of strings) {
    const d = Math.abs(centsBetween(frequency, s.frequency));
    if (d < bestDistance) {
      best = s;
      bestDistance = d;
    }
  }
  return best;
}
