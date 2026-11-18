/**
 * One app-wide audio player. The song keeps playing while the user moves between the song
 * page, its chords, its tab, the chord library and the tuner. The mini player shows what's playing.
 * Speed changes keep the pitch (pitch correction), and loops are handled here.
 */

import { createAudioPlayer, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioPlayer } from 'expo-audio';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import type { LocalSong } from '@/features/library/model';
import { storage } from '@/features/library/storage';
import { loopTarget } from '@/features/songs/timeline';
import { songBarOffset } from '@/features/songs/practice';
import { extendBeats } from '@/lib/music/fingerstyle';
import { barDuration, renderClicks } from '@/lib/audio/click';
import { createClickScheduler } from '@/lib/audio/metronome';
import type { ClickScheduler } from '@/lib/audio/metronome.types';
import { encodeWav } from '@/lib/audio/pluck';
import { wavUri } from '@/lib/audio/wavUri';

import { getSettings, useSettings } from '@/features/settings/store';

import { createClock, type PlaybackClock } from './clock';

export interface LoopRange {
  start: number;
  end: number;
}

interface PlayerValue {
  song: LocalSong | null;
  currentTime: number;
  duration: number;
  playing: boolean;
  loaded: boolean;
  rate: number;
  loop: LoopRange | null;
  /** Current count-in beat (1–4), or null when not counting in. */
  countingIn: { beat: number; beats: number } | null;
  error: string | null;
  /** Smooth position for animation (60 fps between the player's own reports). */
  clock: PlaybackClock;
  /** Metronome clicks on the song's beats while it plays. */
  metronome: boolean;
  setMetronome: (on: boolean) => void;
  /** Load `song` if it isn't already loaded. Does not start playback. */
  load: (song: LocalSong) => Promise<void>;
  /** Keep the loaded song's metadata (corrections, capo…) fresh for the mini player. */
  refresh: (song: LocalSong) => void;
  play: (opts?: { countInBpm?: number }) => void;
  pause: () => void;
  toggle: (opts?: { countInBpm?: number }) => void;
  seek: (t: number) => void;
  setRate: (r: number) => void;
  setLoop: (l: LoopRange | null) => void;
  stop: () => void;
}

const PlayerContext = createContext<PlayerValue | null>(null);

const clickUri = (bpm: number) => wavUri(encodeWav(renderClicks({ bpm, bars: 1 })), `click-${Math.round(bpm * 10)}`);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const player = useAudioPlayer(null, { updateInterval: 50 });
  const status = useAudioPlayerStatus(player);
  const [song, setSong] = useState<LocalSong | null>(null);
  const [rate, setRateState] = useState(() => getSettings().defaultSpeed);
  const [loop, setLoop] = useState<LoopRange | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countingIn, setCountingIn] = useState<{ beat: number; beats: number } | null>(null);
  const countInTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clickPlayer = useRef<AudioPlayer | null>(null);
  const loadedId = useRef<string | null>(null);
  const clock = useMemo(() => createClock(), []);
  const [metronome, setMetronome] = useState(false);
  const clicker = useRef<ClickScheduler | null>(null);

  // The player's exact position, read live (on Windows it is only *reported* ~4 times a second).
  useEffect(() => {
    clock.setSource(() => player.currentTime);
    return () => clock.setSource(null);
  }, [clock, player]);

  // One delay for the beat lamp, strum highlight and metronome: they all read this clock, so
  // they can never drift apart from each other.
  const { syncDelayMs } = useSettings();
  useEffect(() => clock.setDelay(syncDelayMs / 1000), [clock, syncDelayMs]);

  // Feed every position report to the smooth clock.
  useEffect(() => {
    clock.report(status.currentTime, status.playing, rate);
  }, [clock, status.currentTime, status.playing, rate]);

  // Metronome: every 25 ms, schedule the clicks of beats due in the next ~150 ms. Beat 1 of
  // each bar (from the chord changes) is accented.
  const grid = useMemo(() => {
    if (!song) return { beats: [] as number[], offset: 0 };
    const beats = extendBeats(song.analysis.beats);
    return { beats, offset: songBarOffset(song.analysis, beats) };
  }, [song]);
  useEffect(() => {
    if (!metronome || !status.playing || !grid.beats.length) return;
    if (!clicker.current) clicker.current = createClickScheduler();
    let next = grid.beats.findIndex((b) => b >= clock.now() - 0.01);
    if (next < 0) return;
    const tick = () => {
      const t = clock.now();
      // After a seek, jump the pointer to the new position.
      if (next > 0 && grid.beats[next - 1] > t + 0.2) next = grid.beats.findIndex((b) => b >= t - 0.01);
      while (next >= 0 && next < grid.beats.length && grid.beats[next] < t - 0.05) next++;
      while (next >= 0 && next < grid.beats.length && grid.beats[next] <= t + 0.15 * rate) {
        const accent = getSettings().accentFirstBeat && (((next - grid.offset) % 4) + 4) % 4 === 0;
        clicker.current?.click((grid.beats[next] - t) / rate, accent, 0.9);
        next++;
      }
    };
    tick();
    const id = setInterval(tick, 25);
    return () => clearInterval(id);
  }, [metronome, status.playing, grid, clock, rate]);
  useEffect(() => () => clicker.current?.dispose(), []);

  useEffect(() => {
    if (Platform.OS !== 'web') void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true });
  }, []);

  // A–B loop.
  useEffect(() => {
    const target = loopTarget(status.currentTime, loop);
    if (target !== null && status.playing) void player.seekTo(target);
  }, [status.currentTime, status.playing, loop, player]);

  const cancelCountIn = useCallback(() => {
    countInTimers.current.forEach(clearTimeout);
    countInTimers.current = [];
    clickPlayer.current?.pause();
    setCountingIn(null);
  }, []);

  const load = useCallback(
    async (next: LocalSong) => {
      setSong(next);
      if (loadedId.current === next.id) return;
      cancelCountIn();
      setError(null);
      try {
        const uri = await storage.audioUri(next.id);
        player.replace({ uri });
        loadedId.current = next.id;
        setLoop(null);
        player.shouldCorrectPitch = true;
        player.setPlaybackRate(rate, 'high');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load audio.');
      }
    },
    [player, rate, cancelCountIn],
  );

  const refresh = useCallback((next: LocalSong) => {
    setSong((cur) => (cur && cur.id === next.id ? next : cur));
  }, []);

  const startPlayback = useCallback(() => {
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.05)) {
      void player.seekTo(loop?.start ?? 0);
    }
    player.play();
  }, [player, status.didJustFinish, status.currentTime, status.duration, loop]);

  const play = useCallback(
    (opts?: { countInBpm?: number }) => {
      if (!opts?.countInBpm) {
        startPlayback();
        return;
      }
      // Count-in: one bar of clicks at the song's tempo (scaled by practice speed), then play.
      cancelCountIn();
      const bpm = opts.countInBpm * rate;
      const beat = 60 / bpm;
      setCountingIn({ beat: 1, beats: 4 });
      void clickUri(bpm).then((uri) => {
        if (!clickPlayer.current) clickPlayer.current = createAudioPlayer({ uri });
        else clickPlayer.current.replace({ uri });
        void clickPlayer.current.seekTo(0).then(() => clickPlayer.current?.play());
        for (let i = 1; i < 4; i++) countInTimers.current.push(setTimeout(() => setCountingIn({ beat: i + 1, beats: 4 }), i * beat * 1000));
        countInTimers.current.push(
          setTimeout(() => {
            setCountingIn(null);
            clickPlayer.current?.pause();
            startPlayback();
          }, barDuration(bpm) * 1000),
        );
      });
    },
    [rate, startPlayback, cancelCountIn],
  );

  const pause = useCallback(() => {
    cancelCountIn();
    player.pause();
  }, [player, cancelCountIn]);

  const value = useMemo<PlayerValue>(
    () => ({
      song,
      currentTime: status.currentTime,
      duration: status.duration,
      playing: status.playing,
      loaded: status.isLoaded && loadedId.current !== null,
      rate,
      loop,
      countingIn,
      error,
      clock,
      metronome,
      setMetronome,
      load,
      refresh,
      play,
      pause,
      toggle: (opts) => (status.playing || countingIn ? pause() : play(opts)),
      seek: (t) => {
        clock.jump(Math.max(0, t));
        void player.seekTo(Math.max(0, t));
      },
      setRate: (r) => {
        player.shouldCorrectPitch = true; // slower without lowering the pitch
        player.setPlaybackRate(r, 'high');
        setRateState(r);
      },
      setLoop,
      stop: () => {
        pause();
        player.replace(null);
        loadedId.current = null;
        setSong(null);
        setLoop(null);
      },
    }),
    [song, status.currentTime, status.duration, status.playing, status.isLoaded, rate, loop, countingIn, error, clock, metronome, load, refresh, play, pause, player],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider');
  return ctx;
}
