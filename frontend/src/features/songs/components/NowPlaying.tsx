import { StyleSheet, View } from 'react-native';

import { ChordDiagram } from '@/components/music/ChordDiagram';
import { Card } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import { BeatDots } from '@/features/practice/Metronome';
import { parseChord } from '@/lib/music/chords';
import { getVoicings } from '@/lib/music/voicings';
import { useTheme } from '@/theme/ThemeProvider';
import { useLayout } from '@/theme/useLayout';
import { spacing, typeScale } from '@/theme/tokens';

import type { TimelineChord } from '../timeline';

export interface NowPlayingProps {
  current: TimelineChord | null;
  next: TimelineChord[];
  large: boolean;
  beat: number | null;
  countIn: number | null;
  capo: number;
  /** Render without its own card (when placed inside another card). */
  bare?: boolean;
}

/** The current chord shape (big), its diagram, upcoming changes and the beat. */
export function NowPlaying({ current, next, large, beat, countIn, capo, bare = false }: NowPlayingProps) {
  const { colors } = useTheme();
  const { isPhone } = useLayout();
  const label = current && current.label !== 'N' ? current.display : null;
  const sym = label ? parseChord(label) : null;
  const voicing = sym ? getVoicings(sym)[0] : undefined;
  const diagramSize = large ? (isPhone ? 170 : 230) : 132;

  const Wrapper = bare ? View : Card;
  return (
    <Wrapper style={[styles.now, large && { paddingVertical: spacing.xl }]}>
      <View style={{ flex: 1, gap: spacing.sm }}>
        <View style={styles.head}>
          <Text variant="overline" tone="subtle">{countIn ? 'Get ready' : capo ? `Now · capo ${capo}` : 'Now'}</Text>
          <BeatDots beat={countIn ?? beat ?? 0} size={large ? 14 : 10} />
        </View>
        <Text
          aria-live="polite"
          style={[
            typeScale.hero,
            { fontSize: large ? 120 : 72, lineHeight: large ? 124 : 76, color: countIn ? colors.accent : label ? colors.highlight : colors.textSubtle },
          ]}
        >
          {countIn ? String(countIn) : label ?? '—'}
        </Text>
        {current?.corrected && !countIn && <Text variant="caption" tone="accent">Your correction</Text>}
        <Text variant="overline" tone="subtle" style={{ marginTop: spacing.md }}>Next</Text>
        <View style={styles.nextRow}>
          {next.length === 0 ? (
            <Text tone="subtle">—</Text>
          ) : (
            next.map((c, i) => (
              <Text key={c.start} variant={large ? 'title' : 'heading'} style={{ color: i === 0 ? colors.text : colors.textSubtle }}>
                {c.display}
              </Text>
            ))
          )}
        </View>
      </View>
      {voicing && !countIn && <ChordDiagram voicing={voicing} width={diagramSize} tone="highlight" />}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  now: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nextRow: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap', alignItems: 'baseline' },
});
