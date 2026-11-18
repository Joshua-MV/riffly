import { useState } from 'react';
import { Animated, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';

import { useSpring } from './useSpring';

const RANGE = 50;

/**
 * Horizontal cents scale (−50 … +50) with a spring-driven marker. The in-tune window glows
 * olive; the marker turns olive inside it and terracotta outside.
 */
export function CentsStrip({ cents, inTune }: { cents: number | null; inTune: boolean }) {
  const { colors } = useTheme();
  const [w, setW] = useState(400);
  const clamped = cents === null ? 0 : Math.max(-RANGE, Math.min(RANGE, cents));
  const x = useSpring(clamped);
  const left = x.interpolate({ inputRange: [-RANGE, RANGE], outputRange: [0, w] });
  const ticks = Array.from({ length: 21 }, (_, i) => -RANGE + i * 5);
  const marker = cents === null ? colors.textSubtle : inTune ? colors.success : colors.danger;
  const zone = (3 / (2 * RANGE)) * w;

  return (
    <View
      role="meter"
      aria-valuemin={-RANGE}
      aria-valuemax={RANGE}
      aria-valuenow={cents === null ? undefined : Math.round(clamped)}
      accessibilityLabel={cents === null ? 'No note detected' : `${Math.round(cents)} cents ${cents < 0 ? 'flat' : 'sharp'}`}
      style={{ gap: 6 }}
    >
      <View style={styles.scale} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
        <View style={[styles.zone, { left: w / 2 - zone, width: zone * 2, backgroundColor: inTune ? colors.successSoft : colors.surfaceHover, borderColor: inTune ? colors.success : colors.border }]} />
        {ticks.map((t) => (
          <View
            key={t}
            style={[
              styles.tick,
              {
                left: ((t + RANGE) / (2 * RANGE)) * w - 0.5,
                height: t === 0 ? 30 : t % 25 === 0 ? 20 : 12,
                top: t === 0 ? 0 : t % 25 === 0 ? 5 : 9,
                backgroundColor: t === 0 ? colors.text : colors.borderStrong,
              },
            ]}
          />
        ))}
        <Animated.View style={[styles.marker, { backgroundColor: marker, transform: [{ translateX: Animated.add(left, new Animated.Value(-1.5)) }] }]} />
      </View>
      <View style={styles.labels}>
        {['-50', '-25', '0', '+25', '+50'].map((l) => (
          <Text key={l} variant="mono" tone="subtle" style={{ fontSize: 10 }}>{l}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scale: { height: 30, position: 'relative' },
  zone: { position: 'absolute', top: 2, bottom: 2, borderRadius: 3, borderWidth: 1 },
  tick: { position: 'absolute', width: 1 },
  marker: { position: 'absolute', left: 0, top: -4, width: 3, height: 38, borderRadius: 2 },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
});
