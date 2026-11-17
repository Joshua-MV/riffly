import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { typeScale, type ColorTokens, type TypeVariant } from '@/theme/tokens';

type Tone = 'default' | 'muted' | 'subtle' | 'accent' | 'highlight' | 'success' | 'danger' | 'inverse';

const toneToken: Record<Tone, keyof ColorTokens> = {
  default: 'text',
  muted: 'textMuted',
  subtle: 'textSubtle',
  accent: 'accent',
  highlight: 'highlight',
  success: 'success',
  danger: 'danger',
  inverse: 'textInverse',
};

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  tone?: Tone;
  align?: 'left' | 'center' | 'right';
}

export function Text({ variant = 'body', tone = 'default', align, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const role = variant === 'hero' || variant === 'title' || variant === 'heading' ? 'heading' : undefined;
  return (
    <RNText
      role={role}
      style={[typeScale[variant], { color: colors[toneToken[tone]], textAlign: align }, style]}
      {...rest}
    />
  );
}
