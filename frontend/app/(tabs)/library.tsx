import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/ui/Button';
import { Card, EmptyState, Notice, Screen, SearchField, SegmentedControl } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import { useDeleteSong, useSongs } from '@/features/songs/hooks';
import { SongRow } from '@/features/songs/SongRow';
import { ImportList } from '@/features/library/ImportList';
import type { LocalSong } from '@/features/library/model';
import { storage } from '@/features/library/storage';
import { formatBytes } from '@/features/songs/timeline';
import { spacing } from '@/theme/tokens';

type View_ = 'all' | 'favourites';

function confirmDelete(song: LocalSong, onConfirm: () => void) {
  const message = `Delete “${song.title}”? Its MP3, chords and your corrections are removed from this device permanently.`;
  if (Platform.OS === 'web') {
    if (window.confirm(message)) onConfirm();
  } else {
    Alert.alert('Delete song', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ]);
  }
}

export default function LibraryScreen() {
  const songs = useSongs();
  const remove = useDeleteSong();
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View_>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (songs.data ?? []).filter(
      (s) => (view === 'all' || s.isFavourite) && (!q || s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q)),
    );
  }, [songs.data, query, view]);

  return (
    <Screen maxWidth={880}>
      <View style={styles.header}>
        <View>
          <Text variant="overline" tone="subtle">{songs.data ? `${songs.data.length} ${songs.data.length === 1 ? 'song' : 'songs'} ·${formatBytes(songs.data.reduce((n, s) => n + s.audioBytes, 0))} · ${storage.location}` : 'Your library'}</Text>
          <Text variant="title">My music</Text>
        </View>
        <Button label="Analyse a song" icon="add" onPress={() => router.push('/analyze')} />
      </View>
      <ImportList />
      <SearchField value={query} onChangeText={setQuery} placeholder="Search your songs" />
      <SegmentedControl label="Filter songs" value={view} onChange={setView} options={[{ value: 'all', label: 'All songs' }, { value: 'favourites', label: 'Favourites' }]} />

      {songs.isLoading && <ActivityIndicator />}
      {songs.isError && <Notice tone="error">{(songs.error as Error).message}</Notice>}
      {songs.data && filtered.length === 0 && (
        <Card>
          <EmptyState
            icon={view === 'favourites' ? 'heart-outline' : 'albums-outline'}
            title={songs.data.length === 0 ? 'Your library is empty' : 'Nothing matches'}
            body={songs.data.length === 0 ? 'Songs you analyse are saved on this device as MP3, with their chords, corrections and notes.' : view === 'favourites' ? 'Tap the heart on a song to keep it here.' : 'Try a different search.'}
          />
        </Card>
      )}
      <View style={{ gap: spacing.sm }}>
        {filtered.map((s) => (
          <View key={s.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <SongRow song={s} />
            </View>
            <IconButton icon="trash-outline" label={`Delete ${s.title}`} onPress={() => confirmDelete(s, () => remove.mutate(s.id))} />
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
