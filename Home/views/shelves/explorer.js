// The Shelves' free camera. It always faces the wall: the state is one point on
// the cover plane (x, y) — the world point under the safe rect's centre — and a
// distance d from that plane. Dragging pans 1:1 under the pointer with inertia
// and a rubber band at the bounds; the wheel zooms toward the cursor through a
// critically damped spring; glides (keys, fit, keyboard follow, the focus
// framing) are tweens on the shared clock. In FOCUS the Rack's idle float runs
// at 60%, on the camera only.

import * as THREE from 'three';
import { tween } from '../../motion/tween.js';
import { EASE } from '../../motion/bezier.js';
import { Spring } from '../../motion/spring.js';
import { CAM, BOX, COVER_Z, FLOAT } from './layout.js';

const TAN = Math.tan(THREE.MathUtils.degToRad(CAM.fov / 2));
const d2r = THREE.MathUtils.degToRad;
const PADDED = (() => { const bw = BOX.x1 - BOX.x0, bh = BOX.y1 - BOX.y0; return { x0: BOX.x0 - CAM.pad * bw, x1: BOX.x1 + CAM.pad * bw, y0: BOX.y0 - CAM.pad * bh, y1: BOX.y1 + CAM.pad * bh, cx: (BOX.x0 + BOX.x1) / 2, cy: (BOX.y0 + BOX.y1) / 2 }; })();

export class Explorer {
  constructor({ reduced = false } = {}) {
    this.reduced = reduced;
    this.camera = new THREE.PerspectiveCamera(CAM.fov, 1, 50, 30000);
    this.camera.up.set(0, 1, 0);
    this.scratch = new THREE.PerspectiveCamera(CAM.fov, 1, 50, 30000);
    this.x = (BOX.x0 + BOX.x1) / 2; this.y = (BOX.y0 + BOX.y1) / 2; this.d = 3000;
    this.dTarget = this.d;
    this.dSpring = new Spring(this.d, CAM.zoomSpring); this.dSpring.epsilon = 0.05;
    this.anchor = null;                   // { px, py, wx, wy } — the world point held under the cursor while zooming
    this.drag = null;                     // { px, py, x0, y0, samples: [] }
    this.vx = 0; this.vy = 0;             // inertia, mm/ms
    this.over = { x: 0, y: 0 };           // rubber-band overshoot (mm) being sprung back
    this.glide = null;
    this.floatOn = false; this.floatWeight = new Spring(0, FLOAT.omega);
    this.lastInput = performance.now(); this.t0 = performance.now();
    this.phase = [0.3, 1.7, 2.9, 4.1, 5.3, 0.9];
    this.W = 1; this.H = 1; this.safe = { x0: 0, y0: 0, x1: 1, y1: 1, w: 1, h: 1, cx: 0.5, cy: 0.5 };
    this._v = new THREE.Vector3();
    this._b = { x0: 0, x1: 0, y0: 0, y1: 0 }; this._c = { x: 0, y: 0 }; this._w = { x: 0, y: 0 };   // scratch: no allocation per frame
  }

  // ---------------------------------------------------------------- geometry
  resize(w, h) {
    this.W = w; this.H = h;
    const side = w < 600 ? CAM.safe.sidePhone : CAM.safe.side;
    const s = this.safe;
    s.x0 = side; s.x1 = w - side; s.y0 = CAM.safe.top; s.y1 = h - CAM.safe.bottom;
    s.w = s.x1 - s.x0; s.h = s.y1 - s.y0; s.cx = (s.x0 + s.x1) / 2; s.cy = (s.y0 + s.y1) / 2;
    this.aspect = w / h;
    for (const c of [this.camera, this.scratch]) { c.aspect = this.aspect; c.updateProjectionMatrix(); }
    const boxW = BOX.x1 - BOX.x0, boxH = BOX.y1 - BOX.y0;
    this.dFit = Math.max(boxH / (2 * TAN * (s.h / h)), boxW / (2 * TAN * this.aspect * (s.w / w)));
    this.dMin = 314 / (CAM.minFill * 2 * TAN);
    if (this.dTarget > this.dFit) this.dTarget = this.dFit;
    if (this.d > this.dFit) { this.d = this.dFit; this.dSpring.snap(this.d); }
    const c = this.clamp(this.x, this.y, this.d); this.x = c.x; this.y = c.y;
    this.apply();
  }
  mmPerPx(d = this.d) { return (2 * d * TAN) / this.H; }
  frameH(d = this.d) { return 2 * d * TAN; }
  /** The world point on the cover plane under a screen point, at the base pose. */
  worldAt(px, py, d = this.d, x = this.x, y = this.y, out = this._w) { const m = this.mmPerPx(d); out.x = x + (px - this.safe.cx) * m; out.y = y - (py - this.safe.cy) * m; return out; }
  /** The camera bounds for a distance: the visible rect (the safe rect) stays inside the padded box; a wider axis locks to the centre. */
  bounds(d, out = this._b) {
    const m = this.mmPerPx(d), vw = this.safe.w * m, vh = this.safe.h * m;
    const x0 = PADDED.x0, x1 = PADDED.x1, y0 = PADDED.y0, y1 = PADDED.y1;
    out.x0 = vw >= x1 - x0 ? PADDED.cx : x0 + vw / 2; out.x1 = vw >= x1 - x0 ? PADDED.cx : x1 - vw / 2;
    out.y0 = vh >= y1 - y0 ? PADDED.cy : y0 + vh / 2; out.y1 = vh >= y1 - y0 ? PADDED.cy : y1 - vh / 2;
    return out;
  }
  clamp(x, y, d = this.d, out = this._c) { const b = this.bounds(d); out.x = Math.min(b.x1, Math.max(b.x0, x)); out.y = Math.min(b.y1, Math.max(b.y0, y)); return out; }
  fitPose() { const f = this._fit || (this._fit = { x: PADDED.cx, y: PADDED.cy, d: 0 }); f.d = this.dFit; return f; }
  pose() { return { x: this.x, y: this.y, d: this.d }; }
  get moving() { return !!(this.drag || this.glide || Math.abs(this.vx) + Math.abs(this.vy) > 0 || !this.dSpring.settled || this.over.x || this.over.y); }

  // ---------------------------------------------------------------- input
  input() { this.lastInput = performance.now(); }
  beginDrag(px, py) {
    this.cancelGlide(); this.vx = this.vy = 0; this.input();
    this.drag = { px, py, x0: this.x + this.over.x, y0: this.y + this.over.y, samples: [{ t: performance.now(), px, py }] };
    this.over.x = this.over.y = 0;
  }
  dragTo(px, py) {
    const g = this.drag; if (!g) return;
    this.input();
    const m = this.mmPerPx();
    const rx = g.x0 - (px - g.px) * m, ry = g.y0 + (py - g.py) * m;      // 1:1 under the pointer
    this.place(rx, ry, true);
    const now = performance.now();
    g.samples.push({ t: now, px, py });
    while (g.samples.length > 2 && now - g.samples[0].t > 100) g.samples.shift();
    if (this.anchor) { const w = this.worldAt(this.anchor.px, this.anchor.py); this.anchor.wx = w.x; this.anchor.wy = w.y; }
  }
  endDrag(fling = true) {
    const g = this.drag; if (!g) return;
    this.drag = null;
    if (!fling || this.reduced || g.samples.length < 2) return;
    const a = g.samples[0], b = g.samples[g.samples.length - 1], dt = Math.max(1, b.t - a.t);
    if (performance.now() - b.t > 80) return;                           // the pointer had stopped before letting go: no fling
    let vpx = (b.px - a.px) / dt, vpy = (b.py - a.py) / dt;           // px/ms
    const sp = Math.hypot(vpx, vpy);
    if (sp > CAM.inertiaMax) { vpx *= CAM.inertiaMax / sp; vpy *= CAM.inertiaMax / sp; }
    if (sp < CAM.inertiaStop) return;
    const m = this.mmPerPx();
    this.vx = -vpx * m; this.vy = vpy * m;
    if (this.over.x) this.vx = 0; if (this.over.y) this.vy = 0;        // let go past a bound: it springs back, no fling
  }
  /** Set the base point; `rubber` lets it pass the bounds a little (a drag), otherwise it clamps. */
  place(x, y, rubber = false) {
    const b = this.bounds(this.d), m = this.mmPerPx();
    const band = (v, lo, hi) => {
      if (v < lo) { const o = (v - lo) * CAM.rubber; return [lo, Math.max(o, -CAM.rubberMaxPx * m)]; }
      if (v > hi) { const o = (v - hi) * CAM.rubber; return [hi, Math.min(o, CAM.rubberMaxPx * m)]; }
      return [v, 0];
    };
    if (rubber) { const [cx, ox] = band(x, b.x0, b.x1), [cy, oy] = band(y, b.y0, b.y1); this.x = cx; this.y = cy; this.over.x = ox; this.over.y = oy; }
    else { this.x = Math.min(b.x1, Math.max(b.x0, x)); this.y = Math.min(b.y1, Math.max(b.y0, y)); this.over.x = this.over.y = 0; }
  }
  /** Zoom by a factor (> 1 = closer) toward a screen point; the point stays under the cursor. */
  zoomBy(factor, px = this.safe.cx, py = this.safe.cy) {
    this.cancelGlide(); this.input();
    this.vx = this.vy = 0;
    const d = Math.min(this.dFit, Math.max(this.dMin, this.dTarget / factor));
    if (d === this.dTarget && this.dSpring.settled) return;
    this.dTarget = d;
    // the point held under the cursor: keep the one already held while the cursor stays put, so a
    // run of wheel notches from the overview (where the bounds lock x to the centre at first)
    // ends on the point the first notch started from, not on wherever the lock had let it drift
    const a = this.anchor;
    if (!(a && a.px === px && a.py === py)) { const w = this.worldAt(px, py); this.anchor = { px, py, wx: w.x, wy: w.y }; }   // (the numbers, not the scratch)
    if (this.reduced) { this.d = d; this.dSpring.snap(d); this.holdAnchor(); this.anchor = null; }
    else this.dSpring.set(d);
  }
  holdAnchor() {
    const a = this.anchor; if (!a) return;
    const m = this.mmPerPx();
    this.place(a.wx - (a.px - this.safe.cx) * m, a.wy + (a.py - this.safe.cy) * m, !!this.drag);
  }
  /** Ease to a pose over `ms`; resolves when there. */
  glideTo({ x, y, d }, ms, ease = EASE.glide, free = false) {
    this.cancelGlide(); this.vx = this.vy = 0; this.anchor = null; this.over.x = this.over.y = 0;
    if (!free) d = Math.min(this.dFit, Math.max(this.dMin, d));
    const c = free ? { x, y } : { ...this.clamp(x, y, d) };
    if (this.reduced || ms <= 0) { this.x = c.x; this.y = c.y; this.d = d; this.dTarget = d; this.dSpring.snap(d); this.apply(); return Promise.resolve(); }
    const from = [this.x, this.y, this.d], to = [c.x, c.y, d], job = { cancel: false };
    this.glide = job; this.dTarget = d;
    return tween({ from, to, duration: ms, ease, onUpdate: (v) => {
      if (job.cancel) return;
      this.d = v[2]; this.dSpring.snap(this.d);
      const cc = free ? { x: v[0], y: v[1] } : this.clamp(v[0], v[1], this.d); this.x = cc.x; this.y = cc.y;
      this.apply();
    } }).then(() => { if (this.glide === job) this.glide = null; });
  }
  cancelGlide() { if (this.glide) { this.glide.cancel = true; this.glide = null; } }
  fit(ms) { return this.glideTo(this.fitPose(), ms); }
  /** Glide so that a world rect (x0..x1, y0..y1 on the cover plane) is fully inside the safe rect at the current distance. */
  bringIn(r, ms) {
    const m = this.mmPerPx(), vw = this.safe.w * m, vh = this.safe.h * m, pad = 24 * m;
    let x = this.x, y = this.y;
    if (r.x0 - pad < x - vw / 2) x = r.x0 - pad + vw / 2; else if (r.x1 + pad > x + vw / 2) x = r.x1 + pad - vw / 2;
    if (r.y0 - pad < y - vh / 2) y = r.y0 - pad + vh / 2; else if (r.y1 + pad > y + vh / 2) y = r.y1 + pad - vh / 2;
    if (x === this.x && y === this.y) return Promise.resolve();
    return this.glideTo({ x, y, d: this.d }, ms);
  }
  /** Fraction of a world rect that is on screen (inside the safe rect). */
  onScreen(r) {
    const m = this.mmPerPx(), vw = this.safe.w * m, vh = this.safe.h * m;
    const ix = Math.max(0, Math.min(r.x1, this.x + vw / 2) - Math.max(r.x0, this.x - vw / 2));
    const iy = Math.max(0, Math.min(r.y1, this.y + vh / 2) - Math.max(r.y0, this.y - vh / 2));
    return (ix * iy) / ((r.x1 - r.x0) * (r.y1 - r.y0));
  }
  allowFloat(on) { this.floatOn = on && !this.reduced; if (!this.floatOn) this.floatWeight.set(0); }

  // ---------------------------------------------------------------- per frame
  /** Advance inertia, the zoom spring and the rubber band; returns true while anything still moves. */
  frame(dt, now) {
    let moving = !!this.drag;
    // the zoom spring, carrying the point under the cursor with it
    if (!this.dSpring.settled) { this.d = this.dSpring.x; this.holdAnchor(); moving = true; }
    else if (this.anchor) { this.d = this.dSpring.x; this.holdAnchor(); this.anchor = null; }
    // inertia
    if (!this.drag && (this.vx || this.vy)) {
      const k = Math.exp(-(dt * 1000) / CAM.inertiaTau);
      const b = this.bounds(this.d);
      let x = this.x + this.vx * dt * 1000, y = this.y + this.vy * dt * 1000;
      this.vx *= k; this.vy *= k;
      // past a bound: stop there (the rubber band takes a little of the overshoot)
      const m = this.mmPerPx();
      if (x < b.x0 || x > b.x1) { const lim = x < b.x0 ? b.x0 : b.x1; this.over.x = Math.max(-CAM.rubberMaxPx * m, Math.min(CAM.rubberMaxPx * m, (x - lim) * CAM.rubber)); x = lim; this.vx = 0; }
      if (y < b.y0 || y > b.y1) { const lim = y < b.y0 ? b.y0 : b.y1; this.over.y = Math.max(-CAM.rubberMaxPx * m, Math.min(CAM.rubberMaxPx * m, (y - lim) * CAM.rubber)); y = lim; this.vy = 0; }
      this.x = x; this.y = y;
      const stop = CAM.inertiaStop * m;
      if (Math.abs(this.vx) < stop) this.vx = 0; if (Math.abs(this.vy) < stop) this.vy = 0;
      moving = true;
    }
    // the rubber band springs back once the pointer has let go
    if (!this.drag && (this.over.x || this.over.y)) {
      const k = Math.exp(-CAM.rubberSpring * dt);
      this.over.x *= k; this.over.y *= k;
      if (Math.abs(this.over.x) < 0.05) this.over.x = 0; if (Math.abs(this.over.y) < 0.05) this.over.y = 0;
      moving = true;
    }
    if (this.glide) moving = true;
    // the focus float
    if (this.floatOn) this.floatWeight.set(now - this.lastInput > FLOAT.idleAfter ? 1 : 0);
    this.floatWeight.omega = this.floatWeight.target === 0 ? FLOAT.omegaDrop : FLOAT.omega;
    this.apply(now);
    return moving;
  }

  /** Where the camera's own centre is (the safe rect's centre is the state point). */
  centre(d = this.d, x = this.x + this.over.x, y = this.y + this.over.y, out = this._c) {
    const m = this.mmPerPx(d);
    out.x = x - (this.safe.cx - this.W / 2) * m; out.y = y + (this.safe.cy - this.H / 2) * m;
    return out;
  }
  apply(now = performance.now()) {
    const c = this.camera, p = this.centre(), w = this.floatWeight.x;
    c.position.set(p.x, p.y, COVER_Z + this.d);
    c.rotation.set(0, 0, 0);
    if (w > 0.0005) {
      const t = (now - this.t0) / 1000, ph = this.phase, [P1, P2] = FLOAT.periods, A = FLOAT.amp, k = FLOAT.scale;
      const f = (i) => (Math.sin((2 * Math.PI * t) / P1 + ph[i]) + 0.5 * Math.sin((2 * Math.PI * t) / P2 + ph[i] * 1.7)) / 1.5;
      c.position.x += A.x * f(0) * w * k; c.position.y += A.y * f(1) * w * k; c.position.z += A.z * f(2) * w * k;
      c.rotateY(d2r(A.yaw) * f(3) * w * k); c.rotateX(d2r(A.pitch) * f(4) * w * k); c.rotateZ(d2r(A.roll) * f(5) * w * k);
    }
    c.updateMatrixWorld();
  }
  /** Project world points to CSS px from a base pose (no float). */
  projectFrom(pose, pts, out = []) {
    const c = this.scratch, p = this.centre(pose.d, pose.x, pose.y);
    c.position.set(p.x, p.y, COVER_Z + pose.d); c.rotation.set(0, 0, 0); c.updateMatrixWorld();
    out.length = 0;
    for (const v of pts) { this._v.copy(v).project(c); out.push({ x: ((this._v.x + 1) / 2) * this.W, y: ((1 - this._v.y) / 2) * this.H }); }
    return out;
  }
  project(pts, out) { return this.projectFrom(this.pose(), pts, out); }
  /** Project with the live camera (the float included). */
  projectLive(pts, out = []) {
    out.length = 0;
    for (const v of pts) { this._v.copy(v).project(this.camera); out.push({ x: ((this._v.x + 1) / 2) * this.W, y: ((1 - this._v.y) / 2) * this.H }); }
    return out;
  }
}
