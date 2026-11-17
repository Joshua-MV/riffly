import type { PressState } from '@/components/ui/pressState';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ChordDiagram } from '@/components/music/ChordDiagram';
import { Waveform } from '@/components/music/Waveform';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, Chip, EmptyState, Notice, Screen } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import type { LocalSong } from '@/features/library/model';
import { useAudioUri, useCorrectChord, useExportMp3, useRevertCorrection, useSong, useUpdateSong } from '@/features/songs/hooks';
import { buildTimeline, formatBytes, formatTime, segmentAt, upcoming, type TimelineChord } from '@/features/songs/timeline';
import { usePlayback } from '@/features/songs/usePlayback';
import { parseChord, transposeLabel } from '@/lib/music/chords';
import { getVoicings } from '@/lib/music/voicings';
import { useTheme } from '@/theme/ThemeProvider';
import { useLayout } from '@/theme/useLayout';
import { radius, spacing, typeScale } from '@/theme/tokens';

const SPEEDS = [0.5, 0.75, 0.9, 1] as const;

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
          action={<Button label="Try again" onPress={() => song.refetch()} />}
        />
      </Screen>
    );
  }
  return <Results song={song.data} />;
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

function Results({ song }: { song: LocalSong }) {
  const { isPhone, isDesktop } = useLayout();
  const result = song.analysis;
  const audio = useAudioUri(song.id);
  const playback = usePlayback(audio.data ?? null);
  const exportMp3 = useExportMp3();
  const [transpose, setTranspose] = useState(0);
  const [focus, setFocus] = useState(false);
  const [editing, setEditing] = useState<TimelineChord | null>(null);
  const update = useUpdateSong(song.id);

  const timeline = useMemo(() => buildTimeline(result.chords, song.corrections, transpose), [result.chords, song.corrections, transpose]);
  const index = segmentAt(timeline, playback.currentTime);
  const current = index >= 0 ? timeline[index] : null;
  const next = upcoming(timeline, index, 4);
  const duration = playback.duration || result.duration;
  const changes = useMemo(() => timeline.filter((c) => c.label !== 'N').map((c) => c.start), [timeline]);
  const progression = result.progression.map((c) => transposeLabel(c, transpose));
  const keyLabel = result.key ? transposeKey(result.key, transpose) : 'Unknown';

  const setLoopFromCurrent = () => {
    if (!current) return;
    // Loop the current chord plus the next three changes: one phrase.
    const endSeg = timeline[Math.min(timeline.length - 1, index + 3)];
    playback.setLoop({ start: current.start, end: endSeg.end });
  };

  const nowPlaying = (
    <NowPlaying current={current} next={next} large={focus} />
  );

  const transport = (
    <Card style={{ gap: spacing.md }}>
      <Waveform peaks={result.waveform} duration={duration} currentTime={playback.currentTime} loop={playback.loop} markers={changes} onSeek={playback.seek} height={focus ? 96 : 72} />
      <View style={styles.timeRow}>
        <Text variant="caption" tone="muted">{formatTime(playback.currentTime)}</Text>
        <Text variant="caption" tone="muted">{formatTime(duration)}</Text>
      </View>
      <View style={styles.transport}>
        <IconButton icon="play-back" label="Back 5 seconds" size={focus ? 60 : 48} onPress={() => playback.seek(playback.currentTime - 5)} />
        <IconButton icon={playback.playing ? 'pause' : 'play'} label={playback.playing ? 'Pause' : 'Play'} tone="accent" size={focus ? 84 : 64} disabled={!playback.loaded} onPress={playback.toggle} />
        <IconButton icon="play-forward" label="Forward 5 seconds" size={focus ? 60 : 48} onPress={() => playback.seek(playback.currentTime + 5)} />
      </View>
      <View style={styles.controlsWrap}>
        <ControlGroup label="Speed">
          {SPEEDS.map((s) => (
            <Chip key={s} label={`${s}×`} selected={playback.rate === s} onPress={() => playback.setRate(s)} />
          ))}
        </ControlGroup>
        <ControlGroup label={`Transpose ${transpose > 0 ? '+' : ''}${transpose}`}>
          <IconButton icon="remove" label="Transpose down a semitone" size={32} onPress={() => setTranspose((t) => Math.max(-11, t - 1))} />
          <IconButton icon="add" label="Transpose up a semitone" size={32} onPress={() => setTranspose((t) => Math.min(11, t + 1))} />
          {transpose !== 0 && <Chip label="Reset" onPress={() => setTranspose(0)} />}
        </ControlGroup>
        <ControlGroup label="Loop">
          {playback.loop ? (
            <Chip icon="close" label={`${formatTime(playback.loop.start)}–${formatTime(playback.loop.end)}`} selected onPress={() => playback.setLoop(null)} />
          ) : (
            <Chip icon="repeat" label="Loop this phrase" onPress={setLoopFromCurrent} />
          )}
        </ControlGroup>
      </View>
    </Card>
  );

  if (focus) {
    return (
      <Screen maxWidth={1120}>
        <BackBar>
          <Button label="Exit play-along" variant="secondary" icon="contract" onPress={() => setFocus(false)} />
        </BackBar>
        {nowPlaying}
        {transport}
      </Screen>
    );
  }

  return (
    <Screen maxWidth={1120}>
      <BackBar>
        <IconButton
          icon={song.isFavourite ? 'heart' : 'heart-outline'}
          label={song.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
          active={song.isFavourite}
          onPress={() => update.mutate({ isFavourite: !song.isFavourite })}
        />
        <Button
          label={Platform.OS === 'web' ? 'Download MP3' : 'Save MP3'}
          icon="download-outline"
          variant="secondary"
          loading={exportMp3.isPending}
          disabled={!audio.data}
          onPress={() => exportMp3.mutate(song)}
        />
        <Button label="Play along" icon="expand" onPress={() => setFocus(true)} />
      </BackBar>

      <View>
        <Text variant="overline" tone="subtle">{song.artist ?? `MP3 · ${formatBytes(song.audioBytes)} · saved on this device`}</Text>
        <Text variant="title">{song.title}</Text>
      </View>

      {audio.isError && <Notice tone="error">{(audio.error as Error).message} The chords are still available below.</Notice>}
      {exportMp3.isError && <Notice tone="error">{(exportMp3.error as Error).message}</Notice>}

      <View style={styles.stats}>
        <Stat label="Key" value={keyLabel} confidence={result.key_confidence} />
        <Stat label="Tempo" value={result.bpm ? `${Math.round(result.bpm)} BPM` : '—'} confidence={result.bpm_confidence} />
        <Stat label="Length" value={formatTime(result.duration)} />
        <Stat label="Chord changes" value={String(changes.length)} />
      </View>

      <View style={[styles.split, { flexDirection: isDesktop ? 'row' : 'column' }]}>
        <View style={{ flex: 3, gap: spacing.lg }}>
          {nowPlaying}
          {transport}
        </View>
        <View style={{ flex: 2, gap: spacing.lg }}>
          {progression.length > 0 && (
            <Card style={{ gap: spacing.sm }}>
              <Text variant="overline" tone="subtle">Main progression</Text>
              <Text variant="heading">{progression.join('  →  ')}</Text>
            </Card>
          )}
          <ChordList timeline={timeline} activeIndex={index} onSeek={playback.seek} onEdit={setEditing} compact={isPhone} />
        </View>
      </View>

      {editing && <CorrectionEditor songId={song.id} chord={editing} transpose={transpose} onClose={() => setEditing(null)} />}

      <Notice>
        {`${result.notes.join(' ')} Engine ${result.model_version}; analysed in ${result.processing_seconds}s.`}
      </Notice>
    </Screen>
  );
}

function transposeKey(key: string, semitones: number): string {
  const [tonic, mode] = key.split(' ');
  return `${transposeLabel(tonic, semitones)} ${mode}`;
}

function Stat({ label, value, confidence }: { label: string; value: string; confidence?: number | null }) {
  return (
    <Card style={styles.stat}>
      <Text variant="overline" tone="subtle">{label}</Text>
      <Text variant="heading">{value}</Text>
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

function NowPlaying({ current, next, large }: { current: TimelineChord | null; next: TimelineChord[]; large: boolean }) {
  const { colors } = useTheme();
  const { isPhone } = useLayout();
  const label = current && current.label !== 'N' ? current.display : null;
  const sym = label ? parseChord(label) : null;
  const voicing = sym ? getVoicings(sym)[0] : undefined;
  const diagramSize = large ? (isPhone ? 180 : 240) : 132;
  return (
    <Card style={[styles.now, large && { paddingVertical: spacing.xxl }]}>
      <View style={{ flex: 1, gap: spacing.sm }}>
        <Text variant="overline" tone="subtle">Now</Text>
        <Text
          aria-live="polite"
          style={[typeScale.hero, { fontSize: large ? 120 : 72, lineHeight: large ? 124 : 76, color: label ? colors.highlight : colors.textSubtle }]}
        >
          {label ?? '—'}
        </Text>
        {current?.corrected && <Text variant="caption" tone="accent">Your correction</Text>}
        <Text variant="overline" tone="subtle" style={{ marginTop: spacing.md }}>Next</Text>
        <View style={styles.nextRow}>
          {next.length === 0 ? (
            <Text tone="subtle">—</Text>
          ) : (
            next.map((c, i) => (
              <Text key={c.start} variant={large ? 'title' : 'heading'} style={{ color: i === 0 ? colors.text : colors.textSubtle }}>
                {c.display}
              </Text>
            ))
          )}
        </View>
      </View>
      {voicing && <ChordDiagram voicing={voicing} width={diagramSize} tone="highlight" />}
    </Card>
  );
}

function ChordList({ timeline, activeIndex, onSeek, onEdit, compact }: { timeline: TimelineChord[]; activeIndex: number; onSeek: (t: number) => void; onEdit: (c: TimelineChord) => void; compact: boolean }) {
  const { colors } = useTheme();
  const rows = timeline.filter((c) => c.label !== 'N');
  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <View style={[styles.listHead, { borderBottomColor: colors.border }]}>
        <Text variant="overline" tone="subtle">Timeline</Text>
        <Text variant="caption" tone="subtle">Tap to jump · ✎ to correct</Text>
      </View>
      <ScrollView style={{ maxHeight: compact ? undefined : 520 }} nestedScrollEnabled>
        {rows.map((c) => {
          const active = timeline.indexOf(c) === activeIndex;
          return (
            <Pressable
              key={c.start}
              onPress={() => onSeek(c.start)}
              accessibilityLabel={`${c.display} at ${formatTime(c.start)}, confidence ${Math.round(c.confidence * 100)} percent`}
              style={({ hovered }: PressState) => [
                styles.listRow,
                { borderBottomColor: colors.border },
                active && { backgroundColor: colors.highlightSoft },
                hovered && !active && { backgroundColor: colors.surfaceHover },
              ]}
            >
              <Text variant="mono" tone="subtle" style={{ width: 48 }}>{formatTime(c.start)}</Text>
              <Text variant="subheading" style={{ flex: 1, color: active ? colors.highlight : colors.text }}>
                {c.display}
                {c.corrected ? '  ✓' : ''}
              </Text>
              <ConfidenceBar value={c.confidence} />
              <IconButton icon="create-outline" label={`Correct ${c.display}`} size={32} onPress={() => onEdit(c)} />
            </Pressable>
          );
        })}
      </ScrollView>
    </Card>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const { colors } = useTheme();
  const color = value > 0.6 ? colors.success : value > 0.35 ? colors.highlight : colors.danger;
  return (
    <View style={[styles.conf, { backgroundColor: colors.surfaceSunken }]} accessibilityLabel={`Confidence ${Math.round(value * 100)}%`}>
      <View style={{ width: `${Math.round(value * 100)}%`, height: '100%', backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}

function CorrectionEditor({ songId, chord, transpose, onClose }: { songId: string; chord: TimelineChord; transpose: number; onClose: () => void }) {
  const { colors } = useTheme();
  const [value, setValue] = useState(chord.display);
  const correct = useCorrectChord(songId);
  const revert = useRevertCorrection(songId);
  const parsed = parseChord(value);
  const save = () => {
    if (!parsed) return;
    // Corrections are stored in the original key, so they survive transposition.
    correct.mutate(
      { start: chord.start, originalLabel: chord.label, correctedLabel: transposeLabel(value.trim(), -transpose) },
      { onSuccess: onClose },
    );
  };
  return (
    <Card style={{ gap: spacing.md, borderColor: colors.accent }}>
      <Text variant="subheading">Correct the chord at {formatTime(chord.start)}</Text>
      <Text variant="caption" tone="muted">Detected: {transposeLabel(chord.label, transpose)} ({Math.round(chord.confidence * 100)}% confidence)</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Corrected chord name"
        onSubmitEditing={save}
        style={[typeScale.heading, styles.input, { color: colors.text, borderColor: parsed ? colors.border : colors.danger, backgroundColor: colors.surfaceSunken }]}
      />
      {!parsed && <Text variant="caption" tone="danger">Enter a chord like G, Em, D7, Cmaj7, Asus4 or F#dim.</Text>}
      {correct.error && <Notice tone="error">{(correct.error as Error).message}</Notice>}
      <View style={styles.controlRow}>
        <Button label="Save correction" onPress={save} disabled={!parsed} loading={correct.isPending} />
        {chord.corrected && <Button label="Revert to detected" variant="secondary" loading={revert.isPending} onPress={() => revert.mutate(chord.start, { onSuccess: onClose })} />}
        <Button label="Cancel" variant="ghost" onPress={onClose} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  backBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  processing: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxxl },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: { flexGrow: 1, flexBasis: 140, gap: 2 },
  split: { gap: spacing.lg, alignItems: 'stretch' },
  now: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  nextRow: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap', alignItems: 'baseline' },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -spacing.sm },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl },
  controlsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xl, justifyContent: 'space-between' },
  controlRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  conf: { width: 48, height: 4, borderRadius: 2, overflow: 'hidden' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 52 },
});
