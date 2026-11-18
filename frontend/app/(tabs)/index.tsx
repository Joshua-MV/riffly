import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/layout/Logo';
import { CentsStrip } from '@/components/music/CentsStrip';
import { Headstock } from '@/components/music/Headstock';
import { Button, IconButton } from '@/components/ui/Button';
import { Notice, Screen, SegmentedControl } from '@/components/ui/primitives';
import type { PressState } from '@/components/ui/pressState';
import { Text } from '@/components/ui/Text';
import { getSettings, updateSettings } from '@/features/settings/store';
import { useTuner } from '@/features/tuner/useTuner';
import { GUITAR_TUNINGS, tuningStrings } from '@/lib/music/instruments';
import { useTheme } from '@/theme/ThemeProvider';
import { useLayout } from '@/theme/useLayout';
import { fonts, radius, spacing } from '@/theme/tokens';

export default function TunerScreen() {
  const { colors } = useTheme();
  const { width, isPhone } = useLayout();
  const params = useLocalSearchParams<{ tuning?: string }>();
  const [tuningId, setTuningId] = useState(params.tuning ?? getSettings().defaultTuning);
  const [selected, setSelected] = useState<number | null>(null);
  // "Tune to this" from a song opens the tuner with that song's tuning selected.
  useEffect(() => {
    if (params.tuning && GUITAR_TUNINGS.some((t) => t.id === params.tuning)) {
      setTuningId(params.tuning);
      setSelected(null);
    }
  }, [params.tuning]);
  const [a4, setA4State] = useState(() => getSettings().a4);
  const setA4 = (f: (v: number) => number) =>
    setA4State((v) => {
      const n = f(v);
      updateSettings({ a4: n });
      return n;
    });
  const tuning = GUITAR_TUNINGS.find((t) => t.id === tuningId) ?? GUITAR_TUNINGS[0];
  const { status, error, reading, levelDb, strings, start, stop } = useTuner(tuning, selected, a4);

  const listening = status === 'listening';
  const inTune = reading?.state === 'in-tune';
  const stable = !!reading?.stable;
  const active = reading?.target?.index ?? selected;

  // Strings tuned this session get a tick.
  const [done, setDone] = useState<Set<number>>(() => new Set());
  useEffect(() => setDone(new Set()), [tuningId, a4]);
  useEffect(() => {
    if (stable && reading?.target) {
      const i = reading.target.index;
      setDone((d) => (d.has(i) ? d : new Set(d).add(i)));
    }
  }, [stable, reading?.target]);

  const wasStable = useRef(false);
  useEffect(() => {
    if (stable && !wasStable.current && Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    wasStable.current = stable;
  }, [stable]);

  // One soft settle when a string locks in tune: the note cross-fades to olive.
  const settle = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(settle, { toValue: stable ? 1 : 0, duration: 240, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: false }).start();
  }, [stable, settle]);

  const cents = reading ? reading.centsSmooth : null;
  const stateColor = !reading ? colors.textSubtle : inTune ? colors.success : colors.danger;
  const status1 = !listening ? 'Not listening' : !reading ? 'Listening' : stable ? 'In tune' : inTune ? 'Close' : reading.state === 'flat' ? 'Flat — tune up' : 'Sharp — tune down';
  const hint = !listening
    ? 'Press Start, then pluck one string and let it ring.'
    : !reading
      ? 'Pluck a single string near the mic.'
      : stable
        ? 'Hold steady… then move to the next string.'
        : inTune
          ? 'Slow down — you are almost there.'
          : `${reading.state === 'flat' ? 'Tighten' : 'Loosen'} the ${reading.target ? reading.target.note.replace(/-?\d+$/, '') : ''} peg slowly in the direction of the arrow.`;

  const sideBySide = width >= 1100;
  const headW = sideBySide ? 360 : Math.min(width - spacing.lg * 2, 320);
  const noteColor = settle.interpolate({ inputRange: [0, 1], outputRange: [reading ? colors.text : colors.textSubtle, colors.success] });

  return (
    <Screen maxWidth={1180}>
      {isPhone && <Logo />}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text variant="title">Tuner</Text>
          <SegmentedControl<'auto' | 'manual'>
            label="String selection"
            value={selected === null ? 'auto' : 'manual'}
            onChange={(v) => setSelected(v === 'auto' ? null : (active ?? 0))}
            options={[{ value: 'auto', label: 'Auto string' }, { value: 'manual', label: 'Manual' }]}
          />
        </View>
        <View style={styles.headerRight}>
          <InputMeter db={levelDb} />
          <View style={[styles.refBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <IconButton icon="remove" label="Lower reference pitch" size={24} onPress={() => setA4((v) => Math.max(415, v - 1))} />
            <Text variant="mono" style={{ fontSize: 12 }} accessibilityLabel={`Reference A4 ${a4} hertz`}>A4 = {a4} Hz</Text>
            <IconButton icon="add" label="Raise reference pitch" size={24} onPress={() => setA4((v) => Math.min(466, v + 1))} />
          </View>
        </View>
      </View>

      <View style={styles.presets} accessibilityLabel="Tuning presets">
        {GUITAR_TUNINGS.map((t) => {
          const on = t.id === tuningId;
          const notes = tuningStrings(t).map((s) => s.note.replace(/-?\d+$/, '')).join(' ');
          return (
            <Pressable
              key={t.id}
              role="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${t.name} tuning, ${notes}`}
              onPress={() => { setTuningId(t.id); setSelected(null); }}
              style={({ hovered }: PressState) => [styles.preset, { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : hovered ? colors.surfaceHover : colors.surface }]}
            >
              <Text variant="caption" style={{ color: on ? colors.text : colors.textMuted }}>{t.name}</Text>
              <Text variant="mono" style={{ fontSize: 10, letterSpacing: 1.2, color: on ? colors.highlight : colors.textSubtle }}>{notes}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.stage, { flexDirection: sideBySide ? 'row' : 'column' }]}>
        <View style={[styles.headWrap, sideBySide && { flex: 1 }]}>
          <Headstock
            strings={strings}
            active={listening ? active : selected}
            locked={selected}
            state={reading ? reading.state : null}
            cents={cents}
            stable={stable}
            done={done}
            onPeg={(i) => setSelected(selected === i ? null : i)}
            width={headW}
          />
        </View>

        <View style={[styles.readoutCol, sideBySide && { flex: 1.15 }]} aria-live="polite">
          <View style={styles.noteRow}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <Animated.Text style={{ fontFamily: fonts.serif, fontSize: isPhone ? 120 : 168, lineHeight: isPhone ? 124 : 172, letterSpacing: -4, color: noteColor }}>
                {reading ? reading.name : '–'}
              </Animated.Text>
              {reading && <Text variant="heading" tone="muted" style={{ fontFamily: fonts.serif, marginTop: 18, marginLeft: 4 }}>{reading.octave}</Text>}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text variant="overline" tone="subtle">Detected</Text>
              <Text variant="readout" style={{ fontSize: 30 }}>
                {reading ? reading.frequency.toFixed(2) : '—'}
                <Text variant="mono" tone="subtle" style={{ fontSize: 13 }}> Hz</Text>
              </Text>
              <Text variant="overline" tone="subtle">Target {reading ? reading.targetFrequency.toFixed(2) : '—'} Hz</Text>
            </View>
          </View>

          <CentsStrip cents={cents} inTune={inTune} />

          <View style={styles.statusRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={[styles.lamp, { backgroundColor: stateColor }]} />
              <Text variant="subheading" style={{ color: stateColor }}>{status1}</Text>
            </View>
            <Text variant="readout" style={{ fontSize: 22, color: stateColor }}>
              {cents === null ? '' : `${cents >= 0 ? '+' : '−'}${String(Math.abs(Math.round(cents))).padStart(2, '0')}¢`}
            </Text>
          </View>
          <Text tone="muted">{hint}</Text>

          <View style={styles.strings}>
            {strings.map((s) => {
              const name = s.note.replace(/-?\d+$/, '');
              const live = active === s.index && listening;
              const isDone = done.has(s.index);
              const locked = selected === s.index;
              return (
                <Pressable
                  key={s.index}
                  role="radio"
                  accessibilityState={{ checked: locked }}
                  accessibilityLabel={`String ${6 - s.index}, ${name}${isDone ? ', tuned' : ''}`}
                  onPress={() => setSelected(locked ? null : s.index)}
                  style={({ hovered }: PressState) => [
                    styles.stringBtn,
                    { borderColor: live || locked ? colors.accent : colors.border, backgroundColor: live ? colors.accentSoft : hovered ? colors.surfaceHover : colors.surface },
                  ]}
                >
                  <Text variant="overline" tone="subtle" style={{ fontSize: 9 }}>String {6 - s.index}</Text>
                  <Text variant="heading" style={{ color: isDone ? colors.success : colors.text }}>{name}</Text>
                  <View style={[styles.dot, { backgroundColor: isDone ? colors.success : live ? colors.accent : colors.border }]} />
                </Pressable>
              );
            })}
          </View>

          {status === 'denied' && (
            <Notice tone="error">Microphone access was denied. Allow Riffly to use the microphone in {Platform.OS === 'web' ? 'Windows privacy settings' : 'device settings'}.</Notice>
          )}
          {error && <Notice tone="error">{error}</Notice>}

          <Button
            label={listening ? 'Stop tuner' : 'Start tuner'}
            icon={listening ? 'stop' : 'mic'}
            size="lg"
            variant={listening ? 'secondary' : 'primary'}
            loading={status === 'requesting'}
            onPress={listening ? stop : start}
            fullWidth
          />
          <Text variant="caption" tone="subtle">Audio is analysed on this device and never recorded.</Text>
        </View>
      </View>
    </Screen>
  );
}

/** Input meter: eight segments from −60 to 0 dBFS. */
function InputMeter({ db }: { db: number | null }) {
  const { colors } = useTheme();
  const segs = 8;
  const lit = db === null ? 0 : Math.round(Math.max(0, Math.min(1, (db + 60) / 60)) * segs);
  return (
    <View style={styles.meter} accessibilityLabel={db === null ? 'Microphone off' : `Input level ${Math.round(db)} decibels`}>
      <Text variant="overline" tone="subtle" style={{ fontSize: 9.5 }}>Input</Text>
      <View style={{ flexDirection: 'row', gap: 2, alignItems: 'flex-end' }}>
        {Array.from({ length: segs }, (_, i) => (
          <View key={i} style={{ width: 3, height: 6 + i * 1.2, borderRadius: 1, backgroundColor: i < lit ? (i >= segs - 1 ? colors.danger : colors.success) : colors.border }} />
        ))}
      </View>
      <Text variant="mono" tone="subtle" style={{ fontSize: 11 }}>{db === null ? 'Mic off' : `${Math.round(db)} dB`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flexWrap: 'wrap' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flexWrap: 'wrap' },
  refBox: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 4, borderRadius: radius.md, borderWidth: 1 },
  meter: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  preset: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 32, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  stage: { gap: spacing.xxl, alignItems: 'center', paddingTop: spacing.md },
  headWrap: { alignItems: 'center' },
  readoutCol: { gap: spacing.lg, width: '100%', maxWidth: 560 },
  noteRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: spacing.md },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lamp: { width: 8, height: 8, borderRadius: 4 },
  strings: { flexDirection: 'row', gap: spacing.sm },
  stringBtn: { flex: 1, minWidth: 0, height: 64, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
