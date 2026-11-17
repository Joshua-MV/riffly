/** Pure helpers for the analysis timeline (unit tested). */

import { transposeLabel } from '@/lib/music/chords';
import type { ChordSegment, Correction } from '@/services/api';

export interface TimelineChord extends ChordSegment {
  /** Label shown to the user: correction (if any), then transposition applied. */
  display: string;
  corrected: Correction | null;
}

/** Merge user corrections over machine estimates and apply transposition. */
export function buildTimeline(segments: readonly ChordSegment[], corrections: readonly Correction[], transpose: number): TimelineChord[] {
  const byStart = new Map(corrections.map((c) => [c.start.toFixed(3), c]));
  return segments.map((s) => {
    const corrected = byStart.get(s.start.toFixed(3)) ?? null;
    const label = corrected ? corrected.corrected_label : s.label;
    return { ...s, corrected, display: transposeLabel(label, transpose) };
  });
}

/** Index of the segment playing at `time` (binary search; segments are sorted). */
export function segmentAt(segments: readonly { start: number; end: number }[], time: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (time < segments[mid].start) hi = mid - 1;
    else if (time >= segments[mid].end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** The next `count` chord changes after `index`, skipping "no chord" segments. */
export function upcoming<T extends { display: string; label: string }>(segments: readonly T[], index: number, count: number): T[] {
  const out: T[] = [];
  for (let i = index + 1; i < segments.length && out.length < count; i++) {
    if (segments[i].label !== 'N') out.push(segments[i]);
  }
  return out;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Wrap playback back to the loop start when it passes the loop end. */
export function loopTarget(time: number, loop: { start: number; end: number } | null): number | null {
  if (!loop || loop.end - loop.start < 0.5) return null;
  return time >= loop.end || time < loop.start - 0.25 ? loop.start : null;
}
