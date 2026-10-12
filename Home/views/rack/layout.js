// The Rack view's room, in millimetres. y is up from the floor (y 0); the wall
// is the plane z = 0 facing +z; x runs along the ledge to the right.
// Jacket i sits at x = i · PITCH. (RACK-VIEW-BRIEF §3)

import { JACKET } from '../../scene/layout.js';

export const PITCH = 700;
export { LEDGE, WALL, LEAN_DEG, JACKET_REST } from '../shared/wallLayout.js';
export const CONSOLE = { width: 1400, depth: 450, top: 640, edge: 6, toe: 60 };
export const PLATTER_WORLD_Y = CONSOLE.top + 78;     // the mat's top (record rests here)

export function consoleCentreX(n) { return ((n - 1) * PITCH) / 2; }

/** Open-spread: the jacket shifts right by half its width so the spine lands on its centre line. */
export const OPEN = { lift: 30, forward: 80, shift: JACKET.size / 2, angleDeg: -170 };
/** The record's way out of the pocket: straight up until its lower edge clears the flap, then toward the camera. */
export const POCKET = { breath: 6, rise: 125, out: 70, revealDeg: -8 };
/** The picture light keeps one offset from whatever it lights, so the light level never changes as it travels. */
export const SPOT_OFFSET = { x: -300, y: 845, z: 874 };

export const CAM = {
  fov: 32,
  fillClose: 0.60, fillMax: 0.78, neighbourMargin: 40, gutterPx: 82, above: 40,
  floatPortrait: 0.45,         // the float's sideways sway in portrait (the edge keys sit 24 px from the jacket)
  raise: 0.08,                 // the jacket's centre sits this much of the frame height above the middle (room for the title row)
  fillOpenW: 0.70, fillOpenH: 0.52, raiseOpen: 0.09,
  turntableElevDeg: 52, plinthFill: 0.64, plinthFillPortrait: 0.78,
  promptGap: 16,               // px between the turntable's lowest projected edge and the prompt; the pair is centred as one block
  bump: 0.05, lead: 0.02, glide: 1150,     // browse: one jacket per glide, ms
};

export const FLOAT = {
  idleAfter: 1200, stopAfter: 120000, easeIn: 1.6, omega: 1.5, omegaDrop: 5,
  amp: { x: 13, y: 8, z: 10, yaw: 0.5, pitch: 0.38, roll: 0.18 },
  periods: [7.6, 11.9],
  parallax: { x: 24, y: 14, omega: 2.6 },
};
