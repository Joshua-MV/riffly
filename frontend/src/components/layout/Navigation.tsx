import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

import { goTo, usePracticeSong } from './Rail';

export interface NavItem {
  name: string;
  label: string;
  icon: IconName;
  iconActive: IconName;
}

/** Tab routes (the desktop rail is in Rail.tsx). */
export const NAV_ITEMS: readonly NavItem[] = [
  // The tuner is the first screen: tuning up is the first thing you do with a guitar.
  { name: 'index', label: 'Tune', icon: 'speedometer-outline', iconActive: 'speedometer' },
  { name: 'library', label: 'Songs', icon: 'library-outline', iconActive: 'library-outline' },
  { name: 'chords', label: 'Learn', icon: 'book-outline', iconActive: 'book-outline' },
];

interface TabBarProps {
  activeName: string;
  onNavigate: (name: string) => void;
}

/** Phone: five thumb-reach tabs. Play opens the current song; More holds settings. */
export function BottomTabBar({ activeName, onNavigate }: TabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const song = usePracticeSong();
  const items: { key: string; label: string; icon: IconName; active: boolean; onPress: () => void; disabled?: boolean }[] = [
    { key: 'index', label: 'Tune', icon: 'speedometer-outline', active: activeName === 'index', onPress: () => onNavigate('index') },
    { key: 'library', label: 'Songs', icon: 'library-outline', active: activeName === 'library' || activeName === 'analyze', onPress: () => onNavigate('library') },
    { key: 'play', label: 'Play', icon: 'play-circle-outline', active: false, onPress: () => goTo('play', song), disabled: !song },
    { key: 'chords', label: 'Learn', icon: 'book-outline', active: activeName === 'chords', onPress: () => onNavigate('chords') },
    { key: 'more', label: 'More', icon: 'ellipsis-horizontal', active: false, onPress: () => goTo('settings', song) },
  ];
  return (
    <View role="tablist" style={[styles.bottom, { backgroundColor: colors.backgroundRaised, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          role="tab"
          accessibilityLabel={item.label}
          accessibilityState={{ selected: item.active, disabled: !!item.disabled }}
          disabled={item.disabled}
          onPress={item.onPress}
          style={[styles.bottomItem, item.disabled && { opacity: 0.4 }]}
        >
          <Icon name={item.icon} size={22} color={item.active ? colors.highlight : colors.textSubtle} />
          <Text variant="caption" style={{ fontSize: 11, color: item.active ? colors.text : colors.textSubtle }}>{item.label}</Text>
          {item.active && <View style={[styles.lamp, { backgroundColor: colors.accent }]} />}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bottom: { flexDirection: 'row', borderTopWidth: 1, paddingTop: spacing.sm },
  bottomItem: { flex: 1, alignItems: 'center', gap: 3, minHeight: 48 },
  lamp: { width: 4, height: 4, borderRadius: 2 },
});
