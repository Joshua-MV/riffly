/**
 * Guitar chord voicings (standard tuning).
 *
 * Two sources:
 *  1. Curated open-position voicings — the shapes beginners learn first.
 *  2. Movable shapes (CAGED "E-shape" rooted on string 6 and "A-shape" rooted on string 5)
 *     transposed to every root. This yields a correct voicing for every root × quality
 *     without hand-typing hundreds of diagrams. Correctness is enforced by unit tests:
 *     every fretted note is a chord tone, the bass is the root, required tones are present,
 *     and the fret span is playable.
 */

import { chordId, formatChord, QUALITY_ORDER, type ChordQuality, type ChordSymbol } from './chords';
import { mod12, parsePitchClass, type PitchClass } from './notes';
import { generateShapes } from './voicegen';

/** Fret per string, lowest string first. null = muted, 0 = open. */
export type Frets = readonly (number | null)[];
/** Finger per string: 1 index … 4 pinky, 0 = open/unused, null = muted. */
export type Fingers = readonly (number | null)[];

export type VoicingShape = 'open' | 'E-shape' | 'A-shape' | 'D-shape';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface Barre {
  fret: number;
  /** String indices (0 = low E) covered by the barre, inclusive. */
  fromString: number;
  toString: number;
}

export interface Voicing {
  id: string;
  chord: ChordSymbol;
  frets: Frets;
  fingers: Fingers;
  shape: VoicingShape;
  difficulty: Difficulty;
  barre: Barre | null;
  /** Lowest fretted fret (≥ 1), used to position the diagram window. */
  minFret: number;
  maxFret: number;
}

/** Open-string pitch classes of standard tuning, low to high. */
export const STANDARD_OPEN_PCS: readonly PitchClass[] = [4, 9, 2, 7, 11, 4];
export const STANDARD_OPEN_MIDI: readonly number[] = [40, 45, 50, 55, 59, 64];

type X = null;
const x: X = null;

interface ShapeTemplate {
  /** Offsets from the barre fret, lowest string first. */
  offsets: readonly (number | X)[];
  fingers: readonly (number | X)[];
}

// Root on string 6 (E-shape). Offset 0 = barre fret.
const E_SHAPES: Partial<Record<ChordQuality, ShapeTemplate>> = {
  maj: { offsets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1] },
  min: { offsets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1] },
  '7': { offsets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1] },
  maj7: { offsets: [0, x, 1, 1, 0, x], fingers: [1, x, 3, 4, 2, x] },
  m7: { offsets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1] },
  sus4: { offsets: [0, 2, 2, 2, 0, 0], fingers: [1, 2, 3, 4, 1, 1] },
  dim: { offsets: [0, 1, 2, 0, x, x], fingers: [1, 2, 3, 1, x, x] },
  aug: { offsets: [0, x, 2, 1, 1, 0], fingers: [1, x, 4, 2, 3, 1] },
  // Power chord on the low E string: root, fifth, octave. Mute the rest with the fretting hand.
  '5': { offsets: [0, 2, 2, x, x, x], fingers: [1, 3, 4, x, x, x] },
};

// Root on string 5 (A-shape).
const A_SHAPES: Partial<Record<ChordQuality, ShapeTemplate>> = {
  maj: { offsets: [x, 0, 2, 2, 2, 0], fingers: [x, 1, 2, 3, 4, 1] },
  min: { offsets: [x, 0, 2, 2, 1, 0], fingers: [x, 1, 3, 4, 2, 1] },
  '7': { offsets: [x, 0, 2, 0, 2, 0], fingers: [x, 1, 3, 1, 4, 1] },
  maj7: { offsets: [x, 0, 2, 1, 2, 0], fingers: [x, 1, 3, 2, 4, 1] },
  m7: { offsets: [x, 0, 2, 0, 1, 0], fingers: [x, 1, 3, 1, 2, 1] },
  sus2: { offsets: [x, 0, 2, 2, 0, 0], fingers: [x, 1, 3, 4, 1, 1] },
  sus4: { offsets: [x, 0, 2, 2, 3, 0], fingers: [x, 1, 2, 3, 4, 1] },
  dim: { offsets: [x, 0, 1, 2, 1, x], fingers: [x, 1, 2, 4, 3, x] },
  aug: { offsets: [x, 0, 3, 2, 2, x], fingers: [x, 1, 4, 2, 3, x] },
  // Power chord on the A string: root, fifth, octave.
  '5': { offsets: [x, 0, 2, 2, x, x], fingers: [x, 1, 3, 4, x, x] },
};

// Power chords rooted on the D string (third common position).
const D_SHAPES: Partial<Record<ChordQuality, ShapeTemplate>> = {
  '5': { offsets: [x, x, 0, 2, 3, x], fingers: [x, x, 1, 3, 4, x] },
};

interface CuratedVoicing {
  chord: string;
  frets: Frets;
  fingers: Fingers;
}

// Open-position voicings not produced by the movable shapes at fret 0.
const CURATED: readonly CuratedVoicing[] = [
  { chord: 'C', frets: [x, 3, 2, 0, 1, 0], fingers: [x, 3, 2, 0, 1, 0] },
  { chord: 'D', frets: [x, x, 0, 2, 3, 2], fingers: [x, x, 0, 1, 3, 2] },
  { chord: 'G', frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  { chord: 'G', frets: [3, 2, 0, 0, 3, 3], fingers: [2, 1, 0, 0, 3, 4] },
  { chord: 'F', frets: [x, x, 3, 2, 1, 1], fingers: [x, x, 3, 2, 1, 1] },
  { chord: 'Dm', frets: [x, x, 0, 2, 3, 1], fingers: [x, x, 0, 2, 3, 1] },
  { chord: 'C7', frets: [x, 3, 2, 3, 1, 0], fingers: [x, 3, 2, 4, 1, 0] },
  { chord: 'D7', frets: [x, x, 0, 2, 1, 2], fingers: [x, x, 0, 2, 1, 3] },
  { chord: 'G7', frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  { chord: 'B7', frets: [x, 2, 1, 2, 0, 2], fingers: [x, 2, 1, 3, 0, 4] },
  { chord: 'Cmaj7', frets: [x, 3, 2, 0, 0, 0], fingers: [x, 3, 2, 0, 0, 0] },
  { chord: 'Dmaj7', frets: [x, x, 0, 2, 2, 2], fingers: [x, x, 0, 1, 1, 1] },
  { chord: 'Fmaj7', frets: [x, x, 3, 2, 1, 0], fingers: [x, x, 3, 2, 1, 0] },
  { chord: 'Gmaj7', frets: [3, 2, 0, 0, 0, 2], fingers: [3, 2, 0, 0, 0, 1] },
  { chord: 'Dm7', frets: [x, x, 0, 2, 1, 1], fingers: [x, x, 0, 2, 1, 1] },
  { chord: 'Dsus2', frets: [x, x, 0, 2, 3, 0], fingers: [x, x, 0, 1, 3, 0] },
  { chord: 'Dsus4', frets: [x, x, 0, 2, 3, 3], fingers: [x, x, 0, 1, 2, 3] },
  { chord: 'Cadd9', frets: [x, 3, 2, 0, 3, 0], fingers: [x, 2, 1, 0, 3, 0] },
  { chord: 'Cadd9', frets: [x, 3, 2, 0, 3, 3], fingers: [x, 2, 1, 0, 3, 4] },
  { chord: 'Gadd9', frets: [3, 2, 0, 2, 0, 3], fingers: [2, 1, 0, 3, 0, 4] },
  { chord: 'Csus2', frets: [x, 3, 0, 0, 1, 3], fingers: [x, 3, 0, 0, 1, 4] },
];

function parseCuratedChord(label: string): ChordSymbol {
  const m = /^([A-G][#b]?)(.*)$/.exec(label);
  const root = m ? parsePitchClass(m[1]) : null;
  const suffix = m?.[2] ?? '';
  const quality = (
    { '': 'maj', m: 'min', '7': '7', maj7: 'maj7', m7: 'm7', sus2: 'sus2', sus4: 'sus4', add9: 'add9' } as Record<string, ChordQuality>
  )[suffix];
  if (root === null || !quality) throw new Error(`Bad curated chord ${label}`);
  return { root, quality };
}

function fretRange(frets: Frets): { minFret: number; maxFret: number } {
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  return fretted.length
    ? { minFret: Math.min(...fretted), maxFret: Math.max(...fretted) }
    : { minFret: 0, maxFret: 0 };
}

/** A barre exists when finger 1 holds the same fret on two or more strings. */
export function detectBarre(frets: Frets, fingers: Fingers): Barre | null {
  const strings = fingers
    .map((f, i) => (f === 1 && frets[i] !== null && (frets[i] as number) > 0 ? i : -1))
    .filter((i) => i >= 0);
  if (strings.length < 2) return null;
  const fret = frets[strings[0]] as number;
  if (!strings.every((i) => frets[i] === fret)) return null;
  return { fret, fromString: strings[0], toString: strings[strings.length - 1] };
}

function difficultyOf(chord: ChordSymbol, shape: VoicingShape, barre: Barre | null, maxFret: number): Difficulty {
  if (shape === 'open' && !barre) return 'beginner';
  // Two- or three-finger power chords are among the first shapes electric players learn.
  if (chord.quality === '5') return maxFret > 12 ? 'intermediate' : 'beginner';
  if (barre && barre.toString - barre.fromString >= 4) return maxFret > 9 ? 'advanced' : 'intermediate';
  return maxFret > 9 ? 'advanced' : 'intermediate';
}

function makeVoicing(chord: ChordSymbol, frets: Frets, fingers: Fingers, shape: VoicingShape): Voicing {
  const { minFret, maxFret } = fretRange(frets);
  const barre = detectBarre(frets, fingers);
  // A movable shape played at the nut (open strings, low frets) is an open chord.
  const isOpenPosition = frets.some((f) => f === 0) && maxFret <= 4;
  const effectiveShape = isOpenPosition ? 'open' : shape;
  return {
    id: `${chordId(chord)}:${frets.map((f) => (f === null ? 'x' : f)).join('')}`,
    chord,
    frets,
    fingers,
    shape: effectiveShape,
    difficulty: difficultyOf(chord, effectiveShape, barre, maxFret),
    barre,
    minFret,
    maxFret,
  };
}

/** Instantiate a movable shape at `baseFret`. At fret 0 the barre becomes open strings and
 * the remaining fingers are renumbered from 1 (e.g. the E-major barre shape → 0-2-2-1-0-0
 * fingered 2-3-1). */
function instantiate(template: ShapeTemplate, baseFret: number): { frets: Frets; fingers: Fingers } {
  const frets = template.offsets.map((o) => (o === null ? null : o + baseFret));
  if (baseFret > 0) return { frets, fingers: template.fingers };
  const used = Array.from(
    new Set(template.fingers.filter((f, i): f is number => f !== null && frets[i] !== 0)),
  ).sort((a, b) => a - b);
  const fingers = template.fingers.map((f, i) => {
    if (f === null) return null;
    if (frets[i] === 0) return 0;
    return used.indexOf(f) + 1;
  });
  return { frets, fingers };
}

const SHAPE_SOURCES: readonly [VoicingShape, Partial<Record<ChordQuality, ShapeTemplate>>, number][] = [
  ['E-shape', E_SHAPES, STANDARD_OPEN_PCS[0]],
  ['A-shape', A_SHAPES, STANDARD_OPEN_PCS[1]],
  ['D-shape', D_SHAPES, STANDARD_OPEN_PCS[2]],
];

const DIFFICULTY_RANK: Record<Difficulty, number> = { beginner: 0, intermediate: 1, advanced: 2 };

const cache = new Map<string, Voicing[]>();

/**
 * All voicings for a chord, easiest first, in standard tuning (default) or any other tuning
 * given as open-string MIDI notes (lowest string first). Slash chords (G/B) get shapes with
 * that bass note; in standard tuning, plain chords use hand-picked open and barre shapes.
 */
export function getVoicings(chord: ChordSymbol, openMidi: readonly number[] = STANDARD_OPEN_MIDI): Voicing[] {
  const standard = openMidi.length === 6 && openMidi.every((m, i) => m === STANDARD_OPEN_MIDI[i]);
  const key = `${chordId(chord)}/${chord.bass ?? ''}@${openMidi.join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out: Voicing[] = [];
  const seen = new Set<string>();
  const push = (v: Voicing) => {
    if (seen.has(v.id)) return;
    seen.add(v.id);
    out.push(v);
  };
  if (!standard || chord.bass !== undefined) {
    for (const g of generateShapes(chord, openMidi, 4)) push(makeVoicing(chord, g.frets, g.fingers, 'open'));
    if (standard && !out.length) out.push(...getVoicings({ root: chord.root, quality: chord.quality }));
    cache.set(key, out);
    return out;
  }
  const base: ChordSymbol = { root: chord.root, quality: chord.quality };

  for (const c of CURATED) {
    const sym = parseCuratedChord(c.chord);
    if (sym.root === base.root && sym.quality === base.quality) push(makeVoicing(base, c.frets, c.fingers, 'open'));
  }
  for (const [shape, templates, openPc] of SHAPE_SOURCES) {
    const template = templates[base.quality];
    if (!template) continue;
    const fret = mod12(base.root - openPc);
    const { frets, fingers } = instantiate(template, fret);
    push(makeVoicing(base, frets, fingers, shape));
    // Also offer the shape an octave up when it stays within a comfortable range.
    if (fret === 0) {
      const up = instantiate(template, 12);
      push(makeVoicing(base, up.frets, up.fingers, shape));
    }
  }
  // Chords without a hand-picked or movable shape (e.g. add9) come from the generator.
  if (!out.length) for (const g of generateShapes(base, openMidi, 3)) push(makeVoicing(base, g.frets, g.fingers, 'open'));
  out.sort(
    (a, b) => DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty] || a.minFret - b.minFret,
  );
  cache.set(key, out);
  return out;
}

/** Sounding MIDI notes of a voicing in standard tuning (for playback). */
export function voicingMidiNotes(frets: Frets, openMidi: readonly number[] = STANDARD_OPEN_MIDI): number[] {
  return frets.flatMap((f, i) => (f === null ? [] : [openMidi[i] + f]));
}

export interface LibraryChord {
  chord: ChordSymbol;
  id: string;
  name: string;
  voicings: Voicing[];
}

/** Every chord in the library: 12 roots × 9 qualities. */
export function libraryChords(): LibraryChord[] {
  const out: LibraryChord[] = [];
  for (const quality of QUALITY_ORDER) {
    for (let root = 0; root < 12; root++) {
      const chord: ChordSymbol = { root, quality };
      out.push({ chord, id: chordId(chord), name: formatChord(chord), voicings: getVoicings(chord) });
    }
  }
  return out;
}
