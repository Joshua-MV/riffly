import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChordDiagram } from '@/components/music/ChordDiagram';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import { ChangeDrill } from '@/features/practice/ChangeDrill';
import { Metronome } from '@/features/practice/Metronome';
import { playVoicing } from '@/lib/audio/chordPlayer';
import { chordId, parseChord } from '@/lib/music/chords';
import { getVoicings } from '@/lib/music/voicings';
import { useLayout } from '@/theme/useLayout';
import { spacing } from '@/theme/tokens';

import { songChords, topChanges } from '../practice';
import type { TimelineChord } from '../timeline';

/** Learn the song: every chord shape it uses, a chord-change drill and a metronome. */
export function LearnPanel({ timeline, songBpm }: { timeline: TimelineChord[]; songBpm: number | null }) {
  const { isPhone } = useLayout();
  const chords = songChords(timeline);
  const changes = topChanges(timeline);
  const [bpm, setBpm] = useState(() => Math.round(songBpm ?? 80));

  return (
    <View style={{ gap: spacing.lg }}>
      <View>
        <Text variant="subheading">Chords in this song</Text>
        <Text variant="caption" tone="muted">In the order you'll meet them, with how much of the song each one takes up. Tap a chord for finger-by-finger instructions.</Text>
      </View>
      <View style={styles.grid}>
        {chords.map((c) => {
          const sym = parseChord(c.shape);
          const v = sym ? getVoicings(sym)[0] : undefined;
          return (
            <Card key={c.shape} style={[styles.chord, { flexBasis: isPhone ? '46%' : 170 }]}>
              <View style={styles.chordHead}>
                <Text variant="heading">{c.shape}</Text>
                <Text variant="caption" tone="subtle">{Math.round(c.share * 100)}%</Text>
              </View>
              {v ? <ChordDiagram voicing={v} width={120} /> : <Text tone="muted">No diagram</Text>}
              <Text variant="caption" tone={c.difficulty === 'beginner' ? 'success' : 'highlight'}>{c.difficulty}</Text>
              <View style={styles.actions}>
                {v && <Button label="Hear" icon="volume-high" size="sm" variant="secondary" onPress={() => void playVoicing(v.frets)} />}
                {sym && <Button label="How to" size="sm" variant="ghost" onPress={() => router.push(`/chord/${chordId(sym)}`)} />}
              </View>
            </Card>
          );
        })}
      </View>
      {changes.length > 0 && <ChangeDrill changes={changes} songBpm={songBpm} />}
      <Metronome bpm={bpm} onBpmChange={setBpm} songBpm={songBpm} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  chord: { alignItems: 'center', gap: spacing.xs, flexGrow: 1 },
  chordHead: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', alignItems: 'baseline' },
  actions: { flexDirection: 'row', gap: spacing.xs },
});
