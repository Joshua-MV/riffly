import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChordLane } from '@/components/music/ChordLane';
import { SeekBar } from '@/components/music/SeekBar';
import type { IconName } from '@/components/ui/Button';
import { Card, Notice } from '@/components/ui/primitives';
import type { PressState } from '@/components/ui/pressState';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { nextChordTime, previousChordTime } from '../lane';
import type { TimelineChord } from '../timeline';

import { NowPlaying } from './NowPlaying';

const SPEEDS = [1, 0.9, 0.75, 0.5] as const;

export interface StageInfo {
  label: string;
  value: string;
  tone?: 'success' | 'highlight' | 'danger';
}

export interface PlayerStageProps {
  timeline: TimelineChord[];
  beats: number[];
  time: number;
  duration: number;
  playing: boolean;
  rate: number;
  loop: { start: number; end: number } | null;
  countIn: number | null;
  countInEnabled: boolean;
  beat: number | null;
  capo: number;
  info: StageInfo[];
  large: boolean;
  notice?: string | null;
  error?: string | null;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onRate: (r: number) => void;
  onLoopToggle: () => void;
  onCountInToggle: () => void;
}

/** Now playing: big chord + diagram, chord lane, song facts, seek bar and controls. */
export function PlayerStage(p: PlayerStageProps) {
  const { colors } = useTheme();
  const index = p.timeline.findIndex((c) => c.start <= p.time && p.time < c.end);
  const current = index >= 0 ? p.timeline[index] : null;
  const next = p.timeline.slice(index + 1).filter((c) => c.label !== 'N').slice(0, 4);
  const lane = p.timeline.map((c) => ({ start: c.start, end: c.end, label: c.label === 'N' ? 'N' : c.display }));
  const nextSpeed = SPEEDS[(SPEEDS.indexOf(p.rate as (typeof SPEEDS)[number]) + 1) % SPEEDS.length] ?? 1;
  const next_t = nextChordTime(lane, p.time);

  return (
    <Card style={{ gap: spacing.lg }}>
      {p.notice && <Notice tone="info">{p.notice}</Notice>}
      {p.error && <Notice tone="error">{p.error}</Notice>}
      <NowPlaying current={current} next={next} large={p.large} beat={p.beat} countIn={p.countIn} capo={p.capo} bare />

      <ChordLane chords={lane} beats={p.beats} time={p.time} onSeek={p.onSeek} height={p.large ? 96 : 76} />

      <View style={styles.info}>
        {p.info.map((i) => (
          <View key={i.label} style={[styles.pill, { backgroundColor: colors.surfaceSunken, borderColor: colors.border }]}>
            <Text variant="caption" tone="subtle">{i.label}</Text>
            <Text variant="caption" style={{ color: i.tone ? colors[i.tone] : colors.text, fontWeight: '600' }}>{i.value}</Text>
          </View>
        ))}
      </View>

      <SeekBar time={p.time} duration={p.duration} onSeek={p.onSeek} loop={p.loop} />

      <View style={styles.controls}>
        <Round icon="repeat" label={p.loop ? 'Stop looping' : 'Loop this phrase'} active={!!p.loop} onPress={p.onLoopToggle} />
        <Round icon="play-skip-back" label="Previous chord" size={52} onPress={() => p.onSeek(previousChordTime(lane, p.time))} />
        <PlayButton playing={p.playing || p.countIn !== null} onPress={p.onToggle} size={p.large ? 84 : 68} />
        <Round icon="play-skip-forward" label="Next chord" size={52} disabled={next_t === null} onPress={() => next_t !== null && p.onSeek(next_t)} />
        <Pressable
          role="button"
          accessibilityLabel={`Speed ${p.rate} times. Change to ${nextSpeed} times`}
          onPress={() => p.onRate(nextSpeed)}
          style={({ hovered }: PressState) => [styles.speed, { borderColor: p.rate !== 1 ? colors.accent : colors.border, backgroundColor: hovered ? colors.surfaceHover : 'transparent' }]}
        >
          <Text variant="caption" style={{ color: p.rate !== 1 ? colors.accent : colors.text, fontWeight: '700' }}>{p.rate}×</Text>
        </Pressable>
      </View>

      <View style={styles.extras}>
        <Pressable
          role="switch"
          accessibilityState={{ checked: p.countInEnabled }}
          accessibilityLabel="Count in one bar before playing"
          onPress={p.onCountInToggle}
          style={styles.extra}
        >
          <Ionicons name="timer-outline" size={16} color={p.countInEnabled ? colors.accent : colors.textSubtle} />
          <Text variant="caption" style={{ color: p.countInEnabled ? colors.accent : colors.textSubtle }}>Count-in {p.countInEnabled ? 'on' : 'off'}</Text>
        </Pressable>
        <Text variant="caption" tone="subtle">Drag the bar to scrub · ⏮ ⏭ jump between chord changes · speed keeps the pitch</Text>
      </View>
    </Card>
  );
}

function PlayButton({ playing, onPress, size }: { playing: boolean; onPress: () => void; size: number }) {
  const { colors } = useTheme();
  return (
    <Pressable
      role="button"
      accessibilityLabel={playing ? 'Pause' : 'Play'}
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => [
        styles.play,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.text,
          transform: [{ scale: pressed ? 0.94 : hovered ? 1.05 : 1 }],
        },
      ]}
    >
      <Ionicons name={playing ? 'pause' : 'play'} size={size * 0.44} color={colors.background} style={{ marginLeft: playing ? 0 : size * 0.05 }} />
    </Pressable>
  );
}

function Round({ icon, label, onPress, active, disabled, size = 44 }: { icon: IconName; label: string; onPress: () => void; active?: boolean; disabled?: boolean; size?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable
      role="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => [
        styles.round,
        { width: size, height: size, borderRadius: size / 2, opacity: disabled ? 0.3 : 1, transform: [{ scale: pressed ? 0.92 : hovered ? 1.06 : 1 }] },
      ]}
    >
      <Ionicons name={icon} size={size * 0.5} color={active ? colors.accent : colors.text} />
      {active && <View style={[styles.dot, { backgroundColor: colors.accent }]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  info: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pill: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  play: { alignItems: 'center', justifyContent: 'center' },
  round: { alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', bottom: 2, width: 4, height: 4, borderRadius: 2 },
  speed: { minWidth: 48, height: 32, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  extras: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  extra: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
