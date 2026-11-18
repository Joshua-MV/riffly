import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ChordDiagram } from '@/components/music/ChordDiagram';
import { ChordLane } from '@/components/music/ChordLane';
import { Waveform } from '@/components/music/Waveform';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Card, SegmentedControl, Stepper } from '@/components/ui/primitives';
import type { PressState } from '@/components/ui/pressState';
import { Slider } from '@/components/ui/Slider';
import { Text } from '@/components/ui/Text';
import { parseChord } from '@/lib/music/chords';
import { getVoicings } from '@/lib/music/voicings';
import { useTheme } from '@/theme/ThemeProvider';
import { useLayout } from '@/theme/useLayout';
import { fonts, radius, spacing } from '@/theme/tokens';

import { laneState } from '../lane';
import { lineAt } from '@/lib/music/lyrics';
import { formatTime } from '../timeline';
import type { SongPractice } from '../useSongPractice';

import { slotAt } from '../components/StrumPanel';
import { StrumGlyphs } from './StrumGlyphs';

type Extra = 'chords' | 'lyrics' | 'strum';

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
  const lyricLine = s.song.lyrics && extra === 'lyrics' ? s.song.lyrics.lines[lineAt(s.song.lyrics, s.time)]?.text : null;

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
            options={[{ value: 'chords', label: 'Chords' }, { value: 'lyrics', label: '+ Lyrics' }, { value: 'strum', label: '+ Strum' }]}
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
            <Text
              aria-live="polite"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ fontFamily: fonts.display, fontSize: isPhone ? 110 : 168, lineHeight: isPhone ? 110 : 164, letterSpacing: -5, color: s.countIn ? colors.highlight : now ? colors.accent : colors.textDisabled }}
            >
              {s.countIn ? String(s.countIn) : shown?.label ?? ''}
            </Text>
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
            <Text style={{ fontFamily: fonts.display, fontSize: 64, lineHeight: 68, color: colors.text }} numberOfLines={1} adjustsFontSizeToFit>{next?.label ?? 'End'}</Text>
          </View>
          <Text variant="caption" tone="subtle">{after ? `then ${after.label} · watch the ring, not the clock` : next ? 'watch the ring, not the clock' : 'End of the song'}</Text>
        </Card>
      </View>

      {extra === 'strum' && <StrumRow s={s} />}
      {extra === 'lyrics' && (
        <Card style={{ minHeight: 64, justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.serif, fontSize: 26, lineHeight: 36 }} tone={lyricLine ? 'default' : 'subtle'}>
            {s.song.lyrics ? lyricLine ?? '…' : 'No lyrics yet. Open Lyrics to get them.'}
          </Text>
        </Card>
      )}

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
        <View style={{ flex: 1, gap: 4, minWidth: 220 }}>
          <View style={styles.speedHead}>
            <Text variant="overline" tone="subtle">Speed · pitch locked</Text>
            <Text variant="mono" style={{ fontSize: 12 }}>{Math.round(player.rate * 100)}%{bpm ? ` · ${bpm} BPM` : ''}</Text>
          </View>
          <Slider value={player.rate} min={0.5} max={1.2} step={0.05} detent={1} onChange={player.setRate} label="Playback speed" format={(v) => `${Math.round(v * 100)} percent`} />
          <View style={styles.speedHead}>
            {['50%', '100%', '120%'].map((l) => (
              <Text key={l} variant="mono" tone="subtle" style={{ fontSize: 10 }}>{l}</Text>
            ))}
          </View>
        </View>
        <View style={styles.dockButtons}>
          <DockButton icon="repeat" label="Loop" keyHint="[ ]" active={!!player.loop} onPress={() => (player.loop ? player.setLoop(null) : s.loopPhrase())} />
          <DockButton icon="timer-outline" label="Count-in" keyHint="1 bar" active={practice.countIn} onPress={() => s.setPractice({ countIn: !practice.countIn })} />
          <DockButton icon="pulse" label="Metronome" keyHint="M" active={player.metronome} onPress={() => player.setMetronome(!player.metronome)} />
        </View>
      </Card>
    </View>
  );
}

/** The bar's eight strums; the one sounding now is lit. Driven by the audio clock. */
function StrumRow({ s }: { s: SongPractice }) {
  const { colors } = useTheme();
  const [slot, setSlot] = useState(-1);
  useEffect(() => s.player.clock.subscribe((t) => setSlot((prev) => {
    const n = slotAt(s.beats, s.barOffset, t);
    return n === prev ? prev : n;
  })), [s.player.clock, s.beats, s.barOffset]);
  return (
    <Card style={{ paddingVertical: spacing.md }}>
      <View style={styles.strumCells}>
        {s.strumPattern.split('').map((_, i) => (
          <View key={i} style={[styles.strumCell, i === slot && { backgroundColor: colors.accentSoft, borderColor: colors.accent }]} />
        ))}
      </View>
      <StrumGlyphs pattern={s.strumPattern} size={30} active={slot} />
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
      <Text variant="readout" style={{ fontSize: 30, color: last ? colors.highlight : colors.text }}>{left}</Text>
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
  strumCells: { position: 'absolute', left: spacing.lg, right: spacing.lg, top: 6, bottom: 6, flexDirection: 'row', gap: 6 },
  strumCell: { flex: 1, borderRadius: radius.md, borderWidth: 1, borderColor: 'transparent' },
  waveFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dock: { alignItems: 'center', gap: spacing.xl },
  bigPlay: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  speedHead: { flexDirection: 'row', justifyContent: 'space-between' },
  dockButtons: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  dockBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1 },
});
