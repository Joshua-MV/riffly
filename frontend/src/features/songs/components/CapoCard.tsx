import { StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/ui/Button';
import { Card, Chip } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import type { CapoOption } from '@/lib/music/simplify';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export interface CapoCardProps {
  capo: number;
  keyShift: number;
  options: CapoOption[];
  recommended: CapoOption | null;
  onCapo: (c: number) => void;
  onKeyShift: (k: number) => void;
}

/** "Make it easier": capo suggestion + manual capo + (advanced) key change. */
export function CapoCard({ capo, keyShift, options, recommended, onCapo, onKeyShift }: CapoCardProps) {
  const { colors } = useTheme();
  const current = options.find((o) => o.capo === capo);
  const easyPct = current ? Math.round(current.easyShare * 100) : 0;

  return (
    <Card style={{ gap: spacing.md }}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text variant="subheading">Make it easier</Text>
          <Text variant="caption" tone="muted">
            A capo raises every string, so easy open shapes sound in the song's real key, and you can still play along with the recording.
          </Text>
        </View>
      </View>

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
      {!recommended && capo === 0 && <Text variant="caption" tone="success">This song already uses easy shapes, so you don't need a capo.</Text>}

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

      <View style={[styles.row, styles.divider, { borderTopColor: colors.border }]}>
        <Text variant="overline" tone="subtle" style={{ width: 52 }}>Key</Text>
        <IconButton icon="remove" label="Lower key a semitone" size={32} onPress={() => onKeyShift(Math.max(-6, keyShift - 1))} />
        <Text variant="bodyStrong" style={{ minWidth: 72, textAlign: 'center' }}>{keyShift === 0 ? 'Original' : `${keyShift > 0 ? '+' : ''}${keyShift}`}</Text>
        <IconButton icon="add" label="Raise key a semitone" size={32} onPress={() => onKeyShift(Math.min(6, keyShift + 1))} />
      </View>
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
