import { beatsLeft, chordProgress, laneWindow, nextChordTime, previousChordTime } from '../lane';

const chords = [
  { start: 0, end: 0.5, label: 'N' },
  { start: 0.5, end: 2.5, label: 'G' },
  { start: 2.5, end: 4.5, label: 'D' },
  { start: 4.5, end: 6.5, label: 'Em' },
];
const beats = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6];

describe('chord lane', () => {
  it('counts beats left before the change', () => {
    expect(beatsLeft(beats, 0.6, 2.5)).toBe(3); // 1.0, 1.5, 2.0 then change at 2.5
    expect(beatsLeft(beats, 2.1, 2.5)).toBe(0); // last beat: change next
    expect(beatsLeft(beats, 0.5, 2.5)).toBe(3); // the beat being played now doesn't count
  });

  it('measures progress through the chord', () => {
    expect(chordProgress(chords[1], 1.5)).toBeCloseTo(0.5);
    expect(chordProgress(chords[1], 0)).toBe(0);
    expect(chordProgress(chords[1], 9)).toBe(1);
  });

  it('shows only nearby chords and hides no-chord', () => {
    expect(laneWindow(chords, 1, 1, 2).map((c) => c.label)).toEqual(['G', 'D']);
  });

  it('skips back like a music player', () => {
    expect(previousChordTime(chords, 3.0)).toBe(0.5); // 0.5 s into D: go to G
    expect(previousChordTime(chords, 4.2)).toBe(2.5); // 1.7 s into D: restart D
    expect(previousChordTime(chords, 0.7)).toBe(0.5); // first chord: restart it
  });

  it('skips forward to the next change', () => {
    expect(nextChordTime(chords, 1)).toBe(2.5);
    expect(nextChordTime(chords, 6)).toBeNull();
  });
});
