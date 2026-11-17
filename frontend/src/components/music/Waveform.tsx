import { memo, useState } from 'react';
import { Pressable, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

export interface WaveformProps {
  peaks: readonly number[];
  duration: number;
  currentTime: number;
  loop: { start: number; end: number } | null;
  /** Chord-change times, drawn as subtle ticks. */
  markers?: readonly number[];
  onSeek: (time: number) => void;
  height?: number;
}

const BAR = 3;
const GAP = 2;

const Bars = memo(function Bars({ peaks, width, height, color }: { peaks: readonly number[]; width: number; height: number; color: string }) {
  const count = Math.max(1, Math.floor(width / (BAR + GAP)));
  const step = peaks.length / count;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        let peak = 0;
        for (let j = Math.floor(i * step); j < Math.floor((i + 1) * step) && j < peaks.length; j++) peak = Math.max(peak, peaks[j]);
        const h = Math.max(2, peak * (height - 4));
        return <Rect key={i} x={i * (BAR + GAP)} y={(height - h) / 2} width={BAR} height={h} rx={1.5} fill={color} />;
      })}
    </>
  );
});

/** Seekable waveform. Played portion is tinted by clipping a second copy of the bars. */
export function Waveform({ peaks, duration, currentTime, loop, markers = [], onSeek, height = 72 }: WaveformProps) {
  const { colors } = useTheme();
  const window = useWindowDimensions();
  // Window-based first guess so the waveform draws before (or without) a layout event.
  const [width, setWidth] = useState(() => Math.max(200, Math.min(window.width, 1200) / 2 - 64));
  const x = (t: number) => (duration > 0 ? (t / duration) * width : 0);
  const playedWidth = Math.min(width, x(currentTime));

  return (
    <Pressable
      role="slider"
      accessibilityLabel="Song position"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(currentTime)}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      onPress={(e) => width > 0 && onSeek((e.nativeEvent.locationX / width) * duration)}
      style={{ height, width: '100%' }}
    >
      {width > 0 && (
        <View pointerEvents="none" style={{ width, height }}>
          {loop && (
            <View style={{ position: 'absolute', left: x(loop.start), width: x(loop.end) - x(loop.start), top: 0, bottom: 0, backgroundColor: colors.highlightSoft, borderRadius: 6 }} />
          )}
          <Svg width={width} height={height} style={{ position: 'absolute' }}>
            <Bars peaks={peaks} width={width} height={height} color={colors.border} />
            {markers.map((m, i) => (
              <Rect key={i} x={x(m)} y={0} width={1} height={6} fill={colors.textSubtle} />
            ))}
          </Svg>
          <View style={{ position: 'absolute', width: playedWidth, height, overflow: 'hidden' }}>
            <Svg width={width} height={height}>
              <Bars peaks={peaks} width={width} height={height} color={colors.accent} />
            </Svg>
          </View>
          <View style={{ position: 'absolute', left: playedWidth - 1, top: 0, bottom: 0, width: 2, borderRadius: 1, backgroundColor: colors.text }} />
        </View>
      )}
    </Pressable>
  );
}
