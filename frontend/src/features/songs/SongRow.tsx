import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import type { Song } from '@/services/api';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { formatTime } from './timeline';

const STATUS_LABEL: Record<Song['status'], string> = {
  uploaded: 'Not analysed',
  queued: 'Queued',
  processing: 'Analysing…',
  completed: '',
  failed: 'Analysis failed',
};

export function SongRow({ song }: { song: Song }) {
  const { colors } = useTheme();
  const meta =
    song.status === 'completed'
      ? [song.key, song.bpm ? `${Math.round(song.bpm)} BPM` : null, song.duration ? formatTime(song.duration) : null].filter(Boolean).join(' · ')
      : STATUS_LABEL[song.status];
  return (
    <Card onPress={() => router.push(`/song/${song.id}`)} accessibilityLabel={`${song.title}. ${meta}`} style={styles.row}>
      <View style={[styles.art, { backgroundColor: song.status === 'failed' ? colors.dangerSoft : colors.accentSoft }]}>
        <Ionicons name={song.status === 'completed' ? 'musical-note' : song.status === 'failed' ? 'alert' : 'hourglass-outline'} size={20} color={song.status === 'failed' ? colors.danger : colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="subheading" numberOfLines={1}>{song.title}</Text>
        <Text variant="caption" tone={song.status === 'failed' ? 'danger' : 'muted'} numberOfLines={1}>{meta}</Text>
      </View>
      {song.is_favourite && <Ionicons name="heart" size={16} color={colors.danger} accessibilityLabel="Favourite" />}
      <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  art: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
