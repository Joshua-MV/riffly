import { useEffect, useMemo, useRef, useState } from 'react';

import { practiceOf, type LocalSong, type PracticeSettings } from '@/features/library/model';
import { usePlayer } from '@/features/player/PlayerProvider';
import { transposeLabel } from '@/lib/music/chords';
import { extendBeats, PATTERNS, stepAt } from '@/lib/music/fingerstyle';
import { capoOptions, recommendCapo } from '@/lib/music/simplify';
import { resolveStrum } from '@/lib/music/strum';

import { needsReanalysis, useReanalyse, useUpdateSong } from './hooks';
import { beatInBar, beginnerTimeline, playContext, practiceTab, practiceTimeline, songBarOffset } from './practice';
import { segmentAt, upcoming } from './timeline';

/**
 * Everything the song's views share: the shared player bound to this song, the chord timeline
 * for the chosen capo/tuning/key, beats and bars, strum pattern, tab, and the actions.
 */
export function useSongPractice(song: LocalSong) {
  const player = usePlayer();
  const update = useUpdateSong(song.id);
  const reanalyse = useReanalyse(song.id);
  const result = song.analysis;
  const practice = practiceOf(song);
  const setPractice = (patch: Partial<PracticeSettings>) => update.mutate({ practice: { ...practice, ...patch } });

  // Songs analysed by the old engine get the improved chords, tempo and strumming automatically.
  const triedReanalyse = useRef(false);
  useEffect(() => {
    if (!triedReanalyse.current && needsReanalysis(song)) {
      triedReanalyse.current = true;
      reanalyse.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  // Open the song in the shared player, unless another song is mid-playback (don't interrupt it).
  const isLoaded = player.song?.id === song.id;
  useEffect(() => {
    if (!player.song || (!player.playing && !player.countingIn)) void player.load(song);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);
  useEffect(() => {
    if (isLoaded) player.refresh(song);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song, isLoaded]);

  const time = isLoaded ? player.currentTime : 0;
  const duration = (isLoaded && player.duration) || result.duration;
  const ctx = useMemo(() => playContext(practice), [practice]);
  const timeline = useMemo(() => practiceTimeline(song, practice), [song, practice]);
  const openOffset = ctx.displayOffset + practice.capo;
  const sounding = useMemo(() => (ctx.standardShapes ? beginnerTimeline(result.chords, song.corrections, openOffset) : []), [result.chords, song.corrections, openOffset, ctx.standardShapes]);
  const capoChoices = useMemo(() => capoOptions(sounding.map((c) => ({ label: c.display, start: c.start, end: c.end }))), [sounding]);
  const recommended = useMemo(() => (sounding.length ? recommendCapo(sounding.map((c) => ({ label: c.display, start: c.start, end: c.end }))) : null), [sounding]);
  // Beginner version by default: a song that hasn't been set up yet starts on the capo that
  // gives the easiest open shapes.
  const autoCapo = useRef(false);
  useEffect(() => {
    if (autoCapo.current || song.practice || !recommended) return;
    autoCapo.current = true;
    setPractice({ capo: recommended.capo });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id, recommended]);
  const beats = useMemo(() => extendBeats(result.beats), [result.beats]);
  const barOffset = useMemo(() => songBarOffset(result, beats), [result, beats]);
  const tabBars = useMemo(() => practiceTab(timeline, result.beats, practice.pattern, ctx.shapeMidi, barOffset), [timeline, result.beats, practice.pattern, ctx.shapeMidi, barOffset]);

  const index = segmentAt(timeline, time);
  const current = index >= 0 ? timeline[index] : null;
  const next = upcoming(timeline, index, 4);
  const tabPos = isLoaded ? stepAt(tabBars, time) : null;
  // The beat lamp reads the same clock as the strum highlight and the metronome.
  const [clockBeat, setClockBeat] = useState<number | null>(null);
  useEffect(
    () =>
      player.clock.subscribe((t) => {
        const b = player.clock.playing() ? beatInBar(beats, t, barOffset) : null;
        setClockBeat((prev) => (prev === b ? prev : b));
      }),
    [player.clock, beats, barOffset],
  );
  const beat = isLoaded && player.playing ? clockBeat : null;
  const countIn = isLoaded && player.countingIn ? player.countingIn.beat : null;
  const [tonic, mode] = result.key ? result.key.split(' ') : [null, null];
  const soundingKey = tonic ? `${transposeLabel(tonic, practice.keyShift)} ${mode === 'minor' ? 'min' : 'maj'}` : 'Unknown';
  const shapeKey = tonic ? `${transposeLabel(tonic, ctx.displayOffset)}${mode === 'minor' ? 'm' : ''}` : null;
  const pattern = PATTERNS.find((p) => p.id === practice.pattern) ?? PATTERNS[0];
  const strumPattern = resolveStrum(practice.strum, result.strum);

  /** Bar number (1-based) at a time, and the song's bar count. */
  const barAt = (t: number) => {
    let i = 0;
    while (i + 1 < beats.length && beats[i + 1] <= t) i++;
    return Math.max(1, Math.floor((i - barOffset) / 4) + 1);
  };
  const totalBars = barAt(duration);

  const toggle = async () => {
    if (!isLoaded) await player.load(song);
    player.toggle({ countInBpm: practice.countIn && result.bpm ? result.bpm : undefined });
  };
  const seek = async (t: number) => {
    if (!isLoaded) await player.load(song);
    player.seek(t);
  };
  const playFrom = async (t: number) => {
    await seek(t);
    if (!player.playing) player.play();
  };
  /** Loop the current chord and the three after it. */
  const loopPhrase = () => {
    if (!current) return;
    const end = timeline[Math.min(timeline.length - 1, index + 3)].end;
    player.setLoop({ start: current.start, end });
  };

  return {
    song, result, practice, setPractice, update, reanalyse, player, isLoaded,
    time, duration, ctx, timeline, capoChoices, recommended, tabBars, beats, barOffset,
    index, current, next, tabPos, beat, countIn, soundingKey, shapeKey, pattern, strumPattern,
    barAt, totalBars, toggle, seek, playFrom, loopPhrase,
  };
}

export type SongPractice = ReturnType<typeof useSongPractice>;
