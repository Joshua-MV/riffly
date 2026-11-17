import type { PressState } from '@/components/ui/pressState';
import { Ionicons } from '@expo/vector-icons';
import { isValidElement, type ReactNode } from 'react';
import {
  Pressable, ScrollView, StyleSheet, TextInput, View, type StyleProp, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { useLayout } from '@/theme/useLayout';
import { radius, shadow, spacing, typeScale } from '@/theme/tokens';

import type { IconName } from './Button';
import { Text } from './Text';

/** Scrollable page container with a readable max width on large screens. */
export function Screen({ children, maxWidth = 1120, scroll = true }: { children: ReactNode; maxWidth?: number; scroll?: boolean }) {
  const { colors } = useTheme();
  const { isPhone } = useLayout();
  const insets = useSafeAreaInsets();
  const inner = (
    <View
      style={[
        styles.screenInner,
        { maxWidth, paddingHorizontal: isPhone ? spacing.lg : spacing.xxl, paddingTop: Math.max(insets.top, spacing.lg) + spacing.sm },
      ]}
    >
      {children}
    </View>
  );
  return scroll ? (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: spacing.xxxl * 2 }}>
      {inner}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, backgroundColor: colors.background }}>{inner}</View>
  );
}

export function Card({
  children, style, onPress, accessibilityLabel, padded = true, elevated = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  padded?: boolean;
  elevated?: boolean;
}) {
  const { colors, scheme } = useTheme();
  const base = [
    styles.card,
    { backgroundColor: colors.surface, borderColor: colors.border },
    padded && { padding: spacing.lg },
    elevated && shadow(1, scheme),
    style,
  ];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      role="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => [
        base,
        hovered && { borderColor: colors.borderStrong, backgroundColor: colors.surfaceHover },
        pressed && { transform: [{ scale: 0.99 }] },
      ]}
    >
      {children}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  const { colors } = useTheme();
  return (
    <Pressable
      role="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? colors.accentSoft : 'transparent', borderColor: selected ? colors.accent : colors.border },
      ]}
    >
      {icon && <Ionicons name={icon} size={14} color={selected ? colors.accent : colors.textMuted} />}
      <Text variant="caption" style={{ color: selected ? colors.accent : colors.textMuted }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({
  options, value, onChange, label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <View role="radiogroup" accessibilityLabel={label} style={[styles.segment, { backgroundColor: colors.surfaceSunken, borderColor: colors.border }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            role="radio"
            accessibilityState={{ checked: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, active && { backgroundColor: colors.surface }]}
          >
            <Text variant="caption" tone={active ? 'default' : 'muted'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (t: string) => void; placeholder: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name="search" size={18} color={colors.textSubtle} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        accessibilityLabel={placeholder}
        autoCorrect={false}
        autoCapitalize="none"
        style={[typeScale.body, styles.searchInput, { color: colors.text }]}
      />
      {value.length > 0 && (
        <Pressable accessibilityLabel="Clear search" onPress={() => onChangeText('')} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={colors.textSubtle} />
        </Pressable>
      )}
    </View>
  );
}

export function ProgressBar({ progress, tone = 'accent' }: { progress: number; tone?: 'accent' | 'success' }) {
  const { colors } = useTheme();
  return (
    <View
      role="progressbar"
      aria-valuenow={Math.round(progress * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={[styles.track, { backgroundColor: colors.surfaceSunken }]}
    >
      <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, progress * 100))}%`, backgroundColor: colors[tone] }]} />
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="heading">{title}</Text>
      {action}
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={24} color={colors.accent} />
      </View>
      <Text variant="subheading" align="center">{title}</Text>
      <Text tone="muted" align="center" style={{ maxWidth: 360 }}>{body}</Text>
      {action}
    </View>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'error' | 'warning'; children: ReactNode }) {
  const { colors } = useTheme();
  const map = {
    info: { bg: colors.accentSoft, fg: colors.accent, icon: 'information-circle' as const },
    error: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle' as const },
    warning: { bg: colors.highlightSoft, fg: colors.highlight, icon: 'warning' as const },
  }[tone];
  return (
    <View role={tone === 'error' ? 'alert' : undefined} style={[styles.notice, { backgroundColor: map.bg }]}>
      <Ionicons name={map.icon} size={18} color={map.fg} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>{isValidElement(children) ? children : <Text variant="caption">{children}</Text>}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenInner: { width: '100%', alignSelf: 'center', gap: spacing.xl },
  card: { borderRadius: radius.lg, borderWidth: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, height: 32, borderRadius: radius.pill, borderWidth: 1 },
  segment: { flexDirection: 'row', padding: 3, borderRadius: radius.md, borderWidth: 1, alignSelf: 'flex-start' },
  segmentItem: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  // outlineStyle is web-only (removes the browser focus outline; the field border shows focus).
  searchInput: { flex: 1, height: '100%', outlineStyle: 'none' } as unknown as ViewStyle,
  track: { height: 6, borderRadius: radius.pill, overflow: 'hidden', width: '100%' },
  fill: { height: '100%', borderRadius: radius.pill },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyIcon: { width: 52, height: 52, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  notice: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md },
});
