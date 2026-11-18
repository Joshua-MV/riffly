import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { Text } from '@/components/ui/Text';
import { formatTime } from '@/features/songs/timeline';
import { useTheme } from '@/theme/ThemeProvider';

export interface SeekBarProps {
  time: number;
  duration: number;
  onSeek: (t: number) => void;
  loop?: { start: number; end: number } | null;
  /** Transport style: times on either side of a thin bar. */
  inline?: boolean;
}

/**
 * Music-player style progress bar: tap anywhere to jump, or grab and drag (backwards or
 * forwards) and let go. While dragging, the bar follows your finger and the time preview
 * updates; the song only jumps when you release.
 */
export function SeekBar({ time, duration, onSeek, loop, inline = false }: SeekBarProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [hover, setHover] = useState(false);
  const originX = useRef(0);

  const timeAt = (pageX: number) => {
    if (width <= 0 || duration <= 0) return 0;
    return Math.min(duration, Math.max(0, ((pageX - originX.current) / width) * duration));
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          // Where the bar starts on screen = touch position minus its offset inside the bar.
          originX.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
          setDrag(timeAt(e.nativeEvent.pageX));
        },
        onPanResponderMove: (e: GestureResponderEvent) => setDrag(timeAt(e.nativeEvent.pageX)),
        onPanResponderRelease: (e: GestureResponderEvent) => {
          onSeek(timeAt(e.nativeEvent.pageX));
          setDrag(null);
        },
        onPanResponderTerminate: () => setDrag(null),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, duration, onSeek],
  );

  const shown = drag ?? time;
  const frac = duration > 0 ? Math.min(1, shown / duration) : 0;
  const active = drag !== null || hover;
  const x = (t: number) => (duration > 0 ? (t / duration) * width : 0);

  const bar = (
      <View
        role="slider"
        accessibilityLabel="Song position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={`${formatTime(shown)} of ${formatTime(duration)}`}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        {...responder.panHandlers}
        // Web/Windows only: grow the bar and show the handle on hover.
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={[styles.hit, inline && { flex: 1 }]}
      >
        <View pointerEvents="none" style={[styles.track, { height: active ? 4 : 3, backgroundColor: colors.border }]}>
          {loop && <View style={[styles.loop, { left: x(loop.start), width: x(loop.end) - x(loop.start), backgroundColor: colors.accent }]} />}
          <View style={[styles.fill, { width: `${frac * 100}%`, backgroundColor: colors.accent }]} />
        </View>
        {loop && <View pointerEvents="none" style={[styles.loopBox, { left: x(loop.start), width: Math.max(2, x(loop.end) - x(loop.start)), borderColor: colors.accent }]} />}
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            { left: frac * width - 6, backgroundColor: colors.text, borderColor: colors.backgroundRaised, transform: [{ scale: drag !== null ? 1.25 : active ? 1.1 : 1 }] },
          ]}
        />
      </View>
  );
  if (inline) {
    return (
      <View style={styles.inline}>
        <Text variant="mono" tone={drag !== null ? 'highlight' : 'muted'} style={styles.time}>{formatTime(shown)}</Text>
        {bar}
        <Text variant="mono" tone="subtle" style={styles.time}>{formatTime(duration)}</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 4 }}>
      {bar}
      <View style={styles.times}>
        <Text variant="caption" tone={drag !== null ? 'accent' : 'muted'} style={styles.mono}>{formatTime(shown)}</Text>
        <Text variant="caption" tone="muted" style={styles.mono}>-{formatTime(Math.max(0, duration - shown))}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 22, justifyContent: 'center', cursor: 'pointer' } as never,
  track: { borderRadius: 3, overflow: 'hidden', width: '100%' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  loop: { position: 'absolute', top: 0, bottom: 0, opacity: 0.3 },
  loopBox: { position: 'absolute', top: 4, bottom: 4, borderWidth: 1, borderRadius: 2, opacity: 0.8 },
  thumb: { position: 'absolute', width: 12, height: 12, borderRadius: 6, top: 5, borderWidth: 2 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  time: { fontSize: 12, minWidth: 38, textAlign: 'center' },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  mono: { fontVariant: ['tabular-nums'], letterSpacing: 0.2 } as never,
});
