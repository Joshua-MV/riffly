import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/ui/Button';
import { Card, Chip } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import { GUITAR_TUNINGS, type Tuning } from '@/lib/music/instruments';
import type { CapoOption } from '@/lib/music/simplify';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export interface CapoCardProps {
  capo: number;
  keyShift: number;
  tuning: Tuning;
  /** False for open/drop tunings, where chord shapes differ from standard. */
  standardShapes: boolean;
  options: CapoOption[];
  recommended: CapoOption | null;
  onCapo: (c: number) => void;
  onKeyShift: (k: number) => void;
  onTuning: (id: string) => void;
}

function tuningHelp(t: Tuning, standardShapes: boolean): string {
  if (t.id === 'standard') return 'Chords are shown for a guitar in standard tuning. If the band used a different tuning, pick it to see the shapes they played instead.';
  if (standardShapes) return `Tune every string down like the band (${t.notes.join(' ')}). You play the usual shapes, so the chord names are the shapes, not the notes that sound.`;
  return `Chord shapes are drawn for ${t.name} (${t.notes.join(' ')}). The names are the chords that sound; the diagrams and tab use this tuning's strings.`;
}

/** "Make it easier": tuning + capo suggestion + manual capo + (advanced) key change. */
export function CapoCard({ capo, keyShift, tuning, standardShapes, options, recommended, onCapo, onKeyShift, onTuning }: CapoCardProps) {
  const { colors } = useTheme();
  const current = options.find((o) => o.capo === capo);
  // Beginner version first: tuning and key change are tucked away unless already in use.
  const [more, setMore] = useState(tuning.id !== 'standard' || keyShift !== 0);
  const easyPct = current ? Math.round(current.easyShare * 100) : 0;

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text variant="subheading">Beginner chords</Text>
          <Text variant="caption" tone="muted">
            Riffly picks the capo that turns this song into easy open chords, so you can play along with the recording.
          </Text>
        </View>
      </View>

      {more && <View style={{ gap: spacing.xs }}>
        <View style={styles.row}>
          <Text variant="overline" tone="subtle" style={{ width: 52 }}>Tuning</Text>
          {GUITAR_TUNINGS.map((t) => (
            <Chip key={t.id} label={t.name} selected={t.id === tuning.id} onPress={() => onTuning(t.id)} />
          ))}
        </View>
        <View style={[styles.row, { alignItems: 'flex-start' }]}>
          <Text variant="caption" tone="muted" style={{ flex: 1, minWidth: 220 }}>{tuningHelp(tuning, standardShapes)}</Text>
          {tuning.id !== 'standard' && (
            <Button label="Tune to this" icon="musical-note" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/', params: { tuning: tuning.id } })} />
          )}
        </View>
      </View>}

      {!standardShapes && (
        <Text variant="caption" tone="muted" style={[styles.divider, { borderTopColor: colors.border }]}>
          Capo suggestions are for standard-shape tunings. You can still set a capo below.
        </Text>
      )}

      {recommended && recommended.capo !== capo && (
        <View style={[styles.suggest, { backgroundColor: colors.successSoft }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">Capo on fret {recommended.capo}, then play {recommended.shapes.slice(0, 6).join(' · ')}</Text>
            <Text variant="caption" tone="muted">
              {recommended.barreShapes.length ? `Only ${recommended.barreShapes.join(', ')} still needs a barre.` : 'No barre chords.'}{' '}
              {Math.round(recommended.easyShare * 100)}% of the song uses beginner shapes.
            </Text>
          </View>
          <Button label={`Use capo ${recommended.capo}`} onPress={() => onCapo(recommended.capo)} />
        </View>
      )}
      {standardShapes && !recommended && capo === 0 && <Text variant="caption" tone="success">This song already uses easy shapes, so you don't need a capo.</Text>}

      <View style={styles.row}>
        <Text variant="overline" tone="subtle" style={{ width: 52 }}>Capo</Text>
        <IconButton icon="remove" label="Capo down a fret" size={32} disabled={capo === 0} onPress={() => onCapo(capo - 1)} />
        <Text variant="heading" style={{ minWidth: 72, textAlign: 'center' }}>{capo === 0 ? 'None' : `Fret ${capo}`}</Text>
        <IconButton icon="add" label="Capo up a fret" size={32} disabled={capo >= 9} onPress={() => onCapo(capo + 1)} />
        {current && <Text variant="caption" tone={easyPct >= 80 ? 'success' : easyPct >= 50 ? 'highlight' : 'muted'}>{easyPct}% beginner shapes</Text>}
      </View>
      {current && (
        <View style={styles.shapes}>
          {current.shapes.slice(0, 10).map((s) => (
            <Chip key={s} label={s} selected={!current.barreShapes.includes(s)} />
          ))}
        </View>
      )}

      <Button label={more ? 'Fewer options' : 'More options: tuning, change key'} variant="ghost" size="sm" onPress={() => setMore((v) => !v)} style={{ alignSelf: 'flex-start' }} />
      {more && <View style={[styles.row, styles.divider, { borderTopColor: colors.border }]}>
        <Text variant="overline" tone="subtle" style={{ width: 52 }}>Key</Text>
        <IconButton icon="remove" label="Lower key a semitone" size={32} onPress={() => onKeyShift(Math.max(-6, keyShift - 1))} />
        <Text variant="bodyStrong" style={{ minWidth: 72, textAlign: 'center' }}>{keyShift === 0 ? 'Original' : `${keyShift > 0 ? '+' : ''}${keyShift}`}</Text>
        <IconButton icon="add" label="Raise key a semitone" size={32} onPress={() => onKeyShift(Math.min(6, keyShift + 1))} />
      </View>}
      {keyShift !== 0 && (
        <Text variant="caption" tone="highlight">
          Changing the key moves the chords away from the recording. Use it to sing in your range without the track; use the capo to play along with it.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: spacing.md },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: 10, flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md },
  shapes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
