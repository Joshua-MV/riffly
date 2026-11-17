/**
 * Karplus–Strong plucked-string synthesis and WAV encoding. Pure functions, no audio APIs:
 * the output is played through expo-audio on every platform.
 */

import { midiToFrequency } from '@/lib/music/notes';

export interface StrumOptions {
  sampleRate?: number;
  /** Delay between successive strings, seconds (a down-strum). */
  strumDelay?: number;
  duration?: number;
  /** Feedback damping; closer to 1 rings longer. */
  decay?: number;
  seed?: number;
}

function pluck(out: Float32Array, start: number, frequency: number, sampleRate: number, decay: number, rand: () => number) {
  const period = Math.max(2, Math.round(sampleRate / frequency));
  const buf = new Float32Array(period);
  for (let i = 0; i < period; i++) buf[i] = rand() * 2 - 1;
  let idx = 0;
  for (let n = start; n < out.length; n++) {
    const next = (idx + 1) % period;
    const v = buf[idx];
    out[n] += v;
    // Averaging two samples is a low-pass filter: high harmonics die first, like a real string.
    buf[idx] = decay * 0.5 * (v + buf[next]);
    idx = next;
  }
}

/** Render a strum of the given MIDI notes (low to high) to mono float samples. */
export function renderStrum(midiNotes: readonly number[], opts: StrumOptions = {}): Float32Array {
  const { sampleRate = 44100, strumDelay = 0.028, duration = 2.4, decay = 0.996, seed = 1 } = opts;
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = new Float32Array(Math.round(duration * sampleRate));
  midiNotes.forEach((m, i) => pluck(out, Math.round(i * strumDelay * sampleRate), midiToFrequency(m), sampleRate, decay, rand));
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.8 / peak : 0;
  // Short fade-out avoids a click at the end.
  const fade = Math.round(0.08 * sampleRate);
  for (let i = 0; i < out.length; i++) {
    const tail = out.length - i;
    out[i] *= gain * (tail < fade ? tail / fade : 1);
  }
  return out;
}

/** Encode mono float samples as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate = 44100): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return bytes;
}
