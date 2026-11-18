import { Icon } from '@/components/ui/Icon';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { Card, Chip, Notice } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import type { PlaybackClock } from '@/features/player/clock';
import { countLabels, STRUM_PATTERNS } from '@/lib/music/strum';
import type { StrumAnalysis } from '@/services/api';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, spacing } from '@/theme/tokens';

export interface StrumPanelProps {
  clock: PlaybackClock;
  beats: readonly number[];
  barOffset: number;
  /** The pattern in use. */
  pattern: string;
  detected: StrumAnalysis | undefined;
  /** 'auto' or a preset id. */
  choice: string;
  onChoose: (choice: string) => void;
  showInLane: boolean;
  onShowInLane: (on: boolean) => void;
  large?: boolean;
}

/** Which eighth-note slot of the bar (0-7) is sounding at `t`, or -1 outside the beat grid. */
export function slotAt(beats: readonly number[], barOffset: number, t: number): number {
  let i = -1;
  let lo = 0;
  let hi = beats.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= t + 0.03) {
      i = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (i < 0 || i >= beats.length - 1) return -1;
  const half = t + 0.03 >= (beats[i] + beats[i + 1]) / 2 ? 1 : 0;
  return ((((i - barOffset) % 4) + 4) % 4) * 2 + half;
}

export function StrumPanel(p: StrumPanelProps) {
  const { colors } = useTheme();
  const detectedOk = p.detected && /^[DU-]{8}$/.test(p.detected.pattern);
  const conf = p.detected?.confidence ?? 0;

  return (
    <View style={{ gap: spacing.lg }}>
      <StrumBar clock={p.clock} beats={p.beats} barOffset={p.barOffset} pattern={p.pattern} large={p.large} />

      <View style={{ gap: spacing.sm }}>
        <Text variant="overline" tone="subtle">Pattern</Text>
        <View style={styles.chips}>
          <Chip
            label={detectedOk ? `From the song · ${p.detected!.pattern}` : 'From the song'}
            selected={p.choice === 'auto'}
            onPress={() => p.onChoose('auto')}
          />
          {STRUM_PATTERNS.map((s) => (
            <Chip key={s.id} label={`${s.name} · ${s.pattern}`} selected={p.choice === s.id} onPress={() => p.onChoose(s.id)} />
          ))}
        </View>
        <Text variant="caption" tone="muted">
          {p.choice === 'auto'
            ? detectedOk
              ? `Riffly listened for where the strums land in each bar and found this rhythm (${conf > 0.6 ? 'clear' : conf > 0.3 ? 'fairly clear' : 'not very clear'} in this recording${p.detected!.sixteenth_feel ? '; the real part is busier, with sixteenth notes' : ''}). Drums can hide the guitar, so if it doesn't feel right, pick a pattern above.`
              : 'This song was analysed before strum detection existed, or no steady beat was found. Pick a pattern above.'
            : STRUM_PATTERNS.find((s) => s.id === p.choice)?.description}
        </Text>
      </View>

      <Pressable role="switch" accessibilityState={{ checked: p.showInLane }} onPress={() => p.onShowInLane(!p.showInLane)} style={styles.toggle}>
        <Icon name={p.showInLane ? 'checkbox' : 'square-outline'} size={18} color={p.showInLane ? colors.accent : colors.textSubtle} />
        <Text variant="caption">Show strum arrows under the chords while playing</Text>
      </Pressable>

      <Notice tone="info">
        Down-strums fall on the beat (1, 2, 3, 4) and up-strums on the "and" in between. Keep your hand moving down and up all the time, like a pendulum, and only touch the strings where the pattern has an arrow.
      </Notice>
    </View>
  );
}

/** The pattern as big arrows with the count under them; the current eighth lights up. */
export function StrumBar({ clock, beats, barOffset, pattern, large }: { clock: PlaybackClock; beats: readonly number[]; barOffset: number; pattern: string; large?: boolean }) {
  const { colors } = useTheme();
  const [slot, setSlot] = useState(-1);
  const pop = useRef(new Animated.Value(0)).current;
  const last = useRef(-1);
  useEffect(
    () =>
      clock.subscribe((t) => {
        const s = slotAt(beats, barOffset, t);
        if (s === last.current) return;
        last.current = s;
        setSlot(s);
        if (clock.playing() && s >= 0 && pattern[s] !== '-') {
          pop.setValue(1);
          Animated.timing(pop, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
        }
      }),
    [clock, beats, barOffset, pattern, pop],
  );
  const size = large ? 44 : 34;
  const counts = countLabels();
  return (
    <Card style={[styles.bar, { backgroundColor: colors.surfaceSunken }]}>
      {pattern.split('').map((ch, i) => {
        const active = i === slot;
        const color = active ? colors.highlight : ch === '-' ? colors.border : i % 2 === 0 ? colors.text : colors.textMuted;
        return (
          <View key={i} style={styles.cell}>
            <Animated.View style={{ transform: [{ scale: active ? pop.interpolate({ inputRange: [0, 1], outputRange: [1.08, 1.35] }) : 1 }] }}>
              {ch === '-' ? (
                <View style={{ height: size, justifyContent: 'center' }}>
                  <View style={[styles.restBar, { backgroundColor: color }]} />
                </View>
              ) : (
                <Icon name={ch === 'D' ? 'arrow-down' : 'arrow-up'} size={size} color={color} />
              )}
            </Animated.View>
            <Text style={{ fontFamily: fonts.displayMedium, fontSize: large ? 16 : 13, color: active ? colors.highlight : colors.textSubtle, fontWeight: i % 2 === 0 ? '700' : '400' }}>
              {counts[i]}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', paddingVertical: spacing.lg, borderRadius: radius.md },
  cell: { alignItems: 'center', gap: 4, minWidth: 28 },
  restBar: { width: 16, height: 3, borderRadius: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});

