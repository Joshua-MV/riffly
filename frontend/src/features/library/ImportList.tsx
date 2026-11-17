import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/ui/Button';
import { Card, ProgressBar } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

import { cancelImport, dismissImport, IMPORT_PHASE_LABEL, useImports, type ImportTask } from './importer';

/** Songs currently being imported (shown on the Analyze and My Music screens). */
export function ImportList({ hideDone = false }: { hideDone?: boolean }) {
  const tasks = useImports().filter((t) => !(hideDone && t.phase === 'done'));
  if (!tasks.length) return null;
  return (
    <View style={{ gap: spacing.sm }} aria-live="polite">
      {tasks.map((t) => (
        <ImportRow key={t.id} task={t} />
      ))}
    </View>
  );
}

function ImportRow({ task }: { task: ImportTask }) {
  const { colors } = useTheme();
  const busy = task.phase === 'uploading' || task.phase === 'analysing' || task.phase === 'saving';
  const step = { uploading: 1, analysing: 2, saving: 3, done: 3, failed: 0 }[task.phase];
  return (
    <Card style={[styles.row, task.phase === 'failed' && { borderColor: colors.danger }]}>
      <View style={styles.icon}>
        {busy ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Ionicons name={task.phase === 'done' ? 'checkmark-circle' : 'alert-circle'} size={24} color={task.phase === 'done' ? colors.success : colors.danger} />
        )}
      </View>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text variant="subheading" numberOfLines={1}>{task.name}</Text>
        <Text variant="caption" tone={task.phase === 'failed' ? 'danger' : 'muted'}>
          {task.phase === 'failed' ? task.error : busy ? `${IMPORT_PHASE_LABEL[task.phase]}…` : 'Saved to this device as MP3'}
        </Text>
        {task.phase === 'uploading' && <ProgressBar progress={task.progress} />}
      </View>
      {task.phase === 'uploading' && <Button label="Cancel" variant="ghost" size="sm" onPress={() => cancelImport(task.id)} />}
      {task.phase === 'done' && task.songId && <Button label="Open" size="sm" onPress={() => { dismissImport(task.id); router.push(`/song/${task.songId}`); }} />}
      {!busy && <IconButton icon="close" label="Dismiss" size={32} onPress={() => dismissImport(task.id)} />}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 28, alignItems: 'center' },
});
