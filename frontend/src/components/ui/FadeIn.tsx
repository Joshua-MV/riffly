import { useIsFocused } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

import { useSettings } from '@/features/settings/store';

/** The "settle" curve from the design: quick start, soft landing. */
export const SETTLE = Easing.bezier(0.2, 0.8, 0.2, 1);

/** Content that settles in: a short fade and a small rise (none with "reduce motion"). */
export function FadeIn({ children, delay = 0, rise = 10, style }: { children: ReactNode; delay?: number; rise?: number; style?: StyleProp<ViewStyle> }) {
  const { reduceMotion } = useSettings();
  const v = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(v, { toValue: 1, duration: 280, delay, easing: SETTLE, useNativeDriver: false }).start();
  }, [v, delay, reduceMotion]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** A list item that cascades in after the ones before it (the first ~10 only; the rest just appear). */
export function Stagger({ index, children, style }: { index: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <FadeIn delay={Math.min(index, 10) * 35} rise={8} style={style}>
      {children}
    </FadeIn>
  );
}

/**
 * Plays the page entrance each time a screen comes into view (tab screens stay mounted, so a
 * plain mount animation would only run once). Nothing is re-mounted: state and scroll stay.
 */
export function usePageEntrance() {
  const { reduceMotion } = useSettings();
  const focused = useIsFocused();
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (!focused || reduceMotion) return;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: first.current ? 320 : 240, easing: SETTLE, useNativeDriver: false }).start();
    first.current = false;
  }, [focused, reduceMotion, v]);
  return { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] };
}
