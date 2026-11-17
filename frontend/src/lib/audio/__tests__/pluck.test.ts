import { YinPitchDetector } from '@/lib/music/pitch';
import { centsBetween } from '@/lib/music/notes';

import { encodeWav, renderStrum } from '../pluck';

describe('Karplus–Strong synthesis', () => {
  it('produces a string tone at the requested pitch', () => {
    const sr = 44100;
    const y = renderStrum([45], { sampleRate: sr, duration: 0.5 }); // A2, 110 Hz
    const est = new YinPitchDetector({ sampleRate: sr }).detect(y.slice(2000, 6096));
    expect(est).not.toBeNull();
    // KS tuning is quantised to whole-sample periods: within ~15 cents at 110 Hz.
    expect(Math.abs(centsBetween(est!.frequency, 110))).toBeLessThan(15);
  });

  it('normalises and fades out', () => {
    const y = renderStrum([40, 47, 52], { duration: 1 });
    expect(Math.max(...y.map(Math.abs))).toBeLessThanOrEqual(0.8001);
    expect(Math.abs(y[y.length - 1])).toBeLessThan(1e-3);
  });

  it('encodes a valid WAV header', () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 1]), 8000);
    const text = (a: number, b: number) => String.fromCharCode(...wav.slice(a, b));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 12)).toBe('WAVE');
    expect(wav.length).toBe(44 + 8);
    const view = new DataView(wav.buffer);
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getInt16(50, true)).toBe(0x7fff);
  });
});
