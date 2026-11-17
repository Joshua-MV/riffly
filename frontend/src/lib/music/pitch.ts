/**
 * YIN fundamental-frequency estimator (de Cheveigné & Kawahara, 2002).
 *
 * Steps: squared-difference function → cumulative-mean-normalised difference →
 * absolute threshold → local-minimum search → parabolic interpolation.
 * YIN measures periodicity rather than spectral peaks, so it copes with guitar strings
 * whose fundamental is weaker than their harmonics (common on low strings and phone mics).
 */

export interface PitchEstimate {
  frequency: number;
  /** 1 − aperiodicity at the chosen lag; ~1 for a clean periodic signal. */
  clarity: number;
}

export interface YinOptions {
  sampleRate: number;
  minFrequency?: number;
  maxFrequency?: number;
  /** Absolute threshold on the normalised difference. Lower = stricter. */
  threshold?: number;
}

export class YinPitchDetector {
  readonly sampleRate: number;
  private readonly tauMin: number;
  private readonly tauMaxLimit: number;
  private readonly threshold: number;
  private diff: Float32Array = new Float32Array(0);

  constructor({ sampleRate, minFrequency = 60, maxFrequency = 1400, threshold = 0.12 }: YinOptions) {
    this.sampleRate = sampleRate;
    this.tauMin = Math.max(2, Math.floor(sampleRate / maxFrequency));
    this.tauMaxLimit = Math.ceil(sampleRate / minFrequency);
    this.threshold = threshold;
  }

  /** Minimum buffer length for the configured lowest frequency (two periods). */
  get minimumBufferSize(): number {
    return this.tauMaxLimit * 2;
  }

  detect(buffer: Float32Array): PitchEstimate | null {
    const tauMax = Math.min(this.tauMaxLimit, Math.floor(buffer.length / 2));
    if (tauMax <= this.tauMin + 2) return null;
    const window = buffer.length - tauMax;
    if (this.diff.length < tauMax + 1) this.diff = new Float32Array(tauMax + 1);
    const d = this.diff;

    // 1. Difference function.
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let j = 0; j < window; j++) {
        const delta = buffer[j] - buffer[j + tau];
        sum += delta * delta;
      }
      d[tau] = sum;
    }

    // 2. Cumulative mean normalised difference.
    d[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += d[tau];
      d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
    }

    // 3. First dip below threshold, then descend to its local minimum.
    let tau = -1;
    for (let t = this.tauMin; t <= tauMax; t++) {
      if (d[t] < this.threshold) {
        while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) return null;

    // 4. Parabolic interpolation around the minimum for sub-sample precision.
    let refined = tau;
    if (tau > 1 && tau < tauMax) {
      const s0 = d[tau - 1];
      const s1 = d[tau];
      const s2 = d[tau + 1];
      const denom = s0 + s2 - 2 * s1;
      if (denom !== 0) refined = tau + (s0 - s2) / (2 * denom);
    }
    return { frequency: this.sampleRate / refined, clarity: 1 - d[tau] };
  }
}

export function rms(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}
