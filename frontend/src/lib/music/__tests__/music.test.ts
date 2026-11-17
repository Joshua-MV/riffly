import { chordTones, formatChord, parseChord, parseChordId, chordId, QUALITIES, transposeLabel } from '../chords';
import { closestString, GUITAR_TUNINGS, tuningStrings } from '../instruments';
import { describeFrequency, midiToFrequency, parsePitchClass, parseScientificPitch } from '../notes';
import { getVoicings, libraryChords, STANDARD_OPEN_PCS } from '../voicings';

describe('notes', () => {
  it('parses pitch classes with accidentals', () => {
    expect(parsePitchClass('C')).toBe(0);
    expect(parsePitchClass('F#')).toBe(6);
    expect(parsePitchClass('Bb')).toBe(10);
    expect(parsePitchClass('Cb')).toBe(11);
    expect(parsePitchClass('E♯')).toBe(5);
    expect(parsePitchClass('H')).toBeNull();
  });

  it('parses scientific pitch, respecting octave boundaries', () => {
    expect(parseScientificPitch('A4')).toBe(69);
    expect(parseScientificPitch('E2')).toBe(40);
    expect(parseScientificPitch('Eb2')).toBe(39);
    expect(parseScientificPitch('Cb4')).toBe(59);
    expect(parseScientificPitch('B#3')).toBe(60);
  });

  it('converts between frequency and notes', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440);
    expect(midiToFrequency(40)).toBeCloseTo(82.407, 2);
    const r = describeFrequency(445);
    expect(r.name).toBe('A');
    expect(r.octave).toBe(4);
    expect(r.cents).toBeCloseTo(19.56, 1);
    expect(describeFrequency(432, 432).cents).toBeCloseTo(0);
  });
});

describe('tunings', () => {
  it('defines all presets with valid notes', () => {
    expect(GUITAR_TUNINGS.map((t) => t.id)).toEqual(['standard', 'drop-d', 'half-down', 'full-down', 'open-g']);
    for (const t of GUITAR_TUNINGS) expect(tuningStrings(t)).toHaveLength(6);
  });

  it('half-step down is exactly one semitone below standard', () => {
    const std = tuningStrings(GUITAR_TUNINGS[0]);
    const half = tuningStrings(GUITAR_TUNINGS[2]);
    std.forEach((s, i) => expect(s.midi - half[i].midi).toBe(1));
  });

  it('finds the closest string', () => {
    const strings = tuningStrings(GUITAR_TUNINGS[0]);
    expect(closestString(strings, 84).note).toBe('E2');
    expect(closestString(strings, 240).note).toBe('B3');
    expect(closestString(strings, 330).note).toBe('E4');
  });
});

describe('chords', () => {
  it('parses symbols and aliases', () => {
    expect(parseChord('F#m7')).toEqual({ root: 6, quality: 'm7' });
    expect(parseChord('Bb')).toEqual({ root: 10, quality: 'maj' });
    expect(parseChord('Bm')).toEqual({ root: 11, quality: 'min' });
    expect(parseChord('Dsus')).toEqual({ root: 2, quality: 'sus4' });
    expect(parseChord('G/B')).toEqual({ root: 7, quality: 'maj', bass: 11 });
    expect(parseChord('C°')).toEqual({ root: 0, quality: 'dim' });
    expect(parseChord('N')).toBeNull();
    expect(parseChord('Xm')).toBeNull();
  });

  it('formats and transposes', () => {
    expect(formatChord({ root: 3, quality: 'maj7' })).toBe('Ebmaj7');
    expect(transposeLabel('G', 2)).toBe('A');
    expect(transposeLabel('Em', -2)).toBe('Dm');
    expect(transposeLabel('B7', 1)).toBe('C7');
    expect(transposeLabel('G/B', 5)).toBe('C/E');
    expect(transposeLabel('N', 3)).toBe('N');
    expect(transposeLabel('A', 12)).toBe('A');
    expect(transposeLabel('C', 1, 'flats')).toBe('Db');
  });

  it('computes chord tones', () => {
    expect(chordTones({ root: 9, quality: 'min' })).toEqual([9, 0, 4]);
    expect(chordTones({ root: 7, quality: '7' })).toEqual([7, 11, 2, 5]);
  });

  it('round-trips chord ids', () => {
    for (const { chord } of libraryChords()) expect(parseChordId(chordId(chord))).toEqual(chord);
  });
});

describe('voicings', () => {
  const library = libraryChords();

  it('covers every root and quality', () => {
    expect(library).toHaveLength(12 * 9);
    for (const entry of library) expect(entry.voicings.length).toBeGreaterThan(0);
  });

  it.each(library.map((c) => [c.name, c] as const))('%s voicings are musically correct', (_name, entry) => {
    const tones = chordTones(entry.chord);
    const required = QUALITIES[entry.chord.quality].intervals
      .filter((i) => !QUALITIES[entry.chord.quality].optional.includes(i))
      .map((i) => (entry.chord.root + i) % 12);
    for (const v of entry.voicings) {
      const sounding = v.frets.flatMap((f, s) => (f === null ? [] : [(STANDARD_OPEN_PCS[s] + f) % 12]));
      // Every note belongs to the chord.
      for (const pc of sounding) expect(tones).toContain(pc);
      // Required tones are present.
      for (const pc of required) expect(sounding).toContain(pc);
      // Root position: lowest sounding string is the root.
      expect(sounding[0]).toBe(entry.chord.root);
      // Playable span: at most 4 frets between lowest and highest fretted note.
      expect(v.maxFret - v.minFret).toBeLessThanOrEqual(3);
      // Fingers line up with frets.
      v.frets.forEach((f, s) => {
        if (f === null) expect(v.fingers[s]).toBeNull();
        else if (f === 0) expect(v.fingers[s]).toBe(0);
        else expect(v.fingers[s]).toBeGreaterThanOrEqual(1);
      });
    }
  });

  it('offers the classic open shapes first', () => {
    expect(getVoicings({ root: 0, quality: 'maj' })[0].frets).toEqual([null, 3, 2, 0, 1, 0]);
    expect(getVoicings({ root: 4, quality: 'maj' })[0].fingers).toEqual([0, 2, 3, 1, 0, 0]);
    expect(getVoicings({ root: 9, quality: 'min' })[0].fingers).toEqual([null, 0, 2, 3, 1, 0]);
    expect(getVoicings({ root: 9, quality: 'min' })[0].difficulty).toBe('beginner');
  });

  it('detects barre chords', () => {
    const fBarre = getVoicings({ root: 5, quality: 'maj' }).find((v) => v.shape === 'E-shape');
    expect(fBarre?.barre).toEqual({ fret: 1, fromString: 0, toString: 5 });
  });
});
