import { createClock } from '../clock';

describe('playback clock', () => {
  let ms = 0;
  const clock = () => createClock(() => ms);
  beforeEach(() => {
    ms = 0;
  });

  it('runs on between reports at the playback rate', () => {
    const c = clock();
    c.report(10, true, 1);
    ms = 500;
    expect(c.now()).toBeCloseTo(10.5);
    c.report(10.5, true, 0.5);
    ms = 1500;
    expect(c.now()).toBeCloseTo(11);
  });

  it('blends small corrections and never runs backwards', () => {
    const c = clock();
    c.report(10, true, 1);
    ms = 1000;
    expect(c.now()).toBeCloseTo(11);
    c.report(10.9, true, 1); // the player says it is slightly behind
    const t = c.now();
    expect(t).toBeGreaterThanOrEqual(11 - 1e-9);
    ms = 1100;
    expect(c.now()).toBeGreaterThan(t);
  });

  it('follows seeks and pauses immediately', () => {
    const c = clock();
    c.report(10, true, 1);
    ms = 200;
    c.report(60, true, 1); // a seek
    expect(c.now()).toBeCloseTo(60);
    c.jump(5);
    expect(c.now()).toBeCloseTo(5);
    c.report(5.2, false, 1);
    ms = 5000;
    expect(c.now()).toBeCloseTo(5.2);
  });

  it('notifies listeners while paused on changes', () => {
    const c = clock();
    const seen: number[] = [];
    const off = c.subscribe((t) => seen.push(t));
    c.jump(3);
    off();
    c.jump(4);
    expect(seen).toEqual([0, 3]);
  });
});
