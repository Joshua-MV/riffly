/**
 * Place transcribed notes on the fretboard and lay them out as tab bars.
 *
 * Fret choice is a greedy "hand position" model: each note (or group of simultaneous notes)
 * goes to the string/fret closest to where the fretting hand already is, preferring open
 * strings and frets ≤ 12. With a capo, frets are relative to the capo, and notes below the
 * capo can't be played, so they are dropped.
 */

import type { TabBar, TabNote, TabStep } from './fingerstyle';
import { STANDARD_OPEN_MIDI } from './voicings';

export interface MidiNote {
  start: number;
  end: number;
  midi: number;
  velocity: number;
}

export interface PlacedNote extends MidiNote, TabNote {}

const MAX_FRET = 15;
const CHORD_WINDOW = 0.035; // notes starting within 35 ms are played together

function candidates(midi: number, capo: number): TabNote[] {
  const out: TabNote[] = [];
  for (let s = 0; s < 6; s++) {
    const fret = midi - STANDARD_OPEN_MIDI[s] - capo;
    if (fret >= 0 && fret <= MAX_FRET) out.push({ string: s, fret });
  }
  return out;
}

export function placeNotes(notes: readonly MidiNote[], capo = 0, minVelocity = 0.25): PlacedNote[] {
  const sorted = notes.filter((n) => n.velocity >= minVelocity).sort((a, b) => a.start - b.start || a.midi - b.midi);
  const placed: PlacedNote[] = [];
  let hand = 2; // fret under the index finger
  for (let i = 0; i < sorted.length; ) {
    const group: MidiNote[] = [];
    const t0 = sorted[i].start;
    while (i < sorted.length && sorted[i].start - t0 <= CHORD_WINDOW) group.push(sorted[i++]);
    const used = new Set<number>();
    // Place higher notes first: they have fewer options on the high strings.
    for (const n of [...group].sort((a, b) => b.midi - a.midi)) {
      let best: TabNote | null = null;
      let bestCost = Infinity;
      for (const c of candidates(n.midi, capo)) {
        if (used.has(c.string)) continue;
        const cost = (c.fret === 0 ? 0.5 : Math.abs(c.fret - hand)) + (c.fret > 12 ? 2 : 0);
        if (cost < bestCost) {
          bestCost = cost;
          best = c;
        }
      }
      if (!best) continue; // unplayable (below capo / out of range / no free string)
      used.add(best.string);
      placed.push({ ...n, ...best });
    }
    const fretted = placed.slice(-group.length).filter((p) => p.fret > 0);
    if (fretted.length) hand = Math.min(...fretted.map((p) => p.fret));
  }
  return placed.sort((a, b) => a.start - b.start || a.string - b.string);
}

/**
 * Quantise placed notes onto the same 8th-note bar grid as the fingerstyle tab, so both
 * views scroll identically with the song. `grid` supplies bar/step times (any pattern).
 */
export function notesToBars(notes: readonly PlacedNote[], grid: readonly TabBar[]): TabBar[] {
  const steps: { bar: number; step: number; time: number }[] = [];
  grid.forEach((b, bi) => b.steps.forEach((s, si) => steps.push({ bar: bi, step: si, time: s.time })));
  const bars: TabBar[] = grid.map((b) => ({
    ...b,
    steps: b.steps.map((s): TabStep => ({ ...s, notes: [] })),
  }));
  if (!steps.length) return bars;
  let j = 0;
  for (const n of notes) {
    while (j + 1 < steps.length && Math.abs(steps[j + 1].time - n.start) <= Math.abs(steps[j].time - n.start)) j++;
    const target = steps[j];
    const stepLen = j + 1 < steps.length ? steps[j + 1].time - steps[j].time : 0.25;
    if (Math.abs(target.time - n.start) > stepLen) continue; // outside the beat grid
    const cell = bars[target.bar].steps[target.step];
    if (!cell.notes.some((x) => x.string === n.string)) cell.notes.push({ string: n.string, fret: n.fret });
  }
  return bars;
}
