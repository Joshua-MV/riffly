/**
 * Fingerpicking tab generator.
 *
 * Builds a playable fingerstyle *arrangement* from the song's detected chords and beats:
 * each beat is split into two eighth notes and filled from a picking pattern, using the
 * easiest voicing of each chord. It follows the song's real tempo and chord timing, so it
 * scrolls in sync with the recording. It is not a transcription of what the original
 * guitarist played; experimental transcription is a separate feature.
 *
 * Assumes 4/4 time (meter detection is not implemented yet).
 */

import { parseChord } from './chords';
import { getVoicings, type Frets } from './voicings';

/** B = bass (lowest string of the shape), A = alternate bass, T1–T3 = highest three strings. */
export type Voice = 'B' | 'A' | 'T1' | 'T2' | 'T3';
export type PatternId = 'arpeggio' | 'pinch' | 'travis';

export interface PickPattern {
  id: PatternId;
  name: string;
  level: 'Beginner' | 'Intermediate';
  description: string;
  /** Eight eighth-note steps per 4/4 bar; each lists the voices plucked together. */
  steps: readonly (readonly Voice[])[];
}

export const PATTERNS: readonly PickPattern[] = [
  {
    id: 'arpeggio',
    name: 'Simple arpeggio',
    level: 'Beginner',
    description: 'Thumb plays the bass on beats 1 and 3; fingers roll up and down the top three strings.',
    steps: [['B'], ['T3'], ['T2'], ['T1'], ['A'], ['T3'], ['T2'], ['T1']],
  },
  {
    id: 'pinch',
    name: 'Pinch pattern',
    level: 'Beginner',
    description: 'Pinch the bass and top string together, then pick the middle strings. Calm and spacious.',
    steps: [['B', 'T1'], [], ['T3'], ['T2'], ['A', 'T1'], [], ['T3'], ['T2']],
  },
  {
    id: 'travis',
    name: 'Travis picking',
    level: 'Intermediate',
    description: 'Thumb alternates bass notes on every beat while the fingers fill the off-beats. The classic folk sound.',
    steps: [['B', 'T1'], ['T2'], ['A'], ['T1'], ['B'], ['T2'], ['A'], ['T3']],
  },
];

export interface TabNote {
  /** 0 = low E … 5 = high E. */
  string: number;
  fret: number;
}

export interface TabStep {
  time: number;
  notes: TabNote[];
  /** Chord shape sounding at this step (null = no chord). */
  chord: string | null;
  /** True on the first step of a beat (for drawing beat markers). */
  onBeat: boolean;
}

export interface TabBar {
  index: number;
  start: number;
  end: number;
  steps: TabStep[];
}

export interface ShapeAtTime {
  start: number;
  end: number;
  /** Chord shape to play (capo already applied), or "N". */
  shape: string;
}

/** Map pattern voices to strings for one chord voicing. */
export function voiceMap(frets: Frets): Record<Voice, number> {
  const played = frets.map((f, s) => (f === null ? -1 : s)).filter((s) => s >= 0);
  const bass = played[0];
  const alt = played.length > 3 ? played[1] : bass;
  const top = played.filter((s) => s !== bass && s !== alt);
  const pick = (i: number) => top[top.length - 1 - i] ?? played[played.length - 1 - i] ?? bass;
  return { B: bass, A: alt, T1: pick(0), T2: pick(1), T3: pick(2) };
}

/**
 * Beat trackers often lock on a few beats into the song. Extend the grid backwards to the
 * start of the track using the median beat interval, so intro chords get bars too.
 * Idempotent: an already-extended grid is returned unchanged.
 */
export function extendBeats(beats: readonly number[]): number[] {
  if (beats.length < 4) return [...beats];
  const intervals = beats.slice(1).map((b, i) => b - beats[i]).sort((a, b) => a - b);
  const step = intervals[Math.floor(intervals.length / 2)];
  const out = [...beats];
  while (out[0] - step > -step * 0.25) out.unshift(Math.max(0, +(out[0] - step).toFixed(3)));
  return out;
}

/**
 * Choose which beat starts bar 1 (0–3) so that chord changes land on bar lines as often as
 * possible. Chord boundaries are already snapped to beats by the analysis engine.
 */
export function chooseBarOffset(beats: readonly number[], changeTimes: readonly number[]): number {
  const scores = [0, 0, 0, 0];
  for (const t of changeTimes) {
    let best = -1;
    let bestDist = 0.12;
    for (let i = 0; i < beats.length; i++) {
      const d = Math.abs(beats[i] - t);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best >= 0) scores[best % 4]++;
  }
  return scores.indexOf(Math.max(...scores));
}

function shapeAt(shapes: readonly ShapeAtTime[], t: number): string | null {
  // Probe slightly after the step so a chord change exactly on the beat is picked up.
  const probe = t + 0.04;
  const seg = shapes.find((s) => probe >= s.start && probe < s.end);
  return seg && seg.shape !== 'N' ? seg.shape : null;
}

export function buildFingerstyleTab(
  shapes: readonly ShapeAtTime[],
  detectedBeats: readonly number[],
  pattern: PickPattern,
  openMidi?: readonly number[],
): TabBar[] {
  if (detectedBeats.length < 5 || !shapes.length) return [];
  const beats = extendBeats(detectedBeats);
  const offset = chooseBarOffset(
    beats,
    shapes.filter((s) => s.shape !== 'N').map((s) => s.start),
  );
  const voicingCache = new Map<string, Record<Voice, number> & { frets: Frets }>();
  const resolve = (shape: string) => {
    if (!voicingCache.has(shape)) {
      const sym = parseChord(shape);
      const v = sym ? getVoicings(sym, openMidi)[0] : undefined;
      if (!v) return null;
      voicingCache.set(shape, { ...voiceMap(v.frets), frets: v.frets });
    }
    return voicingCache.get(shape)!;
  };

  const bars: TabBar[] = [];
  const lastInterval = beats[beats.length - 1] - beats[beats.length - 2];
  for (let b = offset, index = 0; b + 3 < beats.length; b += 4, index++) {
    const steps: TabStep[] = [];
    for (let beat = 0; beat < 4; beat++) {
      const t0 = beats[b + beat];
      const t1 = beats[b + beat + 1] ?? t0 + lastInterval;
      for (let half = 0; half < 2; half++) {
        const time = half === 0 ? t0 : (t0 + t1) / 2;
        const chord = shapeAt(shapes, time);
        const mapping = chord ? resolve(chord) : null;
        const voices = pattern.steps[beat * 2 + half];
        const notes: TabNote[] = [];
        if (mapping) {
          for (const v of voices) {
            const string = mapping[v];
            const fret = mapping.frets[string];
            if (fret !== null && !notes.some((n) => n.string === string)) notes.push({ string, fret });
          }
        }
        steps.push({ time, notes, chord, onBeat: half === 0 });
      }
    }
    const next = beats[b + 4] ?? beats[b + 3] + lastInterval;
    bars.push({ index, start: beats[b], end: next, steps });
  }
  return bars;
}

/** Index of the step sounding at `time` within the flattened bars, or -1. */
export function stepAt(bars: readonly TabBar[], time: number): { bar: number; step: number } | null {
  let lo = 0;
  let hi = bars.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (time < bars[mid].start) hi = mid - 1;
    else if (time >= bars[mid].end) lo = mid + 1;
    else {
      const steps = bars[mid].steps;
      let s = 0;
      while (s + 1 < steps.length && steps[s + 1].time <= time) s++;
      return { bar: mid, step: s };
    }
  }
  return null;
}

const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];

/** Plain-text tab (high e on top), `barsPerLine` bars per system. */
export function toAscii(bars: readonly TabBar[], barsPerLine = 4, header = ''): string {
  const out: string[] = header ? [header, ''] : [];
  for (let i = 0; i < bars.length; i += barsPerLine) {
    const line = bars.slice(i, i + barsPerLine);
    const chordRow = line
      .map((bar) => {
        let row = '';
        let last: string | null = null;
        for (const step of bar.steps) {
          const label = step.chord && step.chord !== last ? step.chord : '';
          if (step.chord) last = step.chord;
          row += label.padEnd(3, ' ').slice(0, 3);
        }
        return row;
      })
      .join(' ');
    out.push(`  ${chordRow}`);
    for (let s = 5; s >= 0; s--) {
      const row = line
        .map((bar) => bar.steps.map((step) => {
          const n = step.notes.find((x) => x.string === s);
          return n ? String(n.fret).padEnd(3, '-') : '---';
        }).join(''))
        .join('|');
      out.push(`${STRING_LABELS[s]}|${row}|`);
    }
    out.push('');
  }
  return out.join('\n');
}
