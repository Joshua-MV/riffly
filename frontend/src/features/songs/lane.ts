/** Timing helpers for the chord lane and the chord-to-chord skip buttons (pure, tested). */

export interface LaneChord {
  start: number;
  end: number;
  label: string;
}

/** Beats still to play in the current chord before it changes (beats strictly after `time`). */
export function beatsLeft(beats: readonly number[], time: number, chordEnd: number): number {
  let n = 0;
  for (const b of beats) {
    if (b > time + 0.02 && b < chordEnd - 0.05) n++;
  }
  return n;
}

export interface LaneState {
  time: number;
  /** Index of the last beat at or before `time` (-1 before the first). */
  beatIndex: number;
  /** Index into `chords` of the chord being played (-1 in silence / "N"). */
  currentIndex: number;
  /** Index of the next real chord after the current one (-1 at the end). */
  nextIndex: number;
  /** Beats the current chord lasts, and beats still to come before the change. */
  beatsTotal: number;
  beatsLeft: number;
}

/** Everything the chord lane shows that changes at most once per beat. */
export function laneState(chords: readonly LaneChord[], beats: readonly number[], time: number): LaneState {
  let lo = 0;
  let hi = beats.length - 1;
  let beatIndex = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= time + 0.02) {
      beatIndex = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const currentIndex = chords.findIndex((c) => c.label !== 'N' && c.start <= time && time < c.end);
  const after = currentIndex >= 0 ? chords[currentIndex].end - 0.01 : time;
  const nextIndex = chords.findIndex((c, i) => c.label !== 'N' && i !== currentIndex && c.start >= after);
  let beatsTotal = 0;
  let left = 0;
  if (currentIndex >= 0) {
    const c = chords[currentIndex];
    for (const b of beats) {
      if (b >= c.start - 0.06 && b < c.end - 0.06) {
        beatsTotal++;
        if (b > time + 0.02) left++;
      }
    }
  }
  return { time, beatIndex, currentIndex, nextIndex, beatsTotal, beatsLeft: left };
}

export interface StrumSlot {
  t: number;
  stroke: 'D' | 'U' | '-';
  onBeat: boolean;
}

/** Eighth-note strum slots in [from, to], following a one-bar pattern like "D-DU-UDU". */
export function strumSlots(beats: readonly number[], barOffset: number, pattern: string, from: number, to: number): StrumSlot[] {
  const out: StrumSlot[] = [];
  if (pattern.length !== 8) return out;
  for (let i = 0; i < beats.length; i++) {
    const t0 = beats[i];
    const t1 = beats[i + 1] ?? t0 + (i > 0 ? t0 - beats[i - 1] : 0.5);
    if (t1 < from || t0 > to) continue;
    const pos = (((i - barOffset) % 4) + 4) % 4;
    for (let h = 0; h < 2; h++) {
      const ch = pattern[pos * 2 + h];
      out.push({ t: h === 0 ? t0 : (t0 + t1) / 2, stroke: ch === 'D' || ch === 'U' ? ch : '-', onBeat: h === 0 });
    }
  }
  return out;
}

/** Fraction (0..1) of the current chord already played. */
export function chordProgress(chord: LaneChord, time: number): number {
  const len = chord.end - chord.start;
  return len > 0 ? Math.min(1, Math.max(0, (time - chord.start) / len)) : 0;
}

/** Chords to draw in the lane window [time - past, time + ahead], skipping "no chord". */
export function laneWindow<T extends LaneChord>(chords: readonly T[], time: number, past: number, ahead: number): T[] {
  return chords.filter((c) => c.label !== 'N' && c.end > time - past && c.start < time + ahead);
}

/**
 * "Previous" works like a music player's back button: more than 1.5 s into the current chord
 * jumps to its start, otherwise to the previous chord.
 */
export function previousChordTime(chords: readonly LaneChord[], time: number): number {
  const played = chords.filter((c) => c.label !== 'N' && c.start <= time);
  if (!played.length) return 0;
  const current = played[played.length - 1];
  if (time - current.start > 1.5 || played.length === 1) return current.start;
  return played[played.length - 2].start;
}

export function nextChordTime(chords: readonly LaneChord[], time: number): number | null {
  const next = chords.find((c) => c.label !== 'N' && c.start > time + 0.05);
  return next ? next.start : null;
}
