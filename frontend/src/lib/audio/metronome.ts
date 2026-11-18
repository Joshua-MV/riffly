/**
 * Metronome clicks over a playing song (Android / iOS). Two short pre-rendered clicks
 * (accented and normal) are triggered with a timer; the scheduler asks a little ahead so
 * timer jitter stays small.
 */

import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import { renderClicks } from './click';
import type { ClickScheduler } from './metronome.types';
import { encodeWav } from './pluck';
import { wavUri } from './wavUri';

export function createClickScheduler(): ClickScheduler {
  const players: { accent: AudioPlayer | null; normal: AudioPlayer | null } = { accent: null, normal: null };
  const timers = new Set<ReturnType<typeof setTimeout>>();
  // One bar at 60 BPM: beat 1 is the accented click, beat 2 a normal one. Each player plays
  // just the first 50 ms of its own render.
  void wavUri(encodeWav(renderClicks({ bpm: 60, bars: 1 }).slice(0, 2205)), 'metro-accent').then((uri) => (players.accent = createAudioPlayer({ uri })));
  void wavUri(encodeWav(renderClicks({ bpm: 60, bars: 1, accent: false }).slice(0, 2205)), 'metro-normal').then(
    (uri) => (players.normal = createAudioPlayer({ uri })),
  );
  return {
    click(delaySeconds, accent, volume) {
      const id = setTimeout(() => {
        timers.delete(id);
        const p = accent ? players.accent : players.normal;
        if (!p) return;
        p.volume = volume;
        void p.seekTo(0).then(() => p.play());
      }, Math.max(0, delaySeconds * 1000));
      timers.add(id);
    },
    dispose() {
      timers.forEach(clearTimeout);
      timers.clear();
      players.accent?.remove();
      players.normal?.remove();
    },
  };
}
