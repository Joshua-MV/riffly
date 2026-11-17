import { buildFingerstyleTab, PATTERNS } from '../fingerstyle';
import { notesToBars, placeNotes } from '../placement';
import { STANDARD_OPEN_MIDI } from '../voicings';

const note = (start: number, midi: number, velocity = 0.8) => ({ start, end: start + 0.2, midi, velocity });

describe('fretboard placement', () => {
  it('every placed note sounds the right pitch', () => {
    const notes = [40, 45, 50, 55, 59, 64, 67, 72, 76].map((m, i) => note(i * 0.3, m));
    for (const capo of [0, 2]) {
      for (const p of placeNotes(notes, capo)) {
        expect(STANDARD_OPEN_MIDI[p.string] + capo + p.fret).toBe(p.midi);
      }
    }
  });

  it('uses open strings and stays near the hand position', () => {
    const placed = placeNotes([note(0, 64), note(0.5, 67), note(1, 69)]);
    expect(placed[0]).toMatchObject({ string: 5, fret: 0 }); // high E open
    expect(placed[1]).toMatchObject({ string: 5, fret: 3 });
    expect(placed[2]).toMatchObject({ string: 5, fret: 5 });
  });

  it('puts simultaneous notes on different strings', () => {
    const chord = [note(0, 48), note(0.01, 52), note(0.02, 55), note(0.02, 60), note(0.03, 64)]; // C major
    const placed = placeNotes(chord);
    expect(new Set(placed.map((p) => p.string)).size).toBe(placed.length);
    expect(placed).toHaveLength(5);
  });

  it('drops quiet notes and notes below the capo', () => {
    expect(placeNotes([note(0, 64, 0.1)])).toHaveLength(0);
    expect(placeNotes([note(0, 40)], 2)).toHaveLength(0); // low E is below a capo on 2
  });

  it('quantises notes onto the tab grid', () => {
    const beats = Array.from({ length: 9 }, (_, i) => i * 0.5);
    const grid = buildFingerstyleTab([{ start: 0, end: 4.5, shape: 'C' }], beats, PATTERNS[0]);
    const bars = notesToBars(placeNotes([note(0.02, 64), note(0.76, 67)]), grid);
    expect(bars[0].steps[0].notes).toEqual([{ string: 5, fret: 0 }]);
    expect(bars[0].steps[3].notes).toEqual([{ string: 5, fret: 3 }]); // 0.75 s = beat 2 "&"
    expect(bars[0].steps[1].notes).toEqual([]);
  });
});
