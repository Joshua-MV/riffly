import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { getSettings } from '@/features/settings/store';
import { brand } from '@/theme/tokens';

import { LogoMark, Wordmark } from './Logo';

const RING_MS = 1100;

/**
 * The launch screen: the lamp and wordmark on charcoal; the string rings once and settles
 * (the logo's only animation), then the app fades in underneath.
 */
export function LaunchSplash() {
  const reduce = getSettings().reduceMotion;
  const [amp, setAmp] = useState(reduce ? 1 : 0);
  const [gone, setGone] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const step = () => {
      const t = (performance.now() - start) / 1000;
      // A plucked string: big first swing, decaying to the logo's resting shape.
      setAmp(1 + 1.3 * Math.exp(-3.6 * t) * Math.cos(2 * Math.PI * 2.4 * t));
      if (t * 1000 < RING_MS) raf = requestAnimationFrame(step);
      else setAmp(1);
    };
    if (!reduce) raf = requestAnimationFrame(step);
    const out = setTimeout(
      () =>
        Animated.timing(fade, { toValue: 0, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: false }).start(() => setGone(true)),
      reduce ? 350 : RING_MS + 150,
    );
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(out);
    };
  }, [fade, reduce]);

  if (gone) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap, { opacity: fade }]}>
      <View style={styles.row}>
        <LogoMark bare size={96} amp={amp} />
        <Wordmark size={64} color={brand.ivory} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: brand.charcoal, alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 22 },
});
