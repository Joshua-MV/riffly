import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { TabView } from '@/components/music/TabView';
import { Waveform } from '@/components/music/Waveform';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, Chip, EmptyState, Notice, Screen, SegmentedControl } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import { practiceOf, type LocalSong, type PracticeSettings } from '@/features/library/model';
import { usePlayer } from '@/features/player/PlayerProvider';
import { CapoCard } from '@/features/songs/components/CapoCard';
import { ChordList, CorrectionEditor } from '@/features/songs/components/ChordList';
import { LearnPanel } from '@/features/songs/components/LearnPanel';
import { LyricsPanel } from '@/features/songs/components/LyricsPanel';
import { PlayerStage } from '@/features/songs/components/PlayerStage';
import { TranscribePanel } from '@/features/songs/components/TranscribePanel';
import { useExportMp3, useSong, useUpdateSong } from '@/features/songs/hooks';
import { beatInBar, practiceTab, practiceTimeline } from '@/features/songs/practice';
import { buildTimeline, formatBytes, formatTime, segmentAt, upcoming, type TimelineChord } from '@/features/songs/timeline';
import { transposeLabel } from '@/lib/music/chords';
import { chooseBarOffset, extendBeats, PATTERNS, stepAt } from '@/lib/music/fingerstyle';
import { capoOptions, recommendCapo } from '@/lib/music/simplify';
import { useLayout } from '@/theme/useLayout';
import { spacing } from '@/theme/tokens';

const SPEEDS = [0.5, 0.75, 0.9, 1] as const;
type Panel = 'chords' | 'lyrics' | 'tab' | 'learn' | 'transcribe';

export default function SongScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const song = useSong(id);

  if (song.isLoading) {
    return (
      <Screen>
        <ActivityIndicator style={{ marginTop: spacing.xxxl }} />
      </Screen>
    );
  }
  if (song.error || !song.data) {
    return (
      <Screen>
        <BackBar />
        <EmptyState
          icon="musical-notes-outline"
          title="Song not found"
          body={song.error instanceof Error ? song.error.message : 'It may have been deleted from this device.'}
          action={<Button label="Back to My Music" onPress={() => router.replace('/library')} />}
        />
      </Screen>
    );
  }
  return <Practice song={song.data} />;
}

function BackBar({ children }: { children?: React.ReactNode }) {
  return (
    <View style={styles.backBar}>
      <IconButton icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/library'))} />
      <View style={{ flex: 1 }} />
      {children}
    </View>
  );
}

function Practice({ song }: { song: LocalSong }) {
  const { isDesktop } = useLayout();
  const player = usePlayer();
  const update = useUpdateSong(song.id);
  const exportMp3 = useExportMp3();
  const [focus, setFocus] = useState(false);
  const [panel, setPanel] = useState<Panel>('chords');
  const [editing, setEditing] = useState<TimelineChord | null>(null);

  const result = song.analysis;
  const practice = practiceOf(song);
  const setPractice = (patch: Partial<PracticeSettings>) => update.mutate({ practice: { ...practice, ...patch } });

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
  const timeline = useMemo(() => practiceTimeline(song, practice), [song, practice]);
  const sounding = useMemo(() => buildTimeline(result.chords, song.corrections, practice.keyShift), [result.chords, song.corrections, practice.keyShift]);
  const options = useMemo(() => capoOptions(sounding.map((c) => ({ label: c.display, start: c.start, end: c.end }))), [sounding]);
  const recommended = useMemo(() => recommendCapo(sounding.map((c) => ({ label: c.display, start: c.start, end: c.end }))), [sounding]);
  const tabBars = useMemo(() => practiceTab(timeline, result.beats, practice.pattern), [timeline, result.beats, practice.pattern]);
  const beats = useMemo(() => extendBeats(result.beats), [result.beats]);
  const barOffset = useMemo(() => chooseBarOffset(beats, timeline.filter((c) => c.label !== 'N').map((c) => c.start)), [beats, timeline]);

  const index = segmentAt(timeline, time);
  const current = index >= 0 ? timeline[index] : null;
  const next = upcoming(timeline, index, 4);
  const changes = useMemo(() => timeline.filter((c) => c.label !== 'N').map((c) => c.start), [timeline]);
  const tabPos = isLoaded ? stepAt(tabBars, time) : null;
  const beat = isLoaded && player.playing ? beatInBar(beats, time, barOffset) : null;
  const countIn = isLoaded && player.countingIn ? player.countingIn.beat : null;
  const soundingKey = result.key ? `${transposeLabel(result.key.split(' ')[0], practice.keyShift)} ${result.key.split(' ')[1]}` : 'Unknown';
  const shapeKey = result.key && practice.capo ? `${transposeLabel(result.key.split(' ')[0], practice.keyShift - practice.capo)} ${result.key.split(' ')[1]} shapes` : null;
  const pattern = PATTERNS.find((p) => p.id === practice.pattern) ?? PATTERNS[0];

  const toggle = async () => {
    if (!isLoaded) await player.load(song);
    player.toggle({ countInBpm: practice.countIn && result.bpm ? result.bpm : undefined });
  };
  const seek = async (t: number) => {
    if (!isLoaded) await player.load(song);
    player.seek(t);
  };
  const loopPhrase = () => {
    if (!current) return;
    const end = timeline[Math.min(timeline.length - 1, index + 3)].end;
    player.setLoop({ start: current.start, end });
  };

  const confTone = (c: number | null) => (c === null ? undefined : c > 0.6 ? ('success' as const) : c > 0.3 ? ('highlight' as const) : ('danger' as const));
  const info = [
    { label: 'Key', value: shapeKey ? `${soundingKey} · ${shapeKey}` : soundingKey, tone: confTone(result.key_confidence) },
    { label: 'Tempo', value: result.bpm ? `${Math.round(result.bpm * player.rate)} BPM${player.rate !== 1 ? ` at ${player.rate}×` : ''}` : '—', tone: confTone(result.bpm_confidence) },
    { label: 'Capo', value: practice.capo ? `fret ${practice.capo}` : 'none' },
    { label: 'Length', value: formatTime(result.duration) },
  ];

  const stage = (
    <PlayerStage
      timeline={timeline}
      beats={beats}
      time={time}
      duration={duration}
      playing={isLoaded && player.playing}
      rate={player.rate}
      loop={isLoaded ? player.loop : null}
      countIn={countIn}
      countInEnabled={practice.countIn}
      beat={beat}
      capo={practice.capo}
      info={info}
      large={focus}
      notice={!isLoaded && player.song ? `Now playing “${player.song.title}”. Press play to switch to this song.` : null}
      error={isLoaded ? player.error : null}
      onToggle={() => void toggle()}
      onSeek={(t) => void seek(t)}
      onRate={player.setRate}
      onLoopToggle={() => (isLoaded && player.loop ? player.setLoop(null) : loopPhrase())}
      onCountInToggle={() => setPractice({ countIn: !practice.countIn })}
    />
  );

  const lyricsPanel = (
    <LyricsPanel
      song={song}
      timeline={timeline}
      time={time}
      playing={isLoaded && player.playing}
      onSeek={(t) => void seek(t)}
      onPlayFrom={(t) => void (async () => {
        await seek(t);
        if (!player.playing) player.play();
      })()}
      large={focus}
    />
  );

  const tabPanel = (
    <View style={{ gap: spacing.md }}>
      <View style={styles.patterns}>
        {PATTERNS.map((p) => (
          <Chip key={p.id} label={`${p.name} · ${p.level}`} selected={p.id === pattern.id} onPress={() => setPractice({ pattern: p.id })} />
        ))}
      </View>
      <Text variant="caption" tone="muted">
        {pattern.description} Generated from the song's chords and beat{practice.capo ? `, with the capo on fret ${practice.capo} (frets are counted from the capo)` : ''}. It's an arrangement in the style of the song, not a note-for-note copy.
      </Text>
      <TabView bars={tabBars} current={tabPos} onSeek={(t) => void seek(t)} large={focus} />
    </View>
  );

  if (focus) {
    return (
      <Screen maxWidth={1200}>
        <BackBar>
          <SegmentedControl<'chords' | 'lyrics' | 'tab'>
            label="Play-along view"
            value={panel === 'tab' || panel === 'lyrics' ? panel : 'chords'}
            onChange={(v) => setPanel(v)}
            options={[{ value: 'chords', label: 'Chords' }, { value: 'lyrics', label: 'Lyrics' }, { value: 'tab', label: 'Tab' }]}
          />
          <Button label="Exit" variant="secondary" icon="contract" onPress={() => setFocus(false)} />
        </BackBar>
        {stage}
        {panel === 'lyrics' && lyricsPanel}
        {panel === 'tab' && tabPanel}
      </Screen>
    );
  }

  return (
    <Screen maxWidth={1200}>
      <BackBar>
        <IconButton
          icon={song.isFavourite ? 'heart' : 'heart-outline'}
          label={song.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
          active={song.isFavourite}
          onPress={() => update.mutate({ isFavourite: !song.isFavourite })}
        />
        <Button label={Platform.OS === 'web' ? 'Download MP3' : 'Save MP3'} icon="download-outline" variant="secondary" loading={exportMp3.isPending} onPress={() => exportMp3.mutate(song)} />
        <Button label="Play along" icon="expand" onPress={() => setFocus(true)} />
      </BackBar>

      <View>
        <Text variant="overline" tone="subtle">{song.artist ?? `MP3 · ${formatBytes(song.audioBytes)} · saved on this device`}</Text>
        <Text variant="title">{song.title}</Text>
      </View>
      {exportMp3.isError && <Notice tone="error">{(exportMp3.error as Error).message}</Notice>}

      {/* Wide windows: player on the left, chords/lyrics/tab beside it so both stay in view. */}
      <View style={[styles.split, { flexDirection: isDesktop ? 'row' : 'column' }]}>
      <View style={{ flex: isDesktop ? 11 : undefined }}>{stage}</View>
      <View style={{ flex: isDesktop ? 10 : undefined, gap: spacing.lg, minWidth: 0 }}>
      <SegmentedControl<Panel>
        label="Practice view"
        value={panel}
        onChange={setPanel}
        options={[
          { value: 'chords', label: 'Chords' },
          { value: 'lyrics', label: 'Lyrics' },
          { value: 'tab', label: 'Tab' },
          { value: 'learn', label: 'Learn' },
          { value: 'transcribe', label: 'Transcribe β' },
        ]}
      />

      {panel === 'chords' && (
        <View style={{ gap: spacing.lg }}>
          {result.progression.length > 0 && (
            <Card style={{ gap: spacing.sm }}>
              <Text variant="overline" tone="subtle">Main progression{practice.capo ? ` · capo ${practice.capo} shapes` : ''}</Text>
              <Text variant="heading">{result.progression.map((c) => transposeLabel(c, practice.keyShift - practice.capo)).join('  →  ')}</Text>
            </Card>
          )}
          {editing && <CorrectionEditor songId={song.id} chord={editing} displayOffset={practice.keyShift - practice.capo} onClose={() => setEditing(null)} />}
          <ChordList timeline={timeline} activeIndex={index} onSeek={(t) => void seek(t)} onEdit={setEditing} />
        </View>
      )}
      {panel === 'lyrics' && lyricsPanel}
      {panel === 'tab' && tabPanel}
      {panel === 'learn' && <LearnPanel timeline={timeline} songBpm={result.bpm} />}
      {panel === 'transcribe' && <TranscribePanel song={song} capo={practice.capo} grid={tabBars} current={tabPos} onSeek={(t) => void seek(t)} />}
      </View>
      </View>

      <CapoCard
        capo={practice.capo}
        keyShift={practice.keyShift}
        options={options}
        recommended={recommended}
        onCapo={(capo) => setPractice({ capo })}
        onKeyShift={(keyShift) => setPractice({ keyShift })}
      />

      <Notice>{`${result.notes.join(' ')} Engine ${result.model_version}.`}</Notice>
    </Screen>
  );
}

function Stat({ label, value, sub, confidence }: { label: string; value: string; sub?: string; confidence?: number | null }) {
  return (
    <Card style={styles.stat}>
      <Text variant="overline" tone="subtle">{label}</Text>
      <Text variant="heading">{value}</Text>
      {sub && <Text variant="caption" tone="accent">{sub}</Text>}
      {confidence !== undefined && confidence !== null && (
        <Text variant="caption" tone={confidence > 0.6 ? 'success' : confidence > 0.3 ? 'highlight' : 'danger'}>
          {confidence > 0.6 ? 'High' : confidence > 0.3 ? 'Medium' : 'Low'} confidence
        </Text>
      )}
    </Card>
  );
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="overline" tone="subtle">{label}</Text>
      <View style={styles.controlRow}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  backBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: { flexGrow: 1, flexBasis: 140, gap: 2 },
  split: { gap: spacing.lg, alignItems: 'stretch' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -spacing.sm },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  controlsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  controlRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  patterns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
