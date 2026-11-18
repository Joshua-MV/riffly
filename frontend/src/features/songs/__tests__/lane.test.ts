import { beatsLeft, chordProgress, laneState, laneWindow, nextChordTime, previousChordTime, strumSlots } from '../lane';

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

  it('tracks the current chord, its beats and the next chord', () => {
    const s = laneState(chords, beats, 1.2);
    expect(chords[s.currentIndex].label).toBe('G');
    expect(chords[s.nextIndex].label).toBe('D');
    expect(s.beatsTotal).toBe(4);
    expect(s.beatsLeft).toBe(2); // 1.5 and 2.0 are still to come
    expect(s.beatIndex).toBe(1);
    const silence = laneState(chords, beats, 0.2);
    expect(silence.currentIndex).toBe(-1);
    expect(chords[silence.nextIndex].label).toBe('G');
    expect(laneState(chords, beats, 6.4).nextIndex).toBe(-1);
  });

  it('lays a one-bar strum pattern on the beat grid', () => {
    const slots = strumSlots(beats, 0, 'D-DU-UDU', 0.4, 2.6);
    expect(slots.slice(0, 8).map((s) => s.stroke).join('')).toBe('D-DU-UDU');
    expect(slots[1].t).toBeCloseTo(0.75);
    expect(slots[0].onBeat).toBe(true);
    // Bar starting on the second beat: the pattern shifts with it.
    expect(strumSlots(beats, 1, 'D-DU-UDU', 0.4, 0.9).map((s) => s.stroke)).toEqual(['D', 'U']);
  });
});
