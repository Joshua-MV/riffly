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
