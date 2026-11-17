/**
 * "Make it easier": find the capo position whose chord shapes are easiest to play.
 *
 * With a capo on fret c, a chord that sounds as X is played with the shape of X − c
 * semitones. The recording stays in its original key, so the user can still play along.
 * Each option is scored by the duration-weighted difficulty of its shapes.
 */

import { formatChord, parseChord, transposeSymbol, type ChordSymbol } from './chords';
import { getVoicings } from './voicings';

/** 1 = open beginner chord … 7 = barre high up the neck. */
export function shapeDifficulty(chord: ChordSymbol): number {
  const v = getVoicings(chord)[0];
  if (!v) return 10;
  if (v.shape === 'open' && !v.barre) return 1;
  if (chord.quality === '5') return 2; // small movable shape, no barre
  if (v.shape === 'open') return 3; // partial barre, e.g. the small F
  return v.maxFret > 9 ? 7 : 5;
}

export interface TimedChord {
  label: string;
  start: number;
  end: number;
}

export interface CapoOption {
  capo: number;
  /** Lower is easier. */
  score: number;
  /** Fraction of playing time spent on beginner (open, no barre) shapes. */
  easyShare: number;
  /** Distinct shapes to learn, in order of first appearance. */
  shapes: string[];
  /** Shapes that still need a barre. */
  barreShapes: string[];
}

/** Shape name to play for a sounding chord with the capo on `capo`. Unparsable labels pass through. */
export function shapeFor(label: string, capo: number): string {
  const sym = parseChord(label);
  return sym ? formatChord(transposeSymbol(sym, -capo)) : label;
}

const CAPO_PENALTY = 0.04; // per fret: prefer lower capos when shapes are equally easy

export function capoOptions(chords: readonly TimedChord[], maxCapo = 9): CapoOption[] {
  const played = chords
    .map((c) => ({ sym: parseChord(c.label), dur: Math.max(0, c.end - c.start) }))
    .filter((c): c is { sym: ChordSymbol; dur: number } => c.sym !== null && c.dur > 0);
  const total = played.reduce((n, c) => n + c.dur, 0);
  if (!total) return [{ capo: 0, score: 0, easyShare: 1, shapes: [], barreShapes: [] }];

  const options: CapoOption[] = [];
  for (let capo = 0; capo <= maxCapo; capo++) {
    let weighted = 0;
    let easy = 0;
    const shapes: string[] = [];
    const barre = new Set<string>();
    for (const c of played) {
      const shape = transposeSymbol(c.sym, -capo);
      const name = formatChord(shape);
      const d = shapeDifficulty(shape);
      weighted += d * c.dur;
      if (d === 1) easy += c.dur;
      if (d >= 3) barre.add(name);
      if (!shapes.includes(name)) shapes.push(name);
    }
    options.push({
      capo,
      score: weighted / total + capo * CAPO_PENALTY,
      easyShare: easy / total,
      shapes,
      barreShapes: shapes.filter((s) => barre.has(s)),
    });
  }
  return options.sort((a, b) => a.score - b.score);
}

/** The best capo, or null when playing without a capo is already (nearly) as easy. */
export function recommendCapo(chords: readonly TimedChord[]): CapoOption | null {
  const options = capoOptions(chords);
  const best = options[0];
  const none = options.find((o) => o.capo === 0)!;
  return best.capo !== 0 && none.score - best.score > 0.25 ? best : null;
}
