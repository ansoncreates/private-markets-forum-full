// Critically damped springs for pointer-driven motion (the jacket tilt,
// the camera parallax). A spring is never linear: it decelerates into its
// target with no overshoot. Stepped by the stage loop while unsettled.

const springs = new Set();
let listeners = new Set();

export function onSpringWoken(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function hasActiveSprings() {
  for (const s of springs) if (!s.settled) return true;
  return false;
}

export class Spring {
  constructor(value = 0, omega = 12) {
    this.x = value; this.v = 0; this.target = value;
    this.omega = omega;           // rad/s — critically damped: zeta = 1
    this.settled = true;
    this.epsilon = 1e-3;
    springs.add(this);
  }
  set(target) {
    if (target === this.target) return;
    this.target = target;
    if (this.settled) { this.settled = false; listeners.forEach((fn) => fn()); }
  }
  snap(value) { this.x = value; this.target = value; this.v = 0; this.settled = true; }
  step(dt) {
    if (this.settled) return;
    dt = Math.min(dt, 1 / 30);
    const w = this.omega;
    // semi-implicit Euler on x'' = -2ωx' - ω²(x - target)
    this.v += (-2 * w * this.v - w * w * (this.x - this.target)) * dt;
    this.x += this.v * dt;
    if (Math.abs(this.v) < this.epsilon && Math.abs(this.x - this.target) < this.epsilon) {
      this.x = this.target; this.v = 0; this.settled = true;
    }
  }
  dispose() { springs.delete(this); }
}

export function stepSprings(dt) {
  let any = false;
  for (const s of springs) { s.step(dt); if (!s.settled) any = true; }
  return any;
}
