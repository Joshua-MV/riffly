import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { palette } from '@/theme/tokens';

/** Wordmark: five "string" bars of varying height, read as a waveform and a fretboard. */
export function Logo({ size = 28 }: { size?: number }) {
  const { colors } = useTheme();
  const bars = [0.45, 0.8, 1, 0.65, 0.35];
  const barColors = [palette.violet400, palette.violet400, palette.amber400, palette.violet400, palette.violet400];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityLabel="Riffly">
      <Svg width={size} height={size} viewBox="0 0 28 28">
        <Rect x={0} y={0} width={28} height={28} rx={8} fill={colors.accentSoft} />
        {bars.map((h, i) => (
          <Rect key={i} x={5 + i * 4} y={14 - (h * 16) / 2} width={2.4} height={h * 16} rx={1.2} fill={barColors[i]} />
        ))}
      </Svg>
      <Text variant="heading" style={{ fontSize: 22, letterSpacing: -0.6 }}>riffly</Text>
    </View>
  );
}
