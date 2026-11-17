import { createSong } from '@/features/library/model';
import type { AnalysisResult } from '@/services/api';

import { beatInBar, practiceTab, practiceTimeline, songChords, topChanges } from '../practice';

const chords = ['Ab', 'Eb', 'Fm', 'Db', 'Ab', 'Eb', 'Fm', 'Db'].map((label, i) => ({
  start: 0.5 + i * 2, end: 0.5 + (i + 1) * 2, label, root: null, quality: null, confidence: 0.8,
}));
const beats = Array.from({ length: 34 }, (_, i) => 0.5 + i * 0.5);
const analysis: AnalysisResult = {
  duration: 17, key: 'Ab major', key_confidence: 0.8, bpm: 120, bpm_confidence: 0.9, chords, progression: [],
  beats, waveform: [], model_version: 't', processing_seconds: 1, notes: [],
};
const song = createSong({ id: 's', title: 'x', originalFilename: 'x.mp3', audioBytes: 1, analysis });

describe('practice view', () => {
  it('shows capo shapes and applies corrections first', () => {
    const t = practiceTimeline(
      { ...song, corrections: [{ start: 2.5, originalLabel: 'Eb', correctedLabel: 'Eb7' }] },
      { capo: 1, keyShift: 0, pattern: 'arpeggio', countIn: false },
    );
    expect(t.slice(0, 4).map((c) => c.display)).toEqual(['G', 'D7', 'Em', 'C']);
  });

  it('lists song chords with time share', () => {
    const list = songChords(practiceTimeline(song, { capo: 1, keyShift: 0, pattern: 'arpeggio', countIn: false }));
    expect(list.map((c) => c.shape)).toEqual(['G', 'D', 'Em', 'C']);
    expect(list[0].share).toBeCloseTo(0.25);
    expect(list.every((c) => c.difficulty === 'beginner')).toBe(true);
  });

  it('finds the most common changes', () => {
    const changes = topChanges(practiceTimeline(song));
    expect(changes[0]).toEqual({ from: 'Ab', to: 'Eb', count: 2 });
    expect(changes.find((c) => c.from === 'Db' && c.to === 'Ab')?.count).toBe(1);
  });

  it('builds a tab using capo shapes', () => {
    const bars = practiceTab(practiceTimeline(song, { capo: 1, keyShift: 0, pattern: 'travis', countIn: false }), beats, 'travis');
    expect(bars[0].steps[0].chord).toBe('G');
    expect(bars.length).toBe(8);
  });

  it('counts beats within the bar', () => {
    expect(beatInBar(beats, 0.5, 0)).toBe(1);
    expect(beatInBar(beats, 1.6, 0)).toBe(3);
    expect(beatInBar(beats, 2.5, 0)).toBe(1);
    expect(beatInBar(beats, 0.6, 1)).toBe(4);
    expect(beatInBar(beats, 0.1, 0)).toBeNull();
  });
});
