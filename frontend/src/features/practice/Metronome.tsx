import { StyleSheet, View } from 'react-native';

import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

import { useClickLoop } from './useClickLoop';

export function BeatDots({ beat, beats = 4, size = 12 }: { beat: number; beats?: number; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.dots} accessibilityLabel={beat ? `Beat ${beat} of ${beats}` : 'Stopped'}>
      {Array.from({ length: beats }, (_, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size,
            backgroundColor: beat === i + 1 ? (i === 0 ? colors.highlight : colors.accent) : colors.border,
          }}
        />
      ))}
    </View>
  );
}

export function TempoControl({ bpm, onChange, songBpm }: { bpm: number; onChange: (b: number) => void; songBpm?: number | null }) {
  const set = (v: number) => onChange(Math.max(30, Math.min(220, Math.round(v))));
  return (
    <View style={styles.tempo}>
      <IconButton icon="remove" label="Slower" size={36} onPress={() => set(bpm - 5)} />
      <View style={{ alignItems: 'center', minWidth: 72 }}>
        <Text variant="title" accessibilityLabel={`${bpm} beats per minute`}>{bpm}</Text>
        <Text variant="caption" tone="subtle">BPM</Text>
      </View>
      <IconButton icon="add" label="Faster" size={36} onPress={() => set(bpm + 5)} />
      {songBpm ? <Button label={`Song: ${Math.round(songBpm)}`} variant="ghost" size="sm" onPress={() => set(songBpm)} /> : null}
      {songBpm ? <Button label="½ speed" variant="ghost" size="sm" onPress={() => set(songBpm / 2)} /> : null}
    </View>
  );
}

/** Standalone metronome for practising without the recording. */
export function Metronome({ bpm, onBpmChange, songBpm }: { bpm: number; onBpmChange: (b: number) => void; songBpm?: number | null }) {
  const click = useClickLoop(bpm);
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={styles.head}>
        <Text variant="subheading">Metronome</Text>
        <BeatDots beat={click.beat} />
      </View>
      <TempoControl bpm={bpm} onChange={onBpmChange} songBpm={songBpm} />
      <Button label={click.running ? 'Stop' : 'Start metronome'} icon={click.running ? 'stop' : 'play'} variant={click.running ? 'secondary' : 'primary'} onPress={click.running ? click.stop : click.start} />
    </Card>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tempo: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap', borderRadius: radius.md },
});
