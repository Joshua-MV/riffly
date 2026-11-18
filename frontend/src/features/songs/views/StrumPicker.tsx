import { Pressable, ScrollView, StyleSheet } from 'react-native';

import type { PressState } from '@/components/ui/pressState';
import { Text } from '@/components/ui/Text';
import { isPattern, STRUM_PATTERNS, strumChoice } from '@/lib/music/strum';
import type { StrumAnalysis } from '@/services/api';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

/**
 * Change the strum pattern in one tap, right where you are: the song's own pattern first,
 * then the common ones, each with its arrows in miniature.
 */
export function StrumPicker({ choice, detected, onChoose }: { choice: string | undefined; detected: StrumAnalysis | undefined; onChoose: (id: string) => void }) {
  const { colors } = useTheme();
  const current = strumChoice(choice, detected);
  const options = [
    ...(detected && isPattern(detected.pattern) ? [{ id: 'auto', name: 'This song', pattern: detected.pattern }] : []),
    ...STRUM_PATTERNS.filter((p) => !(detected && p.pattern === detected.pattern)).map((p) => ({ id: p.id, name: p.name.replace('Beginner: ', ''), pattern: p.pattern })),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
      {options.map((o) => {
        const on = o.id === current;
        return (
          <Pressable
            key={o.id}
            role="radio"
            accessibilityLabel={`Strum pattern ${o.name}: ${o.pattern}`}
            accessibilityState={{ checked: on }}
            onPress={() => onChoose(o.id)}
            style={({ hovered }: PressState) => [styles.option, { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : hovered ? colors.surfaceHover : colors.surface }]}
          >
            <Text variant="caption" numberOfLines={1} style={{ color: on ? colors.text : colors.textMuted }}>{o.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  option: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
});
