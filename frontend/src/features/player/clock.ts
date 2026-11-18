/**
 * A smooth playback clock. The audio player only reports its position every so often (and on
 * some platforms only a few times a second), so anything drawn from those reports moves in
 * jumps. The clock fills in between reports from the system clock at 60 fps, and folds each
 * new report in gently so the picture never stutters or runs backwards; a real jump (a seek)
 * is followed immediately.
 */

export type ClockListener = (time: number) => void;

export interface PlaybackClock {
  /** Smooth song position in seconds. */
  now(): number;
  playing(): boolean;
  /** Called every animation frame while playing (and once after any change while paused). */
  subscribe(fn: ClockListener): () => void;
}

export interface ClockControl extends PlaybackClock {
  /** A position report from the player. */
  report(time: number, playing: boolean, rate: number): void;
  /** Jump straight to a time (seek), without blending. */
  jump(time: number): void;
  /**
   * A live position source (the player's own current time, readable at any moment). While
   * playing, the clock follows it exactly instead of estimating between reports.
   */
  setSource(read: (() => number) | null): void;
  /**
   * While playing, report the position this many (real) seconds behind the player, so
   * everything drawn or clicked from the clock lines up with the sound as heard.
   */
  setDelay(seconds: number): void;
}

const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const frame = (cb: () => void): unknown =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : setTimeout(cb, 16);
const cancelFrame = (id: unknown) => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id as number);
  else clearTimeout(id as ReturnType<typeof setTimeout>);
};

/** Reports closer than this to the prediction are blended in; further ones are jumps. */
const JUMP = 0.3;
/** How much of the difference to a new report is taken at once. */
const BLEND = 0.25;

export function createClock(nowMs: () => number = perfNow): ClockControl {
  let anchorTime = 0;
  let anchorAt = nowMs();
  let isPlaying = false;
  let rate = 1;
  let lastOut = 0;
  let source: (() => number) | null = null;
  let delay = 0;
  let raf: unknown = null;
  const listeners = new Set<ClockListener>();

  const predict = () => (isPlaying ? anchorTime + ((nowMs() - anchorAt) / 1000) * rate : anchorTime);

  const now = () => {
    let t = predict();
    if (isPlaying && source) {
      const live = source();
      // Follow the player's real position; fall back to the estimate if it isn't usable.
      if (Number.isFinite(live) && live >= 0 && Math.abs(live - t) < 2) {
        t = live;
        anchorTime = live;
        anchorAt = nowMs();
      }
    }
    if (isPlaying) t = Math.max(0, t - delay * rate);
    // Never step backwards while playing (a blended correction could otherwise do that).
    if (isPlaying && t < lastOut && lastOut - t < JUMP) return lastOut;
    lastOut = t;
    return t;
  };

  const emit = () => {
    const t = now();
    listeners.forEach((fn) => fn(t));
  };

  const loop = () => {
    raf = null;
    if (!isPlaying || listeners.size === 0) return;
    emit();
    raf = frame(loop);
  };
  const ensureLoop = () => {
    if (isPlaying && listeners.size > 0 && raf === null) raf = frame(loop);
  };

  const rebase = (t: number) => {
    anchorTime = t;
    anchorAt = nowMs();
  };

  return {
    now,
    playing: () => isPlaying,
    subscribe(fn) {
      listeners.add(fn);
      fn(now());
      ensureLoop();
      return () => {
        listeners.delete(fn);
        if (listeners.size === 0 && raf !== null) {
          cancelFrame(raf);
          raf = null;
        }
      };
    },
    report(time, playing, r) {
      const predicted = predict();
      const diff = time - predicted;
      if (isPlaying && playing && r === rate && Math.abs(diff) < JUMP) rebase(predicted + diff * BLEND);
      else {
        rebase(time);
        lastOut = time;
      }
      isPlaying = playing;
      rate = r;
      if (!playing) emit();
      ensureLoop();
    },
    setSource(read) {
      source = read;
    },
    setDelay(seconds) {
      delay = Math.max(0, seconds);
    },
    jump(time) {
      rebase(time);
      lastOut = time;
      emit();
    },
  };
}
