// The wall room's shared numbers, in millimetres — what the Rack and the Shelves
// have in common: the ledge section, the jacket's rest pose on it, the wall.
// y is up from the floor (y 0); the wall is the plane z = 0 facing +z.

import { JACKET } from '../../scene/layout.js';

/** The ledge section. `top` is the Rack's one shelf; the Shelves pass their own tops. */
export const LEDGE = { top: 1400, depth: 70, thick: 32, lipH: 20, lipD: 10, overhang: 300 };
export const WALL = { height: 2800, margin: 1200, tile: 1200 };

/**
 * The jacket's footprint between the wall and the ledge lip: its back face (z −1.3
 * in the jacket's frame) and its front face (z +6.6) are 7.9 mm apart. Solve the lean
 * so the top back edge sits 0.5 mm off the wall and the bottom front edge 1 mm behind
 * the lip (z 60): S·sin l + 7.9·cos l = 58.5 → l ≈ 9.3°. Nothing touches anything.
 */
export const BACK_FACE = -1.3, FRONT_FACE = 6.6, WALL_GAP = 0.5, LIP_GAP = 1;
const LIP_Z = LEDGE.depth - LEDGE.lipD;
export const LEAN_DEG = (() => {
  const span = LIP_Z - LIP_GAP - WALL_GAP, th = FRONT_FACE - BACK_FACE;
  let l = 0.16;
  for (let k = 0; k < 20; k++) { const f = JACKET.size * Math.sin(l) + th * Math.cos(l) - span; l -= f / (JACKET.size * Math.cos(l) - th * Math.sin(l)); }
  return (l * 180) / Math.PI;
})();
const _l = (LEAN_DEG * Math.PI) / 180;
/** The rest pose's offsets from a ledge top: add `top` to `dy` for the jacket's centre y. */
export const REST = {
  // the back-bottom edge is the lowest point: it rests 0.1 mm above the ledge top
  dy: 0.1 + (JACKET.size / 2) * Math.cos(_l) - BACK_FACE * Math.sin(_l),
  // the back-top edge is the deepest point: 0.5 mm off the wall
  z: WALL_GAP + (JACKET.size / 2) * Math.sin(_l) - BACK_FACE * Math.cos(_l),
};
/** The Rack's rest pose on its one ledge. */
export const JACKET_REST = { y: LEDGE.top + REST.dy, z: REST.z };
