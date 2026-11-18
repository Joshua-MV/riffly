import type { PressState } from '@/components/ui/pressState';
import { Icon } from '@/components/ui/Icon';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing, typeScale } from '@/theme/tokens';

import { Text } from './Text';

export type { IconName } from './Icon';
import type { IconName } from './Icon';
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

/** Controls are 28/36/44 px; anything hit while holding a guitar is 44 or more. */
const heights: Record<Size, number> = { sm: 30, md: 38, lg: 48 };

export function Button({
  label, onPress, variant = 'primary', size = 'md', icon, iconRight, loading, disabled, fullWidth,
  accessibilityHint, style,
}: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const bg: Record<Variant, string> = {
    primary: colors.accent,
    secondary: colors.surface,
    ghost: 'transparent',
    danger: 'transparent',
  };
  const fg: Record<Variant, string> = {
    primary: colors.onAccent,
    secondary: colors.text,
    ghost: colors.textMuted,
    danger: colors.danger,
  };
  const color = inactive ? colors.onDisabled : fg[variant];
  return (
    <Pressable
      role="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed, hovered }: PressState) => [
        styles.base,
        {
          height: heights[size],
          paddingHorizontal: size === 'sm' ? spacing.md : size === 'lg' ? spacing.xl : spacing.lg,
          backgroundColor: inactive && variant !== 'ghost' ? colors.disabled : bg[variant],
          borderColor: variant === 'secondary' ? colors.border : variant === 'danger' ? colors.dangerSoft : 'transparent',
          opacity: pressed ? 0.88 : 1,
        },
        hovered && !inactive && variant === 'primary' && { backgroundColor: colors.accentPressed },
        hovered && !inactive && variant === 'secondary' && { backgroundColor: colors.surfaceHover, borderColor: colors.borderStrong },
        hovered && !inactive && variant === 'ghost' && { backgroundColor: colors.surfaceHover },
        hovered && !inactive && variant === 'danger' && { backgroundColor: colors.dangerSoft },
        fullWidth && styles.full,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} size="small" />
      ) : (
        <View style={styles.row}>
          {icon && <Icon name={icon} size={size === 'lg' ? 20 : 16} color={color} />}
          <Text style={[size === 'sm' ? typeScale.caption : typeScale.bodyStrong, { color, fontFamily: typeScale.bodyStrong.fontFamily }]}>{label}</Text>
          {iconRight && <Icon name={iconRight} size={16} color={color} />}
        </View>
      )}
    </Pressable>
  );
}

export interface IconButtonProps {
  icon: IconName;
  label: string;
  onPress?: () => void;
  size?: number;
  active?: boolean;
  disabled?: boolean;
  tone?: 'default' | 'accent';
  children?: ReactNode;
}

export function IconButton({ icon, label, onPress, size = 44, active, disabled, tone = 'default' }: IconButtonProps) {
  const { colors } = useTheme();
  const filled = tone === 'accent';
  return (
    <Pressable
      role="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!active }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.icon,
        {
          width: size,
          height: size,
          backgroundColor: filled ? colors.accent : active ? colors.accentSoft : 'transparent',
          borderWidth: filled ? 0 : 1,
          borderColor: active ? colors.accent : colors.border,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <Icon
        name={icon}
        size={Math.round(size * 0.44)}
        color={filled ? colors.onAccent : active ? colors.accent : colors.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  full: { alignSelf: 'stretch' },
  icon: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
