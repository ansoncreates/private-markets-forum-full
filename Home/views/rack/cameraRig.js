// The Rack view's camera: a base pose (position + look-at target, eased by
// tweens) with the idle float and the pointer parallax added on top each frame.
// Every move goes through here; nothing else touches the camera.

import * as THREE from 'three';
import { tween } from '../../motion/tween.js';
import { EASE } from '../../motion/bezier.js';
import { Spring } from '../../motion/spring.js';
import { CAM, FLOAT } from './layout.js';

const TAN_HALF = Math.tan(THREE.MathUtils.degToRad(CAM.fov / 2));
const d2r = THREE.MathUtils.degToRad;

export class CameraRig {
  constructor(stage, { reduced = false, hover = true } = {}) {
    this.stage = stage;
    this.reduced = reduced; this.hover = hover;
    this.camera = new THREE.PerspectiveCamera(CAM.fov, 1, 50, 20000);
    this.camera.up.set(0, 1, 0);
    this.pos = new THREE.Vector3(0, 1595, 950);
    this.target = new THREE.Vector3(0, 1555, 26);
    this.floatWeight = new Spring(0, FLOAT.omega);
    this.par = { x: new Spring(0, FLOAT.parallax.omega), y: new Spring(0, FLOAT.parallax.omega) };
    this.floatOn = false;                  // state allows floating
    this.lastInput = performance.now();
    this.stopped = false;                  // 120 s idle: loop released
    this.t0 = performance.now();
    this.phase = [0.3, 1.7, 2.9, 4.1, 5.3, 0.9];
    this.moving = null;
    this.held = false;
    this._v = new THREE.Vector3();
    this.scratch = new THREE.PerspectiveCamera(CAM.fov, 1, 50, 20000);   // the base pose, for projections without the float
    this._p = new THREE.Vector3();
  }

  resize(w, h) { this.aspect = w / h; this.width = w; this.height = h; this.camera.aspect = this.aspect; this.camera.updateProjectionMatrix(); }

  /** Distance for the close-up of one jacket (RACK-VIEW-BRIEF §4.1). */
  closeDistance(pitch, size) {
    const a = this.aspect || 1.6, t = TAN_HALF;
    const dFill = size / (CAM.fillClose * 2 * t);
    const dNeighbour = (pitch - size / 2 - CAM.neighbourMargin) / (t * a);
    let d = Math.max(Math.min(dFill, dNeighbour), size / (CAM.fillMax * 2 * t));
    if (a < 1 && this.width) {
      const f = (this.width - 2 * CAM.gutterPx) / this.width;
      d = Math.max(d, size / (f * 2 * t * a));
    }
    return d;
  }
  /** Distance for the open spread (width w, height h): ≤ 70% of the width, ≤ 58% of the height. */
  openDistance(w, h) {
    const a = this.aspect || 1.6, t = TAN_HALF;
    return Math.max(w / (CAM.fillOpenW * 2 * t * a), h / (CAM.fillOpenH * 2 * t));
  }
  /** Visible frame height (mm) at distance d. */
  frameHeight(d) { return 2 * d * TAN_HALF; }
  /** Distance at which a width w (mm) fills `fill` of the frame width. */
  widthDistance(w, fill) { return w / (fill * 2 * TAN_HALF * (this.aspect || 1.6)); }

  /** Project world points (mm) to CSS px as seen from the pose (pos, target) — the float and parallax excluded. */
  projectFrom(pos, target, pts, out = []) {
    const c = this.scratch;
    if (c.aspect !== this.camera.aspect) { c.aspect = this.camera.aspect; c.updateProjectionMatrix(); }
    c.position.copy(pos); c.up.set(0, 1, 0); c.lookAt(target); c.updateMatrixWorld();
    out.length = 0;
    for (const v of pts) {
      this._p.copy(v).project(c);
      out.push({ x: ((this._p.x + 1) / 2) * this.width, y: ((1 - this._p.y) / 2) * this.height });
    }
    return out;
  }
  /** Screen rect (CSS px) of world points from a pose. */
  rectFrom(pos, target, pts) {
    const ps = this.projectFrom(pos, target, pts);
    return { left: Math.min(...ps.map((p) => p.x)), right: Math.max(...ps.map((p) => p.x)), top: Math.min(...ps.map((p) => p.y)), bottom: Math.max(...ps.map((p) => p.y)) };
  }
  /** How far (px) a world point is carried on screen by the float and parallax right now. */
  liveDelta(world, out = { x: 0, y: 0 }) {
    const base = this.projectFrom(this.pos, this.target, [world])[0];
    this._p.copy(world).project(this.camera);
    out.x = ((this._p.x + 1) / 2) * this.width - base.x;
    out.y = ((1 - this._p.y) / 2) * this.height - base.y;
    return out;
  }

  /** Snap the base pose. */
  set(pos, target) { this.pos.copy(pos); this.target.copy(target); this.apply(); }

  /**
   * Ease the base pose to (pos, target). Position and target are eased separately;
   * `bulge` bends the position path along a quadratic Bézier; `bump` dollies in/out
   * through the move by sin(πu)·bump along the view axis.
   */
  moveTo(pos, target, { duration = 950, easePos = EASE.glide, easeTarget = EASE.glide, bulge = null, bump = 0, lead = 0 } = {}) {
    if (this.moving) { this.moving.cancel = true; }
    const p0 = this.pos.clone(), t0 = this.target.clone(), p1 = pos.clone(), t1 = target.clone();
    const ctrl = bulge ? p0.clone().add(p1).multiplyScalar(0.5).add(bulge) : null;
    const job = { cancel: false };
    this.moving = job;
    const self = this;
    return tween({ from: 0, to: 1, duration, ease: easePos, onUpdate: (u, p) => {
      if (job.cancel) return;
      if (ctrl) {
        self.pos.set(
          (1 - u) * (1 - u) * p0.x + 2 * (1 - u) * u * ctrl.x + u * u * p1.x,
          (1 - u) * (1 - u) * p0.y + 2 * (1 - u) * u * ctrl.y + u * u * p1.y,
          (1 - u) * (1 - u) * p0.z + 2 * (1 - u) * u * ctrl.z + u * u * p1.z);
      } else self.pos.lerpVectors(p0, p1, u);
      const ut = Math.min(1, easeTarget(Math.min(1, p * (1 + lead))));
      self.target.lerpVectors(t0, t1, ut);
      if (bump) {
        const axis = self._v.subVectors(self.pos, self.target).normalize();
        self.pos.addScaledVector(axis, Math.sin(Math.PI * u) * bump);
      }
      self.apply();
    } }).then(() => { if (self.moving === job) self.moving = null; });
  }

  /** Any input: cancels the float for 1.2 s and wakes the loop if it had stopped. */
  input() {
    this.lastInput = performance.now();
    if (this.stopped) { this.stopped = false; this.resumeHold(); }
  }
  /** Whether the state allows the idle float at all. */
  allowFloat(on) {
    this.floatOn = on && !this.reduced;
    if (this.floatOn) this.resumeHold(); else { this.floatWeight.set(0); }
  }
  resumeHold() { if (!this.held) { this.held = true; this.stage.hold('float'); } }
  releaseHold() { if (this.held) { this.held = false; this.stage.release('float'); } }
  setParallax(nx, ny) {
    if (!this.hover || this.reduced) return;
    this.par.x.set(nx * FLOAT.parallax.x); this.par.y.set(-ny * FLOAT.parallax.y);
  }

  /** Per frame: settle the float weight, release the loop after 120 s idle, place the camera. */
  frame(dt, now) {
    const idle = now - this.lastInput;
    if (this.floatOn) {
      if (idle > FLOAT.stopAfter) { this.floatWeight.set(0); if (this.floatWeight.settled && this.floatWeight.x === 0 && !this.stopped) { this.stopped = true; this.releaseHold(); } }
      else this.floatWeight.set(idle > FLOAT.idleAfter ? 1 : 0);
    }
    // ease in slowly, but get out of the way quickly when the visitor acts
    this.floatWeight.omega = this.floatWeight.target === 0 ? FLOAT.omegaDrop : FLOAT.omega;
    this.apply(now);
  }

  apply(now = performance.now()) {
    const c = this.camera, w = this.floatWeight.x;
    c.position.copy(this.pos);
    if (w > 0.0005) {
      const t = (now - this.t0) / 1000, ph = this.phase, [P1, P2] = FLOAT.periods, A = FLOAT.amp;
      const f = (k) => (Math.sin((2 * Math.PI * t) / P1 + ph[k]) + 0.5 * Math.sin((2 * Math.PI * t) / P2 + ph[k] * 1.7)) / 1.5;
      const side = this.aspect < 1 ? CAM.floatPortrait : 1;     // less sideways sway on a phone: the edge keys are close
      c.position.x += A.x * f(0) * w * side; c.position.y += A.y * f(1) * w; c.position.z += A.z * f(2) * w;
      c.position.x += this.par.x.x; c.position.y += this.par.y.x;
      c.lookAt(this.target);
      c.rotateY(d2r(A.yaw) * f(3) * w * side); c.rotateX(d2r(A.pitch) * f(4) * w); c.rotateZ(d2r(A.roll) * f(5) * w);
    } else {
      c.position.x += this.par.x.x; c.position.y += this.par.y.x;
      c.lookAt(this.target);
    }
  }
  floatInfo() { return `${this.floatOn ? 'on' : 'off'} w=${this.floatWeight.x.toFixed(2)}${this.stopped ? ' stopped' : ''}`; }
}
