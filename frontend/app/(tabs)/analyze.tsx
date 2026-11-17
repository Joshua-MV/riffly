import { StyleSheet, View } from 'react-native';

import { Card, Notice, Screen } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import { UploadPanel } from '@/features/songs/UploadPanel';
import { useLayout } from '@/theme/useLayout';
import { spacing } from '@/theme/tokens';

const STEPS = [
  { title: 'Separate', body: 'Drums and percussion are filtered out so they don’t blur the harmony.' },
  { title: 'Listen', body: 'A constant-Q transform measures how strongly each of the 12 notes sounds over time.' },
  { title: 'Match', body: 'Every moment is compared with major and minor chord shapes, then smoothed so chords don’t flicker.' },
  { title: 'Align', body: 'Beat tracking estimates tempo and snaps chord changes onto the beat; the key is inferred from the harmony.' },
];

export default function AnalyzeScreen() {
  const { isPhone } = useLayout();
  return (
    <Screen maxWidth={880}>
      <View>
        <Text variant="overline" tone="subtle">Song analyzer</Text>
        <Text variant="title">Find the chords</Text>
        <Text tone="muted" style={{ marginTop: spacing.xs }}>
          Upload a recording and Riffly estimates its chords, key and tempo so you can play along.
        </Text>
      </View>
      <UploadPanel />
      <Notice>
        Results are estimates of the whole mix — not a transcription of the guitar part. Each chord shows a confidence score, and you can correct any chord by tapping it.
      </Notice>
      <View style={{ gap: spacing.md }}>
        <Text variant="overline" tone="subtle">How it works</Text>
        <View style={[styles.steps, { flexDirection: isPhone ? 'column' : 'row' }]}>
          {STEPS.map((s, i) => (
            <Card key={s.title} style={styles.step}>
              <Text variant="mono" tone="accent">{String(i + 1).padStart(2, '0')}</Text>
              <Text variant="subheading">{s.title}</Text>
              <Text variant="caption" tone="muted">{s.body}</Text>
            </Card>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  steps: { gap: spacing.md },
  step: { flex: 1, gap: spacing.xs },
});
