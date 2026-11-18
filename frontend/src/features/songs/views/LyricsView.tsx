import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card, Notice, SegmentedControl, Stepper, Toggle } from '@/components/ui/primitives';
import type { PressState } from '@/components/ui/pressState';
import { Text } from '@/components/ui/Text';
import { estimateTimes, isTimed, layoutSong, lineAt, lineSegments, lyricsToText, type ChordLine, type Lyrics } from '@/lib/music/lyrics';
import { lyricsEngine } from '@/services/lyricsEngine';
import { useTheme } from '@/theme/ThemeProvider';
import { useLayout } from '@/theme/useLayout';
import { fonts, radius, spacing } from '@/theme/tokens';

import { AutoLyrics } from '../components/AutoLyrics';
import { LyricsEditor, SyncLyrics } from '../components/LyricsPanel';
import { formatTime } from '../timeline';
import type { SongPractice } from '../useSongPractice';

const SIZES = [22, 28, 34] as const;

/** Lyrics with chords above the words, big enough to read from the stool; follows the song. */
export function LyricsView({ s }: { s: SongPractice }) {
  const { colors } = useTheme();
  const { isPhone } = useLayout();
  const { song, practice } = s;
  const [mode, setMode] = useState<'sheet' | 'edit' | 'paste' | 'sync'>('sheet');
  const [size, setSize] = useState<(typeof SIZES)[number]>(28);
  const [chordsAbove, setChordsAbove] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const offset = (practice.lyricsOffsetMs ?? 0) / 1000;
  const lyrics = song.lyrics;
  const save = (next: Lyrics) => s.update.mutate({ lyrics: next });

  let body: React.ReactNode;
  if (!lyrics && mode !== 'paste' && lyricsEngine.available()) {
    body = <AutoLyrics song={song} onDone={save} onPaste={() => setMode('paste')} />;
  } else if (!lyrics || mode === 'edit' || mode === 'paste') {
    body = (
      <LyricsEditor
        initial={lyrics && mode === 'edit' ? lyricsToText(lyrics) : ''}
        onCancel={lyrics || mode === 'paste' ? () => setMode('sheet') : undefined}
        onSave={(l) => {
          save({ ...l, source: 'user' });
          setMode('sheet');
        }}
      />
    );
  } else if (mode === 'sync') {
    body = (
      <SyncLyrics
        lyrics={lyrics}
        time={s.time}
        playing={s.isLoaded && s.player.playing}
        onStart={() => void s.playFrom(Math.max(0, (s.timeline.find((c) => c.label !== 'N')?.start ?? 0) - 2))}
        onDone={(timed) => {
          save(timed);
          setMode('sheet');
        }}
        onCancel={() => setMode('sheet')}
      />
    );
  } else {
    body = <Sheet s={s} lyrics={lyrics} size={size} chordsAbove={chordsAbove} autoScroll={autoScroll} offset={offset} />;
  }

  const inspector = (
    <View style={[styles.inspector, !isPhone && { borderLeftColor: colors.border, borderLeftWidth: 1 }]}>
      <View style={styles.block}>
        <Text variant="overline" tone="subtle">Source</Text>
        <Text variant="subheading">{!lyrics ? 'No lyrics yet' : lyrics.source === 'heard' ? 'Transcribed on this computer' : 'Added by you'}</Text>
        <Text variant="caption" tone="muted">
          {!lyrics
            ? lyricsEngine.available()
              ? 'Riffly listens to the recording and writes the words down, timed to the song.'
              : 'Paste the words or import a .txt or .lrc file.'
            : lyrics.source === 'heard'
              ? `whisper.cpp · ${lyrics.lines.length} lines aligned to the song. Nothing was uploaded.`
              : `${lyrics.lines.length} lines${isTimed(lyrics) ? ', timed' : ''}.`}
        </Text>
        <View style={styles.btnRow}>
          <Button label="Edit lyrics" icon="create-outline" variant="secondary" size="sm" disabled={!lyrics} onPress={() => setMode('edit')} />
          <Button label="Paste my own" variant="secondary" size="sm" onPress={() => setMode('paste')} />
        </View>
        {lyrics && lyricsEngine.available() && (
          <Button label="Listen again" icon="ear-outline" variant="ghost" size="sm" onPress={() => s.update.mutate({ lyrics: undefined })} />
        )}
      </View>

      <View style={styles.block}>
        <Text variant="overline" tone="subtle">Sync offset</Text>
        <Stepper
          label="offset"
          value={`${offset >= 0 ? '+' : '−'}${Math.abs(Math.round(offset * 1000))} ms`}
          onMinus={() => s.setPractice({ lyricsOffsetMs: (practice.lyricsOffsetMs ?? 0) - 60 })}
          onPlus={() => s.setPractice({ lyricsOffsetMs: (practice.lyricsOffsetMs ?? 0) + 60 })}
        />
        <Text variant="caption" tone="muted">If the words arrive late, add a little; early, take some away. Or re-time every line with Sync.</Text>
        <Button label="Sync by tapping" icon="timer-outline" variant="ghost" size="sm" disabled={!lyrics} onPress={() => setMode('sync')} />
      </View>

      <View style={styles.block}>
        <Text variant="overline" tone="subtle">Display</Text>
        <View style={styles.setting}>
          <Text variant="body">Text size</Text>
          <View style={styles.sizes}>
            {SIZES.map((v) => (
              <Pressable
                key={v}
                role="radio"
                accessibilityLabel={`Text size ${v}`}
                accessibilityState={{ checked: size === v }}
                onPress={() => setSize(v)}
                style={({ hovered }: PressState) => [styles.sizeBtn, { borderColor: size === v ? colors.accent : colors.border, backgroundColor: size === v ? colors.accentSoft : hovered ? colors.surfaceHover : colors.surface }]}
              >
                <Text style={{ fontFamily: fonts.serif, fontSize: 11 + SIZES.indexOf(v) * 3, color: colors.text }}>A</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.setting}>
          <Text variant="body">Chords above words</Text>
          <Toggle value={chordsAbove} onChange={setChordsAbove} label="Chords above words" />
        </View>
        <View style={styles.setting}>
          <Text variant="body">Auto-scroll</Text>
          <Toggle value={autoScroll} onChange={setAutoScroll} label="Auto-scroll" />
        </View>
      </View>

      {lyrics?.source === 'heard' && (
        <Notice>Sung words are hard to hear over the music, so some may be wrong. Edit fixes them; your version is kept.</Notice>
      )}
    </View>
  );

  return (
    <View style={[styles.wrap, { flexDirection: isPhone ? 'column' : 'row' }]}>
      <View style={{ flex: 1, gap: spacing.lg, minWidth: 0 }}>
        <View style={styles.head}>
          <View style={styles.titleRow}>
            <Text variant="title" numberOfLines={1} style={{ fontSize: 28, lineHeight: 34, flexShrink: 1 }}>{song.title}</Text>
            <View style={[styles.chip, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}>
              <Text variant="overline" tone="highlight" style={{ fontSize: 10 }}>{formatTime(s.time)}</Text>
            </View>
          </View>
          <SegmentedControl<'lyrics' | 'chords'>
            label="View"
            value="lyrics"
            onChange={(v) => v === 'chords' && router.setParams({ view: 'play' })}
            options={[{ value: 'chords', label: 'Chords' }, { value: 'lyrics', label: '+ Lyrics' }]}
          />
        </View>
        {body}
      </View>
      {inspector}
    </View>
  );
}

function Sheet({ s, lyrics, size, chordsAbove, autoScroll, offset }: { s: SongPractice; lyrics: Lyrics; size: number; chordsAbove: boolean; autoScroll: boolean; offset: number }) {
  const { colors } = useTheme();
  const time = s.time + offset;
  const timed = isTimed(lyrics);
  const placed = useMemo(() => {
    const first = s.timeline.find((c) => c.label !== 'N');
    const last = [...s.timeline].reverse().find((c) => c.label !== 'N');
    return timed ? lyrics : estimateTimes(lyrics, first?.start ?? 0, last?.end ?? s.duration);
  }, [lyrics, timed, s.timeline, s.duration]);
  const chords = useMemo(() => s.timeline.map((c) => ({ start: c.start, end: c.end, label: c.label === 'N' ? 'N' : c.display })), [s.timeline]);
  const lines = useMemo(() => layoutSong(placed, chords, s.duration), [placed, chords, s.duration]);
  const active = lineAt(placed, time);
  const timedLines = placed.lines.filter((l) => l.time !== null);
  const activeLaid = active < 0 ? -1 : timedLines.indexOf(placed.lines[active]);

  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef<number[]>([]);
  const [pausedUntil, setPausedUntil] = useState(0);
  useEffect(() => {
    if (!autoScroll || activeLaid < 0 || Date.now() < pausedUntil) return;
    const y = offsets.current[activeLaid];
    if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - 140), animated: true });
  }, [activeLaid, autoScroll, pausedUntil]);

  return (
    <View style={{ gap: spacing.sm }}>
      {!timed && <Notice tone="warning">Line timing is estimated, so chords may sit over the wrong words. Use Sync to time each line.</Notice>}
      <ScrollView
        ref={scroll}
        style={{ maxHeight: 620 }}
        contentContainerStyle={{ paddingVertical: spacing.md }}
        nestedScrollEnabled
        onScrollBeginDrag={() => setPausedUntil(Date.now() + 4000)}
      >
        {lines.map((line, i) => (
          <View key={i} onLayout={(e) => (offsets.current[i] = e.nativeEvent.layout.y)}>
            <SheetLine line={line} active={i === activeLaid} past={i < activeLaid} time={time} size={size} chordsAbove={chordsAbove} onPress={() => void s.seek(line.start)} />
          </View>
        ))}
      </ScrollView>
      <Text variant="caption" tone="subtle">
        {autoScroll ? 'Auto-scroll on · scroll freely to pause it, it resumes after 4 s · ' : ''}Tap a line to jump there.
      </Text>
    </View>
  );
}

function SheetLine({ line, active, past, time, size, chordsAbove, onPress }: { line: ChordLine; active: boolean; past: boolean; time: number; size: number; chordsAbove: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  if (!line.text && !line.marks.length) return <View style={{ height: size * 0.6 }} />;
  const segs = lineSegments(line);
  const big = active ? size * 1.14 : size;
  return (
    <Pressable onPress={onPress} accessibilityLabel={`Jump to: ${line.text}`} style={[styles.line, { opacity: past ? 0.45 : active ? 1 : 0.75 }]}>
      <View style={styles.segs}>
        {segs.map((sg, i) => {
          const nowChord = active && sg.start !== null && time >= sg.start && (segs[i + 1]?.start ?? Infinity) > time;
          return (
            <View key={i} style={{ flexShrink: 1 }}>
              {chordsAbove && (
                <Text style={{ fontFamily: fonts.display, fontSize: Math.max(13, size * 0.5), lineHeight: Math.max(18, size * 0.66), color: nowChord ? colors.highlight : active ? colors.accent : colors.textMuted }}>
                  {sg.chord ?? ' '}
                </Text>
              )}
              <Text
                style={{
                  fontFamily: fonts.serif,
                  fontSize: big,
                  lineHeight: big * 1.3,
                  color: active ? colors.text : colors.textMuted,
                  textDecorationLine: nowChord ? 'underline' : 'none',
                  textDecorationColor: colors.accent,
                }}
              >
                {sg.text || ' '}
              </Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xl, alignItems: 'flex-start' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 },
  chip: { paddingHorizontal: spacing.sm, height: 22, borderRadius: radius.xs, borderWidth: 1, justifyContent: 'center' },
  inspector: { width: 300, gap: spacing.xl, paddingLeft: spacing.xl, alignSelf: 'stretch' },
  block: { gap: spacing.sm },
  btnRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  setting: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
  sizes: { flexDirection: 'row', gap: 4 },
  sizeBtn: { width: 30, height: 28, borderRadius: radius.xs, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  line: { marginBottom: spacing.md, borderRadius: radius.sm },
  segs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
});
