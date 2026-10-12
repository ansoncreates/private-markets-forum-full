// The Shelves view's numbers, in millimetres (SHELVES-VIEW-BRIEF §3–§5).
// y is up from the floor (y 0); the wall is the plane z = 0 facing +z; the
// middle column is at x = 0.

import { JACKET } from '../../scene/layout.js';
import { LEDGE, LEAN_DEG, REST } from '../shared/wallLayout.js';

export { LEDGE, LEAN_DEG, REST };

export const COLS = 5, ROWS = 3;
export const PITCH_X = 420;
/** Row 0 is the top shelf, row 1 the middle (the Rack's height), row 2 the bottom. */
export const SHELF_TOPS = [1860, 1400, 940];
export const colX = (c) => (c - (COLS - 1) / 2) * PITCH_X;
export const LEDGE_X = { x0: -(2 * PITCH_X + JACKET.size / 2 + LEDGE.overhang), x1: 2 * PITCH_X + JACKET.size / 2 + LEDGE.overhang };   // ±1297
export const WALL_X = { x0: -2500, x1: 2500 };
export const WALL_H = 3200;

/** The cover plane the camera looks at and pans on (the closed jacket's face at rest, ≈ z 31). */
export const COVER_Z = 31;
const lean = (LEAN_DEG * Math.PI) / 180;
const jacketTop = (top) => top + REST.dy + (JACKET.size / 2) * Math.cos(lean) + 6.6 * Math.sin(lean);
/** Camera bounds: the fifteen jackets with a little air (§3.1). */
export const BOX = {
  x0: colX(0) - JACKET.size / 2 - 80, x1: colX(COLS - 1) + JACKET.size / 2 + 80,      // ±1077
  y0: SHELF_TOPS[2] - LEDGE.thick - 40, y1: jacketTop(SHELF_TOPS[0]) + 60,            // 868 → ≈ 2231
};

export const CAM = {
  fov: 32,
  pad: 0.06,                     // the visible rect may pass the box by this fraction of the box
  minFill: 0.72,                 // closest: one jacket fills 72% of the frame height
  focusFill: 0.50, focusMaxW: 0.78, focusRaise: 0.10, focusBlockGap: 24,
  safe: { top: 72, bottom: 88, side: 24, sidePhone: 16 },
  zoomSpring: 14, keyStep: 1.6, dblStep: 2, wheelK: 0.0016, pinchK: 0.012,
  inertiaTau: 250, inertiaMax: 2.5, inertiaStop: 0.02,     // a fling at the cap rests in ≈ 1.2 s
  rubber: 0.35, rubberMaxPx: 48, rubberSpring: 12,
  panStep: 0.15,
};

/** The raised jacket (§5): clear of the lip first, then toward the camera. */
export const FOCUS = { liftClear: 30, lift: 70, forward: 160 };

export const T = {
  // rise
  tipUp: [0, 260], liftClear: [200, 480], forward: [420, 1000], camera: [150, 1100], dim: [250, 900], block: [850, 1130],
  // drop
  blockOut: [0, 200], cameraBack: [0, 900], undim: [100, 600], back: [0, 520], fall: [520, 720], tipBack: [720, 980], settle1: [980, 1070], settle2: [1070, 1180],
  // go
  goFade: [80, 600], goCam: [0, 600], navigate: 600,
  glide: { dbl: 600, key: 450, fit: 700, follow: 600, pan: 300 },
  dimTo: 0.4,
};

/** The focus float: the Rack's, at 60%. */
export const FLOAT = {
  idleAfter: 1200, omega: 1.5, omegaDrop: 5, scale: 0.6,
  amp: { x: 13, y: 8, z: 10, yaw: 0.5, pitch: 0.38, roll: 0.18 },
  periods: [7.6, 11.9],
};

/**
 * Lights (§3.3). No wash spots: a point light's mirror image in a glossy cover is a
 * hot blob wherever the camera happens to be, and with the camera free that is
 * somewhere on some cover at every zoom. The shelves are lit evenly by the
 * hemisphere, the bounce and the env map (the covers are .32 self-lit too);
 * the one spot is the focus light, on the raised jacket only.
 */
export const LIGHT = {
  focus: { color: 0xffe6cc, intensity: 5.5e6, angleDeg: 22, penumbra: 0.8, decay: 2, offset: { x: -300, y: 845, z: 874 } },
  hemi: 0.75, ambient: 0.45,
  // one warm directional from high in front: the wall and the ledge tops read, and its mirror image
  // in a cover points 40° below level, where the wall-facing camera never is — no hot spot
  key: { color: 0xffe6cc, intensity: 1.3, dir: [0.25, 0.87, 0.45] },
};
