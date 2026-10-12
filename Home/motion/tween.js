// Shared-clock tweens. Nothing here runs on its own: the stage's loop calls
// `stepTweens(now)` once per frame while `hasActiveTweens()` is true, so an
// idle page spends no frames at all.

import { EASE } from './bezier.js';

const active = new Set();
let listeners = new Set();
// What the last step moved: `busy` — a tween changed something on screen (or one finished, whose
// onComplete may have); `ambient` — only a slow ambient glow moved (the READY LED). A tween still
// waiting out its delay, a sequence's pending call() and a wait() move nothing, so they keep the
// loop stepping without asking for a frame.
const activity = { busy: false, ambient: false };

export function onTweenAdded(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function hasActiveTweens() { return active.size > 0; }
export function tweenActivity() { return activity; }

/**
 * tween({ from, to, duration, delay, ease, onUpdate(value, progress), onComplete })
 * `from` / `to` may be numbers or arrays of numbers (interpolated element-wise).
 * Resolves when complete. Throws without a curve — linear motion is not allowed.
 */
export function tween(opts) {
  const { from = 0, to = 1, duration, delay = 0, onUpdate, onComplete, ambient = false } = opts;
  let ease = opts.ease;
  if (typeof ease === 'string') ease = EASE[ease];
  if (typeof ease !== 'function' || opts.ease === 'linear') {
    throw new Error('tween(): an easing curve is required — linear motion is not allowed on this page');
  }
  if (!(duration >= 0)) throw new Error('tween(): duration required');
  const isArr = Array.isArray(from);
  return new Promise((resolve) => {
    const t = {
      start: null, delay, duration, ease, from, to, isArr, onUpdate, ambient, done: false,
      finish() {
        if (t.done) return;
        t.done = true;
        active.delete(t);
        onComplete && onComplete();
        resolve();
      },
      cancel() { t.done = true; active.delete(t); resolve(); },
    };
    active.add(t);
    listeners.forEach((fn) => fn());
  });
}

export function stepTweens(now) {
  let busy = false, ambient = false;
  for (const t of active) {                 // deleting from a Set while iterating it is safe
    if (t.done) continue;
    if (t.start === null) t.start = now + t.delay;
    const elapsed = now - t.start;
    if (elapsed < 0) continue;              // not started: nothing has moved yet
    const p = t.duration === 0 ? 1 : Math.min(1, elapsed / t.duration);
    const e = t.ease(p);
    let v;
    if (t.isArr) v = t.from.map((a, i) => a + (t.to[i] - a) * e);
    else v = t.from + (t.to - t.from) * e;
    if (t.onUpdate) { t.onUpdate(v, p, e); if (t.ambient) ambient = true; else busy = true; }
    if (p >= 1) { t.finish(); busy = true; }
  }
  activity.busy = busy; activity.ambient = ambient;
  return active.size > 0;
}

export function cancelAllTweens() {
  for (const t of Array.from(active)) t.cancel();
}

/** Wait `ms` on the shared clock (still eased internally; no motion attached). */
export function wait(ms) {
  return tween({ from: 0, to: 1, duration: ms, ease: EASE.ui });
}

/**
 * A choreography helper: `const s = sequence(); s.at(450, 800, {...tween opts})`
 * schedules a tween whose own clock starts at `startMs` after `s.begin()`.
 */
export function sequence() {
  const jobs = [];
  return {
    at(startMs, endMs, opts) {
      const p = { ...opts, delay: startMs, duration: endMs - startMs };
      jobs.push(p);
      return p;
    },
    call(startMs, fn) {
      jobs.push({ from: 0, to: 1, delay: startMs, duration: 0, ease: EASE.ui, onComplete: fn });
    },
    run() {
      return Promise.all(jobs.map((j) => tween(j)));
    },
  };
}
