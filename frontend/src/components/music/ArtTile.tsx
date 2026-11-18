import { View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { fonts, keyColor } from '@/theme/tokens';

/** "G major" -> "G", "A minor" -> "Am". */
export function keyShort(key: string | null | undefined): string {
  if (!key) return '–';
  const [tonic, mode] = key.split(' ');
  return mode === 'minor' ? `${tonic}m` : tonic;
}

/**
 * Song artwork generated from the detected key: no artwork needed. Large tiles carry the six
 * string hairlines along the top.
 */
export function ArtTile({ songKey, size = 40, width, height, strings = false }: { songKey: string | null | undefined; size?: number; width?: number; height?: number; strings?: boolean }) {
  const { bg, fg } = keyColor(songKey);
  const label = keyShort(songKey);
  const w = width ?? size;
  const h = height ?? size;
  const s = Math.min(w, h);
  return (
    <View style={{ width: w, height: h, borderRadius: Math.max(4, s * 0.08), backgroundColor: bg, overflow: 'hidden', justifyContent: 'flex-end', padding: s * 0.1 }}>
      {strings && (
        <View style={{ position: 'absolute', left: w * 0.06, right: w * 0.06, top: h * 0.1, gap: h * 0.035 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ height: 1 + (5 - i) * 0.15, backgroundColor: fg, opacity: 0.45 }} />
          ))}
        </View>
      )}
      <Text style={{ fontFamily: fonts.serif, fontSize: s * (strings ? 0.3 : label.length > 2 ? 0.34 : 0.42), lineHeight: s * (strings ? 0.36 : 0.5), color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
