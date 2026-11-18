import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChordDiagram } from '@/components/music/ChordDiagram';
import { TabView } from '@/components/music/TabView';
import { Button } from '@/components/ui/Button';
import { Card, Chip } from '@/components/ui/primitives';
import type { PressState } from '@/components/ui/pressState';
import { Stagger } from '@/components/ui/FadeIn';
import { Text } from '@/components/ui/Text';
import { ChangeDrill } from '@/features/practice/ChangeDrill';
import { playVoicing } from '@/lib/audio/chordPlayer';
import { chordId, parseChord } from '@/lib/music/chords';
import { PATTERNS } from '@/lib/music/fingerstyle';
import { getVoicings } from '@/lib/music/voicings';
import { useTheme } from '@/theme/ThemeProvider';
import { useLayout } from '@/theme/useLayout';
import { radius, spacing } from '@/theme/tokens';

import { TranscribePanel } from '../components/TranscribePanel';
import { songChords, topChanges } from '../practice';
import type { SongPractice } from '../useSongPractice';

type Filter = 'song' | 'open' | 'barre';

/** Tab & Learn: the fingerpicking tab, the song's chords as diagrams, and a change drill. */
export function TabLearn({ s }: { s: SongPractice }) {
  const { colors } = useTheme();
  const { isPhone } = useLayout();
  const { practice, ctx } = s;
  const [filter, setFilter] = useState<Filter>('song');
  const [showTranscribe, setShowTranscribe] = useState(false);
  const chords = useMemo(() => songChords(s.timeline, ctx.shapeMidi), [s.timeline, ctx.shapeMidi]);
  const changes = useMemo(() => topChanges(s.timeline), [s.timeline]);
  const nowShape = s.current && s.current.label !== 'N' ? s.current.display : null;
  const cards = chords
    .map((c) => {
      const sym = parseChord(c.shape);
      return { ...c, sym, v: sym ? getVoicings(sym, ctx.shapeMidi)[0] : undefined };
    })
    .filter((c) => filter === 'song' || (filter === 'open' ? c.v && !c.v.barre : c.v?.barre));

  return (
    <View style={{ gap: spacing.xl }}>
      <View style={styles.head}>
        <Text variant="title">Tab &amp; Learn</Text>
        <View style={styles.chips}>
          {PATTERNS.map((p) => (
            <Chip key={p.id} label={`${p.name} · ${p.level}`} selected={p.id === s.pattern.id} onPress={() => s.setPractice({ pattern: p.id })} />
          ))}
        </View>
      </View>

      <Card style={{ gap: spacing.md }}>
        <View style={styles.cardHead}>
          <Text variant="subheading">{s.song.title} · {s.pattern.name}</Text>
          <Text variant="overline" tone="subtle">{practice.capo ? `Capo ${practice.capo} · ` : ''}frets from the capo</Text>
        </View>
        <TabView bars={s.tabBars} current={s.tabPos} onSeek={(t) => void s.seek(t)} maxHeight={300} />
        <Text variant="caption" tone="subtle">{s.pattern.description} An arrangement in the style of the song, built from its chords and beat, not a note-for-note copy.</Text>
      </Card>

      <View style={[styles.cols, { flexDirection: isPhone ? 'column' : 'row' }]}>
        <View style={{ flex: 2, gap: spacing.md }}>
          <View style={styles.cardHead}>
            <Text variant="heading">Chord library</Text>
            <View style={styles.chips}>
              <Chip label="In this song" selected={filter === 'song'} onPress={() => setFilter('song')} />
              <Chip label="Open" selected={filter === 'open'} onPress={() => setFilter('open')} />
              <Chip label="Barre" selected={filter === 'barre'} onPress={() => setFilter('barre')} />
              <Chip label="All chords" onPress={() => router.navigate('/chords')} />
            </View>
          </View>
          <View style={styles.grid}>
            {cards.map((c, i) => {
              const now = c.shape === nowShape;
              return (
                <Stagger key={c.shape} index={i}>
                <Pressable
                  role="button"
                  accessibilityLabel={`${c.shape}: hear it`}
                  onPress={() => c.v && void playVoicing(c.v.frets, ctx.soundMidi)}
                  style={({ hovered }: PressState) => [
                    styles.chordCard,
                    { borderColor: now ? colors.accent : colors.border, backgroundColor: now ? colors.accentSoft : hovered ? colors.surfaceHover : colors.surface, transform: [{ translateY: hovered ? -2 : 0 }] },
                  ]}
                >
                  <View style={styles.chordHead}>
                    <Text variant="heading" style={{ color: now ? colors.highlight : colors.text }}>{c.shape}</Text>
                    <Text variant="overline" tone="subtle" style={{ fontSize: 9.5 }}>{c.v?.barre ? 'Barre' : c.sym?.quality === '5' ? 'Power' : 'Open'}</Text>
                  </View>
                  {c.v ? <ChordDiagram voicing={c.v} width={118} tone={now ? 'highlight' : 'accent'} /> : <Text tone="muted">No diagram</Text>}
                  <View style={styles.chordHead}>
                    <Text variant="mono" tone="subtle" style={{ fontSize: 10 }}>{Math.round(c.share * 100)}% of song</Text>
                    {c.sym && (
                      <Pressable onPress={() => router.push(`/chord/${chordId(c.sym!)}`)} accessibilityLabel={`How to play ${c.shape}`}>
                        <Text variant="caption" tone="highlight">How to</Text>
                      </Pressable>
                    )}
                  </View>
                </Pressable>
                </Stagger>
              );
            })}
          </View>
          <Text variant="caption" tone="subtle">
            <Text variant="caption" tone="danger">✕</Text> sits on a string you don’t play — mute it with a fingertip. ○ above the nut = let it ring open. Tap a chord to hear it.
          </Text>
        </View>

        <Card style={{ flex: 1, gap: spacing.md, minWidth: 280 }}>
          <Text variant="overline" tone="subtle">Change drill · from this song</Text>
          {changes.length > 0 ? <ChangeDrill changes={changes} songBpm={s.result.bpm} /> : <Text tone="muted">This song has no chord changes to drill.</Text>}
        </Card>
      </View>

      <View style={{ gap: spacing.md }}>
        <Button
          label={showTranscribe ? 'Hide experimental transcription' : 'Experimental: transcribe the guitar part'}
          icon="sparkles"
          variant="ghost"
          onPress={() => setShowTranscribe((v) => !v)}
          style={{ alignSelf: 'flex-start' }}
        />
        {showTranscribe && <TranscribePanel song={s.song} capo={practice.capo} soundMidi={ctx.soundMidi} grid={s.tabBars} current={s.tabPos} onSeek={(t) => void s.seek(t)} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  cols: { gap: spacing.xl, alignItems: 'flex-start' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  chordCard: { width: 156, gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center' },
  chordHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch' },
});
