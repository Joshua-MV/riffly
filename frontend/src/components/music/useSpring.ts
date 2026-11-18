import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

/**
 * A value that follows `target` with a critically damped spring, integrated every animation
 * frame. Unlike restarting a timing animation on every update (which stutters when updates
 * arrive 30 times a second), the motion stays continuous however often the target changes.
 */
export function useSpring(target: number, { stiffness = 140, damping = 2 * Math.sqrt(140) } = {}): Animated.Value {
  const value = useRef(new Animated.Value(target)).current;
  const state = useRef({ x: target, v: 0, target, raf: 0 as unknown, last: 0 });

  useEffect(() => {
    const s = state.current;
    s.target = target;
    if (s.raf) return;
    s.last = performance.now();
    const step = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - s.last) / 1000);
      s.last = now;
      const a = stiffness * (s.target - s.x) - damping * s.v;
      s.v += a * dt;
      s.x += s.v * dt;
      value.setValue(s.x);
      if (Math.abs(s.target - s.x) < 0.01 && Math.abs(s.v) < 0.01) {
        s.x = s.target;
        value.setValue(s.x);
        s.raf = 0;
        return;
      }
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
  }, [target, stiffness, damping, value]);

  useEffect(() => () => {
    if (state.current.raf) cancelAnimationFrame(state.current.raf as number);
  }, []);

  return value;
}
