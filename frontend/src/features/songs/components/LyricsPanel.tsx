import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card, Chip, Notice } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import type { LocalSong } from '@/features/library/model';
import { estimateTimes, isTimed, layoutSong, lineAt, lyricsToText, parseLyrics, type ChordLine, type Lyrics } from '@/lib/music/lyrics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing, typeScale } from '@/theme/tokens';

import { lyricsEngine } from '@/services/lyricsEngine';

import { useUpdateSong } from '../hooks';
import { AutoLyrics } from './AutoLyrics';
import type { TimelineChord } from '../timeline';

const MONO = Platform.select({ web: 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace', ios: 'Menlo', default: 'monospace' });

export interface LyricsPanelProps {
  song: LocalSong;
  /** Chord shapes to show (capo and key change already applied). */
  timeline: TimelineChord[];
  time: number;
  playing: boolean;
  onSeek: (t: number) => void;
  onPlayFrom: (t: number) => void;
  large?: boolean;
}

export function LyricsPanel({ song, timeline, time, playing, onSeek, onPlayFrom, large = false }: LyricsPanelProps) {
  const update = useUpdateSong(song.id);
  const [editing, setEditing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pasting, setPasting] = useState(false);
  const lyrics = song.lyrics;

  const save = (next: Lyrics) => update.mutate({ lyrics: next });

  // Windows app: get the words automatically by listening to the song on this PC.
  if (!lyrics && !pasting && lyricsEngine.available()) {
    return <AutoLyrics song={song} onDone={save} onPaste={() => setPasting(true)} />;
  }
  if (!lyrics || editing) {
    return <LyricsEditor initial={lyrics ? lyricsToText(lyrics) : ''} onCancel={lyrics ? () => setEditing(false) : pasting ? () => setPasting(false) : undefined} onSave={(l) => { save({ ...l, source: 'user' }); setEditing(false); setPasting(false); }} />;
  }
  if (syncing) {
    return (
      <SyncLyrics
        lyrics={lyrics}
        time={time}
        playing={playing}
        onStart={() => onPlayFrom(Math.max(0, (timeline.find((c) => c.label !== 'N')?.start ?? 0) - 2))}
        onDone={(timed) => { save(timed); setSyncing(false); }}
        onCancel={() => setSyncing(false)}
      />
    );
  }
  return (
    <ChordSheet
      lyrics={lyrics}
      timeline={timeline}
      time={time}
      duration={song.analysis.duration}
      onSeek={onSeek}
      large={large}
      onEdit={() => setEditing(true)}
      onSync={() => setSyncing(true)}
      onRelisten={lyricsEngine.available() ? () => update.mutate({ lyrics: undefined }) : undefined}
    />
  );
}

export function LyricsEditor({ initial, onSave, onCancel }: { initial: string; onSave: (l: Lyrics) => void; onCancel?: () => void }) {
  const { colors } = useTheme();
  const [text, setText] = useState(initial);
  const parsed = useMemo(() => parseLyrics(text), [text]);
  const importFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: Platform.OS === 'web' ? '.lrc,.txt,text/plain' : ['text/plain', '*/*'], copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setText(a.file ? await a.file.text() : await (await fetch(a.uri)).text());
  };
  return (
    <Card style={{ gap: spacing.md }}>
      <View>
        <Text variant="subheading">Add the lyrics</Text>
        <Text variant="caption" tone="muted">
          Paste the words of the song, or import a .txt or synced .lrc file. Riffly puts the chords above the words. Riffly doesn't download lyrics, because they're copyrighted, so use a copy you're allowed to use.
        </Text>
      </View>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        placeholder={'Paste lyrics here, one line per sung line.\n\nSynced .lrc lines like [00:12.50]Some words are timed automatically.'}
        placeholderTextColor={colors.textSubtle}
        accessibilityLabel="Lyrics"
        style={[typeScale.body, styles.editor, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSunken, fontFamily: MONO }]}
      />
      <Text variant="caption" tone="muted">
        {parsed.lines.filter((l) => l.text).length} lines{isTimed(parsed) ? ' · timed (.lrc)' : ' · not timed yet: you can tap along to sync them next'}
      </Text>
      <View style={styles.row}>
        <Button label="Save lyrics" icon="checkmark" disabled={!parsed.lines.some((l) => l.text)} onPress={() => onSave(parsed)} />
        <Button label="Import file" icon="document-text-outline" variant="secondary" onPress={() => void importFile()} />
        {onCancel && <Button label="Cancel" variant="ghost" onPress={onCancel} />}
      </View>
    </Card>
  );
}

/** Tap-along timing: play the song and press the big button as each line starts. */
export function SyncLyrics({ lyrics, time, playing, onStart, onDone, onCancel }: { lyrics: Lyrics; time: number; playing: boolean; onStart: () => void; onDone: (l: Lyrics) => void; onCancel: () => void }) {
  const { colors } = useTheme();
  const sung = lyrics.lines.map((l, i) => ({ ...l, i })).filter((l) => l.text);
  const [times, setTimes] = useState<number[]>([]);
  const k = times.length;
  const finish = (all: number[]) => {
    let j = 0;
    onDone({ lines: lyrics.lines.map((l) => (l.text ? { ...l, time: all[j++] } : { ...l, time: null })).filter((l) => l.time !== null || !l.text) });
  };
  const tap = () => {
    const next = [...times, Math.max(time, times[times.length - 1] ?? 0)];
    if (next.length >= sung.length) finish(next);
    else setTimes(next);
  };

  // Space bar on a keyboard does the same as the big button.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && playing) {
        e.preventDefault();
        tap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Card style={{ gap: spacing.lg, alignItems: 'stretch' }}>
      <Text variant="subheading">Sync the lyrics</Text>
      <Text variant="caption" tone="muted">
        Start the song, then tap the button (or press Space) at the moment each line begins. Riffly remembers the timing.
      </Text>
      <View style={[styles.syncLine, { backgroundColor: colors.surfaceSunken }]}>
        <Text variant="overline" tone="subtle">{k < sung.length ? `Line ${k + 1} of ${sung.length}` : 'Done'}</Text>
        <Text variant="title" style={{ textAlign: 'center' }}>{sung[k]?.text ?? ''}</Text>
        {sung[k + 1] && <Text tone="muted" style={{ textAlign: 'center' }}>{sung[k + 1].text}</Text>}
      </View>
      {!playing && k === 0 ? (
        <Button label="Start the song" icon="play" size="lg" onPress={onStart} />
      ) : (
        <Button label="This line starts now" icon="hand-left-outline" size="lg" onPress={tap} />
      )}
      <View style={styles.row}>
        {k > 0 && <Button label="Undo last tap" variant="secondary" onPress={() => setTimes(times.slice(0, -1))} />}
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
      </View>
    </Card>
  );
}

function ChordSheet({ lyrics, timeline, time, duration, onSeek, large, onEdit, onSync, onRelisten }: { lyrics: Lyrics; timeline: TimelineChord[]; time: number; duration: number; onSeek: (t: number) => void; large: boolean; onEdit: () => void; onSync: () => void; onRelisten?: () => void }) {
  const { colors } = useTheme();
  const [autoScroll, setAutoScroll] = useState(true);
  const [size, setSize] = useState(large ? 20 : 16);
  const timed = isTimed(lyrics);
  const placed = useMemo(() => {
    const firstChord = timeline.find((c) => c.label !== 'N');
    const lastChord = [...timeline].reverse().find((c) => c.label !== 'N');
    return timed ? lyrics : estimateTimes(lyrics, firstChord?.start ?? 0, lastChord?.end ?? duration);
  }, [lyrics, timed, timeline, duration]);
  const chords = useMemo(() => timeline.map((c) => ({ start: c.start, end: c.end, label: c.label === 'N' ? 'N' : c.display })), [timeline]);
  const lines = useMemo(() => layoutSong(placed, chords, duration), [placed, chords, duration]);
  const active = lineAt(placed, time);
  // Map placed-line index -> laid-out index (blank lines are skipped by layoutSong only when untimed).
  const timedLines = placed.lines.filter((l) => l.time !== null);
  const activeLaid = active < 0 ? -1 : timedLines.indexOf(placed.lines[active]);

  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef<number[]>([]);
  useEffect(() => {
    if (!autoScroll || activeLaid < 0) return;
    const y = offsets.current[activeLaid];
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - 120), animated: true });
  }, [activeLaid, autoScroll]);

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.row}>
        <Chip icon={autoScroll ? 'arrow-down-circle' : 'arrow-down-circle-outline'} label={autoScroll ? 'Auto-scroll on' : 'Auto-scroll off'} selected={autoScroll} onPress={() => setAutoScroll(!autoScroll)} />
        <Chip icon="text" label="A−" onPress={() => setSize((s) => Math.max(12, s - 2))} />
        <Chip icon="text" label="A+" onPress={() => setSize((s) => Math.min(30, s + 2))} />
        <View style={{ flex: 1 }} />
        <Button label="Sync" icon="timer-outline" size="sm" variant="secondary" onPress={onSync} />
        <Button label="Edit" icon="create-outline" size="sm" variant="ghost" onPress={onEdit} />
        {onRelisten && <Button label="Listen again" icon="ear-outline" size="sm" variant="ghost" onPress={onRelisten} />}
      </View>
      {lyrics.source === 'heard' && (
        <Text variant="caption" tone="muted">
          Written down by Riffly from the recording. Sung words are hard to hear over the music, so some may be wrong: tap Edit to fix them.
        </Text>
      )}
      {!timed && (
        <Notice tone="warning">
          Line timing is estimated, so chords may sit over the wrong words. Tap Sync and tap along once to time each line.
        </Notice>
      )}
      <Card padded={false} style={{ overflow: 'hidden' }}>
        <ScrollView ref={scroll} style={{ maxHeight: large ? 560 : 460 }} contentContainerStyle={{ padding: spacing.lg }} nestedScrollEnabled>
          {lines.map((line, i) => (
            <View key={i} onLayout={(e) => (offsets.current[i] = e.nativeEvent.layout.y)}>
              <SheetLine line={line} active={i === activeLaid} past={i < activeLaid} time={time} size={size} onPress={() => onSeek(line.start)} />
            </View>
          ))}
        </ScrollView>
      </Card>
      <Text variant="caption" tone="subtle">Chords follow your capo and key settings. Tap a line to jump there.</Text>
    </View>
  );
}

function SheetLine({ line, active, past, time, size, onPress }: { line: ChordLine; active: boolean; past: boolean; time: number; size: number; onPress: () => void }) {
  const { colors } = useTheme();
  const spans: { text: string; chord: boolean; current: boolean }[] = [];
  let cursor = 0;
  line.marks.forEach((m, idx) => {
    if (m.col > cursor) spans.push({ text: ' '.repeat(m.col - cursor), chord: false, current: false });
    const end = line.marks[idx + 1]?.start ?? line.end;
    spans.push({ text: m.label, chord: true, current: active && time >= m.start && time < end });
    cursor = m.col + m.label.length;
  });
  const mono = { fontFamily: MONO, fontSize: size, lineHeight: Math.round(size * 1.35) };
  if (!line.text && !line.marks.length) return <View style={{ height: size }} />;
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`Jump to: ${line.text}`}
      style={[styles.sheetLine, active && { backgroundColor: colors.accentSoft }, { opacity: past ? 0.55 : 1 }]}
    >
      <Text style={[mono, { color: colors.accent, fontWeight: '700' }]}>
        {spans.map((s, i) => (
          <Text key={i} style={s.current ? { color: colors.highlight, backgroundColor: colors.highlightSoft } : undefined}>
            {s.text}
          </Text>
        ))}
        {spans.length === 0 ? ' ' : ''}
      </Text>
      <Text style={[mono, { color: active ? colors.text : colors.textMuted, fontWeight: active ? '600' : '400' }]}>{line.text || ' '}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  editor: { minHeight: 220, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  syncLine: { borderRadius: radius.md, padding: spacing.xl, gap: spacing.sm, alignItems: 'center' },
  sheetLine: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, marginBottom: 6 },
});
