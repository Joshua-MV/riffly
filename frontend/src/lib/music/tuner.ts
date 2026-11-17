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

export class TunerEngine {
  private readonly detector: YinPitchDetector;
  private readonly opts: Required<Omit<TunerEngineOptions, 'strings' | 'selectedString'>> &
    Pick<TunerEngineOptions, 'strings' | 'selectedString'>;
  private history: number[] = [];
  private inTuneSince: number | null = null;

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
  }

  /** Process one frame. Returns null while silent or when no clear pitch is present. */
  process(frame: Float32Array, now: number): TunerReading | null {
    const level = rms(frame);
    if (level < this.opts.noiseGate) {
      this.reset();
      return null;
    }
    const estimate = this.detector.detect(frame);
    if (!estimate || estimate.clarity < this.opts.minClarity) return null;

    // Median of recent estimates rejects single-frame octave errors.
    this.history.push(estimate.frequency);
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
          : closestString(strings, frequency);
      targetFrequency = target.frequency;
    } else {
      targetFrequency = this.opts.a4 * 2 ** ((note.midi - 69) / 12);
    }
    const centsOff = centsBetween(frequency, targetFrequency);
    const inTune = Math.abs(centsOff) <= this.opts.inTuneCents;
    if (inTune) this.inTuneSince ??= now;
    else this.inTuneSince = null;

    return {
      ...note,
      target,
      targetFrequency,
      centsOff,
      state: inTune ? 'in-tune' : centsOff < 0 ? 'flat' : 'sharp',
      stable: inTune && this.inTuneSince !== null && now - this.inTuneSince >= this.opts.stableMs,
      clarity: estimate.clarity,
      level,
    };
  }
}
