/**
 * Lyrics with chords above the words.
 *
 * Riffly never downloads lyrics (they are copyrighted). The user pastes their own text, or
 * imports a synced .lrc file, and can time plain lyrics by tapping along once ("Sync").
 * Chords are then placed over the words at the moment they change.
 */

export interface LyricLine {
  /** Start time in seconds, or null if the line hasn't been timed yet. */
  time: number | null;
  text: string;
}

export interface Lyrics {
  lines: LyricLine[];
}

const LRC_TIME = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const LRC_META = /^\[(ar|ti|al|by|offset|length|re|ve|au|#):/i;

/** Parse pasted text. LRC timestamps ([mm:ss.xx]) are used when present; otherwise lines are untimed. */
export function parseLyrics(raw: string): Lyrics {
  const lines: LyricLine[] = [];
  for (const rawLine of raw.replace(/\r\n?/g, '\n').split('\n')) {
    if (LRC_META.test(rawLine.trim())) continue;
    const stamps = [...rawLine.matchAll(LRC_TIME)];
    const text = rawLine.replace(LRC_TIME, '').trim();
    if (stamps.length) {
      for (const m of stamps) {
        const frac = m[3] ? Number(m[3]) / 10 ** m[3].length : 0;
        lines.push({ time: Number(m[1]) * 60 + Number(m[2]) + frac, text });
      }
    } else {
      lines.push({ time: null, text });
    }
  }
  // Trim blank lines at the ends; keep single blank lines between verses as spacing.
  while (lines.length && !lines[0].text && lines[0].time === null) lines.shift();
  while (lines.length && !lines[lines.length - 1].text && lines[lines.length - 1].time === null) lines.pop();
  const timed = lines.some((l) => l.time !== null);
  return { lines: timed ? lines.filter((l) => l.time !== null).sort((a, b) => a.time! - b.time!) : lines };
}

export function isTimed(lyrics: Lyrics): boolean {
  return lyrics.lines.length > 0 && lyrics.lines.every((l) => l.time !== null || !l.text);
}

/** Back to editable text (LRC format when timed, so timings survive editing). */
export function lyricsToText(lyrics: Lyrics): string {
  return lyrics.lines
    .map((l) => {
      if (l.time === null) return l.text;
      const m = Math.floor(l.time / 60);
      const s = l.time - m * 60;
      return `[${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}]${l.text}`;
    })
    .join('\n');
}

/**
 * Rough timing for untimed lyrics: spread the sung lines evenly from the first chord to the last.
 * Shown with a "tap Sync for exact timing" hint.
 */
export function estimateTimes(lyrics: Lyrics, start: number, end: number): Lyrics {
  const sung = lyrics.lines.filter((l) => l.text);
  const step = sung.length ? (end - start) / sung.length : 0;
  let i = 0;
  return {
    lines: lyrics.lines.map((l) => (l.text ? { ...l, time: l.time ?? start + step * i++ } : l)),
  };
}

/** Index of the line being sung at `time` (-1 before the first line). */
export function lineAt(lyrics: Lyrics, time: number): number {
  let idx = -1;
  lyrics.lines.forEach((l, i) => {
    if (l.time !== null && l.time <= time) idx = i;
  });
  return idx;
}

export interface ChordMark {
  /** Character column over the lyric text where the chord starts. */
  col: number;
  label: string;
  start: number;
}

export interface ChordLine {
  text: string;
  start: number;
  end: number;
  marks: ChordMark[];
}

interface TimedChord {
  start: number;
  end: number;
  label: string;
}

/**
 * Lay chords over a line of lyrics. A chord changing a third of the way through the line goes
 * over the character a third of the way along. The chord already sounding when the line
 * starts is shown at column 0. Marks never overlap (each starts after the previous label).
 */
export function layoutChordLine(text: string, start: number, end: number, chords: readonly TimedChord[]): ChordLine {
  const width = Math.max(text.length, 1);
  const dur = Math.max(end - start, 0.01);
  const marks: ChordMark[] = [];
  // Chord changes within a quarter second of the line's start belong to the start of the line
  // (detected changes and tapped line timings are both a little approximate).
  const edge = start + Math.min(0.25, dur / 4);
  const atStart = chords.find((c) => c.start <= edge && c.end > edge && c.label !== 'N');
  if (atStart) marks.push({ col: 0, label: atStart.label, start: atStart.start });
  for (const c of chords) {
    if (c.label === 'N' || c.start <= edge || c.start >= end) continue;
    if (marks.length && marks[marks.length - 1].label === c.label) continue;
    let col = Math.round(((c.start - start) / dur) * width);
    // Prefer the start of the nearest word so chords sit over syllables, not mid-word.
    const wordStart = text.lastIndexOf(' ', col);
    if (wordStart >= 0 && col - wordStart <= 3) col = wordStart + 1;
    const prev = marks[marks.length - 1];
    if (prev) col = Math.max(col, prev.col + prev.label.length + 1);
    marks.push({ col, label: c.label, start: c.start });
  }
  return { text, start, end, marks };
}

/** Build every line's chord layout. Lines must be timed (use estimateTimes first if not). */
export function layoutSong(lyrics: Lyrics, chords: readonly TimedChord[], songEnd: number): ChordLine[] {
  const lines = lyrics.lines.filter((l) => l.time !== null);
  return lines.map((l, i) => layoutChordLine(l.text, l.time!, lines[i + 1]?.time ?? songEnd, chords));
}

/** Render one laid-out line as two monospace text rows (for tests and plain-text export). */
export function chordRowText(line: ChordLine): string {
  let row = '';
  for (const m of line.marks) {
    row = row.padEnd(m.col, ' ') + m.label;
  }
  return row;
}
