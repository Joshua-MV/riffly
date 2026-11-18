import { Icon } from '@/components/ui/Icon';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { Text } from '@/components/ui/Text';
import type { TunedString } from '@/lib/music/instruments';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

export interface HeadstockProps {
  strings: readonly TunedString[];
  /** String the tuner is listening to (auto-detected or locked), or null. */
  active: number | null;
  /** Locked string (tap a peg), or null for auto. */
  locked: number | null;
  state: 'flat' | 'sharp' | 'in-tune' | null;
  /** Cents off (for the peg's turning speed). */
  cents: number | null;
  stable: boolean;
  /** Strings that have been in tune this session (they get a tick). */
  done: ReadonlySet<number>;
  onPeg: (index: number) => void;
  width: number;
}

/**
 * A 3+3 guitar headstock. Each string runs from the nut to its tuning post; the pegs are the
 * buttons. The string being tuned glows and vibrates, and its peg turns the way you need to
 * turn it (faster when further off), then lights up green when it's in tune.
 */
export function Headstock({ strings, active, locked, state, cents, stable, done, onPeg, width }: HeadstockProps) {
  const { colors } = useTheme();
  const W = width;
  const H = W * 1.3;
  const cx = W / 2;
  const nutY = H * 0.6;
  const nutW = W * 0.24;
  const topW = W * 0.44;
  const rows = [H * 0.13, H * 0.28, H * 0.43];
  // Left side (top to bottom) carries strings 4, 5, 6 (D A E); right side strings 3, 2, 1 (G B E).
  const layout = [
    { index: 2, side: -1, row: 0 },
    { index: 1, side: -1, row: 1 },
    { index: 0, side: -1, row: 2 },
    { index: 3, side: 1, row: 0 },
    { index: 4, side: 1, row: 1 },
    { index: 5, side: 1, row: 2 },
  ];
  const postX = (side: number) => cx + side * W * 0.135;
  const pegX = (side: number) => cx + side * W * 0.36;
  const nutX = (i: number) => cx - nutW / 2 + nutW * (0.08 + (0.84 * i) / 5);
  const peg = W * 0.15;

  const body = [
    `M ${cx - nutW / 2 - 6} ${nutY}`,
    `C ${cx - nutW / 2 - 10} ${H * 0.62}, ${cx - topW / 2} ${H * 0.5}, ${cx - topW / 2} ${H * 0.24}`,
    `Q ${cx - topW / 2} ${H * 0.03}, ${cx - topW * 0.22} ${H * 0.02}`,
    `Q ${cx} ${H * 0.07}, ${cx + topW * 0.22} ${H * 0.02}`,
    `Q ${cx + topW / 2} ${H * 0.03}, ${cx + topW / 2} ${H * 0.24}`,
    `C ${cx + topW / 2} ${H * 0.5}, ${cx + nutW / 2 + 10} ${H * 0.62}, ${cx + nutW / 2 + 6} ${nutY}`,
    'Z',
  ].join(' ');

  return (
    <View style={{ width: W, height: H }}>
      <Svg width={W} height={H}>
        <Defs>
          <LinearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#262722" />
            <Stop offset="1" stopColor="#161714" />
          </LinearGradient>
        </Defs>
        {/* Neck below the nut, with frets */}
        <Rect x={cx - nutW / 2 - 4} y={nutY} width={nutW + 8} height={H - nutY} fill="#191A17" />
        {[0.2, 0.42, 0.62, 0.8].map((f) => (
          <Line key={f} x1={cx - nutW / 2 - 4} x2={cx + nutW / 2 + 4} y1={nutY + (H - nutY) * f} y2={nutY + (H - nutY) * f} stroke="#77766F" strokeWidth={1.5} opacity={0.7} />
        ))}
        <Circle cx={cx} cy={nutY + (H - nutY) * 0.52} r={2.5} fill="#77766F" opacity={0.7} />
        <Path d={body} fill="url(#wood)" stroke="#3E3F39" strokeWidth={1.2} />
        {/* Peg shafts */}
        {layout.map((l) => (
          <Line key={`sh${l.index}`} x1={postX(l.side)} y1={rows[l.row]} x2={pegX(l.side)} y2={rows[l.row]} stroke={colors.borderStrong} strokeWidth={5} strokeLinecap="round" />
        ))}
        {/* Strings: nut -> post, and down the neck */}
        {layout.map((l) => {
          const on = active === l.index;
          const color = on ? (state === 'in-tune' ? colors.success : colors.highlight) : colors.textSubtle;
          const width = 1 + (5 - l.index) * 0.35 + (on ? 1 : 0);
          return (
            <Line key={`st${l.index}`} x1={nutX(l.index)} y1={nutY} x2={postX(l.side)} y2={rows[l.row]} stroke={color} strokeWidth={width} opacity={on ? 1 : 0.7} />
          );
        })}
        {layout.map((l) => (
          <Circle key={`po${l.index}`} cx={postX(l.side)} cy={rows[l.row]} r={W * 0.026} fill="#D9D4C7" stroke="#1E1F1B" strokeWidth={1} />
        ))}
        <Rect x={cx - nutW / 2 - 4} y={nutY - 5} width={nutW + 8} height={7} rx={1} fill="#F2EEE4" />
      </Svg>

      {/* Strings down the neck: Views so the active one can vibrate smoothly. */}
      {strings.map((s) => (
        <NeckString
          key={s.index}
          x={nutX(s.index)}
          top={nutY + 2}
          height={H - nutY - 2}
          thickness={1 + (5 - s.index) * 0.35}
          active={active === s.index}
          vibrating={active === s.index && state !== null && !stable}
          color={active === s.index ? (state === 'in-tune' ? colors.success : colors.highlight) : colors.textSubtle}
        />
      ))}

      {layout.map((l) => {
        const s = strings[l.index];
        if (!s) return null;
        return (
          <Peg
            key={`pg${l.index}`}
            x={pegX(l.side) - peg / 2}
            y={rows[l.row] - peg / 2}
            size={peg}
            label={s.note.replace(/-?\d+$/, '')}
            number={6 - l.index}
            side={l.side}
            active={active === l.index}
            locked={locked === l.index}
            done={done.has(l.index)}
            state={active === l.index ? state : null}
            cents={active === l.index ? cents : null}
            stable={active === l.index && stable}
            onPress={() => onPeg(l.index)}
          />
        );
      })}
    </View>
  );
}

function NeckString({ x, top, height, thickness, active, vibrating, color }: { x: number; top: number; height: number; thickness: number; active: boolean; vibrating: boolean; color: string }) {
  const wobble = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!vibrating) {
      wobble.stopAnimation();
      Animated.timing(wobble, { toValue: 0, duration: 120, useNativeDriver: false }).start();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(wobble, { toValue: 1, duration: 38, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(wobble, { toValue: -1, duration: 76, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        Animated.timing(wobble, { toValue: 0, duration: 38, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [vibrating, wobble]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - (thickness + (active ? 1 : 0)) / 2,
        top,
        height,
        width: thickness + (active ? 1 : 0),
        backgroundColor: color,
        opacity: active ? 1 : 0.7,
        borderRadius: 1,
        transform: [{ translateX: wobble.interpolate({ inputRange: [-1, 1], outputRange: [-1.6, 1.6] }) }, { scaleX: wobble.interpolate({ inputRange: [-1, 0, 1], outputRange: [2.2, 1, 2.2] }) }],
      }}
    />
  );
}

interface PegProps {
  x: number;
  y: number;
  size: number;
  label: string;
  number: number;
  side: number;
  active: boolean;
  locked: boolean;
  done: boolean;
  state: 'flat' | 'sharp' | 'in-tune' | null;
  cents: number | null;
  stable: boolean;
  onPress: () => void;
}

function Peg({ x, y, size, label, number, side, active, locked, done, state, cents, stable, onPress }: PegProps) {
  const { colors } = useTheme();
  const spin = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  // Flat: tighten. On a 3+3 headstock seen from the front, tightening turns the left pegs
  // anticlockwise and the right pegs clockwise (the string winds onto the post).
  const turning = active && (state === 'flat' || state === 'sharp');
  const dir = (state === 'flat' ? 1 : -1) * (side > 0 ? 1 : -1);
  const speed = cents === null ? 0 : Math.abs(cents) > 25 ? 700 : Math.abs(cents) > 10 ? 1200 : 2000;

  useEffect(() => {
    if (!turning) {
      spin.stopAnimation();
      spin.setValue(0);
      return;
    }
    spin.setValue(0);
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: speed, easing: Easing.linear, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [turning, speed, dir, spin]);

  useEffect(() => {
    Animated.timing(glow, { toValue: stable ? 1 : active ? 0.5 : 0, duration: 220, useNativeDriver: false }).start();
  }, [stable, active, glow]);

  const ring = stable || (done && !active) ? colors.success : active ? (state === 'in-tune' ? colors.success : colors.highlight) : locked ? colors.accent : colors.borderStrong;
  return (
    <Pressable
      role="radio"
      accessibilityState={{ checked: locked }}
      accessibilityLabel={`String ${number}, ${label}${locked ? ', locked' : ''}${done ? ', tuned' : ''}. ${locked ? 'Tap to go back to auto' : 'Tap to tune only this string'}`}
      onPress={onPress}
      style={({ pressed }) => [styles.pegHit, { left: x - 6, top: y - 6, width: size + 12, height: size + 12, transform: [{ scale: pressed ? 0.93 : 1 }] }]}
    >
      <Animated.View
        style={[
          styles.glow,
          {
            width: size + 12,
            height: size + 12,
            borderRadius: (size + 12) / 2,
            backgroundColor: stable ? colors.success : colors.highlight,
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.28] }),
          },
        ]}
      />
      <Animated.View
        style={[
          styles.peg,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: ring,
            borderStyle: active || locked || stable ? 'solid' : 'dashed',
            backgroundColor: '#1E1F1B',
            transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${dir * 360}deg`] }) }],
          },
        ]}
      >
        {/* Knurled face with an indicator line, so the turn is visible. */}
        <View style={[styles.face, { width: size - 10, height: size - 10, borderRadius: (size - 10) / 2, backgroundColor: '#2B2C27', borderColor: '#4A4B44' }]}>
          <View style={[styles.indicator, { height: size * 0.32, backgroundColor: active || stable ? ring : '#B3B0A6', transform: [{ rotate: '35deg' }] }]} />
        </View>
      </Animated.View>
      <View style={[styles.noteTag, { top: size + 6 }]} pointerEvents="none">
        <Text variant="mono" style={{ fontSize: 10, color: stable || (done && !active) ? colors.success : active ? colors.highlight : colors.textSubtle }}>{label}</Text>
      </View>
      {(stable || (done && !active)) && (
        <View style={[styles.badge, { backgroundColor: colors.success }]} pointerEvents="none">
          <Icon name="checkmark" size={11} color={colors.background} />
        </View>
      )}
      {turning && (
        <View style={[styles.turn, { top: size + 20, left: (size + 12) / 2 - 40 }]} pointerEvents="none">
          <Icon name="refresh" size={14} color={colors.highlight} style={{ transform: [{ scaleX: dir > 0 ? 1 : -1 }] }} />
          <Text variant="caption" style={{ color: colors.highlight, fontWeight: '700' }}>{state === 'flat' ? 'tighten' : 'loosen'}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pegHit: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute' },
  peg: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  face: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  indicator: { width: 2, borderRadius: 1, position: 'absolute', top: 3 },
  noteTag: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 0, right: 0, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  turn: { position: 'absolute', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, width: 80 },
});
