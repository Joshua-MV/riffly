import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import type { LocalSong } from '@/features/library/model';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { formatTime } from './timeline';

export function SongRow({ song }: { song: LocalSong }) {
  const { colors } = useTheme();
  const a = song.analysis;
  const meta = [a.key, a.bpm ? `${Math.round(a.bpm)} BPM` : null, formatTime(a.duration)].filter(Boolean).join(' · ');
  return (
    <Card onPress={() => router.push(`/song/${song.id}`)} accessibilityLabel={`${song.title}. ${meta}`} style={styles.row}>
      <View style={[styles.art, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name="musical-note" size={20} color={colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="subheading" numberOfLines={1}>{song.title}</Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>{meta}</Text>
      </View>
      {song.isFavourite && <Ionicons name="heart" size={16} color={colors.danger} accessibilityLabel="Favourite" />}
      <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  art: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
