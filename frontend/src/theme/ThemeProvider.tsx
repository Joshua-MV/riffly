import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { darkColors, lightColors, type ColorTokens } from './tokens';

export type SchemePreference = 'system' | 'dark' | 'light';

interface ThemeValue {
  colors: ColorTokens;
  scheme: 'dark' | 'light';
  preference: SchemePreference;
  setPreference: (p: SchemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/** Dark is the default; "system" follows the OS only when the user opts in. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreference] = useState<SchemePreference>('dark');
  const scheme = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
  const value = useMemo<ThemeValue>(
    () => ({ colors: scheme === 'dark' ? darkColors : lightColors, scheme, preference, setPreference }),
    [scheme, preference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
