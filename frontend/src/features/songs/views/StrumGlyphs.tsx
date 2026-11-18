import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { countLabels } from '@/lib/music/strum';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * A one-bar strum pattern as arrows: downstrokes thick and amber, upstrokes lighter ivory,
 * misses as a dim arrow (keep the hand moving). The `active` slot is lit.
 */
export function StrumGlyphs({ pattern, size = 28, active = -1, counts = true }: { pattern: string; size?: number; active?: number; counts?: boolean }) {
  const { colors } = useTheme();
  const labels = countLabels();
  return (
    <View style={styles.row}>
      {pattern.split('').map((ch, i) => {
        const on = i === active;
        const down = ch === 'D' || (ch === '-' && i % 2 === 0);
        const color = ch === '-' ? colors.border : on ? colors.highlight : ch === 'D' ? colors.accent : colors.text;
        return (
          <View key={i} style={styles.cell}>
            <View style={{ opacity: ch === '-' ? 0.6 : 1, transform: [{ scale: on ? 1.15 : 1 }] }}>
              <Icon name={down ? 'arrow-down' : 'arrow-up'} size={size} color={color} strokeWidth={ch === 'D' ? 2.6 : ch === 'U' ? 1.9 : 1.5} />
            </View>
            {counts && (
              <Text variant="mono" style={{ fontSize: Math.max(10, size * 0.42), color: on ? colors.highlight : i % 2 === 0 ? colors.textMuted : colors.textSubtle }}>{labels[i]}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { alignItems: 'center', gap: 4, flex: 1 },
});
