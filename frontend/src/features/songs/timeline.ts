/** Pure helpers for the analysis timeline (unit tested). */

import type { ChordCorrection } from '@/features/library/model';
import { transposeLabel } from '@/lib/music/chords';
import type { ChordSegment } from '@/services/api';

export interface TimelineChord extends ChordSegment {
  /** Label shown to the user: correction (if any), then transposition applied. */
  display: string;
  corrected: ChordCorrection | null;
}

/** Merge user corrections over machine estimates and apply transposition. */
export function buildTimeline(segments: readonly ChordSegment[], corrections: readonly ChordCorrection[], transpose: number): TimelineChord[] {
  const byStart = new Map(corrections.map((c) => [c.start.toFixed(3), c]));
  return segments.map((s) => {
    const corrected = byStart.get(s.start.toFixed(3)) ?? null;
    const label = corrected ? corrected.correctedLabel : s.label;
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

export function formatBytes(bytes: number): string {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Wrap playback back to the loop start when it passes the loop end. */
export function loopTarget(time: number, loop: { start: number; end: number } | null): number | null {
  if (!loop || loop.end - loop.start < 0.5) return null;
  return time >= loop.end || time < loop.start - 0.25 ? loop.start : null;
}
