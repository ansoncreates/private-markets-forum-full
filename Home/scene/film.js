// The shrink-wrap film over every jacket (GLOSS-FILM-BRIEF.md): the two maps it
// is drawn with, the two rooms it reflects, and the materials that wear it.
//
// The film is three.js's clearcoat. Its normal map is the wrinkle field of a tight
// shrink-wrap — fans of fine ridges at the corners, short ripples along the edges,
// two faint stress creases, a little shrink undulation — and its roughness map is
// the film's haze, rougher along the folds. Both are drawn once at boot, in
// millimetres over the 314 mm face, and shared by every cover in every view: the
// covers differ only in their print, which lies flat and sharp beneath.

import * as THREE from 'three';
import { JACKET } from './layout.js';
import { studioScene } from './environment.js';

const S = JACKET.size;                      // 314 mm

/** The numbers (brief §3–§7). Heights in mm, positions in mm from the print's top-left. */
export const FILM = {
  size: 1024, hazeSize: 512,
  lockup: { x0: 24, x1: 144, y0: 24, y1: 62, damp: 0.3, feather: 10 },   // the lockup with 10 mm of air: wrinkles at 30 % inside
  undulation: [[3, 0.035], [6, 0.012]],                                  // [cells, amplitude mm]
  fan: { count: [5, 8], spread: 36, start: [2, 6], length: [45, 110], sigma: [1.2, 2.4], height: [0.03, 0.06], decay: [0.3, 0.55], wobble: [1.5, 3.5] },
  edge: { band: 22, spacing: [5, 18], sigma: [0.9, 1.7], height: [0.015, 0.04], length: [0.45, 1], tilt: 0.35, weak: 0.6 },   // top + right at full height; left + bottom at 60 %
  crease: { count: 2, angle: [20, 70], sigma: 0.9, height: 0.012, wobble: 2.5 },
  grain: [100, 0],                                 // no micro-grain: value noise shows its lattice as a blocky dither in the highlight; the haze map does this job
  maxSlope: 0.35,
  haze: { base: 0.05, noise: [[4, 0.015], [9, 0.008]], ridge: 0.05, band: 0.02, min: 0.04, max: 0.14 },
  // the cover material
  envIntensity: 0.8, emissive: 0.32,
  specular: 0.3,                 // the paper under the film: matte-ish — the gloss is the film's, not a lacquer sheen on the print
  // thin-film rainbow: off. At 0.12 it changed no pixel by more than 7/255 and cost a fifth of the Rack's frame (software GL); the
  // sheen on real shrink-wrap is birefringence under polarised light, not interference — nothing the eye expects here
  iridescence: { amount: 0, ior: 1.32, thickness: [120, 380] },
  edgeCoat: { clearcoat: 0.9, roughness: 0.14 },
  // the rooms (linear radiance)
  room: { ceiling: [0.11, 0.105, 0.097], horizon: 0.045, floorLine: 0.025, floor: 0.015, band: 0.01 },   // the band is what a straight-on cover reflects: 0.01 keeps its veil under 2/255
  softbox: { w: 0.34, h: 2.4, light: [3.6, 3.4, 3.05], rim: 0.06, rimLight: 1.0, inner: 0.02, innerLight: 2.0 },
  window: { w: 1.2, h: 1.6, light: [0.7, 0.8, 0.95], frame: 0.05, frameLight: 0.3 },
  panel: [1.15, 1.1, 1.02],                       // the Table's overhead panel (was (1, .96, .9) at 0.8 intensity)
  // where the softbox sits for each eye-level room: [azimuth° right, elevation° up]. The Rack's jacket leans 9° and
  // reflects 18° up; the Shelves' raised jacket stands upright at the camera's height and reflects level, so its box
  // sits lower (it spans ±15°, so the leaning overview jackets still catch it)
  softboxAt: { rack: [7, 18], shelves: [6, 6] },
};

// ---------------------------------------------------------------- the height field

function lcg(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return smooth(t); };
const range = (rnd, [a, b]) => lerp(a, b, rnd());
const gauss = (d, sigma) => Math.exp(-(d * d) / (2 * sigma * sigma));

/** Add `amp` × value noise with `cells` across an N² field (non-tiling, clamped). */
function addNoise(h, N, cells, amp, rnd) {
  const G = cells + 2, g = new Float32Array(G * G);
  for (let i = 0; i < G * G; i++) g[i] = rnd() - 0.5;
  const k = cells / N, ixs = new Int32Array(N), txs = new Float32Array(N);
  for (let x = 0; x < N; x++) { const fx = x * k; ixs[x] = Math.floor(fx); txs[x] = smooth(fx - ixs[x]); }
  for (let y = 0; y < N; y++) {
    const fy = y * k, iy = Math.floor(fy), ty = smooth(fy - iy), r0 = iy * G, r1 = r0 + G, row = y * N, a2 = amp * 2;
    for (let x = 0; x < N; x++) {
      const ix = ixs[x], tx = txs[x];
      const a = g[r0 + ix], b = g[r0 + ix + 1], c = g[r1 + ix], d = g[r1 + ix + 1];
      h[row + x] += a2 * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
    }
  }
}

/**
 * Splat one ridge into `h` (N² field, `ppm` px per mm): a Gaussian cross-section of
 * `sigma` mm, height `height(t)` along its length t ∈ [0, 1], bent by a slow sine of
 * `wobble` mm. Ridges take the max, so a crossing is a peak, not a spike.
 */
function ridge(h, N, ppm, x0, y0, angle, length, sigma, height, wobble, wobbleFreq) {
  const dx = Math.cos(angle), dy = Math.sin(angle), nx = -dy, ny = dx;
  const halfW = 3 * sigma, steps = Math.ceil(length * ppm * 2), across = Math.ceil(halfW * ppm * 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, s = t * length, w = wobble * Math.sin(t * wobbleFreq * Math.PI * 2);
    const hh = height(t); if (hh <= 0) continue;
    const cx = x0 + dx * s + nx * w, cy = y0 + dy * s + ny * w;
    for (let j = -across; j <= across; j++) {
      const d = (j / across) * halfW;
      const px = Math.round((cx + nx * d) * ppm), py = Math.round((cy + ny * d) * ppm);
      if (px < 0 || py < 0 || px >= N || py >= N) continue;
      const v = hh * gauss(d, sigma), k = py * N + px;
      if (v > h[k]) h[k] = v;
    }
  }
}

/** 1 outside the lockup zone, `damp` inside, feathered. (x, y in mm.) */
function lockupMask(x, y) {
  const L = FILM.lockup;
  if (x > L.x1 + L.feather || y > L.y1 + L.feather || x < L.x0 - L.feather || y < L.y0 - L.feather) return 1;
  const dx = Math.max(L.x0 - x, 0, x - L.x1), dy = Math.max(L.y0 - y, 0, y - L.y1);
  return L.damp + (1 - L.damp) * smoothstep(0, L.feather, Math.sqrt(dx * dx + dy * dy));
}

/** Build the fields: returns { ridges, height } (N² Float32Arrays, mm) and the LCG state. */
function buildFields(N) {
  const ppm = N / S, rnd = lcg(7);
  const ridges = new Float32Array(N * N);
  const F = FILM.fan;
  // corner fans: the film gathered toward each corner
  const corners = [[0, 0, Math.PI / 4], [S, 0, (3 * Math.PI) / 4], [S, S, (-3 * Math.PI) / 4], [0, S, -Math.PI / 4]];
  for (const [cx, cy, diag] of corners) {
    const n = Math.round(range(rnd, F.count));
    for (let i = 0; i < n; i++) {
      const a = diag + THREE.MathUtils.degToRad((rnd() * 2 - 1) * F.spread);
      const start = range(rnd, F.start), len = range(rnd, F.length), sigma = range(rnd, F.sigma), hh = range(rnd, F.height), decay = range(rnd, F.decay);
      const x0 = cx + Math.cos(a) * start, y0 = cy + Math.sin(a) * start;
      ridge(ridges, N, ppm, x0, y0, a, len, sigma, (t) => hh * Math.exp(-t / decay), range(rnd, F.wobble), 0.5 + rnd());
    }
  }
  // edge ripples: short ridges square to each edge, strongest at the edge
  const E = FILM.edge, band = E.band;
  const edges = [
    { along: (s) => [s, 0], angle: Math.PI / 2, k: 1 },          // top edge, ridges run down
    { along: (s) => [S, s], angle: Math.PI, k: 1 },              // right edge, ridges run left
    { along: (s) => [s, S], angle: -Math.PI / 2, k: E.weak },    // bottom edge, ridges run up
    { along: (s) => [0, s], angle: 0, k: E.weak },               // left edge, ridges run right
  ];
  for (const e of edges) {
    let s = range(rnd, E.spacing) * 0.5;
    while (s < S) {
      const [x0, y0] = e.along(s), len = band * range(rnd, E.length), hh = range(rnd, E.height) * e.k;
      ridge(ridges, N, ppm, x0, y0, e.angle + (rnd() - 0.5) * 2 * E.tilt, len, range(rnd, E.sigma), (t) => hh * (1 - smoothstep(0.1, 1, t)), 0.6, 0.5 + rnd());
      s += range(rnd, E.spacing);
    }
  }
  // two long stress creases, edge to edge, missing the lockup zone
  const C = FILM.crease, L = FILM.lockup;
  for (let i = 0; i < C.count; i++) {
    let x0, y0, a;
    for (let tries = 0; tries < 20; tries++) {
      a = THREE.MathUtils.degToRad(range(rnd, C.angle)) * (rnd() < 0.5 ? 1 : -1);
      x0 = S * (0.15 + 0.7 * rnd()); y0 = a > 0 ? 0 : S;
      // walk the line; reject it if it passes through the lockup zone
      let hit = false;
      for (let t = 0; t <= 1; t += 0.01) { const x = x0 + Math.cos(a) * S * 1.5 * t, y = y0 + Math.sin(a) * S * 1.5 * t; if (x > L.x0 && x < L.x1 && y > L.y0 && y < L.y1) { hit = true; break; } }
      if (!hit) break;
    }
    ridge(ridges, N, ppm, x0 - Math.cos(a) * S, y0 - Math.sin(a) * S, a, S * 3, C.sigma, () => C.height, C.wobble, 2 + rnd() * 2);
  }
  // the whole field: undulation (undamped) + damped ridges + damped micro-grain
  const h = new Float32Array(N * N), grain = new Float32Array(N * N);
  for (const [cells, amp] of FILM.undulation) addNoise(h, N, cells, amp, rnd);
  if (FILM.grain[1] > 0) addNoise(grain, N, FILM.grain[0], FILM.grain[1], rnd);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = y * N + x, m = lockupMask((x + 0.5) / ppm, (y + 0.5) / ppm);
    h[k] += m * (ridges[k] + grain[k]);
  }
  return { ridges, height: h, ppm };
}

// ---------------------------------------------------------------- the two maps

/** The wrinkle field as a tangent-space normal map (clearcoatNormalScale 1), and its haze. */
export function filmTextures() {
  const t0 = performance.now();
  const N = FILM.size, { ridges, height: h, ppm } = buildFields(N);
  const kd = ppm / 2, maxS = FILM.maxSlope;          // slope = Δh over 2 px, in mm/mm
  const c = document.createElement('canvas'); c.width = N; c.height = N;
  const ctx = c.getContext('2d'), img = ctx.createImageData(N, N), d = img.data;
  let sum2 = 0, maxSlope = 0;
  for (let y = 0; y < N; y++) {
    const ym = Math.max(0, y - 1), yp = Math.min(N - 1, y + 1);
    for (let x = 0; x < N; x++) {
      const xm = Math.max(0, x - 1), xp = Math.min(N - 1, x + 1);
      // slopes in mm/mm; image y runs down, texture v runs up: n = (−∂h/∂u, −∂h/∂v, 1) = (−hx, +hy_img, 1)
      let nx = -(h[y * N + xp] - h[y * N + xm]) * kd, ny = (h[yp * N + x] - h[ym * N + x]) * kd;
      const sl2 = nx * nx + ny * ny; sum2 += sl2; if (sl2 > maxSlope) maxSlope = sl2;
      if (nx > maxS) nx = maxS; else if (nx < -maxS) nx = -maxS;
      if (ny > maxS) ny = maxS; else if (ny < -maxS) ny = -maxS;
      const l = Math.sqrt(nx * nx + ny * ny + 1), i = (y * N + x) * 4;
      d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const normal = new THREE.CanvasTexture(c);
  normal.colorSpace = THREE.NoColorSpace; normal.wrapS = normal.wrapT = THREE.ClampToEdgeWrapping; normal.anisotropy = 8;

  // haze: base + patchy noise + rougher along the folds + the edge bands (green channel is read)
  const M = FILM.hazeSize, H = FILM.haze, rnd = lcg(11), r = M / N;
  const noise = new Float32Array(M * M);
  for (const [cells, amp] of H.noise) addNoise(noise, M, cells, amp, rnd);
  let ridgeMax = 0; for (let i = 0; i < ridges.length; i++) if (ridges[i] > ridgeMax) ridgeMax = ridges[i];
  const hc = document.createElement('canvas'); hc.width = M; hc.height = M;
  const hctx = hc.getContext('2d'), himg = hctx.createImageData(M, M), hd = himg.data;
  let hMin = 1, hMax = 0;
  const ppmH = M / S, bandPx = FILM.edge.band * ppmH;
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
    // the ridge mask at this texel: the mean of the 2×2 block of the 1024 field
    const X = Math.floor(x / r), Y = Math.floor(y / r);
    let rm = 0; for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) rm += ridges[(Y + yy) * N + X + xx];
    rm /= 4 * ridgeMax;
    const edgeD = Math.min(x, y, M - 1 - x, M - 1 - y);
    let v = H.base + noise[y * M + x] + H.ridge * rm + H.band * (1 - smoothstep(bandPx * 0.6, bandPx, edgeD));
    v = Math.max(H.min, Math.min(H.max, v));
    if (v < hMin) hMin = v; if (v > hMax) hMax = v;
    const i = (y * M + x) * 4, b = Math.round(v * 255);
    hd[i] = b; hd[i + 1] = b; hd[i + 2] = b; hd[i + 3] = 255;
  }
  hctx.putImageData(himg, 0, 0);
  const haze = new THREE.CanvasTexture(hc);
  haze.colorSpace = THREE.NoColorSpace; haze.wrapS = haze.wrapT = THREE.ClampToEdgeWrapping; haze.anisotropy = 4;

  const stats = { rms: +Math.sqrt(sum2 / (N * N)).toFixed(4), max: +Math.sqrt(maxSlope).toFixed(3), hazeMin: +hMin.toFixed(3), hazeMax: +hMax.toFixed(3), ms: +(performance.now() - t0).toFixed(1) };
  return { normal, haze, stats };
}

// ---------------------------------------------------------------- the rooms

/**
 * The room the film reflects is not a texture. A baked environment map (PMREM, 256 px
 * per cube face) has texels ~0.35° wide, and the Rack's close-up camera is so narrow
 * that a cover spans only ~35 of them: every edge in a baked reflection is a 50 px
 * smear with a staircase in it. So the film's world is analytic — a few lit
 * rectangles and a wall gradient evaluated per pixel in the clearcoat's reflection
 * direction (see FILM_ENV_PARS). Edges are as sharp as the haze says they are, the
 * wrinkles bend them, and no texture memory is spent.
 *
 * A quad is { origin, u, v (unit axes), half (half-sizes, m), color (linear radiance) },
 * painted in order, outer to inner: a softbox is its frame, its inner rim, its emitter.
 */
const MAX_QUADS = 6;
function quad(o, u, v, hw, hh, rgb) { return { o, u, v, hw, hh, c: Array.isArray(rgb) ? rgb : [rgb, rgb, rgb] }; }

/** The quads of a rectangle standing `r` m from the origin at azimuth `az`° (right +), elevation `el`° (up +), facing the origin, rolled by `roll` rad. */
function standing(az, el, r, roll, rects) {
  const g = new THREE.Object3D();
  const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
  g.position.set(r * Math.sin(a) * Math.cos(e), r * Math.sin(e), r * Math.cos(a) * Math.cos(e));
  g.lookAt(0, 0, 0); if (roll) g.rotateZ(roll); g.updateMatrixWorld(true);
  const u = new THREE.Vector3(1, 0, 0).applyQuaternion(g.quaternion), v = new THREE.Vector3(0, 1, 0).applyQuaternion(g.quaternion);
  return rects.map(([hw, hh, rgb, du = 0, dv = 0]) => quad(g.position.clone().addScaledVector(u, du).addScaledVector(v, dv), u.clone(), v.clone(), hw, hh, rgb));
}
function softboxQuads(az, el) {
  const B = FILM.softbox;
  return standing(az, el, 4.5, -0.26, [[B.w / 2 + B.rim, B.h / 2 + B.rim, B.rimLight], [B.w / 2 + B.inner, B.h / 2 + B.inner, B.innerLight], [B.w / 2, B.h / 2, B.light]]);
}
function windowQuads(az, el, r = 5) {
  const W = FILM.window;
  return standing(az, el, r, 0, [[W.w / 2 + W.frame, W.h / 2 + W.frame, W.frameLight], [W.w / 2, W.h / 2, W.light], [W.frame * 0.4, W.h / 2, W.frameLight]]);
}
/**
 * The Table's overhead panel: a horizontal rectangle at y 4.85 whose near edge runs on
 * the diagonal x = 0.81 + 0.225·z, out to the +x wall — from the top-down camera its
 * edge crosses the cover from top-centre to the lower right, leaving the lockup and the
 * title over the dark room — with the diffuser's rim just outside that edge.
 */
function panelQuads() {
  const y = 4.85, k = 0.225, x0 = 0.81, B = FILM.softbox;
  const u = new THREE.Vector3(k, 0, 1).normalize(), v = new THREE.Vector3(1, 0, -k).normalize();   // along the edge; across it toward +x
  const edge = new THREE.Vector3(x0, y, 0), depth = 5;
  return [
    quad(edge.clone().addScaledVector(v, -B.rim / 2), u, v, 6, B.rim / 2, B.rimLight),           // the rim, just outside the edge
    quad(edge.clone().addScaledVector(v, depth / 2), u, v, 6, depth / 2, FILM.panel),            // the panel, edge to wall
  ];
}

/** The uniforms of one film world: the wall gradient and up to MAX_QUADS lit rectangles. Shared by every material of a view. */
function filmWorld(quads) {
  if (quads.length > MAX_QUADS) throw new Error('film world: too many quads');
  const R = FILM.room;
  const o = [], u = [], v = [], h = [], c = [];
  for (let i = 0; i < MAX_QUADS; i++) {
    const q = quads[i];
    o.push(q ? q.o : new THREE.Vector3()); u.push(q ? q.u : new THREE.Vector3(1, 0, 0)); v.push(q ? q.v : new THREE.Vector3(0, 1, 0));
    h.push(q ? new THREE.Vector2(q.hw, q.hh) : new THREE.Vector2()); c.push(q ? new THREE.Vector3(...q.c) : new THREE.Vector3());
  }
  return {
    fqN: { value: quads.length }, fqO: { value: o }, fqU: { value: u }, fqV: { value: v }, fqH: { value: h }, fqC: { value: c },
    filmCeil: { value: new THREE.Vector3(...R.ceiling) }, filmWall: { value: new THREE.Vector4(R.horizon, R.floorLine, R.floor, R.band) },
  };
}

/** The eye-level world (Rack, Shelves): the softbox right of the line of sight, the window 38° left and 6° up. */
export function filmWorldFront(view = 'rack') {
  const [az, el] = FILM.softboxAt[view] || FILM.softboxAt.rack;
  return filmWorld([...windowQuads(-38, 6), ...softboxQuads(az, el)]);
}
/** The top-down world (Table): the overhead panel, the window on the −x wall. */
export function filmWorldTop() {
  return filmWorld([...windowQuads(-90, 26, 5), ...panelQuads()]);
}

/**
 * The print's reflection worlds — what the board under the film reflects and is lit
 * by: the dark studio alone (`printStudio`), so the paper shows no streak of its own and
 * every reflection on a cover is the film's. The older scene with its one strip
 * (`printStudioFront`) is kept for the Rack's inner faces, which are
 * laminated prints with no film. (The film sees the rooms above through its own sampler;
 * see filmedCoverMaterial.)
 */
export function printStudio() { return studioScene(); }           // under the film: the dark studio alone — no streak on the paper
export function printStudioFront() {
  // a narrow strip behind the camera, 7° right and 18° up, leaning ~15°: its streak runs up a leaning cover's right side
  const scene = studioScene();
  const box = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 3.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.1, 1.95), side: THREE.DoubleSide }));
  const az = THREE.MathUtils.degToRad(7), el = THREE.MathUtils.degToRad(18), r = 4.5;
  box.position.set(r * Math.sin(az) * Math.cos(el), r * Math.sin(el), r * Math.cos(az) * Math.cos(el));
  box.lookAt(0, 0, 0); box.rotateZ(-0.26);
  scene.add(box);
  return scene;
}
// ---------------------------------------------------------------- the materials

/**
 * The film reflects a different world from the print. three.js gives a material one
 * environment map for both its layers, so the clearcoat's radiance lookup is redirected
 * in the fragment shader to the analytic film world above: the print keeps the dark
 * studio (its colours and brightness do not change), the film reflects the dim room
 * with its lit rectangles. Cheaper than the texture lookup it replaces.
 */
const FILM_ENV_PARS = `
#define FILM_QUADS ${MAX_QUADS}
uniform int fqN; uniform vec3 fqO[FILM_QUADS]; uniform vec3 fqU[FILM_QUADS]; uniform vec3 fqV[FILM_QUADS]; uniform vec2 fqH[FILM_QUADS]; uniform vec3 fqC[FILM_QUADS];
uniform vec3 filmCeil; uniform vec4 filmWall;    // horizon, floor line, floor, eye-level band
vec3 filmRoomColor( const in vec3 d ) {
  float y = d.y;
  float w = y < 0.0 ? mix( filmWall.y, filmWall.x, smoothstep( -1.0, 0.0, y ) ) : mix( filmWall.x, filmCeil.r, smoothstep( 0.0, 1.0, y ) );
  w = mix( w, filmWall.w, 1.0 - smoothstep( 0.12, 0.24, abs( y ) ) );
  w = mix( w, filmWall.z, smoothstep( -0.55, -0.8, y ) );
  return w * ( filmCeil / max( filmCeil.r, 1e-4 ) );
}
vec3 getFilmIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
  vec3 R = inverseTransformDirection( reflect( - viewDir, normal ), viewMatrix );
  vec3 col = filmRoomColor( R );
  float blur = 0.003 + 0.7 * roughness * roughness;        // the lobe's half-angle (rad) → a soft edge of blur·distance
  for ( int i = 0; i < FILM_QUADS; i ++ ) {
    if ( i >= fqN ) break;
    vec3 n = cross( fqU[ i ], fqV[ i ] );
    float denom = dot( R, n ); if ( abs( denom ) < 1e-5 ) continue;
    float t = dot( fqO[ i ], n ) / denom; if ( t <= 0.0 ) continue;
    vec3 p = R * t - fqO[ i ];
    vec2 l = vec2( dot( p, fqU[ i ] ), dot( p, fqV[ i ] ) );
    float e = blur * t;
    vec2 k = 1.0 - smoothstep( fqH[ i ] - e, fqH[ i ] + e, abs( l ) );
    vec2 q = l / fqH[ i ];
    float shade = 1.0 - 0.3 * q.x * q.x - 0.12 * q.y * q.y;      // a diffuser is brightest at its middle
    col = mix( col, fqC[ i ] * shade, k.x * k.y );
  }
  return col * envMapIntensity;
}
`;
const CLEARCOAT_LINE = 'clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );';
function wearFilmEnv(material, world) {
  material.userData.filmWorld = world;                       // the shared uniforms of the view's film world
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, material.userData.filmWorld);
    const maps = THREE.ShaderChunk.lights_fragment_maps;
    if (!maps.includes(CLEARCOAT_LINE)) console.warn('film: clearcoat radiance line not found; the film reflects the print\'s world');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <envmap_physical_pars_fragment>', '#include <envmap_physical_pars_fragment>\n' + FILM_ENV_PARS)
      .replace('#include <lights_fragment_maps>', maps.replace(CLEARCOAT_LINE, CLEARCOAT_LINE.replace('getIBLRadiance', 'getFilmIBLRadiance')));
  };
  material.customProgramCacheKey = () => 'film-env';
  return material;
}


/**
 * The printed board under the film. `env` = { print, film }: the print's own studio (as
 * before the film) and the room the film reflects. The wrinkle field and the haze ride
 * on the clearcoat.
 */
export function filmedCoverMaterial(map, env, film) {
  const I = FILM.iridescence;
  const m = new THREE.MeshPhysicalMaterial({
    map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: FILM.emissive, color: 0xffffff,
    roughness: 0.68, metalness: 0, specularIntensity: FILM.specular,
    clearcoat: 1, clearcoatRoughness: 1, clearcoatRoughnessMap: film.haze,
    clearcoatNormalMap: film.normal, clearcoatNormalScale: new THREE.Vector2(1, 1),
    envMap: env.print, envMapIntensity: FILM.envIntensity,
    ...(I.amount > 0 ? { iridescence: I.amount, iridescenceIOR: I.ior, iridescenceThicknessRange: I.thickness.slice() } : {}),
  });
  return wearFilmEnv(m, env.film);
}

/** Card under the same film: the edges and the spine (no maps — they are millimetres thin). */
export function wrappedEdgeMaterial(color, env) {
  const E = FILM.edgeCoat;
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.9, metalness: 0, clearcoat: E.clearcoat, clearcoatRoughness: E.roughness, envMap: env.print, envMapIntensity: FILM.envIntensity });
  return wearFilmEnv(m, env.film);
}
