import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { TunerGauge } from '@/components/music/TunerGauge';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, Chip, Notice, Screen } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import { useTuner } from '@/features/tuner/useTuner';
import { GUITAR_TUNINGS } from '@/lib/music/instruments';
import { useTheme } from '@/theme/ThemeProvider';
import { useLayout } from '@/theme/useLayout';
import { radius, spacing, typeScale } from '@/theme/tokens';

export default function TunerScreen() {
  const { colors } = useTheme();
  const { width, isPhone } = useLayout();
  const [tuningId, setTuningId] = useState('standard');
  const [selected, setSelected] = useState<number | null>(null);
  const [a4, setA4] = useState(440);
  const tuning = GUITAR_TUNINGS.find((t) => t.id === tuningId) ?? GUITAR_TUNINGS[0];
  const { status, error, reading, strings, start, stop } = useTuner(tuning, selected, a4);

  const listening = status === 'listening';
  const inTune = reading?.state === 'in-tune';
  const stable = !!reading?.stable;
  const gaugeWidth = Math.min(isPhone ? width - spacing.lg * 2 : 520, 520);

  // A single gentle haptic tick when a string locks in tune.
  const wasStable = useRef(false);
  useEffect(() => {
    if (stable && !wasStable.current && Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    wasStable.current = stable;
  }, [stable]);

  const stateColor = !reading ? colors.textSubtle : inTune ? colors.success : colors.highlight;
  const hint = !listening
    ? 'Start the tuner and pluck a string'
    : !reading
      ? 'Listening… pluck a single string'
      : stable
        ? 'In tune'
        : inTune
          ? 'Hold it…'
          : reading.state === 'flat'
            ? 'Too low — tighten the string'
            : 'Too high — loosen the string';

  return (
    <Screen maxWidth={760}>
      <View style={styles.header}>
        <View>
          <Text variant="overline" tone="subtle">Chromatic tuner</Text>
          <Text variant="title">Tuner</Text>
        </View>
        <View style={styles.reference}>
          <IconButton icon="remove" label="Lower reference pitch" size={32} onPress={() => setA4((v) => Math.max(415, v - 1))} />
          <Text variant="caption" tone="muted" accessibilityLabel={`Reference A4 ${a4} hertz`}>A4 = {a4} Hz</Text>
          <IconButton icon="add" label="Raise reference pitch" size={32} onPress={() => setA4((v) => Math.min(466, v + 1))} />
        </View>
      </View>

      <View style={styles.chips} accessibilityLabel="Tuning presets">
        {GUITAR_TUNINGS.map((t) => (
          <Chip key={t.id} label={t.name} selected={t.id === tuningId} onPress={() => { setTuningId(t.id); setSelected(null); }} />
        ))}
      </View>

      <Card style={styles.stage} padded={false}>
        <View style={styles.readout} aria-live="polite">
          <Text variant="overline" tone="subtle">
            {reading?.target ? `Target ${reading.target.note}` : 'Detected note'}
          </Text>
          <View style={styles.noteRow}>
            <Text style={[styles.note, { color: reading ? colors.text : colors.textSubtle }]}>
              {reading ? reading.name : '–'}
            </Text>
            {reading && <Text variant="heading" tone="muted" style={styles.octave}>{reading.octave}</Text>}
          </View>
        </View>

        <View style={styles.gaugeRow}>
          <FlatSharp label="Flat" icon="chevron-back" active={reading?.state === 'flat'} />
          <TunerGauge cents={reading ? reading.centsOff : null} inTune={inTune} width={gaugeWidth - 96} />
          <FlatSharp label="Sharp" icon="chevron-forward" active={reading?.state === 'sharp'} />
        </View>

        <View style={styles.metrics}>
          <Metric label="Cents" value={reading ? `${reading.centsOff > 0 ? '+' : ''}${reading.centsOff.toFixed(1)}` : '—'} />
          <Metric label="Frequency" value={reading ? `${reading.frequency.toFixed(1)} Hz` : '—'} />
          <Metric label="Target" value={reading ? `${reading.targetFrequency.toFixed(1)} Hz` : '—'} />
        </View>

        <View style={[styles.hint, { backgroundColor: stable ? colors.successSoft : 'transparent' }]}>
          {stable && <Ionicons name="checkmark-circle" size={18} color={colors.success} />}
          <Text variant="subheading" style={{ color: stateColor }}>{hint}</Text>
        </View>
      </Card>

      <View style={{ gap: spacing.md }}>
        <Text variant="overline" tone="subtle">Strings · tap to lock a target</Text>
        <View style={styles.strings}>
          <StringButton label="Auto" sub="any" active={selected === null} onPress={() => setSelected(null)} />
          {strings.map((s) => {
            const name = s.note.replace(/-?\d+$/, '');
            const live = reading?.target?.index === s.index;
            return (
              <StringButton
                key={s.index}
                label={name}
                sub={`${6 - s.index}`}
                active={selected === s.index}
                live={live}
                done={live && stable}
                onPress={() => setSelected(selected === s.index ? null : s.index)}
              />
            );
          })}
        </View>
      </View>

      {status === 'denied' && (
        <Notice tone="error">
          Microphone access was denied. Enable it for Riffly in your {Platform.OS === 'web' ? 'browser site settings' : 'device settings'} to use the tuner.
        </Notice>
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

      <Notice>
        Works offline — audio is analysed on this device and never recorded. Acoustic guitars: hold the phone near the sound hole. Electric guitars: tune by the amp, or connect an audio interface and select it as your device's input.
      </Notice>
    </Screen>
  );
}

function FlatSharp({ label, icon, active }: { label: string; icon: 'chevron-back' | 'chevron-forward'; active: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.flatSharp} accessibilityLabel={`${label}${active ? ', active' : ''}`}>
      <Ionicons name={icon} size={28} color={active ? colors.highlight : colors.border} />
      <Text variant="caption" style={{ color: active ? colors.highlight : colors.textSubtle }}>{label}</Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text variant="overline" tone="subtle">{label}</Text>
      <Text variant="mono">{value}</Text>
    </View>
  );
}

function StringButton({ label, sub, active, live, done, onPress }: { label: string; sub: string; active: boolean; live?: boolean; done?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const border = done ? colors.success : active ? colors.accent : live ? colors.highlight : colors.border;
  return (
    <Pressable
      role="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={sub === 'any' ? 'Auto-detect string' : `String ${sub}, ${label}`}
      onPress={onPress}
      style={[styles.stringBtn, { borderColor: border, backgroundColor: active ? colors.accentSoft : colors.surface }]}
    >
      <Text variant="subheading" style={{ color: done ? colors.success : colors.text }}>{label}</Text>
      <Text variant="caption" tone="subtle" style={{ fontSize: 11 }}>{sub}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: spacing.md },
  reference: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stage: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md, overflow: 'hidden' },
  readout: { alignItems: 'center' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start' },
  note: { ...typeScale.hero, fontSize: 88, lineHeight: 96, letterSpacing: -3 },
  octave: { marginTop: 14, marginLeft: 2 },
  gaugeRow: { flexDirection: 'row', alignItems: 'flex-end' },
  flatSharp: { width: 48, alignItems: 'center', paddingBottom: spacing.sm },
  metrics: { flexDirection: 'row', gap: spacing.xxl, flexWrap: 'wrap', justifyContent: 'center' },
  metric: { alignItems: 'center', gap: 2, minWidth: 88 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill },
  strings: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  stringBtn: { flexGrow: 1, flexBasis: 52, minWidth: 52, height: 64, borderRadius: radius.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
