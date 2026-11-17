import type { AnalysisResult } from '@/services/api';

import { applyPatch, createSong, exportFilename, parseSong, removeCorrection, sortByNewest, upsertCorrection } from '../model';

const analysis: AnalysisResult = {
  duration: 10, key: 'G major', key_confidence: 0.8, bpm: 120, bpm_confidence: 0.9,
  chords: [{ start: 0, end: 2, label: 'G', root: 7, quality: 'maj', confidence: 0.9 }],
  progression: ['G'], beats: [], waveform: [], model_version: 'test', processing_seconds: 1, notes: [],
};

const base = () => createSong({ id: 's1', title: '  My Song ', originalFilename: 'my.wav', audioBytes: 100, analysis, now: new Date('2026-01-01') });

describe('local library model', () => {
  it('creates a clean record', () => {
    const s = base();
    expect(s.title).toBe('My Song');
    expect(s.isFavourite).toBe(false);
    expect(s.corrections).toEqual([]);
    expect(s.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('upserts and removes corrections by segment start', () => {
    let s = upsertCorrection(base(), { start: 2, originalLabel: 'D', correctedLabel: 'D7' });
    s = upsertCorrection(s, { start: 0, originalLabel: 'G', correctedLabel: 'Gmaj7' });
    s = upsertCorrection(s, { start: 2.0001, originalLabel: 'D', correctedLabel: 'Dsus4' });
    expect(s.corrections.map((c) => c.correctedLabel)).toEqual(['Gmaj7', 'Dsus4']);
    // Correcting back to the detected label removes the correction.
    s = upsertCorrection(s, { start: 0, originalLabel: 'G', correctedLabel: 'G' });
    expect(s.corrections).toHaveLength(1);
    expect(removeCorrection(s, 2).corrections).toEqual([]);
  });

  it('patches metadata and bumps updatedAt', () => {
    const s = applyPatch(base(), { isFavourite: true, notes: 'capo 2' }, new Date('2026-02-01'));
    expect(s.isFavourite).toBe(true);
    expect(s.notes).toBe('capo 2');
    expect(s.updatedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('rejects malformed stored records', () => {
    expect(parseSong(null)).toBeNull();
    expect(parseSong({ version: 2, id: 'x' })).toBeNull();
    expect(parseSong({ ...base(), analysis: {} })).toBeNull();
    expect(parseSong(JSON.parse(JSON.stringify(base())))?.id).toBe('s1');
  });

  it('sorts newest first and builds safe export names', () => {
    const a = { ...base(), id: 'a', createdAt: '2026-01-01' };
    const b = { ...base(), id: 'b', createdAt: '2026-03-01' };
    expect(sortByNewest([a, b]).map((s) => s.id)).toEqual(['b', 'a']);
    expect(exportFilename({ title: 'Wish/You:Were Here?', artist: 'Pink Floyd' })).toBe('Pink Floyd - WishYouWere Here.mp3');
    expect(exportFilename({ title: '', artist: null })).toBe('song.mp3');
  });
});
