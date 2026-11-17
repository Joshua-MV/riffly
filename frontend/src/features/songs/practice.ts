/** Derives what the player should see from a song + its practice settings (pure, tested). */

import { practiceOf, type LocalSong, type PracticeSettings } from '@/features/library/model';
import { buildFingerstyleTab, PATTERNS, type TabBar } from '@/lib/music/fingerstyle';
import { getVoicings } from '@/lib/music/voicings';
import { parseChord } from '@/lib/music/chords';

import { buildTimeline, type TimelineChord } from './timeline';

/**
 * Timeline whose `display` is the chord *shape* to play: corrections applied, then the key
 * shift, then the capo (shape = sounding chord − capo).
 */
export function practiceTimeline(song: LocalSong, settings: PracticeSettings = practiceOf(song)): TimelineChord[] {
  return buildTimeline(song.analysis.chords, song.corrections, settings.keyShift - settings.capo);
}

export function practiceTab(timeline: readonly TimelineChord[], beats: readonly number[], patternId: string): TabBar[] {
  const pattern = PATTERNS.find((p) => p.id === patternId) ?? PATTERNS[0];
  return buildFingerstyleTab(
    timeline.map((c) => ({ start: c.start, end: c.end, shape: c.label === 'N' ? 'N' : c.display })),
    beats,
    pattern,
  );
}

export interface SongChordSummary {
  shape: string;
  /** Share of playing time, 0..1. */
  share: number;
  firstAt: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'unknown';
}

/** Distinct chord shapes in the song, in order of first appearance. */
export function songChords(timeline: readonly TimelineChord[]): SongChordSummary[] {
  const map = new Map<string, SongChordSummary>();
  let total = 0;
  for (const c of timeline) {
    if (c.label === 'N') continue;
    const dur = c.end - c.start;
    total += dur;
    const entry = map.get(c.display);
    if (entry) entry.share += dur;
    else {
      const sym = parseChord(c.display);
      const v = sym ? getVoicings(sym)[0] : undefined;
      map.set(c.display, { shape: c.display, share: dur, firstAt: c.start, difficulty: v?.difficulty ?? 'unknown' });
    }
  }
  return [...map.values()].map((s) => ({ ...s, share: total ? s.share / total : 0 }));
}

/** Most frequent chord changes (A → B), for the change drill. */
export function topChanges(timeline: readonly TimelineChord[], limit = 6): { from: string; to: string; count: number }[] {
  const seq = timeline.filter((c) => c.label !== 'N').map((c) => c.display);
  const counts = new Map<string, number>();
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] === seq[i - 1]) continue;
    const key = `${seq[i - 1]}→${seq[i]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k, count]) => {
      const [from, to] = k.split('→');
      return { from, to, count };
    });
}

/** Beat number within the bar (1–4) at `time`, given a bar offset; null before the first beat. */
export function beatInBar(beats: readonly number[], time: number, barOffset: number): number | null {
  let lo = 0;
  let hi = beats.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= time) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (idx < 0 || time - beats[idx] > 2) return null;
  return ((((idx - barOffset) % 4) + 4) % 4) + 1;
}
