import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { cancelImport, dismissImport, IMPORT_PHASE_LABEL, useImports, type ImportTask } from './importer';

const STAGES = ['Read', 'Key', 'Tempo', 'Beats', 'Chords', 'Strum'] as const;

/** Songs being imported: a staged pipeline that fills left to right. */
export function ImportList({ hideDone = false }: { hideDone?: boolean }) {
  const tasks = useImports().filter((t) => !(hideDone && t.phase === 'done'));
  if (!tasks.length) return null;
  return (
    <View style={{ gap: spacing.sm, flex: 1, minWidth: 280 }} aria-live="polite">
      {tasks.map((t, i) => (
        <ImportCard key={t.id} task={t} index={i} total={tasks.length} />
      ))}
    </View>
  );
}

function ImportCard({ task, index, total }: { task: ImportTask; index: number; total: number }) {
  const { colors } = useTheme();
  const busy = task.phase === 'uploading' || task.phase === 'analysing' || task.phase === 'saving';
  // Phases map onto the six stages: reading the file, analysing (key → strum), saving.
  const filled = task.phase === 'uploading' ? 1 : task.phase === 'analysing' ? 4 : 6;
  const title = task.name.replace(/\.(mp3|wav|m4a)$/i, '');
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: task.phase === 'failed' ? colors.danger : colors.border }]}>
      <View style={styles.head}>
        <Text variant="overline" tone={task.phase === 'failed' ? 'danger' : task.phase === 'done' ? 'success' : 'subtle'}>
          {task.phase === 'failed' ? 'Couldn’t import' : task.phase === 'done' ? 'Ready to play' : `Analysing · ${index + 1} of ${total}`}
        </Text>
        {task.phase === 'uploading' && <Button label="Cancel" variant="ghost" size="sm" onPress={() => cancelImport(task.id)} />}
        {!busy && <Button label="Dismiss" variant="ghost" size="sm" onPress={() => dismissImport(task.id)} />}
      </View>
      <Text variant="subheading" numberOfLines={1}>{title}</Text>
      {task.phase === 'failed' ? (
        <Text variant="caption" tone="danger">{task.error}</Text>
      ) : (
        <>
          <View style={styles.bars}>
            {STAGES.map((s, i) => (
              <View key={s} style={[styles.bar, { backgroundColor: i < filled ? (task.phase === 'done' ? colors.success : i === filled - 1 && busy ? colors.accent : colors.success) : colors.border }]} />
            ))}
          </View>
          <View style={styles.labels}>
            {STAGES.map((s, i) => (
              <Text key={s} variant="overline" style={{ fontSize: 9, color: i < filled - (busy ? 1 : 0) ? colors.textMuted : i === filled - 1 && busy ? colors.highlight : colors.textDisabled }}>
                {s}{i < filled - (busy ? 1 : 0) ? ' ✓' : i === filled - 1 && busy ? '…' : ''}
              </Text>
            ))}
          </View>
        </>
      )}
      {busy && <Text variant="caption" tone="subtle">{IMPORT_PHASE_LABEL[task.phase]}…</Text>}
      {task.phase === 'done' && task.songId && (
        <View style={{ alignItems: 'flex-start' }}>
          <Button label="Open" size="sm" onPress={() => { dismissImport(task.id); router.push({ pathname: '/song/[id]', params: { id: task.songId!, view: 'overview' } }); }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 30 },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2 },
  labels: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
});
