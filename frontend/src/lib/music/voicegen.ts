/**
 * Chord-shape generator for any tuning.
 *
 * Searches the fretboard for playable shapes of a chord: every note is a chord tone, the
 * lowest string plays the bass note (the root, or the slash note in G/B), all essential notes
 * are present, the fretted notes fit in a four-fret span, and at most four fingers are needed
 * (a barre counts as one finger). Shapes are ranked for comfort: open strings, low position,
 * more strings, fewer fingers. Used for slash and add9 chords in standard tuning and for every
 * chord in other tunings (open G, DADGAD…).
 */

import { chordTones, QUALITIES, type ChordSymbol } from './chords';
import { mod12 } from './notes';

export interface GeneratedShape {
  frets: (number | null)[];
  fingers: (number | null)[];
  score: number;
}

const MAX_FRET = 12;

export function generateShapes(chord: ChordSymbol, openMidi: readonly number[], limit = 4): GeneratedShape[] {
  const tones = new Set(chordTones(chord));
  const info = QUALITIES[chord.quality];
  const required = info.intervals.filter((i) => !info.optional.includes(i)).map((i) => mod12(chord.root + i));
  const bassPc = chord.bass ?? chord.root;
  const strings = openMidi.length;
  const minSounded = chord.quality === '5' ? 2 : 3;
  const found = new Map<string, GeneratedShape>();

  for (let base = 1; base <= MAX_FRET - 3; base++) {
    const options = openMidi.map((open) => {
      const opts: (number | null)[] = [null];
      if (tones.has(mod12(open))) opts.push(0);
      for (let f = base; f <= base + 3; f++) if (tones.has(mod12(open + f))) opts.push(f);
      return opts;
    });
    const current: (number | null)[] = new Array(strings).fill(null);
    const walk = (s: number) => {
      if (s === strings) {
        evaluate(current.slice(), openMidi, bassPc, required, minSounded, found);
        return;
      }
      for (const o of options[s]) {
        current[s] = o;
        // The lowest sounding string must play the bass note.
        const firstSounded = current.slice(0, s + 1).findIndex((x) => x !== null);
        if (firstSounded === s && o !== null && mod12(openMidi[s] + o) !== bassPc) continue;
        walk(s + 1);
      }
      current[s] = null;
    };
    walk(0);
  }
  return [...found.values()].sort((a, b) => a.score - b.score).slice(0, limit);
}

function evaluate(
  frets: (number | null)[],
  openMidi: readonly number[],
  bassPc: number,
  required: number[],
  minSounded: number,
  found: Map<string, GeneratedShape>,
) {
  const sounded = frets.map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0);
  if (sounded.length < minSounded) return;
  const first = sounded[0];
  const last = sounded[sounded.length - 1];
  if (mod12(openMidi[first] + (frets[first] as number)) !== bassPc) return;
  // At most one muted string inside the strummed range.
  const innerMutes = last - first + 1 - sounded.length;
  if (innerMutes > 1) return;
  const pcs = new Set(sounded.map((i) => mod12(openMidi[i] + (frets[i] as number))));
  if (!required.every((pc) => pcs.has(pc))) return;
  const fretted = sounded.filter((i) => (frets[i] as number) > 0);
  if (fretted.length) {
    const fs = fretted.map((i) => frets[i] as number);
    if (Math.max(...fs) - Math.min(...fs) > 3) return;
  }
  const fingers = assignFingers(frets);
  if (!fingers) return;
  const key = frets.map((f) => (f === null ? 'x' : f)).join(',');
  if (found.has(key)) return;
  const opens = sounded.length - fretted.length;
  const minFret = fretted.length ? Math.min(...fretted.map((i) => frets[i] as number)) : 0;
  const fingerCount = new Set(fingers.filter((f): f is number => f !== null && f > 0)).size;
  const score = minFret * 0.6 + fingerCount * 0.8 - sounded.length * 0.7 - opens * 0.3 + innerMutes * 1.5;
  found.set(key, { frets, fingers, score });
}

/**
 * Fingers 1-4 by fret then string; the lowest fret becomes a barre (finger 1) when it is used on
 * two or more strings and nothing lower is needed. Returns null when more than 4 fingers are needed.
 */
export function assignFingers(frets: readonly (number | null)[]): (number | null)[] | null {
  const out: (number | null)[] = frets.map((f) => (f === null ? null : f === 0 ? 0 : -1));
  const fretted = frets.map((f, i) => ({ f, i })).filter((x): x is { f: number; i: number } => x.f !== null && x.f > 0);
  if (!fretted.length) return out;
  const minFret = Math.min(...fretted.map((x) => x.f));
  const atMin = fretted.filter((x) => x.f === minFret);
  let finger = 1;
  if (atMin.length >= 2) {
    // Barre across the min-fret strings: only valid if no open string sits between them.
    const lo = atMin[0].i;
    const hi = atMin[atMin.length - 1].i;
    const openBetween = frets.slice(lo, hi + 1).some((f) => f === 0);
    if (!openBetween) {
      for (const x of atMin) out[x.i] = 1;
      finger = 2;
    }
  }
  const rest = fretted.filter((x) => out[x.i] === -1).sort((a, b) => a.f - b.f || a.i - b.i);
  for (const x of rest) {
    if (finger > 4) return null;
    out[x.i] = finger++;
  }
  return out;
}
