import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { renderClicks } from '@/lib/audio/click';
import { encodeWav } from '@/lib/audio/pluck';
import { wavUri } from '@/lib/audio/wavUri';

const clickUri = (bpm: number) => wavUri(encodeWav(renderClicks({ bpm, bars: 1 })), `click-${Math.round(bpm * 10)}`);

/**
 * A looping one-bar click track. Beat and bar counters are derived from the player's own
 * position, so the visuals stay locked to what you hear.
 */
export function useClickLoop(bpm: number) {
  const player = useAudioPlayer(null, { updateInterval: 30 });
  const status = useAudioPlayerStatus(player);
  const [running, setRunning] = useState(false);
  const [bars, setBars] = useState(0);
  const lastTime = useRef(0);

  // (Re)load the click bar whenever the tempo changes, keeping it running if it was.
  useEffect(() => {
    let cancelled = false;
    void clickUri(bpm).then((uri) => {
      if (cancelled) return;
      player.replace({ uri });
      player.loop = true;
      if (running) player.play();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm, player]);

  // Count completed bars: the looped position jumps back to ~0 at each bar line.
  useEffect(() => {
    if (running && status.currentTime + 0.2 < lastTime.current) setBars((b) => b + 1);
    lastTime.current = status.currentTime;
  }, [status.currentTime, running]);

  const start = useCallback(() => {
    setBars(0);
    lastTime.current = 0;
    void player.seekTo(0).then(() => player.play());
    setRunning(true);
  }, [player]);

  const stop = useCallback(() => {
    player.pause();
    setRunning(false);
  }, [player]);

  useEffect(() => () => player.pause(), [player]);

  const beat = running ? Math.min(4, Math.floor(status.currentTime / (60 / bpm)) + 1) : 0;
  return { running, start, stop, beat, bars };
}
