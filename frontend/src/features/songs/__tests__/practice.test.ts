import { createSong, DEFAULT_PRACTICE } from '@/features/library/model';
import { GUITAR_TUNINGS, tuningById, tuningStrings, uniformShift } from '@/lib/music/instruments';
import { parseChord } from '@/lib/music/chords';
import { getVoicings } from '@/lib/music/voicings';
import type { AnalysisResult } from '@/services/api';

import { beatInBar, playContext, practiceTab, practiceTimeline, songChords, topChanges } from '../practice';

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
      { ...DEFAULT_PRACTICE, capo: 1 },
    );
    expect(t.slice(0, 4).map((c) => c.display)).toEqual(['G', 'D7', 'Em', 'C']);
  });

  it('lists song chords with time share', () => {
    const list = songChords(practiceTimeline(song, { ...DEFAULT_PRACTICE, capo: 1 }));
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
    const bars = practiceTab(practiceTimeline(song, { ...DEFAULT_PRACTICE, capo: 1, pattern: 'travis' }), beats, 'travis');
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

  it('knows which tunings keep standard shapes', () => {
    expect(uniformShift(tuningById('standard'))).toBe(0);
    expect(uniformShift(tuningById('half-down'))).toBe(-1);
    expect(uniformShift(tuningById('full-down'))).toBe(-2);
    for (const id of ['drop-d', 'open-g', 'open-d', 'dadgad', 'drop-c']) expect(uniformShift(tuningById(id))).toBeNull();
    expect(tuningById('nope').id).toBe('standard');
  });

  it('half-step down names the shapes a semitone above what sounds', () => {
    // Sounding Ab Eb Fm Db, guitar tuned a half step down: shapes are a semitone higher.
    const t = practiceTimeline(song, { ...DEFAULT_PRACTICE, tuning: 'half-down' });
    expect(t.slice(0, 4).map((c) => c.display)).toEqual(['A', 'E', 'F#m', 'D']);
    expect(playContext({ ...DEFAULT_PRACTICE, tuning: 'half-down' }).standardShapes).toBe(true);
  });

  it('standard with capo 1 shows the same shapes as half-step down with capo 2', () => {
    const std = practiceTimeline(song, { ...DEFAULT_PRACTICE, capo: 1 }).map((c) => c.display);
    const down = practiceTimeline(song, { ...DEFAULT_PRACTICE, tuning: 'half-down', capo: 2 }).map((c) => c.display);
    expect(down).toEqual(std);
  });

  it('open tunings keep the sounding names and draw shapes for that tuning', () => {
    const ctx = playContext({ ...DEFAULT_PRACTICE, tuning: 'open-g' });
    expect(ctx.standardShapes).toBe(false);
    expect(ctx.shapeMidi).toEqual(tuningStrings(tuningById('open-g')).map((s) => s.midi));
    const t = practiceTimeline(song, { ...DEFAULT_PRACTICE, tuning: 'open-g', capo: 1 });
    expect(t[0].display).toBe('G');
    // G in open G with capo 1 (frets from the capo) is the open strings.
    const bars = practiceTab(t, beats, 'arpeggio', ctx.shapeMidi);
    const g = getVoicings(parseChord('G')!, ctx.shapeMidi)[0];
    expect(g.frets).toEqual([null, 0, 0, 0, 0, 0]);
    const firstBar = bars[0].steps.flatMap((s) => s.notes);
    expect(firstBar.every((n) => n.fret === 0)).toBe(true);
    expect(GUITAR_TUNINGS.length).toBeGreaterThan(5);
  });
});
