import { buildTimeline, formatTime, loopTarget, segmentAt, upcoming } from '../timeline';

const segs = [
  { start: 0, end: 0.5, label: 'N', root: null, quality: null, confidence: 0.9 },
  { start: 0.5, end: 2.5, label: 'G', root: 7, quality: 'maj', confidence: 0.8 },
  { start: 2.5, end: 4.5, label: 'D', root: 2, quality: 'maj', confidence: 0.7 },
  { start: 4.5, end: 6.5, label: 'Em', root: 4, quality: 'min', confidence: 0.6 },
];

describe('timeline', () => {
  it('finds the segment at a time', () => {
    expect(segmentAt(segs, 0.1)).toBe(0);
    expect(segmentAt(segs, 2.5)).toBe(2);
    expect(segmentAt(segs, 6.49)).toBe(3);
    expect(segmentAt(segs, 7)).toBe(-1);
  });

  it('applies corrections, then transposition', () => {
    const t = buildTimeline(segs, [{ id: 'c', analysis_id: 'a', start: 2.5, original_label: 'D', corrected_label: 'D7', created_at: '' }], 2);
    expect(t.map((s) => s.display)).toEqual(['N', 'A', 'E7', 'F#m']);
    expect(t[2].corrected?.id).toBe('c');
  });

  it('lists upcoming chords, skipping no-chord', () => {
    const t = buildTimeline(segs, [], 0);
    expect(upcoming(t, 0, 2).map((s) => s.display)).toEqual(['G', 'D']);
  });

  it('formats time and loops', () => {
    expect(formatTime(75.9)).toBe('1:15');
    expect(loopTarget(10, { start: 4, end: 9 })).toBe(4);
    expect(loopTarget(5, { start: 4, end: 9 })).toBeNull();
    expect(loopTarget(5, null)).toBeNull();
  });
});
