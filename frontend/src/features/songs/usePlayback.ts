import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { loopTarget } from './timeline';

export interface LoopRange {
  start: number;
  end: number;
}

/** Song playback with pitch-preserving speed change and A–B looping. */
export function usePlayback(uri: string | null) {
  const player = useAudioPlayer(uri ? { uri } : null, { updateInterval: 50 });
  const status = useAudioPlayerStatus(player);
  const [rate, setRateState] = useState(1);
  const [loop, setLoop] = useState<LoopRange | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  useEffect(() => {
    const target = loopTarget(status.currentTime, loop);
    if (target !== null && status.playing) void player.seekTo(target);
  }, [status.currentTime, status.playing, loop, player]);

  const setRate = useCallback(
    (r: number) => {
      player.shouldCorrectPitch = true; // slow down without lowering the pitch
      player.setPlaybackRate(r, 'high');
      setRateState(r);
    },
    [player],
  );

  const toggle = useCallback(() => {
    if (status.playing) player.pause();
    else {
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.05)) void player.seekTo(loop?.start ?? 0);
      player.play();
    }
  }, [player, status.playing, status.didJustFinish, status.currentTime, status.duration, loop]);

  const seek = useCallback((t: number) => void player.seekTo(Math.max(0, t)), [player]);

  return {
    currentTime: status.currentTime,
    duration: status.duration,
    playing: status.playing,
    loaded: status.isLoaded,
    buffering: status.isBuffering,
    rate,
    loop,
    setRate,
    setLoop,
    toggle,
    seek,
  };
}
