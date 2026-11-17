import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button, IconButton } from '@/components/ui/Button';
import { Card, Notice } from '@/components/ui/primitives';
import type { PressState } from '@/components/ui/pressState';
import { Text } from '@/components/ui/Text';
import { parseChord, transposeLabel } from '@/lib/music/chords';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing, typeScale } from '@/theme/tokens';

import { useCorrectChord, useRevertCorrection } from '../hooks';
import { formatTime, type TimelineChord } from '../timeline';

export function ChordList({ timeline, activeIndex, onSeek, onEdit }: { timeline: TimelineChord[]; activeIndex: number; onSeek: (t: number) => void; onEdit: (c: TimelineChord) => void }) {
  const { colors } = useTheme();
  const rows = timeline.filter((c) => c.label !== 'N');
  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <View style={[styles.listHead, { borderBottomColor: colors.border }]}>
        <Text variant="overline" tone="subtle">Timeline</Text>
        <Text variant="caption" tone="subtle">Tap to jump · ✎ to correct</Text>
      </View>
      <ScrollView style={{ maxHeight: 460 }} nestedScrollEnabled>
        {rows.map((c) => {
          const active = timeline.indexOf(c) === activeIndex;
          return (
            <Pressable
              key={c.start}
              onPress={() => onSeek(c.start)}
              accessibilityLabel={`${c.display} at ${formatTime(c.start)}, confidence ${Math.round(c.confidence * 100)} percent`}
              style={({ hovered }: PressState) => [
                styles.listRow,
                { borderBottomColor: colors.border },
                active && { backgroundColor: colors.highlightSoft },
                hovered && !active && { backgroundColor: colors.surfaceHover },
              ]}
            >
              <Text variant="mono" tone="subtle" style={{ width: 48 }}>{formatTime(c.start)}</Text>
              <Text variant="subheading" style={{ flex: 1, color: active ? colors.highlight : colors.text }}>
                {c.display}
                {c.corrected ? '  ✓' : ''}
              </Text>
              <ConfidenceBar value={c.confidence} />
              <IconButton icon="create-outline" label={`Correct ${c.display}`} size={32} onPress={() => onEdit(c)} />
            </Pressable>
          );
        })}
      </ScrollView>
    </Card>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const { colors } = useTheme();
  const color = value > 0.6 ? colors.success : value > 0.35 ? colors.highlight : colors.danger;
  return (
    <View style={[styles.conf, { backgroundColor: colors.surfaceSunken }]} accessibilityLabel={`Confidence ${Math.round(value * 100)}%`}>
      <View style={{ width: `${Math.round(value * 100)}%`, height: '100%', backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}

/**
 * Edit the chord at one segment. The user types the shape they see (after capo and key
 * shift); it is stored in the song's original key, so it survives changing either.
 */
export function CorrectionEditor({ songId, chord, displayOffset, onClose }: { songId: string; chord: TimelineChord; displayOffset: number; onClose: () => void }) {
  const { colors } = useTheme();
  const [value, setValue] = useState(chord.display);
  const correct = useCorrectChord(songId);
  const revert = useRevertCorrection(songId);
  const parsed = parseChord(value);
  const save = () => {
    if (!parsed) return;
    correct.mutate(
      { start: chord.start, originalLabel: chord.label, correctedLabel: transposeLabel(value.trim(), -displayOffset) },
      { onSuccess: onClose },
    );
  };
  return (
    <Card style={{ gap: spacing.md, borderColor: colors.accent }}>
      <Text variant="subheading">Correct the chord at {formatTime(chord.start)}</Text>
      <Text variant="caption" tone="muted">Detected: {transposeLabel(chord.label, displayOffset)} ({Math.round(chord.confidence * 100)}% confidence)</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Corrected chord name"
        onSubmitEditing={save}
        style={[typeScale.heading, styles.input, { color: colors.text, borderColor: parsed ? colors.border : colors.danger, backgroundColor: colors.surfaceSunken }]}
      />
      {!parsed && <Text variant="caption" tone="danger">Enter a chord like G, Em, D7, Cmaj7, Asus4 or F#dim.</Text>}
      {correct.error && <Notice tone="error">{(correct.error as Error).message}</Notice>}
      <View style={styles.row}>
        <Button label="Save correction" onPress={save} disabled={!parsed} loading={correct.isPending} />
        {chord.corrected && <Button label="Revert to detected" variant="secondary" loading={revert.isPending} onPress={() => revert.mutate(chord.start, { onSuccess: onClose })} />}
        <Button label="Cancel" variant="ghost" onPress={onClose} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  listHead: { flexDirection: 'row', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  conf: { width: 48, height: 4, borderRadius: 2, overflow: 'hidden' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 52 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
});
