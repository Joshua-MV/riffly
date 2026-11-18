import type { PressState } from '@/components/ui/pressState';
import { Icon } from '@/components/ui/Icon';
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
export function Screen({ children, maxWidth = 1280, scroll = true }: { children: ReactNode; maxWidth?: number; scroll?: boolean }) {
  const { colors } = useTheme();
  const { isPhone } = useLayout();
  const insets = useSafeAreaInsets();
  const inner = (
    <View
      style={[
        styles.screenInner,
        { maxWidth, paddingHorizontal: isPhone ? spacing.lg : spacing.xxl, paddingTop: Math.max(insets.top, spacing.lg) + (isPhone ? spacing.sm : spacing.md) },
      ]}
    >
      {children}
    </View>
  );
  return scroll ? (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
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
        pressed && { opacity: 0.9 },
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
        { backgroundColor: selected ? colors.accentSoft : colors.surface, borderColor: selected ? colors.accent : colors.border },
      ]}
    >
      {icon && <Icon name={icon} size={14} color={selected ? colors.highlight : colors.textMuted} />}
      <Text variant="caption" style={{ color: selected ? colors.text : colors.textMuted }}>
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
            style={[styles.segmentItem, active && { backgroundColor: colors.surfaceHover, borderColor: colors.borderStrong }]}
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
      <Icon name="search" size={18} color={colors.textSubtle} />
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
          <Icon name="close-circle" size={18} color={colors.textSubtle} />
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

/** Engraved mono label (small caps), optionally with a hairline rule after it. */
export function Label({ children, tone = 'subtle', style }: { children: ReactNode; tone?: 'subtle' | 'highlight' | 'success' | 'danger' | 'muted'; style?: StyleProp<ViewStyle> }) {
  return (
    <Text variant="overline" tone={tone} style={style as never}>
      {children}
    </Text>
  );
}

/** Rack-unit readout: an engraved label over a mono value. */
export function Readout({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'highlight' | 'success' | 'danger' | 'warning' }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text variant="overline" tone="subtle">{label}</Text>
      <Text variant="readout" style={{ color: tone ? colors[tone] : colors.text, fontSize: 24, lineHeight: 30 }}>{value}</Text>
      {sub ? <Text variant="caption" tone="subtle">{sub}</Text> : null}
    </View>
  );
}

/** A small square of a toggle switch (amber when on). */
export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { colors } = useTheme();
  return (
    <Pressable role="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} onPress={() => onChange(!value)} hitSlop={8}
      style={[styles.toggle, { backgroundColor: value ? colors.accent : colors.surfaceHover, borderColor: value ? colors.accent : colors.border }]}>
      <View style={[styles.knob, { backgroundColor: value ? colors.onAccent : colors.textSubtle, transform: [{ translateX: value ? 14 : 0 }] }]} />
    </Pressable>
  );
}

/** − value + stepper (capo, tempo). */
export function Stepper({ label, value, onMinus, onPlus, minusDisabled, plusDisabled }: { label: string; value: string; onMinus: () => void; onPlus: () => void; minusDisabled?: boolean; plusDisabled?: boolean }) {
  const { colors } = useTheme();
  const btn = (icon: IconName, onPress: () => void, disabled?: boolean, a11y?: string) => (
    <Pressable role="button" accessibilityLabel={a11y} disabled={disabled} onPress={onPress} hitSlop={6} style={({ hovered }: PressState) => [styles.stepBtn, { opacity: disabled ? 0.35 : 1, backgroundColor: hovered ? colors.surfaceHover : 'transparent' }]}>
      <Icon name={icon} size={14} color={colors.textMuted} />
    </Pressable>
  );
  return (
    <View style={[styles.stepper, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      {btn('remove', onMinus, minusDisabled, `Less ${label}`)}
      <Text variant="overline" style={{ color: colors.text, paddingHorizontal: 6 }}>{value}</Text>
      {btn('add', onPlus, plusDisabled, `More ${label}`)}
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
      <View style={[styles.emptyIcon, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Icon name={icon} size={22} color={colors.highlight} />
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
    info: { bg: colors.surface, fg: colors.textSubtle, icon: 'information-circle' as const },
    error: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle' as const },
    warning: { bg: colors.warningSoft, fg: colors.warning, icon: 'warning' as const },
  }[tone];
  return (
    <View role={tone === 'error' ? 'alert' : undefined} style={[styles.notice, { backgroundColor: map.bg, borderColor: tone === 'info' ? colors.border : 'transparent' }]}>
      <Icon name={map.icon} size={16} color={map.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>{isValidElement(children) ? children : <Text variant="caption">{children}</Text>}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenInner: { width: '100%', alignSelf: 'center', gap: spacing.xl },
  card: { borderRadius: radius.lg, borderWidth: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, height: 30, borderRadius: radius.xs, borderWidth: 1 },
  segment: { flexDirection: 'row', padding: 2, borderRadius: radius.md, borderWidth: 1, alignSelf: 'flex-start' },
  segmentItem: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.xs, borderWidth: 1, borderColor: 'transparent' },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 38, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  // outlineStyle is web-only (removes the browser focus outline; the field border shows focus).
  searchInput: { flex: 1, height: '100%', outlineStyle: 'none' } as unknown as ViewStyle,
  track: { height: 4, borderRadius: radius.pill, overflow: 'hidden', width: '100%' },
  fill: { height: '100%', borderRadius: radius.pill },
  toggle: { width: 32, height: 18, borderRadius: 9, borderWidth: 1, padding: 2, justifyContent: 'center' },
  knob: { width: 12, height: 12, borderRadius: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 30, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 2 },
  stepBtn: { width: 26, height: 26, borderRadius: radius.xs, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyIcon: { width: 52, height: 52, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  notice: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
});
