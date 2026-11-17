import { barDuration, renderClicks } from '../click';

describe('metronome clicks', () => {
  it('renders exactly one bar with clicks on each beat', () => {
    const sr = 8000;
    const y = renderClicks({ bpm: 120, sampleRate: sr });
    expect(y.length).toBe(sr * 2); // 4 beats at 120 BPM = 2 s
    const energyAt = (sec: number) => {
      const i = Math.round(sec * sr);
      let e = 0;
      for (let k = i; k < i + 80; k++) e += y[k] * y[k];
      return e;
    };
    for (const t of [0, 0.5, 1, 1.5]) expect(energyAt(t)).toBeGreaterThan(1);
    expect(energyAt(0.25)).toBeLessThan(1e-6);
    // Accented downbeat is louder.
    expect(energyAt(0)).toBeGreaterThan(energyAt(0.5));
  });

  it('computes bar duration', () => {
    expect(barDuration(60)).toBe(4);
    expect(barDuration(90, 3)).toBeCloseTo(2);
  });
});
