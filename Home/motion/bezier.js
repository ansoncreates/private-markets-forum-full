// Cubic-bézier easing solver — a port of WebKit's UnitBezier
// (Newton–Raphson, then bisection when Newton stalls). Same curve
// semantics as CSS `cubic-bezier(x1, y1, x2, y2)`.

export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  const solveX = (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const dx = sampleX(t) - x;
      if (Math.abs(dx) < 1e-6) return t;
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= dx / d;
    }
    let lo = 0, hi = 1; t = x;
    while (lo < hi) {
      const xs = sampleX(t);
      if (Math.abs(xs - x) < 1e-6) return t;
      if (x > xs) lo = t; else hi = t;
      t = (hi - lo) * 0.5 + lo;
    }
    return t;
  };
  const fn = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sampleY(solveX(x)));
  fn.points = [x1, y1, x2, y2];
  fn.css = `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
  // The reverse of a curve, for a step played backwards (eject).
  fn.mirror = () => cubicBezier(1 - x2, 1 - y2, 1 - x1, 1 - y1);
  return fn;
}

// The brand curves (BRAND-FOUNDATION §8) plus the two the homepage adds.
export const EASE = {
  ui:     cubicBezier(0.4, 0, 0.2, 1),       // presses, fades, spin-up, settling
  reveal: cubicBezier(0.22, 1, 0.36, 1),     // anything arriving or lifting
  open:   cubicBezier(0.22, 1.15, 0.36, 1),  // key release only (overshoot)
  mech:   cubicBezier(0.65, 0, 0.35, 1),     // mechanical travel: slide, transfer, swing
  exit:   cubicBezier(0.4, 0, 0.7, 0.2),     // objects leaving the frame
  glide:  cubicBezier(0.4, 0, 0.1, 1),       // browsing: gentle start, long soft landing
  fall:   cubicBezier(0.55, 0, 1, 0.45),     // gravity: slow start, accelerating into the landing (the Shelves' drop)
};
