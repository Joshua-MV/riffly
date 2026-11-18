import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ArtTile } from '@/components/music/ArtTile';
import { SeekBar } from '@/components/music/SeekBar';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { PressState } from '@/components/ui/pressState';
import { Text } from '@/components/ui/Text';
import { practiceTimeline } from '@/features/songs/practice';
import { segmentAt, upcoming } from '@/features/songs/timeline';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';
import { useLayout } from '@/theme/useLayout';

import { usePlayer } from './PlayerProvider';

export const SPEEDS = [1, 0.9, 0.85, 0.75, 0.5] as const;

/**
 * The transport strip: persistent on every screen, so the song never stops when you move
 * around. Song, chord now → next, ±5 s, play, scrub, speed, loop, metronome, open Play Along.
 */
export function Transport() {
  const { colors } = useTheme();
  const { isPhone } = useLayout();
  const player = usePlayer();
  const song = player.song;
  const timeline = useMemo(() => (song ? practiceTimeline(song) : []), [song]);
  if (!song) return null;

  const index = segmentAt(timeline, player.currentTime);
  const now = index >= 0 && timeline[index].label !== 'N' ? timeline[index].display : null;
  const next = upcoming(timeline, index, 1)[0]?.display;
  const duration = player.duration || song.analysis.duration;
  const playing = player.playing || !!player.countingIn;
  const nextSpeed = SPEEDS[(SPEEDS.indexOf(player.rate as (typeof SPEEDS)[number]) + 1) % SPEEDS.length] ?? 1;
  const openPlay = () => router.push({ pathname: '/song/[id]', params: { id: song.id, view: 'play' } });

  return (
    <View style={[styles.bar, { backgroundColor: colors.backgroundRaised, borderTopColor: colors.border, height: isPhone ? 64 : 72 }]}>
      <Pressable role="link" accessibilityLabel={`Now playing ${song.title}. Open Play Along`} onPress={openPlay} style={[styles.song, { width: isPhone ? undefined : 240, flex: isPhone ? 1 : undefined }]}>
        <ArtTile songKey={song.analysis.key} size={isPhone ? 40 : 44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={1}>{song.title}</Text>
          <Text variant="caption" tone="subtle" numberOfLines={1}>
            {[song.artist, now ? `${now}${next ? ` → ${next}` : ''}` : null].filter(Boolean).join(' · ') || 'Ready to play'}
          </Text>
        </View>
      </Pressable>

      <View style={styles.controls}>
        {!isPhone && <Small icon="play-back" label="Back 5 seconds" onPress={() => player.seek(Math.max(0, player.currentTime - 5))} />}
        <Pressable
          role="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          onPress={() => player.toggle()}
          style={({ hovered, pressed }: PressState) => [styles.play, { backgroundColor: hovered ? colors.accentPressed : colors.accent, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
        >
          <Icon name={playing ? 'pause' : 'play'} size={16} color={colors.onAccent} style={{ marginLeft: playing ? 0 : 2 }} />
        </Pressable>
        {!isPhone && <Small icon="play-forward" label="Forward 5 seconds" onPress={() => player.seek(Math.min(duration, player.currentTime + 5))} />}
      </View>

      {!isPhone && (
        <View style={styles.scrub}>
          <SeekBar inline time={player.currentTime} duration={duration} onSeek={player.seek} loop={player.loop} />
        </View>
      )}

      {!isPhone && (
        <View style={styles.right}>
          <Pressable
            role="button"
            accessibilityLabel={`Speed ${player.rate} times. Change to ${nextSpeed} times`}
            onPress={() => player.setRate(nextSpeed)}
            style={({ hovered }: PressState) => [styles.chip, { borderColor: player.rate !== 1 ? colors.accent : colors.border, backgroundColor: hovered ? colors.surfaceHover : colors.surface }]}
          >
            <Text variant="mono" style={{ fontSize: 12, color: player.rate !== 1 ? colors.highlight : colors.text }}>{player.rate.toFixed(2)}×</Text>
          </Pressable>
          <Pressable
            role="button"
            accessibilityLabel={player.loop ? 'Stop looping' : 'Loop (set in Play Along)'}
            onPress={() => (player.loop ? player.setLoop(null) : openPlay())}
            style={({ hovered }: PressState) => [styles.chip, { borderColor: player.loop ? colors.accent : colors.border, backgroundColor: player.loop ? colors.accentSoft : hovered ? colors.surfaceHover : colors.surface }]}
          >
            <Icon name="repeat" size={14} color={player.loop ? colors.highlight : colors.textMuted} />
            <Text variant="caption" style={{ color: player.loop ? colors.highlight : colors.textMuted }}>Loop</Text>
          </Pressable>
          <Small icon="pulse" label={`Metronome ${player.metronome ? 'on' : 'off'}`} active={player.metronome} onPress={() => player.setMetronome(!player.metronome)} />
          <Small icon="expand" label="Open Play Along" onPress={openPlay} />
        </View>
      )}
    </View>
  );
}

function Small({ icon, label, onPress, active }: { icon: IconName; label: string; onPress: () => void; active?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      role="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ hovered }: PressState) => [styles.small, { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accentSoft : hovered ? colors.surfaceHover : 'transparent' }]}
    >
      <Icon name={icon} size={16} color={active ? colors.highlight : colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg, borderTopWidth: 1 },
  song: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minWidth: 0 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  play: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  small: { width: 32, height: 32, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  scrub: { flex: 1, minWidth: 160 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1 },
});
