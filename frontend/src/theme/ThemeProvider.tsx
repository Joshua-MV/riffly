import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { updateSettings, useSettings } from '@/features/settings/store';

import { darkColors, lightColors, type ColorTokens } from './tokens';

export type SchemePreference = 'system' | 'dark' | 'light';

interface ThemeValue {
  colors: ColorTokens;
  scheme: 'dark' | 'light';
  preference: SchemePreference;
  setPreference: (p: SchemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/** Charcoal (dark) is the default; Ivory (light) or "match Windows" from Settings. Remembered. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const { theme: preference } = useSettings();
  const scheme = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
  const value = useMemo<ThemeValue>(
    () => ({ colors: scheme === 'dark' ? darkColors : lightColors, scheme, preference, setPreference: (p) => updateSettings({ theme: p }) }),
    [scheme, preference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
