import { tuningStrings, GUITAR_TUNINGS } from '../instruments';
import { centsBetween } from '../notes';
import { YinPitchDetector } from '../pitch';
import { TunerEngine } from '../tuner';

const SR = 48000;
const N = 4096;

/** Plucked-string-like tone: weak fundamental, strong harmonics, light noise. */
function stringTone(freq: number, { fundamental = 0.4, noise = 0.02, offset = 0 } = {}): Float32Array {
  const out = new Float32Array(N);
  let seed = 12345;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let i = 0; i < N; i++) {
    const t = (i + offset) / SR;
    let v = fundamental * Math.sin(2 * Math.PI * freq * t);
    for (let k = 2; k <= 8; k++) v += (1 / k) * Math.sin(2 * Math.PI * freq * k * t + k);
    out[i] = 0.3 * v + noise * rand();
  }
  return out;
}

describe('YIN pitch detection', () => {
  const yin = new YinPitchDetector({ sampleRate: SR });

  it.each([
    ['low E (E2)', 82.41],
    ['drop D (D2)', 73.42],
    ['A2', 110],
    ['G3', 196],
    ['high E (E4)', 329.63],
    ['12th fret high E', 659.26],
  ])('detects %s within 2 cents', (_name, freq) => {
    const est = yin.detect(stringTone(freq));
    expect(est).not.toBeNull();
    expect(Math.abs(centsBetween(est!.frequency, freq))).toBeLessThan(2);
    expect(est!.clarity).toBeGreaterThan(0.85);
  });

  it('handles a missing fundamental', () => {
    const est = yin.detect(stringTone(110, { fundamental: 0 }));
    expect(Math.abs(centsBetween(est!.frequency, 110))).toBeLessThan(3);
  });

  it('returns null for noise', () => {
    let seed = 1;
    const noise = Float32Array.from({ length: N }, () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1);
    expect(yin.detect(noise)).toBeNull();
  });
});

describe('TunerEngine', () => {
  const strings = tuningStrings(GUITAR_TUNINGS[0]);

  it('ignores silence', () => {
    const engine = new TunerEngine({ sampleRate: SR, strings });
    expect(engine.process(new Float32Array(N), 0)).toBeNull();
  });

  it('reports a flat low E string against the auto-detected target', () => {
    const engine = new TunerEngine({ sampleRate: SR, strings });
    const flat = 82.41 * 2 ** (-20 / 1200);
    const r = engine.process(stringTone(flat), 0)!;
    expect(r.target?.note).toBe('E2');
    expect(r.centsOff).toBeCloseTo(-20, 0);
    expect(r.state).toBe('flat');
    expect(r.stable).toBe(false);
  });

  it('becomes stable after staying in tune', () => {
    const engine = new TunerEngine({ sampleRate: SR, strings, stableMs: 500 });
    let r = engine.process(stringTone(110), 0)!;
    expect(r.state).toBe('in-tune');
    expect(r.stable).toBe(false);
    r = engine.process(stringTone(110, { offset: N }), 300)!;
    expect(r.stable).toBe(false);
    r = engine.process(stringTone(110, { offset: 2 * N }), 600)!;
    expect(r.stable).toBe(true);
  });

  it('measures against a manually selected string', () => {
    const engine = new TunerEngine({ sampleRate: SR, strings, selectedString: 1 });
    const r = engine.process(stringTone(98), 0)!; // G2 while A2 is selected
    expect(r.target?.note).toBe('A2');
    expect(r.centsOff).toBeLessThan(-150);
    expect(r.state).toBe('flat');
  });

  it('works chromatically with a custom reference pitch', () => {
    const engine = new TunerEngine({ sampleRate: SR, a4: 432 });
    const r = engine.process(stringTone(432 / 2), 0)!;
    expect(r.name).toBe('A');
    expect(r.octave).toBe(3);
    expect(Math.abs(r.centsOff)).toBeLessThan(2);
  });
});
