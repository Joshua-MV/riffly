import { buildFingerstyleTab, chooseBarOffset, extendBeats, PATTERNS, stepAt, toAscii, voiceMap, type ShapeAtTime } from '../fingerstyle';
import { capoOptions, recommendCapo, shapeDifficulty, shapeFor } from '../simplify';
import { getVoicings, STANDARD_OPEN_PCS } from '../voicings';
import { chordTones, parseChord } from '../chords';

const prog = (labels: string[], dur = 2) => labels.map((label, i) => ({ label, start: i * dur, end: (i + 1) * dur }));

describe('capo simplification', () => {
  it('rates open chords easier than barre chords', () => {
    expect(shapeDifficulty(parseChord('G')!)).toBe(1);
    expect(shapeDifficulty(parseChord('F')!)).toBe(3);
    expect(shapeDifficulty(parseChord('Bb')!)).toBe(5);
  });

  it('maps sounding chords to capo shapes', () => {
    expect(shapeFor('Ab', 1)).toBe('G');
    expect(shapeFor('Fm', 1)).toBe('Em');
    expect(shapeFor('N', 3)).toBe('N');
  });

  it('suggests capo 1 for Ab–Eb–Fm–Db (played as G–D–Em–C)', () => {
    const best = recommendCapo(prog(['Ab', 'Eb', 'Fm', 'Db']));
    expect(best?.capo).toBe(1);
    expect(best?.shapes).toEqual(['G', 'D', 'Em', 'C']);
    expect(best?.easyShare).toBe(1);
    expect(best?.barreShapes).toEqual([]);
  });

  it('does not suggest a capo when the song is already easy', () => {
    expect(recommendCapo(prog(['G', 'D', 'Em', 'C']))).toBeNull();
  });

  it('weights by duration and ignores no-chord', () => {
    const opts = capoOptions([...prog(['Bb', 'N']), { label: 'Eb', start: 4, end: 20 }]);
    // Eb dominates; capo 1 turns it into D (open).
    expect(opts[0].capo).toBe(1);
    expect(opts[0].shapes).toEqual(['A', 'D']);
  });
});

describe('fingerstyle tab', () => {
  const beats = Array.from({ length: 33 }, (_, i) => 0.5 + i * 0.5); // 120 BPM from 0.5 s
  const shapes: ShapeAtTime[] = [
    { start: 0, end: 0.5, shape: 'N' },
    // Changes land on beats 4, 12, 20 → bars should start at beat index 0 (offset 0).
    { start: 0.5, end: 4.5, shape: 'C' },
    { start: 4.5, end: 8.5, shape: 'G' },
    { start: 8.5, end: 17, shape: 'Am' },
  ];

  it('maps voices to the strings of a voicing', () => {
    const c = getVoicings(parseChord('C')!)[0]; // x32010
    expect(voiceMap(c.frets)).toEqual({ B: 1, A: 2, T1: 5, T2: 4, T3: 3 });
  });

  it('aligns bars to chord changes', () => {
    expect(chooseBarOffset(beats, [0.5, 4.5, 8.5])).toBe(0);
    expect(chooseBarOffset(beats, [1.5, 3.5, 5.5])).toBe(2);
  });

  it.each(PATTERNS.map((p) => [p.id, p] as const))('%s produces playable notes from the chord', (_id, pattern) => {
    const bars = buildFingerstyleTab(shapes, beats, pattern);
    expect(bars.length).toBe(8);
    for (const bar of bars) {
      expect(bar.steps).toHaveLength(8);
      for (const step of bar.steps) {
        if (!step.chord) continue;
        const tones = chordTones(parseChord(step.chord)!);
        const frets = getVoicings(parseChord(step.chord)!)[0].frets;
        for (const n of step.notes) {
          expect(frets[n.string]).toBe(n.fret); // note comes from the chord shape
          expect(tones).toContain((STANDARD_OPEN_PCS[n.string] + n.fret) % 12);
        }
      }
    }
    // Bar 1 starts with the C bass note on string 5 (A string), fret 3.
    expect(bars[0].steps[0].chord).toBe('C');
    expect(bars[0].steps[0].notes).toContainEqual({ string: 1, fret: 3 });
    // Each chord lasts 4 s = 2 bars at 120 BPM: C C G G Am…
    expect(bars.map((b) => b.steps[0].chord)).toEqual(['C', 'C', 'G', 'G', 'Am', 'Am', 'Am', 'Am']);
  });

  it('locates the current step', () => {
    const bars = buildFingerstyleTab(shapes, beats, PATTERNS[0]);
    expect(stepAt(bars, 0.5)).toEqual({ bar: 0, step: 0 });
    expect(stepAt(bars, 0.8)).toEqual({ bar: 0, step: 1 });
    expect(stepAt(bars, 2.6)).toEqual({ bar: 1, step: 0 });
    expect(stepAt(bars, 0.1)).toBeNull();
  });

  it('exports readable ASCII tab', () => {
    const ascii = toAscii(buildFingerstyleTab(shapes, beats, PATTERNS[0]).slice(0, 1), 4, 'Capo 0');
    const lines = ascii.split('\n');
    expect(lines[0]).toBe('Capo 0');
    expect(lines[2].trim().startsWith('C')).toBe(true);
    expect(lines[3].startsWith('e|')).toBe(true);
    expect(lines[8].startsWith('E|')).toBe(true);
    expect(lines[7]).toContain('3'); // C bass on the A string, fret 3
  });

  it('extends a late-starting beat grid back to the start of the song', () => {
    const late = [0.557, 1.115, 1.649, 2.206, 2.74, 3.297, 3.85];
    const ext = extendBeats(late);
    expect(ext[0]).toBeCloseTo(0, 1);
    expect(ext.slice(1)).toEqual(late);
    expect(extendBeats(ext)).toEqual(ext); // idempotent
    // The intro chord now gets its own bar.
    const bars = buildFingerstyleTab(
      [{ start: 0, end: 2.206, shape: 'G' }, { start: 2.206, end: 4.4, shape: 'D' }],
      late,
      PATTERNS[0],
    );
    expect(bars[0].steps[0].chord).toBe('G');
    expect(bars[0].start).toBeCloseTo(0, 1);
  });

  it('returns nothing without a beat grid', () => {
    expect(buildFingerstyleTab(shapes, [0, 1], PATTERNS[0])).toEqual([]);
  });
});
