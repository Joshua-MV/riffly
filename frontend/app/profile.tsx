import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

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
        <Text variant="overline" tone="subtle">Account</Text>
        <Text>Local mode — your songs are stored by the Riffly server you're connected to, with no sign-in.</Text>
        <Text variant="caption" tone="muted">Accounts and cross-device sync (Supabase, free tier) are the next milestone.</Text>
      </Card>

      <Card style={styles.section}>
        <Text variant="overline" tone="subtle">Analysis server</Text>
        <Text variant="mono">{config.apiUrl}</Text>
        {health.isSuccess ? (
          <Text variant="caption" tone="success">Connected · {health.data.engine}</Text>
        ) : health.isError ? (
          <Notice tone="warning">Not reachable. Start the backend to analyse songs — the tuner and chord library work without it.</Notice>
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
