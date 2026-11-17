import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import { Text } from '@/components/ui/Text';
import { beatsLeft, chordProgress, laneWindow, type LaneChord } from '@/features/songs/lane';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, spacing } from '@/theme/tokens';

const PAST = 1.5; // seconds visible behind the playhead
const AHEAD = 6.5; // seconds visible ahead of it

export interface ChordLaneProps {
  chords: readonly LaneChord[];
  beats: readonly number[];
  time: number;
  onSeek: (t: number) => void;
  height?: number;
}

/**
 * A strip of chord blocks moving right-to-left under a fixed playhead. Block width = how long
 * the chord lasts; ticks inside are its beats. The block under the playhead fills up as you
 * play it, and the next chord sits right after it, so you can see exactly when to switch.
 */
export function ChordLane({ chords, beats, time, onSeek, height = 76 }: ChordLaneProps) {
  const { colors } = useTheme();
  const win = useWindowDimensions();
  const [width, setWidth] = useState(() => Math.min(win.width, 1100) - 64);
  const pps = width / (PAST + AHEAD);
  const playheadX = PAST * pps;
  const visible = laneWindow(chords, time, PAST, AHEAD);
  const current = chords.find((c) => c.label !== 'N' && c.start <= time && time < c.end) ?? null;
  const next = chords.find((c) => c.label !== 'N' && c.start >= (current?.end ?? time) - 0.01 && c !== current) ?? null;
  const left = current ? beatsLeft(beats, time, current.end) : 0;
  const secondsLeft = current ? current.end - time : 0;
  const visibleBeats = useMemo(() => beats.filter((b) => b > time - PAST && b < time + AHEAD), [beats, time]);

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={[styles.lane, { height, backgroundColor: colors.surfaceSunken, borderColor: colors.border }]}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessibilityLabel={current ? `Playing ${current.label}, ${left} beats until ${next?.label ?? 'the end'}` : 'Chord lane'}
      >
        {/* Beat grid */}
        {visibleBeats.map((b) => (
          <View key={b} pointerEvents="none" style={[styles.beat, { left: (b - time + PAST) * pps, backgroundColor: colors.border }]} />
        ))}
        {visible.map((c) => {
          const x = (c.start - time + PAST) * pps;
          const w = Math.max(6, (c.end - c.start) * pps - 4);
          const isCurrent = c === current;
          const isNext = c === next;
          const fill = isCurrent ? chordProgress(c, time) : c.end <= time ? 1 : 0;
          return (
            <Pressable
              key={`${c.start}-${c.label}`}
              onPress={() => onSeek(c.start)}
              accessibilityLabel={`${c.label} at ${Math.floor(c.start / 60)}:${String(Math.floor(c.start % 60)).padStart(2, '0')}. Jump here`}
              style={[
                styles.block,
                {
                  left: x + 2,
                  width: w,
                  backgroundColor: isCurrent ? colors.highlightSoft : colors.surface,
                  borderColor: isCurrent ? colors.highlight : isNext ? colors.accent : colors.border,
                  borderWidth: isCurrent || isNext ? 2 : 1,
                  opacity: c.end <= time ? 0.45 : 1,
                },
              ]}
            >
              <View pointerEvents="none" style={[styles.fill, { width: `${fill * 100}%`, backgroundColor: isCurrent ? colors.highlight : colors.borderStrong, opacity: isCurrent ? 0.35 : 0.25 }]} />
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: fonts.display,
                  fontSize: isCurrent ? 22 : 17,
                  color: isCurrent ? colors.highlight : isNext ? colors.accent : colors.text,
                  paddingHorizontal: spacing.sm,
                }}
              >
                {c.label}
              </Text>
            </Pressable>
          );
        })}
        <View pointerEvents="none" style={[styles.playhead, { left: playheadX - 1, backgroundColor: colors.text }]}>
          <View style={[styles.playheadCap, { backgroundColor: colors.text }]} />
        </View>
      </View>

      <View style={styles.status} aria-live="polite">
        {current ? (
          <>
            <Text variant="bodyStrong" style={{ color: colors.highlight }}>{current.label}</Text>
            <Text variant="caption" tone={left <= 1 ? 'highlight' : 'muted'}>
              {left === 0 ? 'change now' : `${left} ${left === 1 ? 'beat' : 'beats'} left`} · {secondsLeft.toFixed(1)}s
            </Text>
            <View style={{ flex: 1 }} />
            {next && (
              <>
                <Text variant="caption" tone="muted">next</Text>
                <Text variant="bodyStrong" tone="accent">{next.label}</Text>
              </>
            )}
          </>
        ) : (
          <Text variant="caption" tone="muted">{next ? `First chord: ${next.label}` : 'No chords here'}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lane: { borderRadius: radius.md, borderWidth: 1, overflow: 'hidden', position: 'relative' },
  beat: { position: 'absolute', top: 0, bottom: 0, width: 1 },
  block: { position: 'absolute', top: 10, bottom: 10, borderRadius: radius.sm, justifyContent: 'center', overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  playhead: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  playheadCap: { position: 'absolute', top: 0, left: -4, width: 10, height: 6, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 },
  status: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
});
