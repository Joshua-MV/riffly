import { router } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { Platform, View } from 'react-native';

import { usePlayer } from '@/features/player/PlayerProvider';
import { SPEEDS, Transport } from '@/features/player/Transport';
import { useTheme } from '@/theme/ThemeProvider';
import { breakpoints } from '@/theme/tokens';
import { useLayout } from '@/theme/useLayout';

import { goTo, Rail, usePracticeSong, type Destination } from './Rail';

const KEYS: Record<string, Destination> = { '1': 'tuner', '2': 'songs', '3': 'play', '4': 'lyrics', '5': 'strum', '6': 'tab', '7': 'learn' };

/**
 * One window, three zones: the rail (where you are), the stage (what you're doing) and the
 * transport strip, which never leaves, so audio never stops when you navigate.
 * Below 960 px the rail gives way to the phone layout's bottom bar.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const { width } = useLayout();
  const wide = width >= breakpoints.desktop;
  useShortcuts();
  if (!wide) return <View style={{ flex: 1, backgroundColor: colors.background }}>{children}</View>;
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
      <Rail compact={width < breakpoints.wide} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flex: 1 }}>{children}</View>
        <Transport />
      </View>
    </View>
  );
}

/** Learnable single-key shortcuts (Windows app). Ignored while typing in a field. */
function useShortcuts() {
  const player = usePlayer();
  const song = usePracticeSong();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        goTo('settings', song);
        return;
      }
      if (e.ctrlKey && (e.key === 'k' || e.key === 'o')) {
        e.preventDefault();
        router.navigate({ pathname: '/library', params: e.key === 'o' ? { import: '1' } : { search: '1' } });
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (KEYS[e.key]) {
        goTo(KEYS[e.key], song);
        return;
      }
      if (!player.song) return;
      const beat = player.song.analysis.bpm ? 60 / player.song.analysis.bpm : 0.5;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          player.toggle();
          break;
        case 'ArrowLeft':
          player.seek(Math.max(0, player.currentTime - (e.shiftKey ? beat * 4 : 5)));
          break;
        case 'ArrowRight':
          player.seek(player.currentTime + (e.shiftKey ? beat * 4 : 5));
          break;
        case 'm':
        case 'M':
          player.setMetronome(!player.metronome);
          break;
        case 'l':
        case 'L':
          if (player.loop) player.setLoop(null);
          else player.setLoop({ start: Math.max(0, player.currentTime - beat * 8), end: player.currentTime });
          break;
        case '[':
          player.setLoop({ start: player.currentTime, end: player.loop?.end ?? player.currentTime + beat * 8 });
          break;
        case ']':
          player.setLoop({ start: player.loop?.start ?? Math.max(0, player.currentTime - beat * 8), end: player.currentTime });
          break;
        case '-':
        case '=': {
          const i = SPEEDS.indexOf(player.rate as (typeof SPEEDS)[number]);
          const j = e.key === '-' ? Math.min(SPEEDS.length - 1, i + 1) : Math.max(0, i - 1);
          player.setRate(SPEEDS[j < 0 ? 0 : j]);
          break;
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [player, song]);
}
