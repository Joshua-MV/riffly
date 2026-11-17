/**
 * Metronome clicks rendered as audio. A bar of clicks is rendered once and looped by the
 * player, so timing is sample-accurate on every platform, with no JS timer jitter.
 */

export interface ClickOptions {
  bpm: number;
  beatsPerBar?: number;
  /** Number of bars to render. */
  bars?: number;
  sampleRate?: number;
  /** Louder, higher click on beat 1. */
  accent?: boolean;
}

function click(out: Float32Array, at: number, freq: number, gain: number, sampleRate: number) {
  const len = Math.min(Math.round(0.035 * sampleRate), out.length - at);
  for (let i = 0; i < len; i++) {
    const t = i / sampleRate;
    out[at + i] += gain * Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 90);
  }
}

export function renderClicks({ bpm, beatsPerBar = 4, bars = 1, sampleRate = 44100, accent = true }: ClickOptions): Float32Array {
  const beatSamples = (60 / bpm) * sampleRate;
  const total = Math.round(beatSamples * beatsPerBar * bars);
  const out = new Float32Array(total);
  for (let b = 0; b < beatsPerBar * bars; b++) {
    const first = b % beatsPerBar === 0;
    click(out, Math.round(b * beatSamples), first && accent ? 1760 : 1175, first && accent ? 0.9 : 0.6, sampleRate);
  }
  return out;
}

export const barDuration = (bpm: number, beatsPerBar = 4) => (60 / bpm) * beatsPerBar;
