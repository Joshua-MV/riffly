/**
 * Riffly design tokens: "The Practice Room".
 *
 * Materials from the amp corner of a rehearsal room: charcoal tolex, ivory piping, olive and
 * terracotta grille cloth, and one amber pilot lamp that marks what is live right now.
 *   Studio Charcoal #252622 · Warm Ivory #F2EEE4 · Vintage Amber #C58A45
 *   Muted Olive #65745B · Terracotta #A65D48 · Stone Grey #77766F
 * Rules: amber means "now" (current chord, beat, active string, primary action) and is never
 * decoration; depth comes from tone steps, not shadows; labels are engraved (mono small caps).
 * Components read semantic tokens (surface, textMuted, accent…), never raw hex values.
 */

export const brand = {
  charcoal: '#252622',
  ivory: '#F2EEE4',
  amber: '#C58A45',
  olive: '#65745B',
  terracotta: '#A65D48',
  stone: '#77766F',
} as const;

export interface ColorTokens {
  /** bg/canvas: the stage behind panels. */
  background: string;
  /** bg/window: rail, transport, title bar. */
  backgroundRaised: string;
  /** surface/panel */
  surface: string;
  /** surface/raised: hover, selected rows, inputs. */
  surfaceHover: string;
  /** Wells: lanes, tracks, recessed areas. */
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  divider: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  textDisabled: string;
  textInverse: string;
  /** Vintage amber: primary action, active selection. */
  accent: string;
  accentPressed: string;
  accentSoft: string;
  onAccent: string;
  /** Amber as text: "now" (current chord, beat, live readouts). */
  highlight: string;
  highlightSoft: string;
  /** Olive: in tune, analysis complete. */
  success: string;
  successSoft: string;
  /** Terracotta: off pitch, errors, muted strings. */
  danger: string;
  dangerSoft: string;
  /** Brass: low confidence, weak signal. */
  warning: string;
  warningSoft: string;
  disabled: string;
  onDisabled: string;
  focusRing: string;
  scrim: string;
}

export const darkColors: ColorTokens = {
  background: '#252622',
  backgroundRaised: '#1E1F1B',
  surface: '#2E2F2A',
  surfaceHover: '#373832',
  surfaceSunken: '#1E1F1B',
  border: '#3E3F39',
  borderStrong: '#4C4D46',
  divider: '#32332E',
  text: '#F2EEE4',
  textMuted: '#B3B0A6',
  textSubtle: '#9C9A91',
  textDisabled: '#5E5D57',
  textInverse: '#252622',
  accent: '#C58A45',
  accentPressed: '#D29A57',
  accentSoft: 'rgba(197,138,69,0.16)',
  onAccent: '#1E1F1B',
  highlight: '#D9A15E',
  highlightSoft: 'rgba(197,138,69,0.14)',
  success: '#8FA07F',
  successSoft: 'rgba(101,116,91,0.28)',
  danger: '#C97A63',
  dangerSoft: 'rgba(166,93,72,0.22)',
  warning: '#BFA266',
  warningSoft: 'rgba(191,162,102,0.16)',
  disabled: '#373832',
  onDisabled: '#5E5D57',
  focusRing: '#D9A15E',
  scrim: 'rgba(20,21,18,0.72)',
};

export const lightColors: ColorTokens = {
  background: '#F2EEE4',
  backgroundRaised: '#E9E4D8',
  surface: '#FAF8F2',
  surfaceHover: '#E4DED1',
  surfaceSunken: '#E9E4D8',
  border: '#D6CFC0',
  borderStrong: '#C2B9A7',
  divider: '#E2DCCF',
  text: '#252622',
  textMuted: '#55544E',
  textSubtle: '#6B6A63',
  textDisabled: '#A9A69C',
  textInverse: '#F2EEE4',
  accent: '#C58A45',
  accentPressed: '#B57B38',
  accentSoft: 'rgba(197,138,69,0.18)',
  onAccent: '#252622',
  highlight: '#8F5E24',
  highlightSoft: 'rgba(197,138,69,0.16)',
  success: '#4E5C45',
  successSoft: 'rgba(101,116,91,0.18)',
  danger: '#8E4A37',
  dangerSoft: 'rgba(166,93,72,0.14)',
  warning: '#7D6630',
  warningSoft: 'rgba(191,162,102,0.18)',
  disabled: '#E4DED1',
  onDisabled: '#A9A69C',
  focusRing: '#8F5E24',
  scrim: 'rgba(37,38,34,0.45)',
};

/** 4-pt base. */
export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Restrained radii: 4 chips · 6 controls · 10 panels · full only for the transport. */
export const radius = { xs: 4, sm: 6, md: 6, lg: 10, pill: 999 } as const;

export const fonts = {
  /** Geist 600: chords, titles. */
  display: 'Geist_600SemiBold',
  displayMedium: 'Geist_500Medium',
  body: 'Geist_400Regular',
  bodyMedium: 'Geist_500Medium',
  bodySemibold: 'Geist_600SemiBold',
  /** Newsreader: display titles. */
  serif: 'Newsreader_400Regular',
  serifItalic: 'Newsreader_400Regular_Italic',
  /** Geist Mono: engraved labels and readouts. */
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
} as const;

export const typeScale = {
  /** Display · Newsreader 56/1.0 */
  hero: { fontFamily: fonts.serif, fontSize: 52, lineHeight: 56, letterSpacing: -1 },
  /** Screen titles · Newsreader */
  title: { fontFamily: fonts.serif, fontSize: 34, lineHeight: 40, letterSpacing: -0.5 },
  /** Title · Geist 600 20/1.3 */
  heading: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  subheading: { fontFamily: fonts.bodySemibold, fontSize: 15, lineHeight: 21 },
  /** Body · Geist 400 14/1.55 */
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 22 },
  caption: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18 },
  /** Label · Mono 500 11, +14% caps: the engraved label. */
  overline: { fontFamily: fonts.monoMedium, fontSize: 11, lineHeight: 14, letterSpacing: 1.5, textTransform: 'uppercase' as const },
  /** Readout · Mono, tabular */
  mono: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 20, fontVariant: ['tabular-nums'] as 'tabular-nums'[] },
  readout: { fontFamily: fonts.mono, fontSize: 28, lineHeight: 32, letterSpacing: -0.5, fontVariant: ['tabular-nums'] as 'tabular-nums'[] },
  /** Chord · Geist 600 120/0.9 */
  chord: { fontFamily: fonts.display, fontSize: 120, lineHeight: 112, letterSpacing: -4 },
} as const;

export type TypeVariant = keyof typeof typeScale;

/** ≥1280 full rail · 960–1279 icon rail · <960 focus (Android-style). */
export const breakpoints = { tablet: 760, desktop: 960, wide: 1280 } as const;

/** Instant 80 · Quick 160 · Settle 240 (ms). Musical motion follows the audio clock instead. */
export const motion = { fast: 80, base: 160, slow: 240 } as const;

/** Depth is tone, not shadow: only modals and menus get a single soft shadow. */
export function shadow(level: 1 | 2, scheme: 'dark' | 'light') {
  if (level === 1) return {};
  const opacity = scheme === 'dark' ? 0.45 : 0.14;
  return { shadowColor: '#000', shadowOpacity: opacity, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 };
}

/** Song artwork colour from the song's key: generated, no artwork needed. */
export function keyColor(key: string | null | undefined): { bg: string; fg: string } {
  if (!key) return { bg: brand.stone, fg: brand.ivory };
  const pc = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].indexOf(key.split(' ')[0].replace('Db', 'C#').replace('D#', 'Eb').replace('Gb', 'F#').replace('G#', 'Ab').replace('A#', 'Bb'));
  const tiles = [
    { bg: brand.olive, fg: brand.ivory },
    { bg: brand.terracotta, fg: brand.ivory },
    { bg: '#2F302B', fg: brand.amber },
    { bg: brand.amber, fg: brand.charcoal },
    { bg: brand.stone, fg: brand.ivory },
  ];
  return tiles[(pc < 0 ? 0 : pc) % tiles.length];
}
