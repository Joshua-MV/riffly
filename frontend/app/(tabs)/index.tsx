import * as Haptics from 'expo-haptics';
import { useIsFocused, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/layout/Logo';
import { IconButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Notice, Screen, SegmentedControl } from '@/components/ui/primitives';
import type { PressState } from '@/components/ui/pressState';
import { Text } from '@/components/ui/Text';
import { getSettings, updateSettings, useSettings } from '@/features/settings/store';
import { Soundhole } from '@/features/tuner/Soundhole';
import { LevelMeter, MicButton, Readout, Screws, Strobe } from '@/features/tuner/TunerPanel';
import { useTuner } from '@/features/tuner/useTuner';
import { GUITAR_TUNINGS, tuningStrings } from '@/lib/music/instruments';
import { useTheme } from '@/theme/ThemeProvider';
import { useLayout } from '@/theme/useLayout';
import { fonts, radius, spacing } from '@/theme/tokens';

const bare = (note: string) => note.replace(/-?\d+$/, '');

export default function TunerScreen() {
  const { colors } = useTheme();
  const { width, isPhone, isDesktop } = useLayout();
  const { reduceMotion } = useSettings();
  const focused = useIsFocused();
  const params = useLocalSearchParams<{ tuning?: string }>();
  const [tuningId, setTuningId] = useState(params.tuning ?? getSettings().defaultTuning);
  const [selected, setSelected] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  // "Tune to this" from a song opens the tuner with that song's tuning selected.
  useEffect(() => {
    if (params.tuning && GUITAR_TUNINGS.some((t) => t.id === params.tuning)) {
      setTuningId(params.tuning);
      setSelected(null);
    }
  }, [params.tuning]);
  const [a4, setA4State] = useState(() => getSettings().a4);
  const setA4 = (n: number) => {
    setA4State(n);
    updateSettings({ a4: n });
  };
  const tuning = GUITAR_TUNINGS.find((t) => t.id === tuningId) ?? GUITAR_TUNINGS[0];
  const { status, error, reading, levelDb, strings, start, stop } = useTuner(tuning, selected, a4);

  const listening = status === 'listening';
  const inTune = reading?.state === 'in-tune';
  const stable = !!reading?.stable;

  // Strings tuned this session get a tick.
  const [done, setDone] = useState<Set<number>>(() => new Set());
  useEffect(() => setDone(new Set()), [tuningId, a4]);
  useEffect(() => {
    if (stable && reading?.target) {
      const i = reading.target.index;
      setDone((d) => (d.has(i) ? d : new Set(d).add(i)));
    }
  }, [stable, reading?.target]);
  const allDone = done.size === strings.length;

  const wasStable = useRef(false);
  useEffect(() => {
    if (stable && !wasStable.current && Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    wasStable.current = stable;
  }, [stable]);

  // A fresh pluck (a note heard after silence) restarts the string's ring.
  const [pluck, setPluck] = useState(0);
  const heard = !!reading;
  useEffect(() => {
    if (heard) setPluck((p) => p + 1);
  }, [heard]);

  const toggle = () => {
    if (listening) {
      stop();
      return;
    }
    if (allDone) setDone(new Set());
    void start();
  };
  // Space starts and stops the mic while the tuner is on screen (before the player's Space).
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  useEffect(() => {
    if (Platform.OS !== 'web' || !focused) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      toggleRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [focused]);

  // The string being tuned: what the mic hears, else the chosen one, else the next untuned one.
  const nextUp = strings.findIndex((s) => !done.has(s.index));
  const active = reading?.target?.index ?? selected ?? (nextUp >= 0 ? nextUp : 0);
  const activeString = strings[active];
  const name = bare(activeString.note);
  const stringNo = 6 - active;
  const cents = reading ? reading.centsSmooth : null;
  const flat = !!reading && !inTune && reading.state === 'flat';

  const stateColor = allDone ? colors.success : !listening ? colors.text : !reading ? colors.text : inTune ? colors.success : flat ? colors.highlight : colors.danger;
  const stateText = allDone
    ? 'Your guitar is in tune'
    : !listening
      ? 'Ready when you are'
      : !reading
        ? 'Listening…'
        : inTune
          ? 'In tune — hold it'
          : flat
            ? `Flat · tighten the ${name} string`
            : `Sharp · loosen the ${name} string`;
  const hint = allDone
    ? 'All six strings are spot on. Press 3 to play along with a song.'
    : !listening
      ? `Press the mic, then pluck the ${name} string (string ${stringNo}) and let it ring.`
      : !reading
        ? `Pluck the ${name} string (string ${stringNo}) and let it ring.`
        : inTune
          ? stable
            ? 'Got it. Now pluck the next string.'
            : 'Hold it there for a moment.'
          : 'Turn its tuning peg a little, then pluck again. Bring the lamp to the top of the ring.';

  const offBy = cents === null ? '' : `${cents >= 0 ? '+' : '−'}${String(Math.abs(Math.round(cents))).padStart(2, '0')}¢`;
  const target = reading ? reading.targetFrequency : activeString.frequency;

  // Side by side on a wide window, stacked otherwise.
  const content = width - (isDesktop ? 232 : 0) - (isPhone ? spacing.lg * 2 : 72);
  const sideBySide = content >= 900;
  const holeW = sideBySide ? Math.min(560, content * 0.48) : Math.min(content, 460);
  const names = strings.map((s) => bare(s.note));

  return (
    <Screen maxWidth={1240}>
      {isPhone && <Logo />}
      <View style={[styles.header, { zIndex: 10 }]}>
        <Text variant="title" style={{ fontSize: 34, lineHeight: 38 }}>Tuner</Text>
        <View style={{ zIndex: 10 }}>
          <Pressable
            onPress={() => setMenu((m) => !m)}
            accessibilityRole="button"
            accessibilityLabel={`Tuning: ${tuning.name}. Change tuning`}
            accessibilityState={{ expanded: menu }}
            style={({ hovered }: PressState) => [styles.tuningBtn, { borderColor: colors.border, backgroundColor: hovered ? colors.surfaceHover : colors.surface }]}
          >
            <Text style={{ fontSize: 13 }}>{tuning.name}</Text>
            <Text variant="mono" tone="subtle" style={{ fontSize: 11, letterSpacing: 1.3 }}>{names.join(' ')}</Text>
            <Icon name={menu ? 'chevron-up' : 'chevron-down'} size={12} color={colors.text} />
          </Pressable>
          {menu && (
            <View style={[styles.menu, { borderColor: colors.border, backgroundColor: colors.backgroundRaised }]} role="menu">
              {GUITAR_TUNINGS.map((t) => {
                const on = t.id === tuningId;
                return (
                  <Pressable
                    key={t.id}
                    role="menuitem"
                    accessibilityState={{ checked: on }}
                    onPress={() => {
                      setTuningId(t.id);
                      setSelected(null);
                      setMenu(false);
                    }}
                    style={({ hovered }: PressState) => [styles.menuItem, { backgroundColor: on ? colors.accentSoft : hovered ? colors.surfaceHover : 'transparent' }]}
                  >
                    <Text style={{ fontSize: 13, color: on ? colors.text : colors.textMuted }}>{t.name}</Text>
                    <Text variant="mono" style={{ fontSize: 11, letterSpacing: 1.2, color: on ? colors.highlight : colors.textSubtle }}>
                      {tuningStrings(t).map((s) => bare(s.note)).join(' ')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
        <SegmentedControl<'auto' | 'manual'>
          label="String detection"
          value={selected === null ? 'auto' : 'manual'}
          onChange={(v) => setSelected(v === 'auto' ? null : active)}
          options={[{ value: 'auto', label: 'Auto string' }, { value: 'manual', label: 'Manual' }]}
        />
        <View style={{ flex: 1 }} />
        <View style={[styles.refBox, { borderColor: colors.border }]}>
          <IconButton icon="remove" label="Lower reference pitch" size={22} onPress={() => setA4(Math.max(415, a4 - 1))} />
          <Text variant="mono" tone="muted" style={{ fontSize: 12 }} accessibilityLabel={`Reference A4 ${a4} hertz`}>A4 = {a4} Hz</Text>
          <IconButton icon="add" label="Raise reference pitch" size={22} onPress={() => setA4(Math.min(466, a4 + 1))} />
        </View>
      </View>

      <View style={[styles.stage, { flexDirection: sideBySide ? 'row' : 'column' }]}>
        <View style={[styles.holeWrap, sideBySide && { flex: 1 }]}>
          <Soundhole
            names={names}
            active={allDone ? null : active}
            done={done}
            live={listening}
            cents={cents}
            inTune={inTune}
            allDone={allDone}
            note={allDone ? '✓' : name}
            noteSub={allDone ? 'ALL SIX IN TUNE' : !listening ? `STRING ${stringNo} · STANDBY` : `${activeString.note} · STRING ${stringNo}`}
            pluckKey={pluck}
            reduceMotion={reduceMotion}
            width={holeW}
          />
        </View>

        <View style={[styles.side, sideBySide && { flex: 1 }]} accessibilityLabel="Pitch readout">
          <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.backgroundRaised }]}>
            <Screws />
            <View style={styles.panelHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 5,
                    backgroundColor: allDone ? colors.success : listening ? colors.accent : '#4A4B44',
                    boxShadow: listening && !allDone ? '0 0 0 4px rgba(197,138,69,0.22)' : undefined,
                  }}
                />
                <Text variant="overline" style={{ fontSize: 11, letterSpacing: 1.8, color: listening || allDone ? colors.text : colors.textSubtle }}>
                  {allDone ? 'Done' : listening ? 'Listening' : 'Standby'}
                </Text>
              </View>
              <LevelMeter db={listening ? levelDb : null} />
            </View>
            <View style={{ gap: 8 }}>
              <Text variant="overline" tone="subtle" style={{ fontSize: 10, letterSpacing: 1.6 }}>Strobe · stripes stop when in tune</Text>
              <Strobe cents={cents} inTune={inTune} live={listening} reduceMotion={reduceMotion} />
            </View>
            <View style={[styles.readouts, { borderTopColor: colors.divider }]}>
              <Readout label="Detected" value={reading ? reading.frequency.toFixed(2) : ''} ghost="888.88" color={stateColor} align="left" />
              <Readout label="Target" value={allDone ? '' : target.toFixed(2)} ghost="888.88" color={colors.textMuted} align="center" />
              <Readout label="Off by" value={offBy} ghost="+88¢" color={stateColor} align="right" />
            </View>
          </View>

          <View style={styles.statusRow} aria-live="polite">
            <MicButton live={listening} onPress={toggle} reduceMotion={reduceMotion} busy={status === 'requesting'} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 18, lineHeight: 22, color: stateColor }}>{stateText}</Text>
              <Text tone="muted" style={{ fontSize: 14, lineHeight: 20 }}>{hint}</Text>
            </View>
            {Platform.OS === 'web' && !isPhone && (
              <View style={[styles.kbd, { borderColor: colors.borderStrong }]}>
                <Text variant="mono" tone="muted" style={{ fontSize: 11 }}>Space</Text>
              </View>
            )}
          </View>

          <View style={styles.strings} role="radiogroup" accessibilityLabel="Strings">
            {strings.map((s) => {
              const on = s.index === active && !allDone;
              const ok = done.has(s.index);
              const locked = selected === s.index;
              return (
                <Pressable
                  key={s.index}
                  role="radio"
                  accessibilityState={{ checked: locked }}
                  accessibilityLabel={`String ${6 - s.index}, ${s.note}${ok ? ', in tune' : ''}`}
                  onPress={() => {
                    setSelected(locked ? null : s.index);
                    setDone((d) => {
                      if (!d.has(s.index)) return d;
                      const n = new Set(d);
                      n.delete(s.index);
                      return n;
                    });
                  }}
                  style={({ hovered }: PressState) => [
                    styles.stringBtn,
                    {
                      borderColor: on ? colors.accent : ok ? 'rgba(143,160,127,0.45)' : colors.border,
                      backgroundColor: on ? '#33342E' : hovered ? colors.surfaceHover : '#2A2B26',
                    },
                  ]}
                >
                  <Text variant="mono" tone="subtle" style={{ fontSize: 10 }}>STRING {6 - s.index}</Text>
                  <Text style={{ fontFamily: fonts.display, fontSize: 22, lineHeight: 24, color: ok ? colors.success : colors.text }}>{bare(s.note)}</Text>
                  <Text variant="mono" style={{ fontSize: 10, color: ok ? colors.success : on ? colors.highlight : colors.textSubtle }}>
                    {ok ? '✓ IN TUNE' : on ? (listening ? 'LISTENING' : 'NEXT') : `${s.frequency.toFixed(1)} HZ`}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {status === 'denied' && (
            <Notice tone="error">Microphone access was denied. Allow Riffly to use the microphone in {Platform.OS === 'web' ? 'Windows privacy settings' : 'device settings'}.</Notice>
          )}
          {error && <Notice tone="error">{error}</Notice>}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="lock-closed-outline" size={14} color={colors.textSubtle} />
            <Text variant="caption" tone="subtle" style={{ fontSize: 12 }}>Sound is analysed on this {Platform.OS === 'web' ? 'computer' : 'device'} and never recorded.</Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 18, rowGap: 12 },
  tuningBtn: { height: 36, paddingHorizontal: 12, borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: 10 },
  menu: { position: 'absolute', top: 40, left: 0, minWidth: 300, borderWidth: 1, borderRadius: radius.lg, padding: 4, zIndex: 20, boxShadow: '0 12px 32px rgba(0,0,0,0.35)' },
  menuItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, height: 34, paddingHorizontal: 10, borderRadius: radius.sm },
  refBox: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 32, paddingHorizontal: 2, borderRadius: radius.md, borderWidth: 1 },
  stage: { gap: 28, alignItems: 'center' },
  holeWrap: { alignItems: 'center', justifyContent: 'center' },
  side: { width: '100%', maxWidth: 560, gap: 14 },
  panel: { borderWidth: 1, borderRadius: 14, paddingTop: 22, paddingHorizontal: 24, paddingBottom: 20, gap: 18 },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  readouts: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 60 },
  kbd: { paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderBottomWidth: 2, borderRadius: 4 },
  strings: { flexDirection: 'row', gap: 6 },
  stringBtn: { flex: 1, minWidth: 0, height: 76, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 4 },
});
