import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ArtTile } from '@/components/music/ArtTile';
import { Waveform } from '@/components/music/Waveform';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Card, Notice, SegmentedControl } from '@/components/ui/primitives';
import type { PressState } from '@/components/ui/pressState';
import { Text } from '@/components/ui/Text';
import { transposeLabel } from '@/lib/music/chords';
import { tuningById } from '@/lib/music/instruments';
import { useTheme } from '@/theme/ThemeProvider';
import { useLayout } from '@/theme/useLayout';
import { fonts, radius, spacing } from '@/theme/tokens';

import { CapoCard } from '../components/CapoCard';
import { ChordList, CorrectionEditor } from '../components/ChordList';
import { songChords } from '../practice';
import { formatBytes, formatTime, type TimelineChord } from '../timeline';
import type { SongPractice } from '../useSongPractice';

import { StrumGlyphs } from './StrumGlyphs';

/** Song overview: what Riffly found, at a glance, and where to start. */
export function Overview({ s }: { s: SongPractice }) {
  const { colors } = useTheme();
  const { isPhone } = useLayout();
  const { song, result, practice, ctx } = s;
  const [shapes, setShapes] = useState<'shapes' | 'concert'>('shapes');
  const [correcting, setCorrecting] = useState(false);
  const [editing, setEditing] = useState<TimelineChord | null>(null);

  const real = result.chords.filter((c) => c.label !== 'N');
  const meanConf = real.length ? real.reduce((n, c) => n + c.confidence, 0) / real.length : 0;
  const doubtful = s.timeline.filter((c) => c.label !== 'N' && c.confidence < 0.35).length;
  const offset = shapes === 'shapes' ? ctx.displayOffset : practice.keyShift;
  const progression = result.progression.map((c) => transposeLabel(c, offset));
  const distinct = useMemo(() => songChords(s.timeline, ctx.shapeMidi), [s.timeline, ctx.shapeMidi]);
  const tuning = tuningById(practice.tuning);
  const steps = [
    { label: 'Key', ok: !!result.key },
    { label: 'Tempo', ok: !!result.bpm },
    { label: 'Beats', ok: result.beats.length > 0 },
    { label: 'Chords', ok: real.length > 0 },
    { label: 'Strumming', ok: !!result.strum },
    { label: 'Lyrics', ok: !!song.lyrics },
  ];
  const startPlaying = () => {
    router.setParams({ view: 'play' });
    void s.toggle();
  };

  return (
    <View style={{ gap: spacing.xl }}>
      <Pressable role="link" accessibilityLabel="Back to My Songs" onPress={() => router.navigate('/library')} style={styles.back}>
        <Icon name="chevron-back" size={14} color={colors.textSubtle} />
        <Text variant="caption" tone="subtle">My Songs</Text>
      </Pressable>

      <View style={styles.head}>
        <ArtTile songKey={result.key} size={isPhone ? 64 : 84} />
        <View style={{ flex: 1, minWidth: 220, gap: 4 }}>
          <Text variant="overline" tone={s.reanalyse.isPending ? 'highlight' : 'success'}>
            {s.reanalyse.isPending ? '● Updating analysis…' : `● Analysis complete · ${result.processing_seconds.toFixed(0)} s · on this computer`}
          </Text>
          <Text variant="hero" numberOfLines={2}>{song.title}</Text>
          <Text tone="subtle">{[song.artist, song.originalFilename, formatTime(result.duration), formatBytes(song.audioBytes)].filter(Boolean).join(' · ')}</Text>
        </View>
        <View style={styles.headActions}>
          <Button label={song.isFavourite ? 'Favourite' : 'Add to favourites'} icon={song.isFavourite ? 'heart' : 'heart-outline'} variant="ghost" onPress={() => s.update.mutate({ isFavourite: !song.isFavourite })} />
          <Button label="Correct detections" variant="secondary" onPress={() => setCorrecting((v) => !v)} />
          <Button label="Start playing" icon="play" onPress={startPlaying} />
        </View>
      </View>
      {s.reanalyse.isError && <Notice tone="error">{`Couldn't re-analyse: ${(s.reanalyse.error as Error).message}`}</Notice>}

      <Card padded={false} style={[styles.stats, { flexDirection: isPhone ? 'column' : 'row' }]}>
        <Stat label="Key" value={s.soundingKey.toUpperCase()} sub={practice.capo || ctx.displayOffset !== practice.keyShift ? `Shapes in ${s.shapeKey}${practice.capo ? ` with capo ${practice.capo}` : ''}` : 'Open shapes, no capo'} />
        <Stat label="Tempo" value={result.bpm ? `${Math.round(result.bpm)} BPM` : '—'} sub={result.bpm_confidence !== null ? (result.bpm_confidence > 0.6 ? 'Steady beat' : 'Tempo drifts a little') : 'No steady beat'} />
        <Stat label="Meter" value="4/4" sub={result.beats.length ? 'Beat grid locked' : 'No beat grid'} />
        <Stat label="Tuning" value={tuning.name.toUpperCase()} sub={tuning.notes.map((n) => n.replace(/-?\d+$/, '')).join(' ')} />
        <Stat label="Confidence" value={`${Math.round(meanConf * 100)}%`} sub={doubtful ? `${doubtful} chord${doubtful === 1 ? '' : 's'} worth a look` : 'Looks clean'} tone={doubtful ? 'highlight' : undefined} last />
      </Card>

      <View style={{ gap: spacing.md }}>
        <View style={styles.sectionHead}>
          <Text variant="heading">Structure</Text>
          <Text variant="overline" tone="subtle">{s.totalBars} bars · 4/4 · {result.beats.length ? 'beat grid locked' : 'no beat grid'}</Text>
        </View>
        <Card padded={false} style={{ padding: spacing.md, gap: spacing.sm, backgroundColor: colors.surfaceSunken }}>
          <Waveform peaks={result.waveform} duration={s.duration} currentTime={s.time} loop={s.player.loop} onSeek={(t) => void s.seek(t)} height={72} />
          <ChordStrip timeline={s.timeline} duration={s.duration} now={s.index} onSeek={(t) => void s.seek(t)} />
        </Card>
      </View>

      <View style={[styles.cols, { flexDirection: isPhone ? 'column' : 'row' }]}>
        <Card style={[styles.panel, { flex: 1.4 }]}>
          <View style={styles.sectionHead}>
            <Text variant="heading">Chord progression</Text>
            <SegmentedControl<'shapes' | 'concert'>
              label="Chord names"
              value={shapes}
              onChange={setShapes}
              options={[{ value: 'shapes', label: practice.capo ? `Shapes · capo ${practice.capo}` : 'Shapes' }, { value: 'concert', label: 'Concert pitch' }]}
            />
          </View>
          {progression.length > 0 && (
            <View style={styles.progRow}>
              <Text variant="overline" tone="subtle" style={{ width: 72 }}>Main loop</Text>
              <View style={styles.chips}>
                {progression.map((c, i) => (
                  <View key={`${c}${i}`} style={[styles.chordBox, { borderColor: colors.border, backgroundColor: colors.surfaceSunken }]}>
                    <Text style={styles.chordText}>{c}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
          <View style={styles.progRow}>
            <Text variant="overline" tone="subtle" style={{ width: 72 }}>All chords</Text>
            <View style={styles.chips}>
              {distinct.map((c) => (
                <View key={c.shape} style={[styles.chordBox, styles.small, { borderColor: colors.border }]}>
                  <Text style={[styles.chordText, { fontSize: 15 }]}>{shapes === 'shapes' ? c.shape : transposeLabel(c.shape, practice.keyShift - ctx.displayOffset)}</Text>
                  <Text variant="mono" tone="subtle" style={{ fontSize: 10 }}>{Math.round(c.share * 100)}%</Text>
                </View>
              ))}
            </View>
          </View>
        </Card>

        <Card style={[styles.panel, { flex: 1 }]}>
          <View style={styles.sectionHead}>
            <Text variant="heading">Strumming</Text>
            {result.strum && <Text variant="overline" tone="subtle">Detected · {Math.round(result.strum.confidence * 100)}%</Text>}
          </View>
          <StrumGlyphs pattern={s.strumPattern} size={26} />
          <Text variant="caption" tone="muted">
            {result.strum ? 'The rhythm Riffly heard in this recording. Pick another in Strum if it doesn’t feel right.' : 'Not detected for this song; showing the common folk-pop pattern.'}
          </Text>
          <View style={{ gap: spacing.xs }}>
            <Text variant="overline" tone="subtle">Pipeline</Text>
            <View style={styles.chips}>
              {steps.map((st) => (
                <Text key={st.label} variant="caption" style={{ color: st.ok ? colors.success : colors.textSubtle }}>{st.ok ? '✓' : '○'} {st.label}</Text>
              ))}
            </View>
          </View>
        </Card>
      </View>

      <CapoCard
        capo={practice.capo}
        keyShift={practice.keyShift}
        tuning={ctx.tuning}
        standardShapes={ctx.standardShapes}
        onTuning={(t) => s.setPractice({ tuning: t })}
        options={s.capoChoices}
        recommended={s.recommended}
        onCapo={(capo) => s.setPractice({ capo })}
        onKeyShift={(keyShift) => s.setPractice({ keyShift })}
      />

      {correcting && (
        <View style={{ gap: spacing.md }}>
          <Text variant="heading">Correct detections</Text>
          <Text tone="muted">Tap the pen next to a chord to fix it. Your corrections are kept when the song is re-analysed.</Text>
          {editing && <CorrectionEditor songId={song.id} chord={editing} displayOffset={ctx.displayOffset} onClose={() => setEditing(null)} />}
          <ChordList timeline={s.timeline} activeIndex={s.index} onSeek={(t) => void s.seek(t)} onEdit={setEditing} />
        </View>
      )}

      <Text variant="caption" tone="subtle">{`${result.notes.join(' ')} Engine ${result.model_version}.`}</Text>
    </View>
  );
}

function Stat({ label, value, sub, tone, last }: { label: string; value: string; sub: string; tone?: 'highlight'; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, !last && { borderRightWidth: 1, borderRightColor: colors.divider }]}>
      <Text variant="overline" tone="subtle">{label}</Text>
      <Text variant="readout" style={{ fontSize: 22, lineHeight: 28 }} numberOfLines={1}>{value}</Text>
      <Text variant="caption" style={{ color: tone ? colors[tone] : colors.textSubtle }} numberOfLines={1}>{sub}</Text>
    </View>
  );
}

/** Chords laid out under the waveform, proportional to time. */
function ChordStrip({ timeline, duration, now, onSeek }: { timeline: TimelineChord[]; duration: number; now: number; onSeek: (t: number) => void }) {
  const { colors } = useTheme();
  const real = timeline.filter((c) => c.label !== 'N');
  return (
    <View style={styles.strip}>
      {real.map((c) => {
        const active = timeline.indexOf(c) === now;
        return (
          <Pressable
            key={c.start}
            accessibilityLabel={`${c.display} at ${formatTime(c.start)}`}
            onPress={() => onSeek(c.start)}
            style={({ hovered }: PressState) => [
              styles.stripCell,
              {
                left: `${(c.start / duration) * 100}%`,
                width: `${((c.end - c.start) / duration) * 100}%`,
                backgroundColor: active ? colors.accentSoft : hovered ? colors.surfaceHover : colors.surface,
                borderColor: active ? colors.accent : colors.border,
              },
            ]}
          >
            <Text variant="mono" numberOfLines={1} style={{ fontSize: 10, color: active ? colors.highlight : colors.textMuted }}>{c.display}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flexWrap: 'wrap' },
  headActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  stats: { overflow: 'hidden' },
  stat: { flex: 1, gap: 4, paddingVertical: spacing.lg, paddingHorizontal: spacing.lg, minWidth: 0 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  strip: { height: 22, position: 'relative' },
  stripCell: { position: 'absolute', top: 0, bottom: 0, borderWidth: 1, borderRadius: 3, justifyContent: 'center', paddingHorizontal: 3, overflow: 'hidden' },
  cols: { gap: spacing.lg },
  panel: { gap: spacing.lg },
  progRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, flex: 1 },
  chordBox: { minWidth: 56, height: 48, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  small: { height: 44, minWidth: 48 },
  chordText: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24 },
});
