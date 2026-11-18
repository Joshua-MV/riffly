import { isTauri } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ArtTile, keyShort } from '@/components/music/ArtTile';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Chip, EmptyState, Notice, Screen, SearchField, SegmentedControl } from '@/components/ui/primitives';
import type { PressState } from '@/components/ui/pressState';
import { Stagger } from '@/components/ui/FadeIn';
import { Text } from '@/components/ui/Text';
import { ImportList } from '@/features/library/ImportList';
import { practiceOf, type LocalSong } from '@/features/library/model';
import { usePlayer } from '@/features/player/PlayerProvider';
import { useDeleteSong, useSongs } from '@/features/songs/hooks';
import { formatTime } from '@/features/songs/timeline';
import { DropZone, useSongImport } from '@/features/songs/UploadPanel';
import { tuningById } from '@/lib/music/instruments';
import { useTheme } from '@/theme/ThemeProvider';
import { useLayout } from '@/theme/useLayout';
import { radius, spacing } from '@/theme/tokens';

type Filter = 'all' | 'ready' | 'standard' | 'alt' | 'review' | 'favourites';
type Sort = 'recent' | 'title' | 'key';

function confirmDelete(song: LocalSong, onConfirm: () => void) {
  const message = `Remove “${song.title}” from Riffly? Its MP3, chords and your corrections are deleted from this computer.`;
  if (isTauri()) {
    // The Windows app's web view doesn't show window.confirm (it would answer "yes" without
    // asking), so use a real Windows dialog. Anything but an explicit "Remove" keeps the song.
    void ask(message, { title: 'Remove song', kind: 'warning', okLabel: 'Remove from Riffly', cancelLabel: 'Keep' })
      .then((yes) => yes && onConfirm())
      .catch(() => undefined);
  } else if (Platform.OS === 'web') {
    if (window.confirm(message)) onConfirm();
  } else {
    Alert.alert('Remove song', message, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onConfirm },
    ]);
  }
}

/** Mean confidence of the detected chords; low means "review chords". */
function confidenceOf(song: LocalSong): number {
  const c = song.analysis.chords.filter((x) => x.label !== 'N');
  return c.length ? c.reduce((n, x) => n + x.confidence, 0) / c.length : 0;
}

export default function LibraryScreen() {
  const { colors } = useTheme();
  const { isPhone } = useLayout();
  const songs = useSongs();
  const remove = useDeleteSong();
  const player = usePlayer();
  const imports = useSongImport();
  const params = useLocalSearchParams<{ import?: string; search?: string }>();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');

  useEffect(() => {
    if (params.import === '1') void imports.pick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.import]);

  const all = songs.data ?? [];
  const totalTime = all.reduce((n, s) => n + s.analysis.duration, 0);
  const counts = {
    all: all.length,
    ready: all.filter((s) => confidenceOf(s) >= 0.45).length,
    standard: all.filter((s) => practiceOf(s).tuning === 'standard').length,
    alt: all.filter((s) => practiceOf(s).tuning !== 'standard').length,
    review: all.filter((s) => confidenceOf(s) < 0.45).length,
    favourites: all.filter((s) => s.isFavourite).length,
  };
  const recent = useMemo(() => [...all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5), [all]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = all.filter((s) => {
      const p = practiceOf(s);
      const ok =
        filter === 'all' ||
        (filter === 'ready' && confidenceOf(s) >= 0.45) ||
        (filter === 'standard' && p.tuning === 'standard') ||
        (filter === 'alt' && p.tuning !== 'standard') ||
        (filter === 'review' && confidenceOf(s) < 0.45) ||
        (filter === 'favourites' && s.isFavourite);
      const match = !q || s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q) || (s.analysis.key ?? '').toLowerCase().includes(q);
      return ok && match;
    });
    return list.sort((a, b) =>
      sort === 'title' ? a.title.localeCompare(b.title) : sort === 'key' ? (a.analysis.key ?? '').localeCompare(b.analysis.key ?? '') : b.updatedAt.localeCompare(a.updatedAt),
    );
  }, [all, query, filter, sort]);

  const open = (s: LocalSong) => router.push({ pathname: '/song/[id]', params: { id: s.id, view: 'overview' } });

  return (
    <Screen maxWidth={1280}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text variant="title">My Songs</Text>
          <Text variant="overline" tone="subtle">{all.length} {all.length === 1 ? 'song' : 'songs'} · {formatTime(totalTime)}</Text>
        </View>
        <View style={styles.actions}>
          <View style={{ width: isPhone ? '100%' : 300 }}>
            <SearchField value={query} onChangeText={setQuery} placeholder="Search title, artist, key…" />
          </View>
          <SegmentedControl<Sort> label="Sort songs" value={sort} onChange={setSort} options={[{ value: 'recent', label: 'Recent' }, { value: 'title', label: 'A–Z' }, { value: 'key', label: 'Key' }]} />
          <Button label="Import audio" icon="add" onPress={() => void imports.pick()} />
        </View>
      </View>

      <View style={styles.topRow}>
        <DropZone onPick={() => void imports.pick()} dragging={imports.dragging} />
        <ImportList />
      </View>
      {imports.error && <Notice tone="error">{imports.error}</Notice>}

      {songs.isLoading && <ActivityIndicator />}
      {songs.isError && <Notice tone="error">{(songs.error as Error).message}</Notice>}

      {recent.length > 0 && (
        <View style={{ gap: spacing.md }}>
          <Text variant="overline" tone="subtle">Recently played</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
            {recent.map((s, i) => (
              <Stagger key={s.id} index={i}>
              <Pressable role="link" accessibilityLabel={`Open ${s.title}`} onPress={() => open(s)} style={({ hovered, pressed }: PressState) => [styles.tile, { transform: [{ translateY: hovered && !pressed ? -3 : 0 }, { scale: pressed ? 0.98 : 1 }] }]}>
                <BigTile songKey={s.analysis.key} />
                <Text variant="bodyStrong" numberOfLines={1} style={{ marginTop: spacing.sm }}>{s.title}</Text>
                <Text variant="caption" tone="subtle" numberOfLines={1}>{s.artist ?? 'Unknown artist'}</Text>
              </Pressable>
              </Stagger>
            ))}
          </ScrollView>
        </View>
      )}

      {all.length > 0 && (
        <View style={styles.filters}>
          <Chip label={`All ${counts.all}`} selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label={`Ready ${counts.ready}`} selected={filter === 'ready'} onPress={() => setFilter('ready')} />
          <Chip label="Standard" selected={filter === 'standard'} onPress={() => setFilter('standard')} />
          {counts.alt > 0 && <Chip label="Alt. tunings" selected={filter === 'alt'} onPress={() => setFilter('alt')} />}
          {counts.review > 0 && <Chip label={`Needs review ${counts.review}`} selected={filter === 'review'} onPress={() => setFilter('review')} />}
          {counts.favourites > 0 && <Chip label="Favourites" icon="heart-outline" selected={filter === 'favourites'} onPress={() => setFilter('favourites')} />}
        </View>
      )}

      {songs.data && rows.length === 0 && (
        <EmptyState
          icon="library-outline"
          title={all.length === 0 ? 'No songs yet' : 'Nothing matches'}
          body={all.length === 0 ? 'Drop an MP3 or WAV here, or press Ctrl O.' : 'Try a different search or filter.'}
        />
      )}

      {rows.length > 0 && (
        <View>
          {!isPhone && (
            <View style={[styles.tr, { borderBottomColor: colors.divider }]}>
              <Text variant="overline" tone="subtle" style={styles.cTitle}>Title</Text>
              <Text variant="overline" tone="subtle" style={styles.cKey}>Key</Text>
              <Text variant="overline" tone="subtle" style={styles.cBpm}>BPM</Text>
              <Text variant="overline" tone="subtle" style={styles.cTuning}>Tuning</Text>
              <Text variant="overline" tone="subtle" style={styles.cTime}>Time</Text>
              <Text variant="overline" tone="subtle" style={styles.cStatus}>Status</Text>
              <View style={styles.cAct} />
            </View>
          )}
          {rows.map((s, rowIndex) => {
            const nowPlaying = player.song?.id === s.id && player.playing;
            const review = confidenceOf(s) < 0.45;
            const status = nowPlaying ? { text: 'Now playing', color: colors.highlight } : review ? { text: 'Low confidence — review chords', color: colors.warning } : { text: 'Ready to play', color: colors.success };
            const tuning = tuningById(practiceOf(s).tuning).name;
            return (
              <Stagger key={s.id} index={rowIndex + recent.length}>
              <Pressable
                role="link"
                accessibilityLabel={`${s.title}. ${s.analysis.key ?? ''} ${s.analysis.bpm ? Math.round(s.analysis.bpm) + ' BPM' : ''}. ${status.text}`}
                onPress={() => open(s)}
                style={({ hovered }: PressState) => [
                  styles.tr,
                  styles.row,
                  { borderBottomColor: colors.divider },
                  nowPlaying && { backgroundColor: colors.highlightSoft },
                  hovered && !nowPlaying && { backgroundColor: colors.surface },
                ]}
              >
                <View style={[styles.cTitle, styles.titleCell]}>
                  <ArtTile songKey={s.analysis.key} size={32} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>{s.title}</Text>
                    <Text variant="caption" tone="subtle" numberOfLines={1}>
                      {isPhone ? [keyShort(s.analysis.key), s.analysis.bpm ? Math.round(s.analysis.bpm) : null, formatTime(s.analysis.duration)].filter(Boolean).join(' · ') : s.artist ?? 'Unknown artist'}
                    </Text>
                  </View>
                </View>
                {!isPhone && (
                  <>
                    <Text variant="mono" style={styles.cKey}>{keyShort(s.analysis.key)}</Text>
                    <Text variant="mono" style={styles.cBpm}>{s.analysis.bpm ? Math.round(s.analysis.bpm) : '—'}</Text>
                    <Text variant="body" tone="muted" style={styles.cTuning}>{tuning}</Text>
                    <Text variant="mono" style={styles.cTime}>{formatTime(s.analysis.duration)}</Text>
                    <View style={[styles.cStatus, styles.statusCell]}>
                      <View style={[styles.dot, { backgroundColor: status.color }]} />
                      <Text variant="caption" style={{ color: status.color }} numberOfLines={1}>{status.text}</Text>
                    </View>
                  </>
                )}
                <View style={styles.cAct}>
                  {s.isFavourite && <Icon name="heart" size={14} color={colors.danger} />}
                  <Pressable
                    role="button"
                    accessibilityLabel={`Remove ${s.title}`}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      confirmDelete(s, () => remove.mutate(s.id));
                    }}
                    hitSlop={6}
                    style={({ hovered }: PressState) => [styles.del, hovered && { backgroundColor: colors.dangerSoft }]}
                  >
                    <Icon name="trash-outline" size={15} color={colors.textSubtle} />
                  </Pressable>
                </View>
              </Pressable>
              </Stagger>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

/** Large "recently played" artwork: the key colour, string hairlines, the key in serif. */
function BigTile({ songKey }: { songKey: string | null }) {
  return <ArtTile songKey={songKey} width={196} height={116} strings />;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.lg },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  topRow: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap', alignItems: 'stretch' },
  tile: { width: 196 },
  filters: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1, gap: spacing.md },
  row: { minHeight: 52, borderRadius: radius.xs },
  cTitle: { flex: 3, minWidth: 0 },
  titleCell: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cKey: { width: 64 },
  cBpm: { width: 64 },
  cTuning: { flex: 1.2 },
  cTime: { width: 64 },
  cStatus: { flex: 1.8 },
  statusCell: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3 },
  cAct: { width: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
  del: { width: 28, height: 28, borderRadius: radius.xs, alignItems: 'center', justifyContent: 'center' },
});
