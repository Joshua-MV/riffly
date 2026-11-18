import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  /** A value the handle snaps to when dragged near it (e.g. 100% speed). */
  detent?: number;
  onChange: (v: number) => void;
  label: string;
  format?: (v: number) => string;
}

/** Horizontal slider: amber fill, ivory handle, an optional detent tick. */
export function Slider({ value, min, max, step, detent, onChange, label, format }: SliderProps) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const origin = useRef(0);
  const toValue = (pageX: number) => {
    if (w <= 0) return value;
    const raw = min + Math.max(0, Math.min(1, (pageX - origin.current) / w)) * (max - min);
    let v = Math.round(raw / step) * step;
    if (detent !== undefined && Math.abs(raw - detent) < step * 0.8) v = detent;
    return Math.max(min, Math.min(max, Number(v.toFixed(4))));
  };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent) => {
          origin.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
          setDrag(toValue(e.nativeEvent.pageX));
        },
        onPanResponderMove: (e: GestureResponderEvent) => setDrag(toValue(e.nativeEvent.pageX)),
        onPanResponderRelease: (e: GestureResponderEvent) => {
          onChange(toValue(e.nativeEvent.pageX));
          setDrag(null);
        },
        onPanResponderTerminate: () => setDrag(null),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [w, min, max, step, detent, onChange],
  );
  const shown = drag ?? value;
  const frac = (shown - min) / (max - min);
  return (
    <View
      role="slider"
      accessibilityLabel={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={shown}
      aria-valuetext={format ? format(shown) : String(shown)}
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      {...responder.panHandlers}
      style={[styles.hit, { cursor: 'pointer' } as never]}
    >
      <View pointerEvents="none" style={[styles.track, { backgroundColor: colors.border }]}>
        <View style={[styles.fill, { width: `${frac * 100}%`, backgroundColor: colors.accent }]} />
      </View>
      {detent !== undefined && (
        <View pointerEvents="none" style={[styles.detent, { left: ((detent - min) / (max - min)) * w - 0.5, backgroundColor: colors.textSubtle }]} />
      )}
      <View pointerEvents="none" style={[styles.thumb, { left: frac * w - 7, backgroundColor: colors.text, borderColor: colors.surface }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 24, justifyContent: 'center' },
  track: { height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%' },
  detent: { position: 'absolute', width: 1, height: 12, top: 6 },
  thumb: { position: 'absolute', width: 14, height: 14, borderRadius: 7, top: 5, borderWidth: 2 },
});
