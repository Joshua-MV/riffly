import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { TabBar } from '@/lib/music/fingerstyle';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius, spacing } from '@/theme/tokens';

const STRINGS = [5, 4, 3, 2, 1, 0]; // draw high e on top, like printed tab
const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];

export interface TabViewProps {
  bars: readonly TabBar[];
  current: { bar: number; step: number } | null;
  onSeek: (time: number) => void;
  large?: boolean;
  maxHeight?: number;
}

interface Metrics {
  col: number;
  row: number;
  chordRow: number;
  barWidth: number;
  lineHeight: number;
}

const BarView = memo(function BarView({ bar, activeStep, metrics, onSeek }: { bar: TabBar; activeStep: number; metrics: Metrics; onSeek: (t: number) => void }) {
  const { colors } = useTheme();
  const active = activeStep >= 0;
  let lastChord: string | null = null;
  return (
    <Pressable
      accessibilityLabel={`Bar ${bar.index + 1}${bar.steps[0].chord ? `, ${bar.steps[0].chord}` : ''}. Jump here`}
      onPress={() => onSeek(bar.start)}
      style={[styles.bar, { width: metrics.barWidth, borderColor: colors.borderStrong }, active && { backgroundColor: colors.highlightSoft }]}
    >
      <View style={{ height: metrics.chordRow, flexDirection: 'row' }}>
        {bar.steps.map((s, i) => {
          const show = s.chord && s.chord !== lastChord ? s.chord : '';
          if (s.chord) lastChord = s.chord;
          return (
            <View key={i} style={{ width: metrics.col }}>
              {show ? <Text variant="caption" style={{ color: colors.highlight, fontFamily: fonts.bodySemibold, width: metrics.col * 3 }} numberOfLines={1}>{show}</Text> : null}
            </View>
          );
        })}
      </View>
      <View>
        {STRINGS.map((s) => (
          <View key={s} style={[styles.stringLine, { top: (5 - s) * metrics.row + metrics.row / 2, backgroundColor: colors.border }]} />
        ))}
        <View style={{ flexDirection: 'row' }}>
          {bar.steps.map((step, i) => (
            <View
              key={i}
              style={[
                { width: metrics.col, height: metrics.row * 6 },
                i === activeStep && { backgroundColor: colors.highlight, borderRadius: radius.sm, opacity: 0.25 },
              ]}
            />
          ))}
        </View>
        <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]} pointerEvents="none">
          {bar.steps.map((step, i) => (
            <View key={i} style={{ width: metrics.col }}>
              {STRINGS.map((s) => {
                const n = step.notes.find((x) => x.string === s);
                return (
                  <View key={s} style={{ height: metrics.row, alignItems: 'center', justifyContent: 'center' }}>
                    {n && (
                      <View style={[styles.fret, { backgroundColor: colors.surface, minWidth: metrics.row - 2 }]}>
                        <Text style={{ fontFamily: fonts.displayMedium, fontSize: metrics.row * 0.62, lineHeight: metrics.row - 2, color: i === activeStep ? colors.highlight : colors.text }}>
                          {n.fret}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', height: 14 }}>
        {bar.steps.map((s, i) => (
          <View key={i} style={{ width: metrics.col, alignItems: 'center' }}>
            {s.onBeat && <Text variant="caption" tone="subtle" style={{ fontSize: 10, lineHeight: 12 }}>{i / 2 + 1}</Text>}
          </View>
        ))}
      </View>
    </Pressable>
  );
});

/** Fingerpicking tab laid out in lines of bars. The playing step is highlighted and kept in view. */
export function TabView({ bars, current, onSeek, large = false, maxHeight = 460 }: TabViewProps) {
  const { colors } = useTheme();
  const window = useWindowDimensions();
  // Start from a window-based estimate so the tab draws immediately; onLayout refines it.
  const [width, setWidth] = useState(() => Math.min(window.width, 1200) - 48);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const metrics = useMemo<Metrics>(() => {
    const col = large ? 34 : 26;
    const row = large ? 24 : 18;
    const chordRow = 20;
    return { col, row, chordRow, barWidth: col * 8 + 2, lineHeight: chordRow + row * 6 + 14 + spacing.md };
  }, [large]);
  const perLine = Math.max(1, Math.floor((width - 24) / metrics.barWidth));
  const lines = useMemo(() => {
    const out: TabBar[][] = [];
    for (let i = 0; i < bars.length; i += perLine) out.push(bars.slice(i, i + perLine));
    return out;
  }, [bars, perLine]);
  const currentLine = current ? Math.floor(current.bar / perLine) : -1;

  useEffect(() => {
    if (currentLine >= 0) scroll.current?.scrollTo({ y: Math.max(0, (currentLine - 1) * metrics.lineHeight), animated: true });
  }, [currentLine, metrics.lineHeight]);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <ScrollView ref={scroll} style={{ maxHeight }} nestedScrollEnabled>
          {lines.map((line, li) => (
            <View key={li} style={[styles.line, { height: metrics.lineHeight }]}>
              <View style={[styles.labels, { marginTop: metrics.chordRow }]}>
                {STRINGS.map((s) => (
                  <Text key={s} variant="caption" tone="subtle" style={{ height: metrics.row, lineHeight: metrics.row, fontSize: 11 }}>
                    {STRING_NAMES[s]}
                  </Text>
                ))}
              </View>
              {line.map((bar) => (
                <BarView
                  key={bar.index}
                  bar={bar}
                  activeStep={current && current.bar === bar.index ? current.step : -1}
                  metrics={metrics}
                  onSeek={onSeek}
                />
              ))}
            </View>
          ))}
          {!bars.length && <Text tone="muted" style={{ padding: spacing.lg, color: colors.textMuted }}>No steady beat was detected, so a synced tab can't be generated for this song.</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'flex-start' },
  labels: { width: 20, alignItems: 'center' },
  bar: { borderLeftWidth: 1, paddingHorizontal: 1, borderRadius: 2 },
  stringLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth * 2 },
  fret: { borderRadius: 4, paddingHorizontal: 2, alignItems: 'center' },
});
