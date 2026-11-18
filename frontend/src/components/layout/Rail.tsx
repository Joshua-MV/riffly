import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { ArtTile, keyShort } from '@/components/music/ArtTile';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { PressState } from '@/components/ui/pressState';
import { Text } from '@/components/ui/Text';
import { practiceOf, type LocalSong } from '@/features/library/model';
import { usePlayer } from '@/features/player/PlayerProvider';
import { useSettings } from '@/features/settings/store';
import { useSongs } from '@/features/songs/hooks';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { Logo, LogoMark } from './Logo';

export type SongView = 'overview' | 'play' | 'strum' | 'tab';
export type Destination = 'tuner' | 'songs' | 'song' | 'play' | 'strum' | 'tab' | 'learn' | 'settings';

/** Where the app is now, from the route. */
export function useDestination(): Destination {
  const path = usePathname();
  const { view } = useGlobalSearchParams<{ view?: string }>();
  if (path === '/' || path === '/index') return 'tuner';
  if (path.startsWith('/song/')) return (['play', 'strum', 'tab'].includes(view ?? '') ? view : 'song') as Destination;
  if (path.startsWith('/chord')) return 'learn';
  if (path === '/profile') return 'settings';
  return 'songs';
}

/** The song the Practice section works on: the one in the player, else the most recent. */
export function usePracticeSong(): LocalSong | null {
  const player = usePlayer();
  const songs = useSongs();
  return useMemo(() => {
    if (player.song) return player.song;
    const list = songs.data ?? [];
    return [...list].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0] ?? null;
  }, [player.song, songs.data]);
}

export function goTo(d: Destination, song: LocalSong | null) {
  switch (d) {
    case 'tuner':
      return router.navigate('/');
    case 'songs':
      return router.navigate('/library');
    case 'learn':
      return router.navigate('/chords');
    case 'settings':
      return router.navigate('/profile');
    default:
      if (!song) return router.navigate('/library');
      return router.navigate({ pathname: '/song/[id]', params: { id: song.id, view: d === 'song' ? 'overview' : d } });
  }
}

/**
 * The left rail: where you are. Instrument, songs, the loaded song's practice views, learning,
 * settings. Collapses to icons on narrower windows.
 */
export function Rail({ compact = false }: { compact?: boolean }) {
  const { colors } = useTheme();
  const here = useDestination();
  const song = usePracticeSong();
  const songs = useSongs();
  const count = songs.data?.length ?? 0;
  const p = song ? practiceOf(song) : null;
  const { reduceMotion } = useSettings();

  // The highlight glides from item to item: one panel behind the list, springing to wherever
  // the active item is.
  const layouts = useRef<Partial<Record<Destination, { y: number; h: number }>>>({});
  const glideY = useRef(new Animated.Value(0)).current;
  const glideH = useRef(new Animated.Value(0)).current;
  const shown = useRef(false);
  const [, setMeasured] = useState(0);
  useEffect(() => {
    const l = layouts.current[here];
    if (!l) return;
    if (!shown.current || reduceMotion) {
      glideY.setValue(l.y);
      glideH.setValue(l.h);
      shown.current = true;
      return;
    }
    Animated.parallel([
      Animated.spring(glideY, { toValue: l.y, friction: 9, tension: 120, useNativeDriver: false }),
      Animated.spring(glideH, { toValue: l.h, friction: 9, tension: 120, useNativeDriver: false }),
    ]).start();
  });
  const measure = (d: Destination) => (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    const prev = layouts.current[d];
    if (prev && prev.y === y && prev.h === height) return;
    layouts.current[d] = { y, h: height };
    if (d === here) setMeasured((n) => n + 1);
  };
  const glides = here !== 'settings' && !!layouts.current[here];

  const item = (d: Destination, label: string, icon: IconName, key?: string, extra?: ReactNode) => {
    const active = here === d;
    const disabled = ['play', 'strum', 'tab'].includes(d) && !song;
    return (
      <Pressable
        key={d}
        role="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: active, disabled }}
        disabled={disabled}
        onPress={() => goTo(d, song)}
        onLayout={measure(d)}
        style={({ hovered }: PressState) => [
          styles.item,
          compact && styles.itemCompact,
          active && d === 'settings' && { backgroundColor: colors.surfaceHover },
          hovered && !active && { backgroundColor: colors.surface },
          disabled && { opacity: 0.4 },
        ]}
      >
        <Icon name={icon} size={18} color={active ? colors.text : colors.textSubtle} />
        {!compact && (
          <>
            <Text variant="body" style={{ flex: 1, color: active ? colors.text : colors.textMuted }}>{label}</Text>
            {extra}
            {active ? <View style={[styles.lamp, { backgroundColor: colors.accent }]} /> : null}
          </>
        )}
      </Pressable>
    );
  };
  const section = (label: string) => (compact ? <View style={[styles.rule, { backgroundColor: colors.divider }]} /> : <Text variant="overline" tone="subtle" style={styles.section}>{label}</Text>);

  return (
    <View style={[styles.rail, compact && { width: 64, paddingHorizontal: spacing.sm }, { backgroundColor: colors.backgroundRaised, borderRightColor: colors.border }]}>
      <View style={[styles.logo, compact && { paddingHorizontal: 0, alignItems: 'center' }]}>
        {compact ? <LogoMark size={30} /> : <Logo size={24} />}
      </View>
      <View role="tablist" style={{ gap: 2 }}>
        {glides && (
          <Animated.View
            pointerEvents="none"
            style={[styles.glide, { top: glideY, height: glideH, backgroundColor: here === 'song' ? 'transparent' : colors.surfaceHover }]}
          />
        )}
        {section('Instrument')}
        {item('tuner', 'Tuner', 'speedometer-outline', '1')}
        {section('Songs')}
        {item('songs', 'My Songs', 'library-outline', '2')}
        {section('Practice')}
        {song && !compact && (
          <Pressable
            role="tab"
            accessibilityLabel={`${song.title}: song overview`}
            accessibilityState={{ selected: here === 'song' }}
            onPress={() => goTo('song', song)}
            onLayout={measure('song')}
            style={({ hovered }: PressState) => [
              styles.songCard,
              { backgroundColor: here === 'song' ? colors.surfaceHover : colors.surface, borderColor: here === 'song' ? colors.borderStrong : colors.border },
              hovered && { borderColor: colors.borderStrong },
            ]}
          >
            <ArtTile songKey={song.analysis.key} size={32} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="bodyStrong" numberOfLines={1} style={{ fontSize: 13, lineHeight: 18 }}>{song.title}</Text>
              <Text variant="overline" tone="subtle" numberOfLines={1} style={{ fontSize: 9.5, letterSpacing: 1 }}>
                {[keyShort(song.analysis.key), song.analysis.bpm ? `${Math.round(song.analysis.bpm)} BPM` : null, p?.capo ? `Capo ${p.capo}` : null].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </Pressable>
        )}
        {song && compact && (
          <Pressable accessibilityLabel={`${song.title}: song overview`} onPress={() => goTo('song', song)} style={{ alignItems: 'center', paddingVertical: 4 }}>
            <ArtTile songKey={song.analysis.key} size={32} />
          </Pressable>
        )}
        {item('play', 'Play Along', 'play-circle-outline', '3')}
        {item('strum', 'Strum', 'swap-vertical', '4')}
        {item('tab', 'Tab', 'list-outline', '5')}
        {section('Learn')}
        {item('learn', 'Chords & drills', 'book-outline', '6')}
      </View>
      <View style={{ flex: 1 }} />
      {item('settings', 'Settings', 'options-outline', 'Ctrl ,')}
      {!compact && (
        <View style={styles.footer}>
          <View style={[styles.dot, { backgroundColor: colors.success }]} />
          <Text variant="caption" tone="subtle" style={{ fontSize: 11.5 }}>Offline · {count} {count === 1 ? 'song' : 'songs'} stored locally</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { width: 232, paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.md, borderRightWidth: 1 },
  logo: { paddingHorizontal: spacing.sm, marginBottom: spacing.lg },
  section: { paddingHorizontal: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.xs, fontSize: 10 },
  rule: { height: 1, marginVertical: spacing.md, marginHorizontal: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, height: 36, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  itemCompact: { justifyContent: 'center', paddingHorizontal: 0 },
  key: { fontSize: 10.5 },
  lamp: { width: 6, height: 6, borderRadius: 3 },
  glide: { position: 'absolute', left: 0, right: 0, borderRadius: radius.md },
  songCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.xs },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: spacing.md },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
