import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ChordDiagram } from '@/components/music/ChordDiagram';
import { ChordLane } from '@/components/music/ChordLane';
import { Waveform } from '@/components/music/Waveform';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Card, Label, SegmentedControl, Stepper } from '@/components/ui/primitives';
import type { PressState } from '@/components/ui/pressState';
import { Text } from '@/components/ui/Text';
import { parseChord } from '@/lib/music/chords';
import { getVoicings } from '@/lib/music/voicings';
import { useSettings } from '@/features/settings/store';
import { useTheme } from '@/theme/ThemeProvider';
import { useLayout } from '@/theme/useLayout';
import { fonts, radius, spacing } from '@/theme/tokens';

import { laneState } from '../lane';
import { formatTime } from '../timeline';
import type { SongPractice } from '../useSongPractice';

import { slotAt } from '../components/StrumPanel';
import { StrumGlyphs, StrumKey } from './StrumGlyphs';
import { StrumPicker } from './StrumPicker';

type Extra = 'chords' | 'strum';

/** Play Along: the chord now, the change coming, the strum, the lane and the practice dock. */
export function PlayAlong({ s }: { s: SongPractice }) {
  const { colors } = useTheme();
  const { isPhone } = useLayout();
  const { practice, player, ctx } = s;
  const [extra, setExtra] = useState<Extra>(practice.showStrum === false ? 'chords' : 'strum');
  const lane = useMemo(() => s.timeline.map((c) => ({ start: c.start, end: c.end, label: c.label === 'N' ? 'N' : c.display })), [s.timeline]);
  const st = laneState(lane, s.beats, s.time);
  const now = st.currentIndex >= 0 ? lane[st.currentIndex] : null;
  const next = st.nextIndex >= 0 ? lane[st.nextIndex] : null;
  const after = st.nextIndex >= 0 ? lane.slice(st.nextIndex + 1).find((c) => c.label !== 'N') : undefined;
  // Before the first chord (or in a gap): count the beats until the next one starts.
  const beatsToNext = now ? st.beatsLeft : next ? s.beats.filter((b) => b > s.time + 0.02 && b < next.start - 0.06).length + 1 : 0;
  const ringTotal = now ? Math.max(1, st.beatsTotal) : Math.max(4, beatsToNext);
  const shown = now ?? next;
  const bar = s.barAt(s.time);
  const bpm = s.result.bpm ? Math.round(s.result.bpm * player.rate) : null;
  const playing = (s.isLoaded && player.playing) || s.countIn !== null;

  const voicing = (label: string | null | undefined) => {
    const sym = label ? parseChord(label) : null;
    return sym ? getVoicings(sym, ctx.shapeMidi)[0] : undefined;
  };
  const nowVoicing = voicing((now ?? next)?.label);

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={styles.context}>
        <View style={styles.titleRow}>
          <Text variant="title" numberOfLines={1} style={{ fontSize: 28, lineHeight: 34, flexShrink: 1 }}>{s.song.title}</Text>
          <View style={[styles.barChip, { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}>
            <Text variant="overline" tone="highlight" style={{ fontSize: 10 }}>Bar {bar} / {s.totalBars}</Text>
          </View>
        </View>
        <View style={styles.contextRight}>
          <SegmentedControl<Extra>
            label="What to show with the chords"
            value={extra}
            onChange={setExtra}
            options={[{ value: 'chords', label: 'Chords' }, { value: 'strum', label: '+ Strum' }]}
          />
          <Stepper
            label="capo"
            value={practice.capo ? `Capo ${practice.capo}${s.shapeKey ? ` · ${s.shapeKey}` : ''}` : 'No capo'}
            onMinus={() => s.setPractice({ capo: Math.max(0, practice.capo - 1) })}
            onPlus={() => s.setPractice({ capo: Math.min(9, practice.capo + 1) })}
            minusDisabled={practice.capo === 0}
            plusDisabled={practice.capo >= 9}
          />
        </View>
      </View>

      <View style={[styles.cards, { flexDirection: isPhone ? 'column' : 'row' }]}>
        <Card style={[styles.nowCard, { flex: 2 }]}>
          <View style={{ flex: 1, gap: spacing.md }}>
            <Text variant="overline" tone="subtle">{s.countIn ? 'Get ready' : !now && next ? 'First chord' : practice.capo ? `Now · capo ${practice.capo}` : 'Now'}</Text>
            <Swap value={s.countIn ? String(s.countIn) : shown?.label ?? ''} kind="pop">
              <Text
                aria-live="polite"
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ fontFamily: fonts.display, fontSize: isPhone ? 110 : 168, lineHeight: isPhone ? 110 : 164, letterSpacing: -5, color: s.countIn ? colors.highlight : now ? colors.accent : colors.textDisabled }}
              >
                {s.countIn ? String(s.countIn) : shown?.label ?? ''}
              </Text>
            </Swap>
            <View style={styles.lamps}>
              {[1, 2, 3, 4].map((b) => (
                <BeatLamp key={b} on={(s.countIn ?? s.beat) === b} past={(s.countIn ?? s.beat ?? 0) > b} />
              ))}
              <Text variant="overline" tone="subtle" style={{ marginLeft: spacing.sm }}>{s.beat ? `Beat ${s.beat} / 4` : playing ? 'Counting…' : 'Paused'}</Text>
            </View>
          </View>
          {nowVoicing && !s.countIn && (
            <View style={{ alignItems: 'center', gap: 4 }}>
              <ChordDiagram voicing={nowVoicing} width={isPhone ? 110 : 140} tone="highlight" />
              <Text variant="overline" tone="subtle" style={{ fontSize: 10 }}>{shown?.label} · {nowVoicing.shape === 'open' ? 'Open' : nowVoicing.shape}</Text>
            </View>
          )}
        </Card>

        <Card style={[styles.nextCard, { flex: 1 }]}>
          <Text variant="overline" tone="subtle">Next · change in</Text>
          <View style={styles.nextRow}>
            <CountdownRing left={next ? beatsToNext : 0} total={ringTotal} />
            <Swap value={`${next?.label ?? 'End'}@${next?.start ?? 0}`} kind="slide" style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 64, lineHeight: 68, color: colors.text }} numberOfLines={1} adjustsFontSizeToFit>{next?.label ?? 'End'}</Text>
            </Swap>
          </View>
          <Text variant="caption" tone="subtle">{after ? `then ${after.label} · watch the ring, not the clock` : next ? 'watch the ring, not the clock' : 'End of the song'}</Text>
        </Card>
      </View>

      {extra === 'strum' && <StrumRow s={s} />}
      <ChordLane chords={lane} beats={s.beats} barOffset={s.barOffset} clock={player.clock} strum={null} onSeek={(t) => void s.seek(t)} height={84} showStatus={false} />

      <View style={{ gap: 4 }}>
        <Waveform peaks={s.result.waveform} duration={s.duration} currentTime={s.time} loop={player.loop} onSeek={(t) => void s.seek(t)} height={44} />
        <View style={styles.waveFoot}>
          <Text variant="mono" tone="subtle" style={{ fontSize: 11 }}>{formatTime(s.time)}</Text>
          {player.loop && <Text variant="overline" tone="highlight" style={{ fontSize: 10 }}>Loop · {formatTime(player.loop.start)} – {formatTime(player.loop.end)}</Text>}
          <Text variant="mono" tone="subtle" style={{ fontSize: 11 }}>{formatTime(s.duration)}</Text>
        </View>
      </View>

      <Card style={[styles.dock, { flexDirection: isPhone ? 'column' : 'row' }]}>
        <Pressable
          role="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          onPress={() => void s.toggle()}
          style={({ hovered, pressed }: PressState) => [styles.bigPlay, { backgroundColor: hovered ? colors.accentPressed : colors.accent, transform: [{ scale: pressed ? 0.95 : 1 }] }]}
        >
          <Icon name={playing ? 'pause' : 'play'} size={22} color={colors.onAccent} style={{ marginLeft: playing ? 0 : 3 }} />
        </Pressable>
        <SpeedControl rate={player.rate} bpm={bpm} onRate={player.setRate} />
        <View style={styles.dockButtons}>
          <DockButton icon="repeat" label="Loop" keyHint="[ ]" active={!!player.loop} onPress={() => (player.loop ? player.setLoop(null) : s.loopPhrase())} />
          <DockButton icon="timer-outline" label="Count-in" keyHint="1 bar" active={practice.countIn} onPress={() => s.setPractice({ countIn: !practice.countIn })} />
          <DockButton icon="pulse" label="Metronome" keyHint="M" active={player.metronome} onPress={() => player.setMetronome(!player.metronome)} />
        </View>
      </Card>
    </View>
  );
}

const SPEED_STEPS = [0.5, 0.75, 0.85, 1] as const;

/**
 * Speed, as its own unmistakable control (not a bar that looks like the song's position): a
 * big readout with the resulting tempo, one-tap presets and fine −/+ steps.
 */
function SpeedControl({ rate, bpm, onRate }: { rate: number; bpm: number | null; onRate: (r: number) => void }) {
  const { colors } = useTheme();
  const set = (r: number) => onRate(Math.max(0.5, Math.min(1.2, Number(r.toFixed(2)))));
  return (
    <View style={styles.speed} accessibilityLabel={`Playback speed ${Math.round(rate * 100)} percent`}>
      <View style={{ gap: 2, minWidth: 108 }}>
        <Text variant="overline" tone="subtle">Speed</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text variant="readout" style={{ color: rate === 1 ? colors.text : colors.highlight }}>{Math.round(rate * 100)}%</Text>
        </View>
        <Text variant="caption" tone="subtle">{bpm ? `${bpm} BPM · same pitch` : 'same pitch'}</Text>
      </View>
      <View style={{ gap: spacing.sm }}>
        <View style={styles.speedRow}>
          <SpeedButton label="−5%" onPress={() => set(rate - 0.05)} disabled={rate <= 0.5} />
          {SPEED_STEPS.map((r) => (
            <SpeedButton key={r} label={r === 1 ? 'Normal' : `${Math.round(r * 100)}%`} active={Math.abs(rate - r) < 0.001} onPress={() => set(r)} />
          ))}
          <SpeedButton label="+5%" onPress={() => set(rate + 0.05)} disabled={rate >= 1.2} />
        </View>
        <Text variant="caption" tone="subtle">Slow it down to learn the changes, then work back up to Normal.</Text>
      </View>
    </View>
  );
}

function SpeedButton({ label, onPress, active, disabled }: { label: string; onPress: () => void; active?: boolean; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      role="button"
      accessibilityLabel={label === 'Normal' ? 'Normal speed' : `Speed ${label}`}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ hovered }: PressState) => [
        styles.speedBtn,
        { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accentSoft : hovered ? colors.surfaceHover : colors.surface, opacity: disabled ? 0.4 : 1 },
      ]}
    >
      <Text variant="mono" style={{ fontSize: 12, color: active ? colors.highlight : colors.text }}>{label}</Text>
    </Pressable>
  );
}

/**
 * Animates its content whenever `value` changes: "pop" springs a new chord in (grows from
 * slightly smaller and rises), "slide" brings the next chord in from the right, "tick" gives
 * the countdown a small bounce. Nothing moves with "reduce motion".
 */
function Swap({ value, kind, children, style }: { value: string; kind: 'pop' | 'slide' | 'tick'; children: React.ReactNode; style?: object }) {
  const { reduceMotion } = useSettings();
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current || reduceMotion) {
      first.current = false;
      return;
    }
    v.setValue(0);
    Animated.spring(v, { toValue: 1, friction: kind === 'tick' ? 5 : 7, tension: kind === 'tick' ? 260 : 140, useNativeDriver: false }).start();
  }, [value, kind, v, reduceMotion]);
  const transform =
    kind === 'pop'
      ? [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }]
      : kind === 'slide'
        ? [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }]
        : [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1.25, 1] }) }];
  const opacity = kind === 'tick' ? 1 : v.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });
  return <Animated.View style={[style, { opacity, transform, transformOrigin: 'left center' } as never]}>{children}</Animated.View>;
}

/** The bar's eight strums; the one sounding now is lit. Driven by the audio clock. */
function StrumRow({ s }: { s: SongPractice }) {
  const { colors } = useTheme();
  const [slot, setSlot] = useState(-1);
  useEffect(() => s.player.clock.subscribe((t) => setSlot((prev) => {
    const n = s.player.clock.playing() ? slotAt(s.beats, s.barOffset, t) : -1;
    return n === prev ? prev : n;
  })), [s.player.clock, s.beats, s.barOffset]);
  return (
    <Card style={{ paddingVertical: spacing.md, gap: spacing.md }}>
      <View style={styles.strumHead}>
        <Label>Strum</Label>
        <StrumKey compact />
      </View>
      <View>
        <View style={styles.strumCells}>
          {s.strumPattern.split('').map((_, i) => (
            <View key={i} style={[styles.strumCell, i === slot && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]} />
          ))}
        </View>
        <StrumGlyphs pattern={s.strumPattern} size={30} active={slot} words={false} />
      </View>
      <StrumPicker choice={s.practice.strum} detected={s.result.strum} onChoose={(id) => s.setPractice({ strum: id })} />
    </Card>
  );
}

function BeatLamp({ on, past }: { on: boolean; past: boolean }) {
  const { colors } = useTheme();
  const flash = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on) return;
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [on, flash]);
  return (
    <Animated.View
      style={[
        styles.lamp,
        {
          backgroundColor: on ? colors.accent : past ? colors.highlightSoft : colors.surfaceHover,
          borderColor: on ? colors.accent : colors.border,
          transform: [{ scale: flash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }],
        },
      ]}
    />
  );
}

/** The countdown ring drains beat by beat; it turns solid amber on the last beat. */
function CountdownRing({ left, total }: { left: number; total: number }) {
  const { colors } = useTheme();
  const size = 76;
  const r = 32;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, left / total));
  const last = left <= 1;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${left} beats until the change`}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={4} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.accent}
          strokeWidth={4}
          fill={last && left > 0 ? colors.accentSoft : 'none'}
          strokeDasharray={`${c * frac} ${c}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Swap value={String(left)} kind="tick">
        <Text variant="readout" style={{ fontSize: 30, color: last ? colors.highlight : colors.text }}>{left}</Text>
      </Swap>
    </View>
  );
}

function DockButton({ icon, label, keyHint, active, onPress }: { icon: IconName; label: string; keyHint: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      role="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ hovered }: PressState) => [
        styles.dockBtn,
        { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accentSoft : hovered ? colors.surfaceHover : colors.surface },
      ]}
    >
      <Icon name={icon} size={15} color={active ? colors.highlight : colors.textMuted} />
      <Text variant="caption" style={{ color: active ? colors.text : colors.textMuted }}>{label}</Text>
      <Text variant="mono" style={{ fontSize: 10, color: active ? colors.highlight : colors.textSubtle }}>{keyHint}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  context: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexShrink: 1 },
  barChip: { paddingHorizontal: spacing.sm, height: 22, borderRadius: radius.xs, borderWidth: 1, justifyContent: 'center' },
  contextRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  cards: { gap: spacing.lg },
  nowCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, padding: spacing.xl, minHeight: 260 },
  nextCard: { gap: spacing.md, padding: spacing.xl, justifyContent: 'space-between' },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  lamps: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lamp: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
  strumHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' },
  strumCells: { position: 'absolute', left: 0, right: 0, top: -6, bottom: -6, flexDirection: 'row', gap: 6 },
  strumCell: { flex: 1, borderRadius: radius.md, borderWidth: 1, borderColor: 'transparent' },
  waveFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dock: { alignItems: 'center', gap: spacing.xl },
  bigPlay: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  speed: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xl, flexWrap: 'wrap', minWidth: 260 },
  speedRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  speedBtn: { height: 34, minWidth: 52, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dockButtons: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  dockBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1 },
});
