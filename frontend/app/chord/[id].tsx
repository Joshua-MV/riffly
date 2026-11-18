import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChordDiagram } from '@/components/music/ChordDiagram';
import { Button, IconButton } from '@/components/ui/Button';
import { Card, Chip, EmptyState, Screen } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import { Transport } from '@/features/player/Transport';
import { playVoicing } from '@/lib/audio/chordPlayer';
import { chordTones, formatChord, parseChordId, QUALITIES } from '@/lib/music/chords';
import { pitchClassName } from '@/lib/music/notes';
import { getVoicings, type Voicing } from '@/lib/music/voicings';
import { useLayout } from '@/theme/useLayout';
import { spacing } from '@/theme/tokens';

const STRING_NAMES = ['6th (low E)', '5th (A)', '4th (D)', '3rd (G)', '2nd (B)', '1st (high E)'];
const FINGER_NAMES = ['', 'index', 'middle', 'ring', 'pinky'];
const INTERVAL_NAMES: Record<number, string> = {
  0: 'root', 2: '2nd', 3: '♭3rd', 4: '3rd', 5: '4th', 6: '♭5th', 7: '5th', 8: '♯5th', 10: '♭7th', 11: '7th',
};

/** Plain-language instructions generated from the voicing data. */
function instructions(v: Voicing): string[] {
  const steps: string[] = [];
  if (v.barre) {
    steps.push(`Lay your index finger flat across fret ${v.barre.fret}, from the ${STRING_NAMES[v.barre.fromString]} to the ${STRING_NAMES[v.barre.toString]} string.`);
  }
  v.frets.forEach((f, s) => {
    const finger = v.fingers[s];
    if (f && finger && !(v.barre && finger === 1 && f === v.barre.fret)) {
      steps.push(`Put your ${FINGER_NAMES[finger]} finger on the ${STRING_NAMES[s]} string, fret ${f}.`);
    }
  });
  const muted = v.frets.map((f, s) => (f === null ? STRING_NAMES[s] : null)).filter(Boolean);
  if (muted.length) steps.push(`Don't play the ${muted.join(' and ')} string${muted.length > 1 ? 's' : ''}.`);
  const open = v.frets.filter((f) => f === 0).length;
  if (open) steps.push(`Let the ${open} open string${open > 1 ? 's' : ''} ring.`);
  steps.push('Press just behind the fret wire, keep your fingertips arched, then strum from the lowest played string.');
  return steps;
}

export default function ChordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isPhone, width } = useLayout();
  const wide = width >= 960;
  const chord = parseChordId(String(id));
  const [index, setIndex] = useState(0);

  if (!chord) {
    return (
      <Screen>
        <EmptyState icon="help-circle-outline" title="Chord not found" body="This chord isn't in the library." action={<Button label="Back to chords" onPress={() => router.replace('/chords')} />} />
      </Screen>
    );
  }

  const voicings = getVoicings(chord);
  const v = voicings[Math.min(index, voicings.length - 1)];
  const info = QUALITIES[chord.quality];
  const name = formatChord(chord);

  return (
    <View style={{ flex: 1 }}>
    <Screen maxWidth={880}>
      <View style={styles.top}>
        <IconButton icon="arrow-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/chords'))} />
        <Text variant="caption" tone="subtle">Chord library</Text>
      </View>

      <View style={[styles.layout, { flexDirection: isPhone ? 'column' : 'row' }]}>
        <Card style={styles.diagramCard}>
          <ChordDiagram voicing={v} width={isPhone ? 220 : 260} />
          <Button label="Play chord" icon="play" onPress={() => playVoicing(v.frets)} fullWidth accessibilityHint="Plays a synthesized strum of this voicing" />
        </Card>

        <View style={styles.info}>
          <View>
            <Text variant="overline" tone="subtle">{info.label}</Text>
            <Text variant="hero">{name}</Text>
          </View>
          <Text tone="muted">{info.description}</Text>
          <View style={styles.tones}>
            {chordTones(chord).map((pc, i) => (
              <Chip key={pc} label={`${pitchClassName(pc)} · ${INTERVAL_NAMES[info.intervals[i]] ?? ''}`} />
            ))}
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text variant="overline" tone="subtle">Voicings</Text>
            <View style={styles.tones}>
              {voicings.map((vv, i) => (
                <Chip
                  key={vv.id}
                  label={vv.shape === 'open' ? 'Open' : `${vv.shape} · fret ${vv.minFret}`}
                  selected={i === index}
                  onPress={() => setIndex(i)}
                />
              ))}
            </View>
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text variant="overline" tone="subtle">How to play · {v.difficulty}</Text>
            {instructions(v).map((step, i) => (
              <View key={i} style={styles.step}>
                <Text variant="caption" tone="accent" style={styles.stepNum}>{i + 1}</Text>
                <Text style={{ flex: 1 }}>{step}</Text>
              </View>
            ))}
          </View>

          <View style={styles.strings}>
            {v.frets.map((f, s) => (
              <View key={s} style={styles.stringRow}>
                <Text variant="caption" tone="subtle" style={{ width: 96 }}>{STRING_NAMES[s]}</Text>
                <Text variant="mono">{f === null ? 'muted' : f === 0 ? 'open' : `fret ${f}`}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </Screen>
    {!wide && <Transport />}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  layout: { gap: spacing.xl, alignItems: 'flex-start' },
  diagramCard: { alignItems: 'center', gap: spacing.lg, alignSelf: 'stretch' },
  info: { flex: 1, gap: spacing.lg, alignSelf: 'stretch' },
  tones: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  step: { flexDirection: 'row', gap: spacing.md },
  stepNum: { width: 16, marginTop: 3 },
  strings: { gap: 4 },
  stringRow: { flexDirection: 'row', alignItems: 'center' },
});
