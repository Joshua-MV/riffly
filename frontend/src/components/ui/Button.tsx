import type { PressState } from '@/components/ui/pressState';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing, typeScale } from '@/theme/tokens';

import { Text } from './Text';

export type IconName = ComponentProps<typeof Ionicons>['name'];
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

const heights: Record<Size, number> = { sm: 36, md: 44, lg: 56 };

export function Button({
  label, onPress, variant = 'primary', size = 'md', icon, iconRight, loading, disabled, fullWidth,
  accessibilityHint, style,
}: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const bg: Record<Variant, string> = {
    primary: colors.accent,
    secondary: colors.surfaceHover,
    ghost: 'transparent',
    danger: colors.dangerSoft,
  };
  const fg: Record<Variant, string> = {
    primary: colors.onAccent,
    secondary: colors.text,
    ghost: colors.accent,
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
          paddingHorizontal: size === 'sm' ? spacing.md : spacing.xl,
          backgroundColor: inactive && variant !== 'ghost' ? colors.disabled : bg[variant],
          borderColor: variant === 'secondary' ? colors.border : 'transparent',
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        hovered && !inactive && variant === 'primary' && { backgroundColor: colors.accentPressed },
        hovered && !inactive && variant !== 'primary' && { backgroundColor: colors.accentSoft },
        fullWidth && styles.full,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} size="small" />
      ) : (
        <View style={styles.row}>
          {icon && <Ionicons name={icon} size={size === 'lg' ? 22 : 18} color={color} />}
          <Text style={[size === 'lg' ? typeScale.subheading : typeScale.bodyStrong, { color }]}>{label}</Text>
          {iconRight && <Ionicons name={iconRight} size={18} color={color} />}
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
          backgroundColor: filled ? colors.accent : active ? colors.accentSoft : colors.surfaceHover,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={Math.round(size * 0.46)}
        color={filled ? colors.onAccent : active ? colors.accent : colors.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  full: { alignSelf: 'stretch' },
  icon: { borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
