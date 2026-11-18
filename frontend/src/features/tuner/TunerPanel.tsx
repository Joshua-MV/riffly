import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { Icon } from '@/components/ui/Icon';
import type { PressState } from '@/components/ui/pressState';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

/** Small engraved panel screws in the four corners. */
export function Screws() {
  const { colors } = useTheme();
  const s = { position: 'absolute' as const, width: 5, height: 5, borderRadius: 3, backgroundColor: colors.border };
  return (
    <>
      <View pointerEvents="none" style={[s, { top: 9, left: 9 }]} />
      <View pointerEvents="none" style={[s, { top: 9, right: 9 }]} />
      <View pointerEvents="none" style={[s, { bottom: 9, left: 9 }]} />
      <View pointerEvents="none" style={[s, { bottom: 9, right: 9 }]} />
    </>
  );
}

/** Fourteen rising bars: the mic input level. */
export function LevelMeter({ db }: { db: number | null }) {
  const { colors } = useTheme();
  const lit = db === null ? 0 : Math.round(Math.max(0, Math.min(1, (db + 60) / 54)) * 14);
  return (
    <View style={{ flexDirection: 'row', gap: 2, alignItems: 'flex-end', height: 14 }} accessibilityLabel={db === null ? 'Microphone off' : `Input level ${Math.round(db)} decibels`}>
      {Array.from({ length: 14 }, (_, i) => (
        <View key={i} style={{ width: 4, height: 4 + i * 0.75, borderRadius: 1, backgroundColor: i < lit ? (i < 10 ? colors.success : colors.accent) : colors.divider }} />
      ))}
    </View>
  );
}

/**
 * A strobe: stripes drift left when flat and right when sharp, faster the further off you are,
 * and stand still when the string is in tune.
 */
export function Strobe({ cents, inTune, live, reduceMotion }: { cents: number | null; inTune: boolean; live: boolean; reduceMotion: boolean }) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const [x, setX] = useState(0);
  const centsRef = useRef(cents);
  centsRef.current = cents;
  const moving = live && cents !== null && !inTune && !reduceMotion;
  useEffect(() => {
    if (!moving) return;
    let raf = 0;
    let last = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      setX((v) => (v + (centsRef.current ?? 0) * 0.35 * (dt / 45)) % 24);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [moving]);
  const col = !live || cents === null ? '#2C2D28' : inTune ? 'rgba(143,160,127,0.55)' : cents < 0 ? 'rgba(197,138,69,0.6)' : 'rgba(201,122,99,0.6)';
  const off = ((x % 24) + 24) % 24;
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      style={{ height: 44, borderRadius: 6, borderWidth: 1, borderColor: colors.divider, backgroundColor: '#191A16', overflow: 'hidden' }}
    >
      {w > 0 && (
        <Svg width={w} height={44}>
          {Array.from({ length: Math.ceil(w / 24) + 2 }, (_, i) => (
            <Rect key={i} x={i * 24 + off - 24} y={0} width={10} height={44} fill={col} />
          ))}
        </Svg>
      )}
      <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: -4, bottom: -4, width: 2, marginLeft: -1, backgroundColor: colors.text, opacity: 0.7 }} />
    </View>
  );
}

/** A mono readout with faint "888.88" segments behind it, like a hardware display. */
export function Readout({ label, value, ghost, color, align }: { label: string; value: string; ghost: string; color: string; align: 'left' | 'center' | 'right' }) {
  const items = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
  const text = { fontFamily: fonts.mono, fontSize: 26, lineHeight: 28, fontVariant: ['tabular-nums' as const] };
  return (
    <View style={{ flex: 1, gap: 6, alignItems: items }}>
      <Text variant="overline" tone="subtle" style={{ fontSize: 10, letterSpacing: 1.6 }}>{label}</Text>
      <View>
        <Text style={[text, { color: '#2C2D28', textAlign: align }]} aria-hidden>{ghost}</Text>
        <Text style={[text, { color, textAlign: align, position: 'absolute', left: 0, right: 0, top: 0 }]}>{value}</Text>
      </View>
    </View>
  );
}

/** The mic button; it breathes while waiting so it's clear where to start. */
export function MicButton({ live, onPress, reduceMotion, busy }: { live: boolean; onPress: () => void; reduceMotion: boolean; busy: boolean }) {
  const { colors } = useTheme();
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (live || reduceMotion) {
      breathe.stopAnimation();
      breathe.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.timing(breathe, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.sin), useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [live, reduceMotion, breathe]);
  return (
    <View style={{ width: 60, height: 60 }}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 30,
          backgroundColor: colors.accent,
          opacity: breathe.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.45, 0, 0] }),
          transform: [{ scale: breathe.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.4, 1.4] }) }],
        }}
      />
      <MicFace live={live} onPress={onPress} busy={busy} />
    </View>
  );
}

function MicFace({ live, onPress, busy }: { live: boolean; onPress: () => void; busy: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={live ? 'Stop listening' : 'Start listening'}
      style={({ hovered }: PressState) => ({
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: live ? (hovered ? colors.surfaceHover : 'transparent') : hovered ? colors.accentPressed : colors.accent,
        borderWidth: live ? 1.5 : 0,
        borderColor: '#5A5952',
        opacity: busy ? 0.6 : 1,
      })}
    >
      {live ? <View style={{ width: 16, height: 16, borderRadius: 2, backgroundColor: colors.text }} /> : <Icon name="mic" size={24} color={colors.onAccent} />}
    </Pressable>
  );
}
