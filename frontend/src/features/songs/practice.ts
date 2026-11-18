/** Derives what the player should see from a song + its practice settings (pure, tested). */

import { practiceOf, type LocalSong, type PracticeSettings } from '@/features/library/model';
import { buildFingerstyleTab, chooseBarOffset, PATTERNS, type TabBar } from '@/lib/music/fingerstyle';
import { tuningById, tuningStrings, uniformShift, type Tuning } from '@/lib/music/instruments';
import { getVoicings, STANDARD_OPEN_MIDI } from '@/lib/music/voicings';
import { parseChord } from '@/lib/music/chords';

import { buildTimeline, type TimelineChord } from './timeline';

/**
 * Which beat (0-3) of the extended beat grid starts bar 1. One answer for the whole app (strum
 * row, beat lamps, bar numbers, metronome accent, tab), taken from the engine when it found the
 * bar start, so nothing can be a beat out of step with anything else.
 */
export function songBarOffset(analysis: LocalSong['analysis'], beats: readonly number[]): number {
  const raw = analysis.beats;
  if (analysis.strum && raw.length) {
    const k = beats.findIndex((b) => Math.abs(b - raw[0]) < 0.002);
    if (k >= 0) return (((analysis.strum.downbeat + k) % 4) + 4) % 4;
  }
  return chooseBarOffset(beats, analysis.chords.filter((c) => c.label !== 'N').map((c) => c.start));
}

export interface PlayContext {
  tuning: Tuning;
  /** Semitones added to sounding chords to get the shape names you play. */
  displayOffset: number;
  /** Open strings the chord *diagrams* are drawn for (standard shapes in down-tunings). */
  shapeMidi: readonly number[];
  /** Open strings as actually tuned (for sound and transcription). */
  soundMidi: readonly number[];
  /** True when shapes are the standard ones (standard, half-step down, whole-step down). */
  standardShapes: boolean;
}

/**
 * How to show a song for the chosen tuning and capo:
 * - standard: shape = sounding chord − capo (+ key change)
 * - half/whole-step down: you tune down like the band, so the same shapes are named a half or
 *   whole step higher than they sound (Eb sounds when you play an E shape)
 * - open/drop tunings: chord names are what sounds (− capo), shapes come from that tuning
 */
export function playContext(settings: PracticeSettings): PlayContext {
  const tuning = tuningById(settings.tuning);
  const shift = uniformShift(tuning);
  const soundMidi = tuningStrings(tuning).map((s) => s.midi);
  return {
    tuning,
    displayOffset: settings.keyShift - settings.capo - (shift ?? 0),
    shapeMidi: shift !== null ? STANDARD_OPEN_MIDI : soundMidi,
    soundMidi,
    standardShapes: shift !== null,
  };
}

/**
 * The beginner version of a chord: plain major or minor (Cadd9 → C, G/B → G, Em7 → Em,
 * Dsus4 → D, E5 → E). Anything that isn't a chord symbol is returned unchanged.
 */
export function simpleChord(label: string): string {
  const sym = parseChord(label);
  if (!sym) return label;
  const minor = sym.quality === 'min' || sym.quality === 'm7' || sym.quality === 'dim';
  const root = label.match(/^[A-G][#b]?/)?.[0] ?? label;
  return minor ? `${root}m` : root;
}

/**
 * Chords as a beginner plays them: simple names (unless the user corrected a chord: their
 * label is kept), and neighbouring blocks with the same chord joined into one.
 */
export function beginnerTimeline(chords: LocalSong['analysis']['chords'], corrections: LocalSong['corrections'], offset: number): TimelineChord[] {
  const out: TimelineChord[] = [];
  for (const c of buildTimeline(chords, corrections, offset)) {
    const display = c.label === 'N' || c.corrected ? c.display : simpleChord(c.display);
    const prev = out[out.length - 1];
    if (prev && prev.display === display && prev.label !== 'N' && c.label !== 'N' && !c.corrected && !prev.corrected) {
      prev.end = c.end;
      continue;
    }
    out.push({ ...c, display });
  }
  return out;
}

/** Timeline whose `display` is the chord *shape* to play (corrections, key change, tuning, capo). */
export function practiceTimeline(song: LocalSong, settings: PracticeSettings = practiceOf(song)): TimelineChord[] {
  return beginnerTimeline(song.analysis.chords, song.corrections, playContext(settings).displayOffset);
}

export function practiceTab(timeline: readonly TimelineChord[], beats: readonly number[], patternId: string, shapeMidi?: readonly number[], barOffset?: number): TabBar[] {
  const pattern = PATTERNS.find((p) => p.id === patternId) ?? PATTERNS[0];
  return buildFingerstyleTab(
    timeline.map((c) => ({ start: c.start, end: c.end, shape: c.label === 'N' ? 'N' : c.display })),
    beats,
    pattern,
    shapeMidi,
    barOffset,
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
export function songChords(timeline: readonly TimelineChord[], shapeMidi?: readonly number[]): SongChordSummary[] {
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
      const v = sym ? getVoicings(sym, shapeMidi)[0] : undefined;
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
