import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/Button';
import { Card, Chip, Screen, Stepper, Toggle } from '@/components/ui/primitives';
import type { PressState } from '@/components/ui/pressState';
import { Text } from '@/components/ui/Text';
import { storage } from '@/features/library/storage';
import { updateSettings, useSettings } from '@/features/settings/store';
import { useSongs } from '@/features/songs/hooks';
import { formatBytes } from '@/features/songs/timeline';
import { GUITAR_TUNINGS } from '@/lib/music/instruments';
import { lyricsEngine } from '@/services/lyricsEngine';
import { useTheme, type SchemePreference } from '@/theme/ThemeProvider';
import { useLayout } from '@/theme/useLayout';
import { brand, darkColors, lightColors, radius, spacing } from '@/theme/tokens';

const SHORTCUTS: [string, string][] = [
  ['Jump to Tuner … Chords & drills', '1 – 7'],
  ['Settings', 'Ctrl ,'],
  ['Play / pause', 'Space'],
  ['Seek ±5 s · ±1 bar with Shift', '← →'],
  ['Set loop in / out', '[ ]'],
  ['Toggle loop', 'L'],
  ['Speed down / up', '- ='],
  ['Metronome', 'M'],
  ['Import audio', 'Ctrl O'],
  ['Search songs', 'Ctrl K'],
];

const LICENCES: [string, string][] = [
  ['whisper.cpp (on-device lyrics)', 'MIT'],
  ['minimp3 (MP3 decoding)', 'CC0'],
  ['dr_wav (WAV decoding)', 'Public domain / MIT-0'],
  ['LAME (MP3 encoding)', 'LGPL'],
  ['Tauri · React Native · Expo', 'MIT / Apache-2.0'],
  ['Geist, Geist Mono, Newsreader fonts', 'SIL Open Font Licence'],
  ['Lucide icons', 'ISC'],
];

export default function SettingsScreen() {
  const { colors, preference, setPreference } = useTheme();
  const { isPhone } = useLayout();
  const settings = useSettings();
  const songs = useSongs();
  const model = useQuery({ queryKey: ['lyrics-model'], queryFn: () => lyricsEngine.status(), enabled: lyricsEngine.available() });
  const [panel, setPanel] = useState<'none' | 'keys' | 'licences'>('none');
  const songBytes = (songs.data ?? []).reduce((n, s) => n + s.audioBytes, 0);
  const analysisBytes = (songs.data ?? []).reduce((n, s) => n + JSON.stringify(s.analysis).length + JSON.stringify(s.lyrics ?? '').length, 0);
  const modelBytes = model.data?.present ? model.data.bytes : 0;
  const total = songBytes + analysisBytes + modelBytes;

  return (
    <Screen maxWidth={1180}>
      <Text variant="title">Settings</Text>
      <View style={[styles.grid, { flexDirection: isPhone ? 'column' : 'row' }]}>
        <Card style={styles.panel}>
          <Text variant="overline" tone="subtle">Appearance</Text>
          <View style={styles.themes}>
            {(
              [
                ['dark', 'Charcoal', darkColors],
                ['light', 'Ivory', lightColors],
                ['system', 'Match Windows', null],
              ] as const
            ).map(([value, label, palette]) => (
              <Pressable
                key={value}
                role="radio"
                accessibilityLabel={`${label} theme`}
                accessibilityState={{ checked: preference === value }}
                onPress={() => setPreference(value as SchemePreference)}
                style={({ hovered }: PressState) => [styles.themeCard, { borderColor: preference === value ? colors.accent : colors.border, backgroundColor: hovered ? colors.surfaceHover : colors.surface }]}
              >
                <ThemeSwatch palette={palette} />
                <Text variant="caption" style={{ color: preference === value ? colors.text : colors.textMuted }}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Row label="Reduce motion" sub="Movement becomes a colour change">
            <Toggle value={settings.reduceMotion} onChange={(v) => updateSettings({ reduceMotion: v })} label="Reduce motion" />
          </Row>
        </Card>

        <Card style={styles.panel}>
          <Text variant="overline" tone="subtle">Tuner &amp; audio</Text>
          <View style={{ gap: spacing.sm }}>
            <Text variant="body">Default tuning</Text>
            <View style={styles.chips}>
              {GUITAR_TUNINGS.map((t) => (
                <Chip key={t.id} label={t.name} selected={settings.defaultTuning === t.id} onPress={() => updateSettings({ defaultTuning: t.id })} />
              ))}
            </View>
          </View>
          <Row label="Reference pitch" sub="Standard is 440 Hz">
            <Stepper label="reference pitch" value={`A4 = ${settings.a4} Hz`} onMinus={() => updateSettings({ a4: Math.max(415, settings.a4 - 1) })} onPlus={() => updateSettings({ a4: Math.min(466, settings.a4 + 1) })} />
          </Row>
          <Row label="Input and output" sub="Riffly uses the devices chosen in Windows sound settings">
            <Text variant="mono" tone="subtle" style={{ fontSize: 12 }}>System default</Text>
          </Row>
        </Card>

        <Card style={styles.panel}>
          <Text variant="overline" tone="subtle">Metronome &amp; playback</Text>
          <Row label="Accent first beat" sub="A higher click on beat 1 of each bar">
            <Toggle value={settings.accentFirstBeat} onChange={(v) => updateSettings({ accentFirstBeat: v })} label="Accent first beat" />
          </Row>
          <Row label="Count-in length" sub="Before play, when count-in is on">
            <Text variant="mono" style={{ fontSize: 12 }}>1 BAR</Text>
          </Row>
          <Row label="Default speed" sub="Pitch is always preserved">
            <Stepper
              label="default speed"
              value={`${Math.round(settings.defaultSpeed * 100)}%`}
              onMinus={() => updateSettings({ defaultSpeed: Math.max(0.5, Number((settings.defaultSpeed - 0.05).toFixed(2))) })}
              onPlus={() => updateSettings({ defaultSpeed: Math.min(1.2, Number((settings.defaultSpeed + 0.05).toFixed(2))) })}
            />
          </Row>
        </Card>
      </View>

      <View style={[styles.grid, { flexDirection: isPhone ? 'column' : 'row' }]}>
        <Card style={[styles.panel, { maxWidth: isPhone ? undefined : 380 }]}>
          <Text variant="overline" tone="subtle">Local storage</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text variant="readout">{formatBytes(total)}</Text>
            <Text variant="caption" tone="subtle">on this computer only</Text>
          </View>
          <View style={[styles.bar, { backgroundColor: colors.surfaceSunken }]}>
            <View style={{ flex: songBytes || 0.0001, backgroundColor: brand.amber }} />
            <View style={{ flex: modelBytes || 0.0001, backgroundColor: brand.olive }} />
            <View style={{ flex: analysisBytes || 0.0001, backgroundColor: brand.terracotta }} />
          </View>
          <Legend color={brand.amber} text={`Songs ${formatBytes(songBytes)} · ${songs.data?.length ?? 0} MP3s`} />
          {lyricsEngine.available() && <Legend color={brand.olive} text={`Lyrics model ${model.data?.present ? formatBytes(modelBytes) : 'not downloaded'}`} />}
          <Legend color={brand.terracotta} text={`Analysis and lyrics ${formatBytes(analysisBytes)}`} />
          <View style={[styles.path, { borderColor: colors.border, backgroundColor: colors.surfaceSunken }]}>
            <Text variant="mono" tone="muted" style={{ fontSize: 12 }}>{Platform.OS === 'web' && lyricsEngine.available() ? '%APPDATA%\\app.riffly' : storage.location}</Text>
          </View>
          <Text variant="caption" tone="subtle">No account and no cloud: nothing syncs between devices. Use “Save MP3” on a song to keep a copy elsewhere.</Text>
        </Card>

        <Card style={[styles.panel, styles.about]}>
          <Logo size={30} />
          <View style={{ flex: 1, gap: 2, minWidth: 220 }}>
            <Text variant="subheading">Version 1.0.0 · {Platform.OS === 'web' ? 'Windows' : 'Android'}</Text>
            <Text variant="caption" tone="muted">Free and offline. No accounts, no tracking, no uploads. Speech recognition by whisper.cpp.</Text>
          </View>
          <Button label="Keyboard shortcuts" variant="secondary" size="sm" onPress={() => setPanel(panel === 'keys' ? 'none' : 'keys')} />
          <Button label="Licences" variant="secondary" size="sm" onPress={() => setPanel(panel === 'licences' ? 'none' : 'licences')} />
          {panel !== 'none' && (
            <View style={{ width: '100%', gap: 2, marginTop: spacing.sm }}>
              {(panel === 'keys' ? SHORTCUTS : LICENCES).map(([a, b]) => (
                <View key={a} style={[styles.kv, { borderBottomColor: colors.divider }]}>
                  <Text variant="body" tone="muted">{a}</Text>
                  <Text variant="mono" style={{ fontSize: 12 }}>{b}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      </View>
    </Screen>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body">{label}</Text>
        {sub && <Text variant="caption" tone="subtle">{sub}</Text>}
      </View>
      {children}
    </View>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
      <Text variant="caption" tone="muted">{text}</Text>
    </View>
  );
}

/** A tiny picture of the theme: canvas, a panel and an amber lamp. */
function ThemeSwatch({ palette }: { palette: typeof darkColors | null }) {
  const half = (p: typeof darkColors, side: 'l' | 'r' | 'full') => (
    <View style={{ flex: 1, backgroundColor: p.background, padding: 6, gap: 4, borderTopLeftRadius: side !== 'r' ? 4 : 0, borderTopRightRadius: side !== 'l' ? 4 : 0 }}>
      <View style={{ height: 6, width: '60%', borderRadius: 2, backgroundColor: p.text }} />
      <View style={{ height: 4, width: '40%', borderRadius: 2, backgroundColor: p.accent }} />
      <View style={{ flex: 1, borderRadius: 3, backgroundColor: p.surface }} />
    </View>
  );
  return (
    <View style={{ height: 64, alignSelf: 'stretch', flexDirection: 'row', borderRadius: 4, overflow: 'hidden' }}>
      {palette ? half(palette, 'full') : (
        <>
          {half(darkColors, 'l')}
          {half(lightColors, 'r')}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.lg, alignItems: 'flex-start' },
  panel: { flex: 1, gap: spacing.lg, minWidth: 0, alignSelf: 'stretch' },
  themes: { flexDirection: 'row', gap: spacing.sm },
  themeCard: { flex: 1, gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 36 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
  path: { padding: spacing.sm, borderRadius: radius.md, borderWidth: 1 },
  about: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.lg },
  kv: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1 },
});
