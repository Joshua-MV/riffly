/**
 * Tuner state machine: raw audio frames in, stable readings out.
 * Pure TypeScript so it is unit-testable and shared by every audio input adapter.
 */

import { closestString, type TunedString } from './instruments';
import { centsBetween, describeFrequency, type NoteReading, type Spelling } from './notes';
import { rms, YinPitchDetector } from './pitch';

export type TuneState = 'flat' | 'sharp' | 'in-tune';

export interface TunerReading extends NoteReading {
  /** String being tuned (auto-detected or user-selected); null in chromatic mode. */
  target: TunedString | null;
  /** Frequency the needle is measuring against. */
  targetFrequency: number;
  /** Deviation from the target in cents (can exceed ±50 when far off a selected string). */
  centsOff: number;
  state: TuneState;
  /** Cents off, smoothed over recent frames: what the needle should show. */
  centsSmooth: number;
  /** True once the note has stayed in tune for `stableMs`. */
  stable: boolean;
  clarity: number;
  level: number;
}

export interface TunerEngineOptions {
  sampleRate: number;
  a4?: number;
  spelling?: Spelling;
  /** Open strings of the active tuning; empty/undefined = chromatic mode. */
  strings?: readonly TunedString[];
  /** Restrict detection to this string (manual string selection). */
  selectedString?: number | null;
  inTuneCents?: number;
  stableMs?: number;
  /** Frames quieter than this RMS are treated as silence. */
  noiseGate?: number;
  minClarity?: number;
}

const HISTORY = 5;
/** Keep the current string as the target unless another is closer by this many cents. */
const SWITCH_MARGIN = 120;
/** Quiet frames are tolerated this long (a note fading out) before the state resets. */
const GATE_HOLD_MS = 250;

export class TunerEngine {
  private readonly detector: YinPitchDetector;
  private readonly opts: Required<Omit<TunerEngineOptions, 'strings' | 'selectedString'>> &
    Pick<TunerEngineOptions, 'strings' | 'selectedString'>;
  private history: number[] = [];
  private inTuneSince: number | null = null;
  private targetIndex: number | null = null;
  private smooth: number | null = null;
  private lastSound = -Infinity;

  constructor(options: TunerEngineOptions) {
    this.opts = {
      a4: 440,
      spelling: 'common',
      inTuneCents: 5,
      stableMs: 600,
      noiseGate: 0.008,
      minClarity: 0.85,
      ...options,
    };
    this.detector = new YinPitchDetector({ sampleRate: options.sampleRate, minFrequency: 60, maxFrequency: 1400 });
  }

  get minimumBufferSize(): number {
    return this.detector.minimumBufferSize;
  }

  reset(): void {
    this.history = [];
    this.inTuneSince = null;
    this.targetIndex = null;
    this.smooth = null;
  }

  /** Auto mode: the closest string, but stay on the current one unless another is clearly closer. */
  private pickString(strings: readonly TunedString[], frequency: number): TunedString {
    const best = closestString(strings, frequency);
    const cur = this.targetIndex !== null ? strings[this.targetIndex] : undefined;
    if (cur && cur.index !== best.index) {
      const dCur = Math.abs(centsBetween(frequency, cur.frequency));
      const dBest = Math.abs(centsBetween(frequency, best.frequency));
      if (dCur - dBest < SWITCH_MARGIN) return cur;
    }
    this.targetIndex = best.index;
    return best;
  }

  /** Process one frame. Returns null while silent or when no clear pitch is present. */
  process(frame: Float32Array, now: number): TunerReading | null {
    const level = rms(frame);
    if (level < this.opts.noiseGate) {
      if (now - this.lastSound > GATE_HOLD_MS) this.reset();
      return null;
    }
    this.lastSound = now;
    const estimate = this.detector.detect(frame);
    if (!estimate || estimate.clarity < this.opts.minClarity) return null;

    // Octave slips (common on the low strings, whose 2nd harmonic is strong): fold an estimate
    // that is an octave away from the recent median back onto it.
    let f = estimate.frequency;
    if (this.history.length >= 3) {
      const med = [...this.history].sort((a, b) => a - b)[Math.floor(this.history.length / 2)];
      for (const k of [2, 0.5]) if (Math.abs(centsBetween(f / k, med)) < 60) f /= k;
    }
    // Median of recent estimates rejects single-frame errors.
    this.history.push(f);
    if (this.history.length > HISTORY) this.history.shift();
    const sorted = [...this.history].sort((a, b) => a - b);
    const frequency = sorted[Math.floor(sorted.length / 2)];

    const note = describeFrequency(frequency, this.opts.a4, this.opts.spelling);
    const { strings, selectedString } = this.opts;
    let target: TunedString | null = null;
    let targetFrequency: number;
    if (strings && strings.length) {
      target =
        selectedString !== null && selectedString !== undefined
          ? strings[selectedString]
          : this.pickString(strings, frequency);
      targetFrequency = target.frequency;
    } else {
      targetFrequency = this.opts.a4 * 2 ** ((note.midi - 69) / 12);
    }
    const centsOff = centsBetween(frequency, targetFrequency);
    // Exponential smoothing for the needle; a big jump (new string / new pluck) is followed at once.
    this.smooth = this.smooth === null || Math.abs(centsOff - this.smooth) > 30 ? centsOff : this.smooth + 0.35 * (centsOff - this.smooth);
    const inTune = Math.abs(centsOff) <= this.opts.inTuneCents;
    if (inTune) this.inTuneSince ??= now;
    else this.inTuneSince = null;

    return {
      ...note,
      target,
      targetFrequency,
      centsOff,
      centsSmooth: this.smooth,
      state: inTune ? 'in-tune' : centsOff < 0 ? 'flat' : 'sharp',
      stable: inTune && this.inTuneSince !== null && now - this.inTuneSince >= this.opts.stableMs,
      clarity: estimate.clarity,
      level,
    };
  }
}
