import { router } from 'expo-router';
import { Stagger } from '@/components/ui/FadeIn';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChordDiagram } from '@/components/music/ChordDiagram';
import { Card, Chip, EmptyState, Screen, SearchField } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import { QUALITIES, type ChordCategory } from '@/lib/music/chords';
import { libraryChords } from '@/lib/music/voicings';
import { useLayout } from '@/theme/useLayout';
import { spacing } from '@/theme/tokens';

type Filter = 'all' | ChordCategory | 'barre';

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
  { value: 'power', label: 'Power' },
  { value: 'seventh', label: '7th' },
  { value: 'suspended', label: 'Sus' },
  { value: 'added', label: 'Add9' },
  { value: 'diminished', label: 'Dim' },
  { value: 'augmented', label: 'Aug' },
  { value: 'barre', label: 'Barre' },
];

const ALL = libraryChords();

function normalise(q: string) {
  return q.trim().toLowerCase().replace('♯', '#').replace('♭', 'b').replace(/\s+/g, '');
}

export default function ChordLibraryScreen() {
  const { isPhone } = useLayout();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const results = useMemo(() => {
    const q = normalise(query);
    return ALL.filter((c) => {
      const info = QUALITIES[c.chord.quality];
      if (filter === 'barre' && !c.voicings.some((v) => v.barre)) return false;
      if (filter !== 'all' && filter !== 'barre' && info.category !== filter) return false;
      if (!q) return true;
      const name = c.name.toLowerCase();
      return name === q || name.startsWith(q) || info.label.toLowerCase().includes(q);
    });
  }, [query, filter]);

  const [gridWidth, setGridWidth] = useState(0);
  const columns = isPhone ? 2 : Math.max(3, Math.min(6, Math.floor(gridWidth / 180)));
  const cardWidth = gridWidth > 0 ? Math.floor((gridWidth - spacing.md * (columns - 1)) / columns) : 0;

  return (
    <Screen>
      <View>
        <Text variant="overline" tone="subtle">{ALL.length} chords · standard tuning</Text>
        <Text variant="title">Chord library</Text>
      </View>
      <SearchField value={query} onChangeText={setQuery} placeholder="Search chords, e.g. F#m7 or sus" />
      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />
        ))}
      </View>
      {results.length === 0 ? (
        <EmptyState icon="search" title="No chords match" body="Try a root note like “A”, a full name like “Bbmaj7”, or a type like “dim”." />
      ) : (
        <View style={styles.grid} onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}>
          {cardWidth > 0 && results.map((c, i) => {
            const v = c.voicings[0];
            return (
              <Stagger key={c.id} index={i}>
              <Card
                onPress={() => router.push(`/chord/${c.id}`)}
                accessibilityLabel={`${c.name}, ${QUALITIES[c.chord.quality].label}, ${c.voicings.length} voicings`}
                style={[styles.card, { width: cardWidth }]}
              >
                <View style={styles.cardHead}>
                  <Text variant="heading">{c.name}</Text>
                  <Text variant="caption" tone="subtle">{c.voicings.length}×</Text>
                </View>
                <View style={styles.diagram}>
                  <ChordDiagram voicing={v} width={Math.min(cardWidth - spacing.lg * 2, 132)} showFingers={false} />
                </View>
                <Text variant="caption" tone="muted">{v.difficulty === 'beginner' ? 'Beginner · open' : v.barre ? `Barre · fret ${v.barre.fret}` : v.shape}</Text>
              </Card>
              </Stagger>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: { gap: spacing.sm },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  diagram: { alignItems: 'center', paddingVertical: spacing.xs },
});
