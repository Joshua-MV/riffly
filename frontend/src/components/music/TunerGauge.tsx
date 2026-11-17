import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

const RANGE = 50; // cents shown either side of centre
const SWEEP = 70; // degrees either side of centre

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

export interface TunerGaugeProps {
  /** Cents off target, or null when nothing is heard. */
  cents: number | null;
  inTune: boolean;
  width: number;
}

/** Analog-style needle gauge. Needle motion is spring-damped so it reads calmly. */
export function TunerGauge({ cents, inTune, width }: TunerGaugeProps) {
  const { colors } = useTheme();
  const angle = useRef(new Animated.Value(0)).current;
  const clamped = cents === null ? 0 : Math.max(-RANGE, Math.min(RANGE, cents));

  useEffect(() => {
    Animated.timing(angle, {
      toValue: (clamped / RANGE) * SWEEP,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [clamped, angle]);

  const h = width * 0.62;
  const cx = width / 2;
  const cy = h - 8;
  const r = Math.min(cx - 12, h - 20);
  const zone = (5 / RANGE) * SWEEP;
  const ticks = Array.from({ length: 21 }, (_, i) => -RANGE + i * 5);
  const needleColor = cents === null ? colors.textSubtle : inTune ? colors.success : colors.highlight;

  return (
    <View
      style={{ width, height: h }}
      role="meter"
      aria-valuemin={-RANGE}
      aria-valuemax={RANGE}
      aria-valuenow={cents === null ? undefined : Math.round(clamped)}
      accessibilityLabel={cents === null ? 'No note detected' : `${Math.round(cents)} cents ${cents < 0 ? 'flat' : 'sharp'}`}
    >
      <Svg width={width} height={h}>
        <Path d={arc(cx, cy, r, -SWEEP, SWEEP)} stroke={colors.border} strokeWidth={2} fill="none" />
        <Path d={arc(cx, cy, r, -zone, zone)} stroke={colors.success} strokeWidth={6} strokeLinecap="round" fill="none" opacity={inTune ? 1 : 0.45} />
        {ticks.map((t) => {
          const deg = (t / RANGE) * SWEEP;
          const major = t % 25 === 0;
          const a = polar(cx, cy, r - 10, deg);
          const b = polar(cx, cy, r - (major ? 26 : 18), deg);
          return <Line key={t} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={major ? colors.textMuted : colors.borderStrong} strokeWidth={major ? 2 : 1} />;
        })}
      </Svg>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.needleWrap,
          {
            left: cx - 2,
            top: cy - r + 6,
            height: (r - 6) * 2,
            transform: [{ rotate: angle.interpolate({ inputRange: [-180, 180], outputRange: ['-180deg', '180deg'] }) }],
          },
        ]}
      >
        <View style={[styles.needle, { height: r - 6, backgroundColor: needleColor }]} />
      </Animated.View>
      <Svg width={width} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Circle cx={cx} cy={cy} r={9} fill={needleColor} />
        <Circle cx={cx} cy={cy} r={3.5} fill={colors.background} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // The wrapper is twice the needle length so it rotates around the pivot at its centre.
  needleWrap: { position: 'absolute', width: 4, alignItems: 'center' },
  needle: { width: 4, borderRadius: 2 },
});
