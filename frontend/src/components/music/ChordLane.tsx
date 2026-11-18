import { Icon } from '@/components/ui/Icon';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { PlaybackClock } from '@/features/player/clock';
import { laneState, strumSlots, type LaneChord } from '@/features/songs/lane';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, spacing } from '@/theme/tokens';

const PAST = 1.6; // seconds visible behind the playhead
const AHEAD = 6.4; // seconds visible ahead of it
const MARGIN = 3; // extra seconds rendered on both sides so blocks slide in, not pop in

export interface ChordLaneProps {
  chords: readonly LaneChord[];
  beats: readonly number[];
  /** Beat index (mod 4) that starts a bar. */
  barOffset: number;
  clock: PlaybackClock;
  /** Strum pattern for one bar of eighth notes ("D-DU-UDU"), drawn under the chords. */
  strum?: string | null;
  onSeek: (t: number) => void;
  height?: number;
  /** The "C ●●○○ … switch in 2 D" line under the lane (Play Along has its own cards). */
  showStatus?: boolean;
}

/**
 * The chord strip scrolls right-to-left under a fixed playhead. Each block is as long as the
 * chord lasts, with its beats marked; whatever has passed the playhead is dimmed, so the
 * current chord visibly "fills up". The countdown says how many beats are left before the
 * change, and the next chord is waiting right behind.
 *
 * Positions come from the smooth playback clock and are applied as a transform (no React
 * re-render per frame); React only re-renders once per beat.
 */
export function ChordLane({ chords, beats, barOffset, clock, strum, onSeek, height = 84, showStatus = true }: ChordLaneProps) {
  const { colors } = useTheme();
  const win = useWindowDimensions();
  const [width, setWidth] = useState(() => Math.min(win.width, 1100) - 64);
  const pps = width / (PAST + AHEAD);
  const playheadX = PAST * pps;

  // Coarse state (changes a few times a second at most).
  const [tick, setTick] = useState(() => laneState(chords, beats, clock.now()));
  const tx = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const lastBeat = useRef(tick.beatIndex);
  const lastChord = useRef(tick.currentIndex);

  useEffect(
    () =>
      clock.subscribe((t) => {
        tx.setValue(playheadX - t * pps);
        const next = laneState(chords, beats, t);
        if (next.beatIndex !== lastBeat.current || next.currentIndex !== lastChord.current || Math.abs(next.time - tick.time) > 1) {
          const changed = next.currentIndex !== lastChord.current;
          lastBeat.current = next.beatIndex;
          lastChord.current = next.currentIndex;
          setTick(next);
          if (clock.playing()) {
            pulse.setValue(changed ? 1 : 0.45);
            Animated.timing(pulse, { toValue: 0, duration: changed ? 420 : 240, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
          }
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clock, chords, beats, pps, playheadX],
  );

  const t = tick.time;
  const from = t - PAST - MARGIN;
  const to = t + AHEAD + MARGIN;
  const visible = useMemo(() => chords.filter((c) => c.label !== 'N' && c.end > from && c.start < to), [chords, from, to]);
  const visibleBeats = useMemo(() => {
    const out: { t: number; bar: boolean; n: number }[] = [];
    beats.forEach((b, i) => {
      if (b > from && b < to) out.push({ t: b, bar: (((i - barOffset) % 4) + 4) % 4 === 0, n: Math.floor((i - barOffset) / 4) + 1 });
    });
    return out;
  }, [beats, barOffset, from, to]);
  const slots = useMemo(() => (strum ? strumSlots(beats, barOffset, strum, from, to) : []), [beats, barOffset, strum, from, to]);

  const current = tick.currentIndex >= 0 ? chords[tick.currentIndex] : null;
  const next = tick.nextIndex >= 0 ? chords[tick.nextIndex] : null;
  const switchSoon = current && next && tick.beatsLeft <= 3 && tick.beatsLeft >= 0;
  const laneHeight = height + (strum ? 26 : 0);

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={[styles.lane, { height: laneHeight, backgroundColor: colors.surfaceSunken, borderColor: colors.border }]}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessibilityLabel={current ? `Playing ${current.label}, ${tick.beatsLeft} beats until ${next?.label ?? 'the end'}` : 'Chord lane'}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateX: tx }] }]}>
          {visibleBeats.map((b) => (
            <View key={b.t} pointerEvents="none" style={[styles.beat, { left: b.t * pps, width: 1, backgroundColor: b.bar ? colors.borderStrong : colors.divider }]}>
              {b.bar && b.n > 0 && (
                <Text variant="mono" style={[styles.barNo, { color: colors.textSubtle }]}>{b.n}</Text>
              )}
            </View>
          ))}
          {visible.map((c) => {
            const isCurrent = c === current;
            const isNext = c === next;
            return (
              <Pressable
                key={`${c.start}-${c.label}`}
                onPress={() => onSeek(c.start)}
                accessibilityLabel={`${c.label} at ${Math.floor(c.start / 60)}:${String(Math.floor(c.start % 60)).padStart(2, '0')}. Jump here`}
                style={[
                  styles.block,
                  {
                    height: height - 26,
                    left: c.start * pps + 1,
                    width: Math.max(6, (c.end - c.start) * pps - 2),
                    backgroundColor: isCurrent ? colors.highlightSoft : 'transparent',
                    borderColor: isCurrent ? colors.accent : isNext ? colors.borderStrong : 'transparent',
                  },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: fonts.display,
                    fontSize: isCurrent ? 26 : 22,
                    color: isCurrent ? colors.highlight : isNext ? colors.text : colors.textMuted,
                    paddingHorizontal: spacing.sm,
                  }}
                >
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
          {slots.map((s) => (
            <View key={s.t} pointerEvents="none" style={[styles.slot, { left: s.t * pps - 8, top: height - 2 }]}>
              {s.stroke === '-' ? (
                <View style={[styles.rest, { backgroundColor: colors.border }]} />
              ) : (
                <Icon name={s.stroke === 'D' ? 'arrow-down' : 'arrow-up'} size={s.onBeat ? 17 : 14} color={s.onBeat ? colors.text : colors.textMuted} />
              )}
            </View>
          ))}
        </Animated.View>

        {/* Everything left of the playhead has been played: dim it. */}
        <View pointerEvents="none" style={[styles.past, { width: playheadX, backgroundColor: colors.surfaceSunken }]} />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            {
              left: playheadX - 14,
              backgroundColor: colors.highlight,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }),
              transform: [{ scaleX: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.4] }) }],
            },
          ]}
        />
        <View pointerEvents="none" style={[styles.playhead, { left: playheadX - 1, backgroundColor: colors.accent }]}>
          <View style={[styles.playheadCap, { backgroundColor: colors.accent }]} />
        </View>
      </View>

      {showStatus && <View style={styles.status} aria-live="polite">
        {current ? (
          <>
            <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.highlight }}>{current.label}</Text>
            <BeatDots total={tick.beatsTotal} done={tick.beatsTotal - tick.beatsLeft} />
            <View style={{ flex: 1 }} />
            {next && (
              <View style={styles.nextBox}>
                <Text variant="caption" tone={switchSoon ? 'highlight' : 'muted'} style={{ fontWeight: switchSoon ? '700' : '400' }}>
                  {tick.beatsLeft === 0 ? 'switch now' : switchSoon ? `switch in ${tick.beatsLeft}` : `${tick.beatsLeft} beats, then`}
                </Text>
                <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.accent }}>{next.label}</Text>
              </View>
            )}
          </>
        ) : (
          <Text variant="caption" tone="muted">{next ? `First chord: ${next.label}` : 'No chords here'}</Text>
        )}
      </View>}
    </View>
  );
}

/** One dot per beat of the current chord; filled dots have been played. */
function BeatDots({ total, done }: { total: number; done: number }) {
  const { colors } = useTheme();
  if (total <= 0) return null;
  const n = Math.min(total, 16);
  return (
    <View style={styles.dots} accessibilityLabel={`Beat ${Math.min(done, total)} of ${total}`}>
      {Array.from({ length: n }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            {
              backgroundColor: i < done ? colors.highlight : 'transparent',
              borderColor: i < done ? colors.highlight : colors.borderStrong,
              transform: [{ scale: i === done - 1 ? 1.25 : 1 }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  lane: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  beat: { position: 'absolute', top: 0, bottom: 0 },
  barNo: { position: 'absolute', top: 3, left: 5, fontSize: 10, width: 40 },
  block: { position: 'absolute', top: 18, borderRadius: radius.xs, borderWidth: 1, justifyContent: 'center', overflow: 'hidden' },
  slot: { position: 'absolute', width: 16, height: 22, alignItems: 'center', justifyContent: 'center' },
  rest: { width: 6, height: 2, borderRadius: 1 },
  past: { position: 'absolute', left: 0, top: 0, bottom: 0, opacity: 0.55 },
  glow: { position: 'absolute', top: 0, bottom: 0, width: 28, borderRadius: 14 },
  playhead: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  playheadCap: { position: 'absolute', top: 0, left: -3, width: 8, height: 8, borderRadius: 4 },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap', minHeight: 30 },
  nextBox: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  dots: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5 },
});
