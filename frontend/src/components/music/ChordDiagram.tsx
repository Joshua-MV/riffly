import Svg, { Circle, Line, Rect, Text as SvgText } from 'react-native-svg';

import type { Voicing } from '@/lib/music/voicings';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

const FRETS_SHOWN = 4;

export interface ChordDiagramProps {
  voicing: Voicing;
  width?: number;
  showFingers?: boolean;
  /** Highlight colour for dots — the play-along screen uses amber for the current chord. */
  tone?: 'accent' | 'highlight';
}

/** Vertical chord box: strings are columns (low E on the left), frets are rows. */
export function ChordDiagram({ voicing, width = 140, showFingers = true, tone = 'accent' }: ChordDiagramProps) {
  const { colors } = useTheme();
  const strings = voicing.frets.length;
  // Extra left margin leaves room for the "5fr" position label.
  const pad = width * 0.2;
  const top = width * 0.22;
  const gridW = width - pad - width * 0.1;
  const gap = gridW / (strings - 1);
  const fretH = gap * 1.25;
  const height = top + fretH * FRETS_SHOWN + width * 0.12;
  const startFret = voicing.maxFret <= FRETS_SHOWN ? 1 : voicing.minFret;
  const atNut = startFret === 1;
  const dot = colors[tone];
  const xOf = (s: number) => pad + s * gap;
  const yOf = (fret: number) => top + (fret - startFret + 0.5) * fretH;
  const fretted = voicing.frets.map((f, s) => ({ f, s })).filter(({ f }) => f !== null && f > 0) as { f: number; s: number }[];
  const label = voicing.frets.map((f) => (f === null ? 'x' : f)).join(' ');

  return (
    <Svg width={width} height={height} accessibilityLabel={`Chord diagram, frets from low to high string: ${label}`}>
      {/* Nut or position marker */}
      {atNut ? (
        <Rect x={pad - 1} y={top - 5} width={gridW + 2} height={5} rx={1.5} fill={colors.text} />
      ) : (
        <SvgText x={pad - width * 0.05} y={top + fretH * 0.62} fontSize={width * 0.085} fill={colors.textMuted} fontFamily={fonts.bodyMedium} textAnchor="end">
          {`${startFret}fr`}
        </SvgText>
      )}
      {Array.from({ length: FRETS_SHOWN + 1 }, (_, i) => (
        <Line key={`f${i}`} x1={pad} x2={pad + gridW} y1={top + i * fretH} y2={top + i * fretH} stroke={colors.borderStrong} strokeWidth={1} />
      ))}
      {Array.from({ length: strings }, (_, s) => (
        <Line key={`s${s}`} x1={xOf(s)} x2={xOf(s)} y1={top} y2={top + FRETS_SHOWN * fretH} stroke={colors.textSubtle} strokeWidth={1 + (strings - 1 - s) * 0.18} />
      ))}
      {/* Open / muted markers */}
      {voicing.frets.map((f, s) =>
        f === 0 ? (
          <Circle key={`o${s}`} cx={xOf(s)} cy={top - width * 0.09} r={width * 0.034} stroke={colors.textMuted} strokeWidth={1.5} fill="none" />
        ) : f === null ? (
          <SvgText key={`x${s}`} x={xOf(s)} y={top - width * 0.06} fontSize={width * 0.1} fill={colors.textSubtle} textAnchor="middle" fontFamily={fonts.bodyMedium}>
            ×
          </SvgText>
        ) : null,
      )}
      {voicing.barre && (
        <Rect
          x={xOf(voicing.barre.fromString) - gap * 0.32}
          y={yOf(voicing.barre.fret) - gap * 0.32}
          width={xOf(voicing.barre.toString) - xOf(voicing.barre.fromString) + gap * 0.64}
          height={gap * 0.64}
          rx={gap * 0.32}
          fill={dot}
        />
      )}
      {fretted.map(({ f, s }) => {
        const finger = voicing.fingers[s];
        const onBarre = voicing.barre && finger === 1 && f === voicing.barre.fret;
        return (
          <Circle key={`d${s}`} cx={xOf(s)} cy={yOf(f)} r={gap * 0.32} fill={dot} opacity={onBarre ? 0 : 1} />
        );
      })}
      {showFingers &&
        fretted.map(({ f, s }) => {
          const finger = voicing.fingers[s];
          if (!finger) return null;
          return (
            <SvgText key={`n${s}`} x={xOf(s)} y={yOf(f) + gap * 0.13} fontSize={gap * 0.38} fill={colors.onAccent} textAnchor="middle" fontFamily={fonts.bodySemibold}>
              {String(finger)}
            </SvgText>
          );
        })}
    </Svg>
  );
}
