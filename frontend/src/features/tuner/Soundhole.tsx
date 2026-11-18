import { useEffect, useState } from 'react';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { brand, fonts } from '@/theme/tokens';

/**
 * The tuner's instrument: the guitar's soundhole with a cents gauge around it, the six strings
 * running down to the bridge, and the note in the middle. The string being tuned vibrates while
 * it rings; the lamp on the ring shows how far off it is (top = in tune). The guitar is an object
 * on the page, so its colours are fixed rather than following the light/dark theme.
 */

const OLIVE = '#8FA07F';
const AMBER = brand.amber;
const TERRA = '#C97A63';
const AMBER_T = '#D9A15E';
const CX = 300;
const CY = 300;
const R = 150;
const XS = [215, 249, 283, 317, 351, 385];
const WIDTHS = [3.4, 2.9, 2.4, 1.8, 1.4, 1.1];
const BRIDGE = 550;

const pt = (c: number, r: number) => {
  const a = ((270 + c * 1.8) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)] as const;
};
const arc = (c0: number, c1: number) => {
  const [ax, ay] = pt(c0, R);
  const [bx, by] = pt(c1, R);
  return `M${ax.toFixed(1)} ${ay.toFixed(1)} A${R} ${R} 0 0 1 ${bx.toFixed(1)} ${by.toFixed(1)}`;
};
let TICKS = '';
for (let i = 0; i <= 20; i++) {
  if (i === 10) continue;
  const c = -50 + i * 5;
  const major = i % 5 === 0;
  const [x0, y0] = pt(c, major ? 139 : 143);
  const [x1, y1] = pt(c, major ? 161 : 157);
  TICKS += `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
const [Z0X, Z0Y] = pt(0, 134);
const [Z1X, Z1Y] = pt(0, 166);
const TICK_ZERO = `M${Z0X.toFixed(1)} ${Z0Y.toFixed(1)}L${Z1X.toFixed(1)} ${Z1Y.toFixed(1)}`;

export interface SoundholeProps {
  /** Open-string names, low to high (E A D G B E). */
  names: readonly string[];
  /** The string being tuned (or next up), or null. */
  active: number | null;
  done: ReadonlySet<number>;
  /** Listening to the mic. */
  live: boolean;
  /** Cents off while a note is heard, else null. */
  cents: number | null;
  inTune: boolean;
  allDone: boolean;
  note: string;
  noteSub: string;
  /** Restart the string's ring (a new pluck). */
  pluckKey: number;
  reduceMotion: boolean;
  width: number;
}

export function Soundhole({ names, active, done, live, cents, inTune, allDone, note, noteSub, pluckKey, reduceMotion, width }: SoundholeProps) {
  const hearing = live && cents !== null && !allDone;
  // The ringing string: a phase that runs while a note is heard, and a ring that decays after each pluck.
  const [anim, setAnim] = useState({ phase: 0, since: 0 });
  useEffect(() => {
    if (!hearing || reduceMotion) return;
    let raf = 0;
    const start = performance.now();
    const step = () => {
      const t = (performance.now() - start) / 1000;
      setAnim({ phase: t * 46, since: t });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [hearing, reduceMotion, pluckKey]);

  const c = hearing ? Math.max(-50, Math.min(50, cents)) : 0;
  const flat = hearing && !inTune && c < 0;
  const sharp = hearing && !inTune && c > 0;
  const arcPath = allDone ? arc(-50, 50) : hearing ? (inTune ? arc(-3, 3) : c < 0 ? arc(c, 0) : arc(0, c)) : arc(-3, 3);
  const arcCol = allDone || (hearing && inTune) ? 'rgba(143,160,127,0.55)' : !hearing ? 'rgba(143,160,127,0.22)' : flat ? 'rgba(197,138,69,0.38)' : 'rgba(201,122,99,0.38)';
  const [lx, ly] = pt(c, R);
  const lampCol = allDone || (hearing && inTune) ? OLIVE : !hearing ? '#4A4B44' : flat ? AMBER : TERRA;
  const noteCol = allDone ? OLIVE : !live ? '#4A4B44' : hearing && inTune ? OLIVE : brand.ivory;

  const ring = hearing ? 0.45 + 0.55 * Math.exp(-anim.since / 0.9) : 0;
  const A = reduceMotion ? 0 : 3.2 * ring;
  let lens = '';
  const strings = names.map((_, i) => {
    const on = i === active && !allDone;
    const ok = done.has(i);
    const col = ok ? OLIVE : on ? (live ? (hearing && inTune ? OLIVE : AMBER) : '#E8E2D4') : i < 3 ? '#A9A69C' : '#C9C4B8';
    let d = `M${XS[i]} 0 L${XS[i]} ${BRIDGE}`;
    if (on && hearing && A > 0) {
      const amp = A * Math.cos(anim.phase);
      d = '';
      let fw = '';
      let bw = '';
      for (let k = 0; k <= 30; k++) {
        const y = (BRIDGE * k) / 30;
        const s = Math.sin((Math.PI * k) / 30);
        d += `${k ? 'L' : 'M'}${(XS[i] + amp * s).toFixed(2)} ${y.toFixed(1)}`;
        fw += `${k ? 'L' : 'M'}${(XS[i] + A * s).toFixed(2)} ${y.toFixed(1)}`;
      }
      for (let k = 30; k >= 0; k--) bw += `L${(XS[i] - A * Math.sin((Math.PI * k) / 30)).toFixed(2)} ${((BRIDGE * k) / 30).toFixed(1)}`;
      lens = `${fw}${bw}Z`;
    }
    return { d, col, on, ok };
  });

  const label = `Guitar soundhole with six strings. ${allDone ? 'All strings in tune.' : hearing ? `Listening to ${note}, ${inTune ? 'in tune' : flat ? 'flat' : 'sharp'}.` : live ? 'Listening.' : 'Standby.'}`;

  return (
    <Svg width={width} height={(width * 640) / 600} viewBox="0 0 600 640" accessibilityLabel={label} role="img">
      <Rect x={10} y={0} width={580} height={640} rx={44} fill="#23241F" />
      <G stroke="#272822" strokeWidth={2} fill="none">
        {[60, 104, 141, 462, 497, 540].map((x) => (
          <Path key={x} d={`M${x} 0 V640`} />
        ))}
      </G>
      <Rect x={10.5} y={0.5} width={579} height={639} rx={43.5} fill="none" stroke={brand.ivory} strokeOpacity={0.1} />

      <Rect x={190} y={0} width={220} height={118} fill="#151612" />
      <Line x1={190} y1={34} x2={410} y2={34} stroke="#6A6962" strokeWidth={3} />
      <Line x1={190} y1={86} x2={410} y2={86} stroke="#6A6962" strokeWidth={3} />
      <Circle cx={300} cy={60} r={5} fill="#E8E2D4" fillOpacity={0.6} />

      <Circle cx={CX} cy={CY} r={168} fill="none" stroke="#3E3F39" strokeWidth={1.2} />
      <Circle cx={CX} cy={CY} r={150} fill="none" stroke="#2F302A" strokeWidth={22} strokeDasharray="3 3.4" />
      <Circle cx={CX} cy={CY} r={138} fill="none" stroke="#3E3F39" strokeWidth={1.2} />
      <Circle cx={CX} cy={CY} r={128} fill="#0E0F0C" />

      <Path d={arcPath} fill="none" stroke={arcCol} strokeWidth={22} opacity={0.9} />
      <Path d={TICKS} fill="none" stroke="#9C9A91" strokeWidth={1.6} strokeLinecap="round" />
      <Path d={TICK_ZERO} fill="none" stroke={brand.ivory} strokeWidth={2.4} strokeLinecap="round" />
      <Circle cx={lx} cy={ly} r={15} fill={lampCol} opacity={0.22} />
      <Circle cx={lx} cy={ly} r={9} fill={lampCol} stroke="#0E0F0C" strokeWidth={2} />
      <SvgText x={112} y={314} textAnchor="middle" fontFamily={fonts.serif} fontSize={42} fill={flat ? AMBER_T : '#3A3B35'}>♭</SvgText>
      <SvgText x={488} y={314} textAnchor="middle" fontFamily={fonts.serif} fontSize={42} fill={sharp ? TERRA : '#3A3B35'}>♯</SvgText>
      <SvgText x={300} y={352} textAnchor="middle" fontFamily={fonts.display} fontSize={150} letterSpacing={-5} fill={noteCol}>{note}</SvgText>
      <SvgText x={300} y={396} textAnchor="middle" fontFamily={fonts.mono} fontSize={13} letterSpacing={2} fill="#9C9A91">{noteSub}</SvgText>

      {lens ? <Path d={lens} fill={inTune ? OLIVE : AMBER} opacity={0.12} /> : null}
      <G fill="none" strokeLinecap="round">
        {strings.map((s, i) => (
          <Path key={i} d={s.d} stroke={s.col} strokeWidth={WIDTHS[i]} />
        ))}
      </G>
      <G fill="none" stroke="#0E0F0C" strokeOpacity={0.5} strokeDasharray="1.1 1.6">
        {strings.slice(0, 3).map((s, i) => (
          <Path key={i} d={s.d} strokeWidth={WIDTHS[i]} />
        ))}
      </G>

      <Rect x={166} y={532} width={268} height={72} rx={14} fill="#151612" />
      <Line x1={186} y1={550} x2={414} y2={550} stroke="#E8E2D4" strokeWidth={5} strokeLinecap="round" />
      {strings.map((s, i) => (
        <Circle key={i} cx={XS[i]} cy={578} r={s.on ? 11 : 9} fill={s.ok ? OLIVE : s.on ? AMBER : '#E8E2D4'} stroke={s.on ? 'rgba(197,138,69,0.35)' : 'transparent'} strokeWidth={3} />
      ))}
      {names.map((n, i) => (
        <SvgText key={i} x={XS[i]} y={628} textAnchor="middle" fontFamily={fonts.mono} fontSize={14} fill={strings[i].on ? brand.ivory : strings[i].ok ? OLIVE : '#9C9A91'}>
          {n}
        </SvgText>
      ))}
    </Svg>
  );
}
