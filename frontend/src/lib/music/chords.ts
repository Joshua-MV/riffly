import { mod12, parsePitchClass, pitchClassName, type PitchClass, type Spelling } from './notes';

export type ChordQuality = 'maj' | 'min' | '7' | 'maj7' | 'm7' | 'sus2' | 'sus4' | 'dim' | 'aug';

export type ChordCategory = 'major' | 'minor' | 'seventh' | 'suspended' | 'diminished' | 'augmented';

export interface QualityInfo {
  intervals: readonly number[];
  suffix: string;
  label: string;
  category: ChordCategory;
  /** Intervals that may be left out of a voicing without changing the chord's identity. */
  optional: readonly number[];
  description: string;
}

export const QUALITIES: Record<ChordQuality, QualityInfo> = {
  maj: { intervals: [0, 4, 7], suffix: '', label: 'Major', category: 'major', optional: [7], description: 'Bright and stable. Root, major third and fifth.' },
  min: { intervals: [0, 3, 7], suffix: 'm', label: 'Minor', category: 'minor', optional: [7], description: 'Darker and softer. Root, minor third and fifth.' },
  '7': { intervals: [0, 4, 7, 10], suffix: '7', label: 'Dominant 7th', category: 'seventh', optional: [7], description: 'Bluesy tension that wants to resolve. A major chord plus a flat seventh.' },
  maj7: { intervals: [0, 4, 7, 11], suffix: 'maj7', label: 'Major 7th', category: 'seventh', optional: [7], description: 'Dreamy and smooth. A major chord plus a major seventh.' },
  m7: { intervals: [0, 3, 7, 10], suffix: 'm7', label: 'Minor 7th', category: 'seventh', optional: [7], description: 'Mellow and jazzy. A minor chord plus a flat seventh.' },
  sus2: { intervals: [0, 2, 7], suffix: 'sus2', label: 'Suspended 2nd', category: 'suspended', optional: [], description: 'Open and airy. The third is replaced by the second.' },
  sus4: { intervals: [0, 5, 7], suffix: 'sus4', label: 'Suspended 4th', category: 'suspended', optional: [], description: 'Unresolved and expectant. The third is replaced by the fourth.' },
  dim: { intervals: [0, 3, 6], suffix: 'dim', label: 'Diminished', category: 'diminished', optional: [], description: 'Tense and unstable. Minor third and flattened fifth.' },
  aug: { intervals: [0, 4, 8], suffix: 'aug', label: 'Augmented', category: 'augmented', optional: [], description: 'Eerie and restless. Major third and sharpened fifth.' },
};

export const QUALITY_ORDER: readonly ChordQuality[] = ['maj', 'min', '7', 'maj7', 'm7', 'sus2', 'sus4', 'dim', 'aug'];

export interface ChordSymbol {
  root: PitchClass;
  quality: ChordQuality;
  /** Slash-chord bass note, if different from the root. */
  bass?: PitchClass;
}

const SUFFIX_ALIASES: Record<string, ChordQuality> = {
  '': 'maj', M: 'maj', maj: 'maj', major: 'maj',
  m: 'min', min: 'min', minor: 'min', '-': 'min',
  '7': '7', dom7: '7',
  maj7: 'maj7', M7: 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', ma7: 'maj7',
  m7: 'm7', min7: 'm7', '-7': 'm7',
  sus2: 'sus2', sus4: 'sus4', sus: 'sus4',
  dim: 'dim', '°': 'dim', o: 'dim',
  aug: 'aug', '+': 'aug',
};

/** Parse a chord symbol such as "F#m7", "Bb", "Dsus4", "G/B". Returns null for "N" or unknown. */
export function parseChord(label: string): ChordSymbol | null {
  const m = /^([A-G][#♯b♭]?)([^/]*)(?:\/([A-G][#♯b♭]?))?$/.exec(label.trim());
  if (!m) return null;
  const root = parsePitchClass(m[1]);
  const quality = SUFFIX_ALIASES[m[2]];
  if (root === null || quality === undefined) return null;
  const bass = m[3] ? parsePitchClass(m[3]) : null;
  return bass !== null && bass !== root ? { root, quality, bass } : { root, quality };
}

export function formatChord(chord: ChordSymbol, spelling: Spelling = 'common'): string {
  const base = pitchClassName(chord.root, spelling) + QUALITIES[chord.quality].suffix;
  return chord.bass !== undefined ? `${base}/${pitchClassName(chord.bass, spelling)}` : base;
}

export function chordTones(chord: ChordSymbol): PitchClass[] {
  return QUALITIES[chord.quality].intervals.map((i) => mod12(chord.root + i));
}

export function transposeSymbol(chord: ChordSymbol, semitones: number): ChordSymbol {
  const out: ChordSymbol = { root: mod12(chord.root + semitones), quality: chord.quality };
  if (chord.bass !== undefined) out.bass = mod12(chord.bass + semitones);
  return out;
}

/** Transpose a chord label. Labels that cannot be parsed (e.g. "N") are returned unchanged. */
export function transposeLabel(label: string, semitones: number, spelling: Spelling = 'common'): string {
  const chord = parseChord(label);
  if (!chord || mod12(semitones) === 0) return label;
  return formatChord(transposeSymbol(chord, semitones), spelling);
}

/** Stable id usable in URLs, e.g. "Fs-m7" for F#m7. */
export function chordId(chord: ChordSymbol): string {
  return `${pitchClassName(chord.root, 'sharps').replace('#', 's')}-${chord.quality}`;
}

export function parseChordId(id: string): ChordSymbol | null {
  const [rootPart, quality] = id.split('-');
  const root = parsePitchClass((rootPart ?? '').replace('s', '#'));
  if (root === null || !(quality in QUALITIES)) return null;
  return { root, quality: quality as ChordQuality };
}
