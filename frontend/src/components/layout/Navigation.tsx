import type { PressState } from '@/components/ui/pressState';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { IconName } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { Logo } from './Logo';

export interface NavItem {
  name: string;
  label: string;
  icon: IconName;
  iconActive: IconName;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { name: 'index', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { name: 'analyze', label: 'Analyze', icon: 'pulse-outline', iconActive: 'pulse' },
  { name: 'tuner', label: 'Tuner', icon: 'speedometer-outline', iconActive: 'speedometer' },
  { name: 'chords', label: 'Chords', icon: 'grid-outline', iconActive: 'grid' },
  { name: 'library', label: 'My Music', icon: 'albums-outline', iconActive: 'albums' },
];

interface TabBarProps {
  activeName: string;
  onNavigate: (name: string) => void;
}

export function BottomTabBar({ activeName, onNavigate }: TabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      role="tablist"
      style={[styles.bottom, { backgroundColor: colors.backgroundRaised, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
    >
      {NAV_ITEMS.map((item) => {
        const active = item.name === activeName;
        return (
          <Pressable
            key={item.name}
            role="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            onPress={() => onNavigate(item.name)}
            style={styles.bottomItem}
          >
            <View style={[styles.bottomPill, active && { backgroundColor: colors.accentSoft }]}>
              <Ionicons name={active ? item.iconActive : item.icon} size={22} color={active ? colors.accent : colors.textSubtle} />
            </View>
            <Text variant="caption" style={{ fontSize: 11, color: active ? colors.text : colors.textSubtle }}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Sidebar({ activeName, onNavigate, footer }: TabBarProps & { footer?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.sidebar, { backgroundColor: colors.backgroundRaised, borderRightColor: colors.border }]}>
      <View style={styles.sidebarLogo}>
        <Logo />
      </View>
      <View role="tablist" style={{ gap: spacing.xs }}>
        {NAV_ITEMS.map((item) => {
          const active = item.name === activeName;
          return (
            <Pressable
              key={item.name}
              role="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: active }}
              onPress={() => onNavigate(item.name)}
              style={({ hovered }: PressState) => [
                styles.sideItem,
                active && { backgroundColor: colors.accentSoft },
                hovered && !active && { backgroundColor: colors.surface },
              ]}
            >
              {active && <View style={[styles.sideIndicator, { backgroundColor: colors.accent }]} />}
              <Ionicons name={active ? item.iconActive : item.icon} size={20} color={active ? colors.accent : colors.textMuted} />
              <Text variant="bodyStrong" style={{ color: active ? colors.text : colors.textMuted }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flex: 1 }} />
      {footer}
      <Pressable
        role="link"
        accessibilityLabel="Profile and settings"
        onPress={() => router.push('/profile')}
        style={({ hovered }: PressState) => [styles.sideItem, hovered && { backgroundColor: colors.surface }]}
      >
        <Ionicons name="person-circle-outline" size={20} color={colors.textMuted} />
        <Text variant="bodyStrong" tone="muted">Profile & settings</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bottom: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
  bottomItem: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48 },
  bottomPill: { width: 56, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  sidebar: { width: 248, paddingHorizontal: spacing.md, paddingVertical: spacing.xl, borderRightWidth: StyleSheet.hairlineWidth },
  sidebarLogo: { paddingHorizontal: spacing.md, marginBottom: spacing.xxl },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, height: 44, paddingHorizontal: spacing.md, borderRadius: radius.md },
  sideIndicator: { position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 2 },
});
