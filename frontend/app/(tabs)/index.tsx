import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { Logo } from '@/components/layout/Logo';
import { Button, IconButton, type IconName } from '@/components/ui/Button';
import { Card, EmptyState, Notice, Screen, SectionHeader } from '@/components/ui/primitives';
import { Text } from '@/components/ui/Text';
import { useSongs } from '@/features/songs/hooks';
import { SongRow } from '@/features/songs/SongRow';
import { useTheme } from '@/theme/ThemeProvider';
import { useLayout } from '@/theme/useLayout';
import { palette, radius, spacing } from '@/theme/tokens';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Late-night session?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** Decorative equaliser for the hero card. */
function HeroBars({ width }: { width: number }) {
  const heights = [0.3, 0.55, 0.8, 0.5, 0.95, 0.7, 0.4, 0.65, 0.85, 0.45, 0.6, 0.3, 0.75, 0.5, 0.35];
  const w = width / heights.length;
  return (
    <Svg width={width} height={96} aria-hidden>
      {heights.map((h, i) => (
        <Rect key={i} x={i * w + w * 0.2} y={96 - h * 96} width={w * 0.6} height={h * 96} rx={w * 0.3} fill={i % 5 === 4 ? palette.amber400 : palette.violet400} opacity={0.25 + h * 0.6} />
      ))}
    </Svg>
  );
}

export default function HomeScreen() {
  const { colors } = useTheme();
  const { isPhone, isDesktop } = useLayout();
  const songs = useSongs();
  const recent = (songs.data ?? []).slice(0, 4);
  const favourites = (songs.data ?? []).filter((s) => s.is_favourite).slice(0, 4);

  return (
    <Screen>
      <View style={styles.top}>
        {!isDesktop ? <Logo /> : <View />}
        <IconButton icon="person-circle-outline" label="Profile and settings" onPress={() => router.push('/profile')} />
      </View>

      <View>
        <Text variant="overline" tone="subtle">{greeting()}</Text>
        <Text variant="hero">What are we playing?</Text>
      </View>

      <Card style={[styles.hero, { flexDirection: isPhone ? 'column' : 'row', borderColor: colors.accent }]} elevated>
        <View style={{ flex: 1, gap: spacing.md }}>
          <Text variant="title">Learn any song by ear</Text>
          <Text tone="muted">Upload a recording and Riffly estimates the chords, key and tempo — then plays along with you, chord by chord.</Text>
          <View style={styles.heroActions}>
            <Button label="Analyse a song" icon="arrow-up-circle" size="lg" onPress={() => router.push('/analyze')} />
          </View>
        </View>
        <View style={{ alignSelf: isPhone ? 'stretch' : 'flex-end', alignItems: 'center' }}>
          <HeroBars width={isPhone ? 260 : 240} />
        </View>
      </Card>

      <View style={[styles.quick, { flexDirection: isPhone ? 'column' : 'row' }]}>
        <QuickCard icon="speedometer" title="Tune up" body="Chromatic tuner with 5 tunings. Works offline." onPress={() => router.push('/tuner')} />
        <QuickCard icon="grid" title="Chord library" body="108 chords with diagrams, fingerings and sound." onPress={() => router.push('/chords')} />
        <QuickCard icon="albums" title="My music" body="Your analysed songs, favourites and corrections." onPress={() => router.push('/library')} />
      </View>

      <View style={{ gap: spacing.md }}>
        <SectionHeader title="Recently analysed" action={recent.length > 0 ? <Button label="See all" variant="ghost" size="sm" onPress={() => router.push('/library')} /> : undefined} />
        {songs.isError ? (
          <Notice tone="warning">{(songs.error as Error).message} The tuner and chord library still work offline.</Notice>
        ) : recent.length === 0 && !songs.isLoading ? (
          <Card>
            <EmptyState icon="musical-notes-outline" title="No songs yet" body="Analyse your first song to see its chords here." />
          </Card>
        ) : (
          recent.map((s) => <SongRow key={s.id} song={s} />)
        )}
      </View>

      {favourites.length > 0 && (
        <View style={{ gap: spacing.md }}>
          <SectionHeader title="Favourites" />
          {favourites.map((s) => <SongRow key={s.id} song={s} />)}
        </View>
      )}

      <View style={{ gap: spacing.md }}>
        <SectionHeader title="New to guitar?" />
        <View style={[styles.quick, { flexDirection: isPhone ? 'column' : 'row' }]}>
          <TipCard step="1" title="Tune first" body="An out-of-tune guitar makes every chord sound wrong. Start each session with the tuner." />
          <TipCard step="2" title="Learn four chords" body="G, D, Em and C open the door to hundreds of songs. Find them in the chord library." />
          <TipCard step="3" title="Slow it down" body="In play-along, drop to 0.75× — the pitch stays the same — and loop the tricky change." />
        </View>
      </View>
    </Screen>
  );
}

function QuickCard({ icon, title, body, onPress }: { icon: IconName; title: string; body: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={title} style={styles.quickCard}>
      <View style={[styles.quickIcon, { backgroundColor: colors.accentSoft }]}>
        <Ionicons name={icon} size={20} color={colors.accent} />
      </View>
      <Text variant="subheading">{title}</Text>
      <Text variant="caption" tone="muted">{body}</Text>
    </Card>
  );
}

function TipCard({ step, title, body }: { step: string; title: string; body: string }) {
  return (
    <Card style={styles.quickCard}>
      <Text variant="mono" tone="highlight">{step.padStart(2, '0')}</Text>
      <Text variant="subheading">{title}</Text>
      <Text variant="caption" tone="muted">{body}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hero: { padding: spacing.xl, gap: spacing.xl, borderRadius: radius.lg, overflow: 'hidden' },
  heroActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, flexWrap: 'wrap' },
  quick: { gap: spacing.md },
  quickCard: { flex: 1, gap: spacing.xs },
  quickIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
});
