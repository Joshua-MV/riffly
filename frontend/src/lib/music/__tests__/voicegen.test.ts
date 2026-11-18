import { chordTones, parseChord, type ChordSymbol } from '../chords';
import { GUITAR_TUNINGS, tuningStrings } from '../instruments';
import { mod12 } from '../notes';
import { assignFingers, generateShapes } from '../voicegen';
import { getVoicings, STANDARD_OPEN_MIDI } from '../voicings';

const tuning = (id: string) => tuningStrings(GUITAR_TUNINGS.find((t) => t.id === id)!).map((s) => s.midi);

function checkShape(chord: ChordSymbol, frets: (number | null)[], open: readonly number[]) {
  const tones = chordTones(chord);
  const sounding = frets.flatMap((f, s) => (f === null ? [] : [mod12(open[s] + f)]));
  for (const pc of sounding) expect(tones).toContain(pc);
  expect(sounding[0]).toBe(chord.bass ?? chord.root);
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(3);
}

describe('chord names from the engine', () => {
  it('parses add9, add2 and slash chords', () => {
    expect(parseChord('C#add9')).toEqual({ root: 1, quality: 'add9' });
    expect(parseChord('Dadd2/F#')).toEqual({ root: 2, quality: 'add9', bass: 6 });
    expect(parseChord('Ebadd9/G')).toEqual({ root: 3, quality: 'add9', bass: 7 });
    expect(parseChord('Fm7')).toEqual({ root: 5, quality: 'm7' });
  });
});

describe('shape generator', () => {
  it('finds G/B with B in the bass in standard tuning', () => {
    const gb = parseChord('G/B')!;
    const shapes = getVoicings(gb);
    expect(shapes.length).toBeGreaterThan(0);
    for (const v of shapes) checkShape(gb, [...v.frets], STANDARD_OPEN_MIDI);
  });

  it('gives D/F# and Cadd9 playable shapes', () => {
    for (const label of ['D/F#', 'Cadd9', 'Ebadd9/G', 'Ab/C', 'Fm7', 'Ebsus4']) {
      const c = parseChord(label)!;
      const shapes = getVoicings(c);
      expect(shapes.length).toBeGreaterThan(0);
      for (const v of shapes) checkShape(c, [...v.frets], STANDARD_OPEN_MIDI);
    }
    expect(getVoicings(parseChord('Cadd9')!)[0].frets).toEqual([null, 3, 2, 0, 3, 0]);
  });

  it.each(['open-g', 'drop-d', 'half-down'])('builds correct shapes in %s tuning', (id) => {
    const open = tuning(id);
    for (const label of ['G', 'C', 'D', 'Em', 'Am', 'F', 'Bm', 'D7']) {
      const c = parseChord(label)!;
      const shapes = getVoicings(c, open);
      expect(shapes.length).toBeGreaterThan(0);
      for (const v of shapes) checkShape(c, [...v.frets], open);
    }
  });

  it('open G tuning plays G on the open strings (low D muted so G is in the bass)', () => {
    expect(getVoicings(parseChord('G')!, tuning('open-g'))[0].frets).toEqual([null, 0, 0, 0, 0, 0]);
  });

  it('assigns fingers, treating a shared lowest fret as a barre', () => {
    expect(assignFingers([1, 3, 3, 2, 1, 1])).toEqual([1, 3, 4, 2, 1, 1]);
    expect(assignFingers([null, 3, 2, 0, 1, 0])).toEqual([null, 3, 2, 0, 1, 0]);
    expect(assignFingers([1, 2, 3, 4, 5, null])).toBeNull(); // five different frets: impossible
  });

  it('only returns shapes that contain the essential notes', () => {
    for (const g of generateShapes({ root: 0, quality: '7' }, STANDARD_OPEN_MIDI)) {
      const pcs = g.frets.flatMap((f, s) => (f === null ? [] : [mod12(STANDARD_OPEN_MIDI[s] + f)]));
      expect(pcs).toEqual(expect.arrayContaining([0, 4, 10]));
    }
  });
});
