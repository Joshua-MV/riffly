import { router, usePathname } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { practiceOf } from '@/features/library/model';
import { practiceTimeline } from '@/features/songs/practice';
import { formatTime, segmentAt, upcoming } from '@/features/songs/timeline';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { usePlayer } from './PlayerProvider';

/** Compact now-playing bar: song, current chord shape, play/pause. Tap to open the song. */
export function MiniPlayer({ variant = 'bar' }: { variant?: 'bar' | 'sidebar' }) {
  const { colors } = useTheme();
  const player = usePlayer();
  const pathname = usePathname();
  const song = player.song;
  const timeline = useMemo(() => (song ? practiceTimeline(song) : []), [song]);
  if (!song || pathname === `/song/${song.id}`) return null;

  const index = segmentAt(timeline, player.currentTime);
  const current = index >= 0 && timeline[index].label !== 'N' ? timeline[index].display : '—';
  const next = upcoming(timeline, index, 1)[0]?.display;
  const capo = practiceOf(song).capo;
  const progress = player.duration > 0 ? player.currentTime / player.duration : 0;
  const sidebar = variant === 'sidebar';

  return (
    <View style={[styles.wrap, sidebar ? styles.sidebarWrap : { borderTopColor: colors.border }, { backgroundColor: sidebar ? colors.surface : colors.backgroundRaised }]}>
      <View style={[styles.progress, { width: `${progress * 100}%`, backgroundColor: colors.accent }]} />
      <View style={styles.row}>
        <Pressable
          role="link"
          accessibilityLabel={`Now playing ${song.title}. Open song`}
          onPress={() => router.push(`/song/${song.id}`)}
          style={styles.info}
        >
          <View style={[styles.chord, { backgroundColor: colors.highlightSoft }]}>
            <Text variant="subheading" style={{ color: colors.highlight }} numberOfLines={1}>{current}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyStrong" numberOfLines={1}>{song.title}</Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {formatTime(player.currentTime)}{next ? ` · next ${next}` : ''}{capo ? ` · capo ${capo}` : ''}
            </Text>
          </View>
        </Pressable>
        <IconButton
          icon={player.playing || player.countingIn ? 'pause' : 'play'}
          label={player.playing ? 'Pause' : 'Play'}
          tone="accent"
          size={40}
          onPress={() => player.toggle()}
        />
        {!sidebar && <IconButton icon="close" label="Close player" size={36} onPress={player.stop} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  sidebarWrap: { borderRadius: radius.md, marginBottom: spacing.md },
  progress: { height: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minWidth: 0 },
  chord: { minWidth: 48, height: 40, paddingHorizontal: spacing.sm, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
