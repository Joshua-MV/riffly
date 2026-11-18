import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { Button } from '@/components/ui/Button';
import { FadeIn } from '@/components/ui/FadeIn';
import { EmptyState, Screen } from '@/components/ui/primitives';
import type { LocalSong } from '@/features/library/model';
import { useSong } from '@/features/songs/hooks';
import { useSongPractice } from '@/features/songs/useSongPractice';
import { Overview } from '@/features/songs/views/Overview';
import { PlayAlong } from '@/features/songs/views/PlayAlong';
import { StrumView } from '@/features/songs/views/StrumView';
import { TabLearn } from '@/features/songs/views/TabLearn';
import { spacing } from '@/theme/tokens';

type View_ = 'overview' | 'play' | 'strum' | 'tab';

/**
 * A song and its practice views. The rail's Practice section (Play Along, Strum, Tab)
 * switches `view`; the overview is what Riffly found and where to start.
 */
export default function SongScreen() {
  const { id, view } = useLocalSearchParams<{ id: string; view?: string }>();
  const song = useSong(id);

  if (song.isLoading) {
    return (
      <Screen>
        <ActivityIndicator style={{ marginTop: spacing.xxxl }} />
      </Screen>
    );
  }
  if (song.error || !song.data) {
    return (
      <Screen>
        <EmptyState
          icon="musical-notes-outline"
          title="Song not found"
          body={song.error instanceof Error ? song.error.message : 'It may have been removed from this computer.'}
          action={<Button label="Back to My Songs" onPress={() => router.replace('/library')} />}
        />
      </Screen>
    );
  }
  const v = (['overview', 'play', 'strum', 'tab'].includes(view ?? '') ? view : 'overview') as View_;
  return <SongViews song={song.data} view={v} />;
}

function SongViews({ song, view }: { song: LocalSong; view: View_ }) {
  const s = useSongPractice(song);
  return (
    <Screen maxWidth={view === 'strum' ? 1320 : 1240}>
      <FadeIn key={view}>
        {view === 'overview' && <Overview s={s} />}
      {view === 'play' && <PlayAlong s={s} />}
      {view === 'strum' && <StrumView s={s} />}
      {view === 'tab' && <TabLearn s={s} />}
      </FadeIn>
    </Screen>
  );
}
