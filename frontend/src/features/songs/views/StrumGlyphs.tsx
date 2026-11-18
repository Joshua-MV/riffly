import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { countLabels } from '@/lib/music/strum';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * A one-bar strum pattern, unambiguous for a beginner: a thick amber arrow and "Down" on
 * down-strums, a lighter arrow and "Up" on up-strums, and a hollow circle with "Skip" where
 * the hand keeps moving but misses the strings. The count (1 & 2 & …) runs underneath and the
 * slot sounding now (`active`) is lit.
 */
export function StrumGlyphs({ pattern, size = 28, active = -1, counts = true, words = true }: { pattern: string; size?: number; active?: number; counts?: boolean; words?: boolean }) {
  const { colors } = useTheme();
  const labels = countLabels();
  return (
    <View style={styles.row}>
      {pattern.split('').map((ch, i) => {
        const on = i === active;
        const color = on ? colors.highlight : ch === 'D' ? colors.accent : ch === 'U' ? colors.text : colors.textSubtle;
        return (
          <View key={i} style={styles.cell}>
            <View style={{ height: size, justifyContent: 'center', transform: [{ scale: on ? 1.15 : 1 }] }}>
              {ch === '-' ? (
                <View style={{ width: size * 0.36, height: size * 0.36, borderRadius: size, borderWidth: 1.5, borderColor: on ? colors.highlight : colors.borderStrong }} />
              ) : (
                <Icon name={ch === 'D' ? 'arrow-down' : 'arrow-up'} size={size} color={color} strokeWidth={ch === 'D' ? 2.6 : 1.9} />
              )}
            </View>
            {words && size >= 20 && (
              <Text variant="caption" style={{ fontSize: Math.max(10, Math.min(14, size * 0.16)), color: on ? colors.highlight : ch === '-' ? colors.textSubtle : colors.textMuted }}>
                {ch === 'D' ? 'Down' : ch === 'U' ? 'Up' : 'Skip'}
              </Text>
            )}
            {counts && (
              <Text variant="mono" style={{ fontSize: Math.max(10, Math.min(18, size * 0.32)), color: on ? colors.highlight : i % 2 === 0 ? colors.textMuted : colors.textSubtle }}>{labels[i]}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** One line that explains the arrows; `compact` is the short form ("↓ Down  ↑ Up  ○ Skip"). */
export function StrumKey({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme();
  if (compact) {
    return (
      <View style={[styles.key, { columnGap: 14 }]}>
        <View style={styles.keyItem}>
          <Icon name="arrow-down" size={12} color={colors.accent} strokeWidth={2.6} />
          <Text variant="caption" tone="subtle">Down</Text>
        </View>
        <View style={styles.keyItem}>
          <Icon name="arrow-up" size={12} color={colors.text} />
          <Text variant="caption" tone="subtle">Up</Text>
        </View>
        <View style={styles.keyItem}>
          <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: colors.borderStrong }} />
          <Text variant="caption" tone="subtle">Skip</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.key}>
      <View style={styles.keyItem}>
        <Icon name="arrow-down" size={14} color={colors.accent} strokeWidth={2.6} />
        <Text variant="caption" tone="muted">Down: strum towards the floor, on the beat (1 2 3 4)</Text>
      </View>
      <View style={styles.keyItem}>
        <Icon name="arrow-up" size={14} color={colors.text} />
        <Text variant="caption" tone="muted">Up: strum back up, on the “&” between beats</Text>
      </View>
      <View style={styles.keyItem}>
        <View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 1.5, borderColor: colors.borderStrong }} />
        <Text variant="caption" tone="muted">Skip: keep your hand moving, but miss the strings</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { alignItems: 'center', gap: 4, flex: 1 },
  key: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 20, rowGap: 6 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
