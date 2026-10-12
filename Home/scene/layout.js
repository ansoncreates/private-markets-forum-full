// Every dimension on the page, in millimetres. 1 world unit = 1 mm.
// y is up (toward the camera), x is screen-right, z is screen-down.
// Origin = spindle centre on the console top (y 0).

export const TURNTABLE = {
  plinth: { x0: -220, x1: 300, z0: -215, z1: 185, top: 60, height: 50, radius: 14, feet: 10 },
  wellR: 171, wellDepth: 4,
  platterR: 165, platterTop: 76, platterThick: 20, platterChamfer: 3,
  strobe: { r0: 154, r1: 165, rows: [180, 183, 216, 217] },
  matR: 148, matTop: 78,
  spindleR: 3.6, spindleTop: 90,
  recordR: 150, recordThick: 1.8, recordTop: 80, labelR: 50, holeR: 3.62, leadInR: 146,
  tonearm: {
    pivot: { x: 200, z: -186 }, length: 245, restY: 92, liftY: 104, playY: 86,
    stylusDrop: 6, counterweightX: 270, headshellOffsetDeg: 22, driftDeg: 0.6,
  },
  keys: { x0: -195, z0: 151, w: 28, d: 18, gap: 8, radius: 4, height: 6, travel: 2.5, names: ['play', 'pause', 'stop'] },
};

export const JACKET = { size: 314, thick: 3.5, radius: 1.5, baseY: 8 };
// One jacket on the console at a time — no fan, nothing stacked.

export const LAYOUTS = {
  landscape: {
    console: { x0: -290, x1: 860, z0: -290, z1: 310, height: 450, edge: 6 },
    activeSlot: { x: 580, z: 0 },
    openSide: 'left',           // the sleeve opens toward the turntable
    slideDir: [-1, 0],          // record leaves the sleeve to −x …
    slideOut: 317,              // … by 317 mm, until it clears the open edge by 10 mm
    bow: [0, 40],               // transfer arc bows toward +z, away from the tonearm
    jacketExit: 'top',          // the jacket departs toward screen-top
    framing: { x0: -290, x1: 860, z0: -290, z1: 310 },
  },
  portrait: {
    console: { x0: -340, x1: 340, z0: -290, z1: 840, height: 450, edge: 6 },   // room below the jacket for its title row
    activeSlot: { x: 0, z: 405 },
    openSide: 'top',            // turntable is above: the sleeve opens upward
    slideDir: [0, -1],          // record leaves the sleeve toward −z (centre 405 → 88)
    slideOut: 317,
    bow: [-40, 0],
    jacketExit: 'right',        // never over the turntable
    framing: { x0: -340, x1: 340, z0: -290, z1: 840 },
  },
};

export const CAMERA = { fov: 20, margin: 0.05 };
export const CARPET_Y = -450;

// Key light direction (toward the light) — screen top-left, shadows fall bottom-right.
export const LIGHT_DIR = [-0.45, 1, -0.55];
