import { chordRowText, estimateTimes, isTimed, layoutChordLine, layoutSong, lineAt, lyricsToText, parseLyrics } from '../lyrics';

const chords = [
  { start: 0, end: 4, label: 'G' },
  { start: 4, end: 8, label: 'D' },
  { start: 8, end: 12, label: 'Em' },
  { start: 12, end: 16, label: 'C' },
];

describe('lyrics parsing', () => {
  it('keeps plain text untimed', () => {
    const l = parseLyrics('\nFirst line\nSecond line\n\nThird line\n');
    expect(l.lines.map((x) => x.text)).toEqual(['First line', 'Second line', '', 'Third line']);
    expect(isTimed(l)).toBe(false);
  });

  it('reads LRC timestamps, skips metadata, sorts and repeats lines', () => {
    const l = parseLyrics('[ti:Song]\n[ar:Someone]\n[00:12.50]Second\n[00:01.00][00:20.25]Chorus\n');
    expect(l.lines).toEqual([
      { time: 1, text: 'Chorus' },
      { time: 12.5, text: 'Second' },
      { time: 20.25, text: 'Chorus' },
    ]);
    expect(isTimed(l)).toBe(true);
  });

  it('round-trips timed lyrics through text', () => {
    const l = parseLyrics('[01:02.50]Hello\n[01:10.00]World');
    expect(lyricsToText(l)).toBe('[01:02.50]Hello\n[01:10.00]World');
    expect(parseLyrics(lyricsToText(l))).toEqual(l);
  });

  it('estimates times evenly for untimed lines', () => {
    const l = estimateTimes(parseLyrics('a\nb\n\nc\nd'), 0, 8);
    expect(l.lines.map((x) => x.time)).toEqual([0, 2, null, 4, 6]);
  });

  it('finds the current line', () => {
    const l = parseLyrics('[00:01]a\n[00:05]b\n[00:09]c');
    expect(lineAt(l, 0.5)).toBe(-1);
    expect(lineAt(l, 5)).toBe(1);
    expect(lineAt(l, 100)).toBe(2);
  });
});

describe('chords over words', () => {
  it('puts the sounding chord at the start and changes over the right word', () => {
    // Line from 2 s to 6 s; D arrives at 4 s = halfway through the line.
    const line = layoutChordLine('Walking down the empty road', 2, 6, chords);
    expect(line.marks.map((m) => m.label)).toEqual(['G', 'D']);
    expect(line.marks[0].col).toBe(0);
    // Halfway (col 13) snaps to the start of the word "the"/"empty" nearby, never mid-word.
    const d = line.marks[1].col;
    expect(line.text[d - 1]).toBe(' ');
    expect(Math.abs(d - 13)).toBeLessThanOrEqual(3);
  });

  it('ignores a chord that ends right as the line starts', () => {
    // Detected change at 4.01 s, line tapped at 4.0 s: the line starts on D's successor.
    const nearly = [
      { start: 0, end: 4.01, label: 'D' },
      { start: 4.01, end: 8, label: 'Em' },
    ];
    expect(layoutChordLine('Every road leads home again', 4, 8, nearly).marks.map((m) => m.label)).toEqual(['Em']);
  });

  it('never overlaps chord names', () => {
    const fast = [
      { start: 0, end: 0.5, label: 'Cmaj7' },
      { start: 0.5, end: 1, label: 'Dsus4' },
      { start: 1, end: 2, label: 'Em7' },
    ];
    const line = layoutChordLine('Hi there', 0, 2, fast);
    const row = chordRowText(line);
    expect(row).toContain('Cmaj7 Dsus4 Em7');
  });

  it('lays out a whole song and ignores no-chord', () => {
    const l = parseLyrics('[00:00]One two three four\n[00:08]Five six seven eight');
    const out = layoutSong(l, [...chords, { start: 16, end: 18, label: 'N' }], 18);
    expect(out).toHaveLength(2);
    expect(out[0].marks.map((m) => m.label)).toEqual(['G', 'D']);
    expect(out[1].marks.map((m) => m.label)).toEqual(['Em', 'C']);
    expect(out[1].end).toBe(18);
  });
});
