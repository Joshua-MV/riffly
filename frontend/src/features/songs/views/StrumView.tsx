import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Card, Chip, SegmentedControl, Stepper } from '@/components/ui/primitives';
import type { PressState } from '@/components/ui/pressState';
import { Text } from '@/components/ui/Text';
import { createClickScheduler } from '@/lib/audio/metronome';
import type { ClickScheduler } from '@/lib/audio/metronome.types';
import { STRUM_PATTERNS, strumChoice } from '@/lib/music/strum';
import { useTheme } from '@/theme/ThemeProvider';
import { useLayout } from '@/theme/useLayout';
import { radius, spacing } from '@/theme/tokens';

import { slotAt } from '../components/StrumPanel';
import type { SongPractice } from '../useSongPractice';

import { StrumGlyphs, StrumKey } from './StrumGlyphs';

type Mode = 'click' | 'song';

/** Strum: pick a pattern, see it big, practise it to a click or with the song. */
export function StrumView({ s }: { s: SongPractice }) {
  const { colors } = useTheme();
  const { isPhone } = useLayout();
  const { practice, result } = s;
  const choice = strumChoice(practice.strum, result.strum);
  const detected = result.strum && /^[DU-]{8}$/.test(result.strum.pattern) ? result.strum.pattern : null;
  const [mode, setMode] = useState<Mode>('click');
  const songBpm = result.bpm ? Math.round(result.bpm) : 90;
  const [bpm, setBpm] = useState(() => Math.max(50, Math.round(songBpm * 0.75)));
  const [running, setRunning] = useState(false);
  const [countIn, setCountIn] = useState(true);
  const [accent, setAccent] = useState(true);
  const [speedUp, setSpeedUp] = useState(false);
  const [slot, setSlot] = useState(-1);

  // Click-only practice: an eighth-note grid at `bpm`, clicks on each beat.
  const clicker = useRef<ClickScheduler | null>(null);
  const tempo = useRef(bpm);
  tempo.current = bpm;
  useEffect(() => {
    if (!running || mode !== 'click') return;
    if (!clicker.current) clicker.current = createClickScheduler();
    let startMs = performance.now() + 120;
    let nextBeat = countIn ? -4 : 0;
    let beatAt = startMs;
    let bars = 0;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const beatMs = 60000 / tempo.current;
      while (beatAt <= now + 100) {
        const isCount = nextBeat < 0;
        clicker.current?.click(Math.max(0, (beatAt - now) / 1000), (accent && ((nextBeat % 4) + 4) % 4 === 0) || isCount, isCount ? 0.6 : 0.9);
        beatAt += beatMs;
        nextBeat++;
        if (nextBeat > 0 && nextBeat % 16 === 0 && speedUp) {
          bars += 4;
          setBpm((b) => Math.min(songBpm, b + 2));
        }
      }
      const sinceStart = now - startMs - (countIn ? 4 * beatMs : 0);
      setSlot(sinceStart < 0 ? -1 : Math.floor(sinceStart / (beatMs / 2)) % 8);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      startMs = 0;
      void bars;
      setSlot(-1);
    };
  }, [running, mode, countIn, accent, speedUp, songBpm]);
  useEffect(() => () => clicker.current?.dispose(), []);

  // With the song: follow the song's own beat.
  useEffect(() => {
    if (mode !== 'song') return;
    return s.player.clock.subscribe((t) => setSlot(s.player.clock.playing() ? slotAt(s.beats, s.barOffset, t) : -1));
  }, [mode, s.player.clock, s.beats, s.barOffset]);

  const start = () => {
    if (mode === 'song') {
      void s.toggle();
      return;
    }
    if (s.player.playing) s.player.pause();
    setRunning((r) => !r);
  };
  const songRunning = mode === 'song' && s.isLoaded && s.player.playing;
  const active = mode === 'click' ? running : songRunning;
  const title = choice === 'auto' ? 'This song' : STRUM_PATTERNS.find((p) => p.id === choice)?.name ?? 'Pattern';

  const row = (id: string, name: string, pattern: string, sub?: string) => {
    const on = choice === id;
    return (
      <Pressable
        key={id}
        role="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={`${name}: ${pattern}`}
        onPress={() => s.setPractice({ strum: id })}
        style={({ hovered }: PressState) => [styles.pattern, { borderColor: on ? colors.accent : 'transparent', backgroundColor: on ? colors.accentSoft : hovered ? colors.surfaceHover : 'transparent' }]}
      >
        <View style={styles.patternHead}>
          <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{name}</Text>
          <Text variant="mono" tone="subtle" style={{ fontSize: 10 }}>4/4</Text>
        </View>
        <StrumGlyphs pattern={pattern} size={12} counts={false} words={false} />
        {sub && <Text variant="caption" tone="subtle">{sub}</Text>}
      </Pressable>
    );
  };

  return (
    <View style={[styles.wrap, { flexDirection: isPhone ? 'column' : 'row' }]}>
      <View style={[styles.list, !isPhone && { borderRightColor: colors.border, borderRightWidth: 1 }]}>
        <Text variant="title" style={{ fontSize: 30 }}>Strum</Text>
        <Text variant="overline" tone="subtle">From this song</Text>
        {detected && (
          <>
            <Text variant="overline" tone="subtle">Suits this song</Text>
            {row('auto', 'This song', detected, `Picked from how busy the recording's strumming is${result.bpm ? ` at ${Math.round(result.bpm)} BPM` : ''}`)}
          </>
        )}
        <Text variant="overline" tone="subtle" style={{ marginTop: detected ? spacing.md : 0 }}>Easiest</Text>
        {row(STRUM_PATTERNS[0].id, STRUM_PATTERNS[0].name, STRUM_PATTERNS[0].pattern, 'Best for learning a new song')}
        <Text variant="overline" tone="subtle" style={{ marginTop: spacing.md }}>When that feels easy</Text>
        {STRUM_PATTERNS.slice(1).map((p) => row(p.id, p.name, p.pattern))}

      </View>

      <View style={{ flex: 1, gap: spacing.lg, minWidth: 0 }}>
        <View style={styles.head}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.md, flexShrink: 1 }}>
            <Text variant="overline" tone="subtle">Pattern</Text>
            <Text variant="heading" numberOfLines={1} style={{ flexShrink: 1 }}>{title}</Text>
          </View>
          <SegmentedControl<Mode> label="Practise with" value={mode} onChange={(m) => { setRunning(false); setMode(m); }} options={[{ value: 'click', label: 'Click only' }, { value: 'song', label: 'With song' }]} />
        </View>

        <Card style={styles.stage}>
          <StrumGlyphs pattern={s.strumPattern} size={isPhone ? 44 : 112} active={slot} />
          <StrumKey />
        </Card>

        <View style={styles.controls}>
          <Pressable
            role="button"
            accessibilityLabel={active ? 'Stop' : 'Start'}
            onPress={start}
            style={({ hovered }: PressState) => [styles.go, { backgroundColor: hovered ? colors.accentPressed : colors.accent }]}
          >
            <Icon name={active ? 'stop' : 'play'} size={14} color={colors.onAccent} />
            <Text variant="bodyStrong" style={{ color: colors.onAccent }}>{active ? 'Stop' : mode === 'song' ? 'Play song' : 'Start'}</Text>
          </Pressable>
          {mode === 'click' ? (
            <>
              <Text variant="overline" tone="subtle">Tempo</Text>
              <Stepper label="tempo" value={`${bpm}`} onMinus={() => setBpm((b) => Math.max(40, b - 2))} onPlus={() => setBpm((b) => Math.min(220, b + 2))} />
              <Text variant="overline" tone="subtle">BPM · song is {songBpm}</Text>
            </>
          ) : (
            <Text variant="caption" tone="muted">The arrows follow the song’s beat. Change its speed in Play Along or the transport.</Text>
          )}
        </View>
        {mode === 'click' && (
          <View style={styles.chips}>
            <Chip label="Count-in 1 bar" selected={countIn} onPress={() => setCountIn((v) => !v)} />
            <Chip label="Accent beat 1" selected={accent} onPress={() => setAccent((v) => !v)} />
            <Chip label={`Speed up +2 every 4 bars (to ${songBpm})`} selected={speedUp} onPress={() => setSpeedUp((v) => !v)} />
          </View>
        )}
        <Text variant="caption" tone="subtle">
          Down-strums fall on the beat (1 2 3 4), up-strums on the “and” in between. Keep your hand moving like a pendulum and only touch the strings where there’s an arrow.
        </Text>
      </View>
    </View>
  );
}

function Legend({ icon, color, text }: { icon: 'arrow-down' | 'arrow-up' | 'remove'; color: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name={icon} size={14} color={color} />
      <Text variant="caption" tone="subtle">{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xl, alignItems: 'flex-start' },
  list: { width: 280, gap: spacing.xs, paddingRight: spacing.lg, alignSelf: 'stretch' },
  pattern: { gap: 6, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  patternHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  stage: { paddingVertical: spacing.xxxl * 1.5, paddingHorizontal: spacing.xl, gap: spacing.xxl },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl, flexWrap: 'wrap' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  go: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 44, paddingHorizontal: spacing.xl, borderRadius: 22 },
  chips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
});
