import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { storage } from '@/features/library/storage';
import { useSongs } from '@/features/songs/hooks';
import { formatBytes } from '@/features/songs/timeline';

import { IconButton } from '@/components/ui/Button';
import { Card, Notice, Screen, SegmentedControl } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import { config } from '@/config';
import { api } from '@/services/api';
import { useTheme, type SchemePreference } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export default function ProfileScreen() {
  const { preference, setPreference } = useTheme();
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, retry: false });
  const songs = useSongs();
  return (
    <Screen maxWidth={720}>
      <View style={styles.top}>
        <IconButton icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
      <Text variant="title">Profile & settings</Text>

      <Card style={styles.section}>
        <Text variant="overline" tone="subtle">Appearance</Text>
        <SegmentedControl<SchemePreference>
          label="Colour theme"
          value={preference}
          onChange={setPreference}
          options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]}
        />
      </Card>

      <Card style={styles.section}>
        <Text variant="overline" tone="subtle">Your music</Text>
        <Text>
          {songs.data ? `${songs.data.length} ${songs.data.length === 1 ? 'song' : 'songs'} ·${formatBytes(songs.data.reduce((n, s) => n + s.audioBytes, 0))} of MP3s` : 'Loading…'}
        </Text>
        <Text variant="caption" tone="muted">
          Stored only on {storage.location.toLowerCase()}. No account and no cloud database: nothing syncs between devices, and
          {Platform.OS === 'web' ? ' clearing site data for Riffly in your browser deletes it.' : ' uninstalling the app deletes it.'} Use “{Platform.OS === 'web' ? 'Download' : 'Save'} MP3” on a song to keep a copy elsewhere.
        </Text>
      </Card>

      <Card style={styles.section}>
        <Text variant="overline" tone="subtle">Analysis server</Text>
        <Text variant="mono">{config.apiUrl}</Text>
        {health.isSuccess ? (
          <Text variant="caption" tone="success">Connected · {health.data.engine}</Text>
        ) : health.isError ? (
          <Notice tone="warning">Not reachable. Only analysing new songs needs it — your saved songs, the tuner and the chord library work offline.</Notice>
        ) : (
          <Text variant="caption" tone="muted">Checking…</Text>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row' },
  section: { gap: spacing.md },
});
