import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChordDiagram } from '@/components/music/ChordDiagram';
import { Button } from '@/components/ui/Button';
import { Card, Chip } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import { parseChord } from '@/lib/music/chords';
import { getVoicings } from '@/lib/music/voicings';
import { useTheme } from '@/theme/ThemeProvider';
import { useLayout } from '@/theme/useLayout';
import { spacing } from '@/theme/tokens';

import { BeatDots, TempoControl } from './Metronome';
import { useClickLoop } from './useClickLoop';

/**
 * Chord-change drill: switch between two chords from the song every bar, in time with a
 * click. Changing smoothly between chords, not knowing each chord, is what holds most
 * beginners back.
 */
export function ChangeDrill({ changes, songBpm }: { changes: { from: string; to: string; count: number }[]; songBpm: number | null }) {
  const { colors } = useTheme();
  const { isPhone } = useLayout();
  const [pick, setPick] = useState(0);
  const [bpm, setBpm] = useState(() => Math.round(Math.min(80, (songBpm ?? 120) / 2)));
  const click = useClickLoop(bpm);
  const pair = changes[pick];
  if (!pair) return null;

  const onA = click.bars % 2 === 0;
  const now = click.running ? (onA ? pair.from : pair.to) : pair.from;
  const next = click.running ? (onA ? pair.to : pair.from) : pair.to;
  const voicing = (label: string) => {
    const sym = parseChord(label);
    return sym ? getVoicings(sym)[0] : undefined;
  };
  const size = isPhone ? 120 : 150;

  return (
    <Card style={{ gap: spacing.lg }}>
      <View>
        <Text variant="subheading">Practise the changes</Text>
        <Text variant="caption" tone="muted">Switch chords on beat 1 of every bar. Start slow; speed up when it feels easy.</Text>
      </View>
      <View style={styles.pairs}>
        {changes.map((c, i) => (
          <Chip key={`${c.from}-${c.to}`} label={`${c.from} → ${c.to} · ${c.count}×`} selected={i === pick} onPress={() => { setPick(i); click.stop(); }} />
        ))}
      </View>
      <View style={styles.stage}>
        {[now, next].map((label, i) => {
          const v = voicing(label);
          return (
            <View key={i} style={[styles.side, { opacity: i === 0 ? 1 : 0.5 }]}>
              <Text variant="overline" tone="subtle">{i === 0 ? 'Play' : 'Next'}</Text>
              <Text variant="title" style={{ color: i === 0 ? colors.highlight : colors.text }}>{label}</Text>
              {v && <ChordDiagram voicing={v} width={i === 0 ? size : size * 0.75} tone={i === 0 ? 'highlight' : 'accent'} />}
            </View>
          );
        })}
      </View>
      <View style={styles.footer}>
        <BeatDots beat={click.beat} size={16} />
        <Text variant="caption" tone="muted">{click.running ? `${click.bars} ${click.bars === 1 ? 'change' : 'changes'}` : 'Ready'}</Text>
      </View>
      <TempoControl bpm={bpm} onChange={setBpm} songBpm={songBpm} />
      <Button label={click.running ? 'Stop drill' : 'Start drill'} icon={click.running ? 'stop' : 'play'} variant={click.running ? 'secondary' : 'primary'} onPress={click.running ? click.stop : click.start} />
    </Card>
  );
}

const styles = StyleSheet.create({
  pairs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stage: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
  side: { alignItems: 'center', gap: spacing.xs },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
