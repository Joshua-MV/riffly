/**
 * Strumming patterns: one 4/4 bar as eight eighth notes. "D" = down-strum (on the beat),
 * "U" = up-strum (on the "and"), "-" = let it ring / miss the strings.
 */

import type { StrumAnalysis } from '@/services/api';

export interface StrumPattern {
  id: string;
  name: string;
  pattern: string;
  level: 'beginner' | 'intermediate';
  description: string;
}

export const STRUM_PATTERNS: readonly StrumPattern[] = [
  { id: 'downs', name: 'Beginner: down on every beat', pattern: 'D-D-D-D-', level: 'beginner', description: 'Four steady down-strums per bar, one on each beat. Start here; when it feels easy, try down-up eighths.' },
  { id: 'eighths', name: 'Down-up eighths', pattern: 'DUDUDUDU', level: 'beginner', description: 'Keep your hand moving down and up in time; every stroke hits the strings.' },
  { id: 'folk', name: 'Folk / pop', pattern: 'D-DU-UDU', level: 'intermediate', description: 'The classic "down, down-up, up-down-up". Your hand keeps moving on the gaps but misses the strings.' },
  { id: 'rock', name: 'Driving rock', pattern: 'D-D-DUDU', level: 'intermediate', description: 'Two firm downs, then a run of down-ups into the next bar.' },
  { id: 'ballad', name: 'Slow ballad', pattern: 'D---D-DU', level: 'beginner', description: 'Let the first strum ring for two beats, then a light down, down-up.' },
  { id: 'drive', name: 'Steady with a lift', pattern: 'D-D-D-DU', level: 'beginner', description: 'Down on every beat, with a quick up-strum at the end of the bar leading into the next.' },
  { id: 'offbeat', name: 'Off-beat (reggae / ska)', pattern: '-U-U-U-U', level: 'intermediate', description: 'Short chops on the "and" of every beat; mute the strings on the beat.' },
];

export const isPattern = (s: string | null | undefined): s is string => !!s && /^[DU-]{8}$/.test(s);

/** The beginner default: a down-strum on every beat. */
export const BEGINNER_STRUM = STRUM_PATTERNS[0].id;

/**
 * The pattern to show: the one the user picked; 'auto' is the pattern Riffly chose for the
 * song from how busy its strumming is and its tempo. With nothing picked, the song's pattern
 * when there is one, else the beginner pattern.
 */
export function resolveStrum(choice: string | undefined, detected: StrumAnalysis | undefined): string {
  const pick = choice ?? (detected && isPattern(detected.pattern) ? 'auto' : BEGINNER_STRUM);
  if (pick === 'auto') return detected && isPattern(detected.pattern) ? detected.pattern : STRUM_PATTERNS[0].pattern;
  const preset = STRUM_PATTERNS.find((p) => p.id === pick);
  if (preset) return preset.pattern;
  return isPattern(pick) ? pick : STRUM_PATTERNS[0].pattern;
}

/** The choice that is in effect ('auto' = the song's own pattern). */
export function strumChoice(choice: string | undefined, detected: StrumAnalysis | undefined): string {
  return choice ?? (detected && isPattern(detected.pattern) ? 'auto' : BEGINNER_STRUM);
}

/** "D-DU-UDU" -> "1 & 2 & 3 & 4 &" counting, with the strokes under it. */
export function countLabels(): string[] {
  return ['1', '&', '2', '&', '3', '&', '4', '&'];
}
