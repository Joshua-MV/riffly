import { View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Path, Rect } from 'react-native-svg';

import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { brand, fonts } from '@/theme/tokens';

/**
 * "Ringing Lamp": the amber pilot lamp with a guitar string ringing across it. Where the string
 * crosses the lamp it turns dark, so it reads as passing in front of the light.
 */

/** The string's path for a given ring amplitude (1 = the logo's resting shape). */
export function stringPath(amp = 1): string {
  const y = (d: number) => (56 + d * amp).toFixed(2);
  return `M14 56 H29 C32.5 56 34 ${y(-9.5)} 38.5 ${y(-9.5)} S 45.5 ${y(10.5)} 50 ${y(10.5)} S 57.5 ${y(-11.5)} 62 ${y(-11.5)} S 69 ${y(7.5)} 73.5 ${y(7.5)} S 80 56 83 56 H98`;
}
const SMALL_STRING = 'M2.5 12 H5.5 C7.3 12 8 8 10 8 S 12.6 16 14.4 16 S 16.8 12 18.5 12 H21.5';

let clipSeq = 0;

/**
 * The app mark. At 24 px and below the string rings once instead of four times and the bezel
 * drops away, so it stays crisp. `bare` draws the lamp and string without the tile (launch
 * screen); `amp` lets the launch animation ring the string.
 */
export function LogoMark({ size = 28, bare = false, amp = 1 }: { size?: number; bare?: boolean; amp?: number }) {
  const id = `lamp${(clipSeq = (clipSeq + 1) % 100000)}`;
  if (size <= 24 && !bare) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Riffly">
        <Defs>
          <ClipPath id={id}>
            <Circle cx={12} cy={12} r={6.6} />
          </ClipPath>
        </Defs>
        <Rect width={24} height={24} rx={5} fill={brand.charcoal} />
        <Circle cx={12} cy={12} r={6.6} fill={brand.amber} />
        <Path d={SMALL_STRING} fill="none" stroke={brand.ivory} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
        <Path d={SMALL_STRING} clipPath={`url(#${id})`} fill="none" stroke="#1E1F1B" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  const d = stringPath(amp);
  const sw = bare ? 4.5 : 4;
  return (
    <Svg width={size} height={bare ? size * 0.74 : size} viewBox={bare ? '10 22 92 68' : '0 0 112 112'} accessibilityLabel="Riffly">
      <Defs>
        <ClipPath id={id}>
          <Circle cx={56} cy={56} r={27} />
        </ClipPath>
      </Defs>
      {!bare && <Rect width={112} height={112} rx={26} fill={brand.charcoal} />}
      {!bare && <Circle cx={56} cy={56} r={32.5} fill="none" stroke={brand.ivory} strokeOpacity={0.16} strokeWidth={1.5} />}
      <Circle cx={56} cy={56} r={27} fill={brand.amber} />
      <Path d={d} fill="none" stroke={brand.ivory} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <Path d={d} clipPath={`url(#${id})`} fill="none" stroke="#1E1F1B" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Wordmark: italic Newsreader "rıffly", the i's dot replaced by the amber lamp. */
export function Wordmark({ size = 26, color }: { size?: number; color?: string }) {
  const { colors } = useTheme();
  const c = color ?? colors.text;
  const text = { fontFamily: fonts.serifItalic, fontSize: size, lineHeight: size * 1.2, color: c, letterSpacing: -size * 0.025 };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }} accessibilityLabel="Riffly">
      <Text style={text}>r</Text>
      <View>
        <Text style={text}>ı</Text>
        <View style={{ position: 'absolute', left: size * 0.12, top: size * 0.3, width: size * 0.15, height: size * 0.15, borderRadius: size, backgroundColor: brand.amber }} />
      </View>
      <Text style={text}>ffly</Text>
    </View>
  );
}

/** Mark + wordmark, as used in the rail and headers. */
export function Logo({ size = 26, mark = true }: { size?: number; mark?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.4 }} accessibilityLabel="Riffly">
      {mark && <LogoMark size={Math.round(size * 1.15)} />}
      <Wordmark size={size} />
    </View>
  );
}
