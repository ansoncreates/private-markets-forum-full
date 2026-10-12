// The turntable's part of the choreography, shared by both views:
//   cue  — S8–S11: cue lever, arm lift, swing to the lead-in groove, lower, READY
//   play — P1–P6: Play key, spin-up to 33⅓, drift, navy hand-over, navigate
//   uncue — S10–S8 reversed, for an eject
// Timings, curves and sounds are the Table view's (HOMEPAGE-VINYL-BRIEF §6).

import { TURNTABLE as T } from '../../scene/layout.js';
import { EASE } from '../../motion/bezier.js';

export const RPM33 = 33.333 / 60 * Math.PI * 2;        // 3.49 rad/s

/**
 * Add S8–S11 to a sequence, starting at `t0` ms.
 * ctx: { turntable, audio, dirty, prefetch(), onReady() }
 */
export function addCue(s, t0, ctx) {
  const { turntable: tt, audio, dirty } = ctx;
  s.call(t0, () => audio.play('tonearm-lift'));
  s.at(t0, t0 + 240, { from: T.tonearm.restY, to: T.tonearm.liftY, ease: EASE.ui, onUpdate: (v, p) => { tt.setArmY(v); tt.setCueLever(EASE.ui(p)); dirty(); } });
  s.call(t0 + 240, () => audio.play('tonearm-swing', { duration: 0.9 }));
  s.at(t0 + 240, t0 + 1040, { from: 0, to: tt.cueAngle, ease: EASE.mech, onUpdate: (v) => { tt.setArmAngle(v); dirty(); } });
  s.call(t0 + 1040, () => ctx.prefetch && ctx.prefetch());
  s.call(t0 + 1300, () => audio.play('needle-drop'));
  s.at(t0 + 1040, t0 + 1400, { from: T.tonearm.liftY, to: T.tonearm.playY, ease: EASE.reveal, onUpdate: (v) => { tt.setArmY(v); dirty(); } });
  s.call(t0 + 1350, () => ctx.onReady && ctx.onReady());
  return t0 + 1630;
}

/**
 * Add S10–S8 reversed (× k) to a sequence from wherever the arm is, starting at t0.
 * Returns the end time. ctx: { turntable, audio, dirty }
 */
export function addUncue(s, t0, ctx, k = 0.75) {
  const { turntable: tt, audio, dirty } = ctx;
  const lazy = (get, apply) => { let a = null; return (v, p) => { if (a === null) a = get(); apply(a, v, p); }; };
  const L = (a, b, v) => a + (b - a) * v;
  let t = t0;
  const armMoved = tt.armAngle > 0.01 || Math.abs(tt.armY - T.tonearm.restY) > 0.01;
  if (!armMoved) return t;
  s.call(t, () => audio.play('tonearm-lift'));
  s.at(t, t += 360 * k, { from: 0, to: 1, ease: EASE.reveal.mirror(), onUpdate: lazy(() => tt.armY, (a, v) => { tt.setArmY(L(a, T.tonearm.liftY, v)); dirty(); }) });
  s.call(t, () => audio.play('tonearm-swing', { duration: 0.8 * k }));
  s.at(t, t += 800 * k, { from: 0, to: 1, ease: EASE.mech.mirror(), onUpdate: lazy(() => tt.armAngle, (a, v) => { tt.setArmAngle(L(a, 0, v)); dirty(); }) });
  s.at(t, t += 240 * k, { from: 0, to: 1, ease: EASE.ui.mirror(), onUpdate: lazy(() => tt.armY, (a, v, p) => { tt.setArmY(L(a, T.tonearm.restY, v)); tt.setCueLever(1 - EASE.ui(p)); dirty(); }) });
  return t;
}

/**
 * Add P1–P6 to a sequence from t0.
 * ctx: { turntable, audio, stage, dirty, setOmega(ω), onLeaving(), navigate() }
 */
export function addPlay(s, t0, ctx) {
  const { turntable: tt, audio, stage, dirty } = ctx;
  s.at(t0, t0 + 90, { from: 0, to: 1, ease: EASE.ui, onUpdate: (v) => { tt.setKeyPress('play', v); dirty(); } });
  s.at(t0 + 90, t0 + 270, { from: 1, to: 0, ease: EASE.open, onUpdate: (v) => { tt.setKeyPress('play', v); dirty(); } });
  s.call(t0 + 100, () => { audio.spinStart({ fadeIn: 0.9 }); stage.hold('spin'); });
  s.at(t0 + 100, t0 + 1000, { from: 0, to: RPM33, ease: EASE.ui, onUpdate: (v) => ctx.setOmega(v) });
  s.at(t0 + 1000, t0 + 2900, { from: tt.cueAngle, to: tt.cueAngle + T.tonearm.driftDeg, ease: EASE.ui, onUpdate: (v) => tt.setArmAngle(v) });
  s.call(t0 + 2300, () => ctx.onLeaving());
  s.call(t0 + 2950, () => ctx.navigate());
  return t0 + 2950;
}
