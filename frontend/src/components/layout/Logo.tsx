import { View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { brand, fonts } from '@/theme/tokens';

/** The app mark: six graded string hairlines, one bent amber string with its pilot lamp. */
export function LogoMark({ size = 28 }: { size?: number }) {
  const xs = [7, 10.5, 14, 17.5, 21];
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28" accessibilityLabel="Riffly">
      <Rect x={0} y={0} width={28} height={28} rx={6.5} fill="#1E1F1B" stroke="#3E3F39" strokeWidth={0.75} />
      {xs.map((x, i) => (
        <Line key={x} x1={x} y1={5} x2={x} y2={23} stroke={brand.ivory} strokeWidth={0.6 + (4 - i) * 0.18} opacity={0.85} />
      ))}
      <Path d="M 15.75 5 C 15.75 11, 17.2 12.5, 15.75 16 C 14.8 18.5, 15.75 20, 15.75 21" stroke={brand.amber} strokeWidth={1.1} fill="none" />
      <Circle cx={15.75} cy={22.2} r={1.5} fill={brand.amber} />
    </Svg>
  );
}

/** Wordmark: italic Newsreader "riffly" with the amber pilot-lamp dot. */
export function Logo({ size = 26, mark = false }: { size?: number; mark?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityLabel="Riffly">
      {mark && <LogoMark size={size + 4} />}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <Text style={{ fontFamily: fonts.serifItalic, fontSize: size, lineHeight: size * 1.15, color: colors.text, letterSpacing: -0.5 }}>riffly</Text>
        <View style={{ width: size * 0.2, height: size * 0.2, borderRadius: size, backgroundColor: brand.amber, marginLeft: 2, marginBottom: size * 0.22 }} />
      </View>
    </View>
  );
}
