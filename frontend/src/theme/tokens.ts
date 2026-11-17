/**
 * Riffly design tokens. Brand palette:
 *   ink #171827 · violet #9B7BFF · amber #FFB84D · mint #48D6B0 · coral #FF6D83 · lilac #F3F0FF
 * Components read semantic tokens (surface, textMuted, accent…) — never raw hex values.
 */

export const palette = {
  ink950: '#0F1019',
  ink900: '#171827',
  ink850: '#1D1F31',
  ink800: '#24263B',
  ink700: '#30334C',
  ink600: '#454865',
  ink400: '#7C7F9C',
  ink300: '#A3A5BE',
  ink100: '#E4E3F0',
  lilac50: '#FBFAFF',
  lilac100: '#F3F0FF',
  lilac200: '#E7E1FF',
  violet300: '#BBA6FF',
  violet400: '#9B7BFF',
  violet500: '#8361F5',
  violet700: '#5B3FC4',
  amber400: '#FFB84D',
  amber600: '#C9831A',
  mint400: '#48D6B0',
  mint600: '#1F9E7D',
  coral400: '#FF6D83',
  coral600: '#D9425A',
  white: '#FFFFFF',
} as const;

export interface ColorTokens {
  background: string;
  backgroundRaised: string;
  surface: string;
  surfaceHover: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  textInverse: string;
  accent: string;
  accentPressed: string;
  accentSoft: string;
  onAccent: string;
  highlight: string;
  highlightSoft: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  disabled: string;
  onDisabled: string;
  focusRing: string;
  scrim: string;
}

export const darkColors: ColorTokens = {
  background: palette.ink900,
  backgroundRaised: palette.ink950,
  surface: palette.ink850,
  surfaceHover: palette.ink800,
  surfaceSunken: palette.ink950,
  border: palette.ink700,
  borderStrong: palette.ink600,
  text: palette.lilac100,
  textMuted: palette.ink300,
  textSubtle: palette.ink400,
  textInverse: palette.ink900,
  accent: palette.violet400,
  accentPressed: palette.violet500,
  accentSoft: 'rgba(155,123,255,0.16)',
  onAccent: palette.ink950,
  highlight: palette.amber400,
  highlightSoft: 'rgba(255,184,77,0.14)',
  success: palette.mint400,
  successSoft: 'rgba(72,214,176,0.14)',
  danger: palette.coral400,
  dangerSoft: 'rgba(255,109,131,0.14)',
  warning: palette.amber400,
  disabled: palette.ink700,
  onDisabled: palette.ink400,
  focusRing: palette.violet300,
  scrim: 'rgba(15,16,25,0.7)',
};

export const lightColors: ColorTokens = {
  background: palette.lilac50,
  backgroundRaised: palette.white,
  surface: palette.white,
  surfaceHover: palette.lilac100,
  surfaceSunken: palette.lilac100,
  border: palette.lilac200,
  borderStrong: '#CFC6F2',
  text: palette.ink900,
  textMuted: palette.ink600,
  textSubtle: palette.ink400,
  textInverse: palette.lilac100,
  accent: palette.violet700,
  accentPressed: '#4A31A8',
  accentSoft: 'rgba(91,63,196,0.10)',
  onAccent: palette.white,
  highlight: palette.amber600,
  highlightSoft: 'rgba(255,184,77,0.18)',
  success: palette.mint600,
  successSoft: 'rgba(31,158,125,0.12)',
  danger: palette.coral600,
  dangerSoft: 'rgba(217,66,90,0.10)',
  warning: palette.amber600,
  disabled: palette.lilac200,
  onDisabled: palette.ink400,
  focusRing: palette.violet500,
  scrim: 'rgba(23,24,39,0.45)',
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Deliberately modest radii: soft, not bubbly. */
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const;

export const fonts = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
} as const;

export const typeScale = {
  hero: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -1 },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.5 },
  heading: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  subheading: { fontFamily: fonts.bodySemibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  overline: { fontFamily: fonts.bodySemibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.2, textTransform: 'uppercase' as const },
  mono: { fontFamily: fonts.displayMedium, fontSize: 15, lineHeight: 20 },
} as const;

export type TypeVariant = keyof typeof typeScale;

export const breakpoints = { tablet: 768, desktop: 1024, wide: 1400 } as const;

export const motion = { fast: 120, base: 200, slow: 320 } as const;

export function shadow(level: 1 | 2, scheme: 'dark' | 'light') {
  const opacity = scheme === 'dark' ? 0.35 : 0.08;
  return level === 1
    ? { shadowColor: '#000', shadowOpacity: opacity, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }
    : { shadowColor: '#000', shadowOpacity: opacity * 1.4, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 };
}
