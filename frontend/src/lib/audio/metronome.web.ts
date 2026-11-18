/**
 * Metronome clicks over a playing song (web / Windows app). Clicks are scheduled on the Web
 * Audio clock a little ahead of time, so each one lands exactly on its beat regardless of
 * what the UI thread is doing.
 */

import type { ClickScheduler } from './metronome.types';

type Ctx = AudioContext;

let ctx: Ctx | null = null;
function audio(): Ctx | null {
  if (ctx) return ctx;
  const AC = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

export function createClickScheduler(): ClickScheduler {
  return {
    click(delaySeconds, accent, volume) {
      const c = audio();
      if (!c) return;
      if (c.state === 'suspended') void c.resume();
      const at = c.currentTime + Math.max(0, delaySeconds);
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = accent ? 1760 : 1175;
      const peak = (accent ? 0.9 : 0.55) * volume;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      osc.connect(gain).connect(c.destination);
      osc.start(at);
      osc.stop(at + 0.06);
    },
    dispose() {},
  };
}
