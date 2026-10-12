// The turntable: plinth with a recessed well, platter with its strobe band,
// mat, spindle, tonearm (pivot top-right, horizontal at rest) and the three
// tactile keys. Satin-matte anodised grey with polished bevels.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { TURNTABLE as T } from './layout.js';

const SATIN = { color: 0x8a8d93, metalness: 0.6, roughness: 0.45 };
const SATIN_DARK = { color: 0x5a5d64, metalness: 0.7, roughness: 0.5 };
const POLISH = { color: 0xb9bcc2, metalness: 1, roughness: 0.12 };
const STEEL = { color: 0xd4d6da, metalness: 1, roughness: 0.18 };

function plinthTopTexture() {
  // 2 px per mm: satin brushed ground + the spun rings around the well.
  const W = 1040, H = 800, S = 2;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#7e8187'; ctx.fillRect(0, 0, W, H);
  // brushed streaks along x
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < H; y++) {
    const rowTone = (rnd() - 0.5) * 10;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, n = (rnd() - 0.5) * 6 + rowTone;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
  }
  ctx.putImageData(img, 0, 0);
  // spun rings r 171 → 180 around the well (well centre at shape (0,0) → canvas (220, 185)·2)
  // CanvasTexture flips y: shape y −185 is the canvas bottom row
  const cx = 220 * S, cy = H - 185 * S;
  for (let r = T.wellR; r <= T.wellR + 9; r += 0.5) {
    ctx.beginPath(); ctx.arc(cx, cy, r * S, 0, Math.PI * 2);
    ctx.strokeStyle = (Math.round(r * 2) % 2) ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.18)';
    ctx.lineWidth = 1; ctx.stroke();
  }
  // a soft occlusion ring just outside the well lip
  const g = ctx.createRadialGradient(cx, cy, T.wellR * S, cx, cy, (T.wellR + 16) * S);
  g.addColorStop(0, 'rgba(0,0,0,.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // ExtrudeGeometry lid uvs are the shape's own coordinates (mm) → map 520×400 onto 0..1
  tex.repeat.set(1 / 520, 1 / 400);
  tex.offset.set(220 / 520, 185 / 400);
  return tex;
}

/**
 * The strobe band: four rows of polished dots on the platter rim (r 154 → 165). Drawn
 * into a polar strip (u = angle, v = radius) and mapped onto an opaque ring, so the
 * dots are mip-mapped like any surface detail: small on screen they average into a
 * fine band instead of flickering. (They were an alpha-tested cut-out — hard pixel
 * edges that crawled whenever the platter turned or the camera floated.)
 */
const STROBE_IN = T.strobe.r0 - 1, STROBE_OUT = T.platterR - T.platterChamfer + 0.5;
function strobeTextures() {
  const W = 4096, H = 64, span = STROBE_OUT - STROBE_IN;
  const make = (ground, dot) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = ground; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = dot;
    const rows = T.strobe.rows, r0 = T.strobe.r0, r1 = T.strobe.r1;
    const pitch = (r1 - r0) / (rows.length + 1), rDot = pitch * 0.28;
    rows.forEach((count, i) => {
      const r = r0 + pitch * (i + 1), y = ((r - STROBE_IN) / span) * H;
      const ry = (rDot / span) * H, rx = (rDot / (2 * Math.PI * r)) * W;
      for (let k = 0; k < count; k++) { ctx.beginPath(); ctx.ellipse(((k + 0.5) / count) * W, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
    });
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    return tex;
  };
  const map = make('#8a8d93', '#c9ccd2'); map.colorSpace = THREE.SRGBColorSpace;      // satin ground, polished dots
  const rough = make('rgb(0,115,0)', 'rgb(0,36,0)'); rough.colorSpace = THREE.NoColorSpace;   // roughness (green): .45 → .14
  return { map, rough };
}
/** A ring whose uv runs round it (u = angle 0 → 1) and across it (v = inner → outer). */
function polarRing(inner, outer, segments) {
  const geo = new THREE.RingGeometry(inner, outer, segments, 1);
  const uv = geo.attributes.uv;
  for (let j = 0, n = 0; j <= 1; j++) for (let i = 0; i <= segments; i++, n++) uv.setXY(n, i / segments, j);
  uv.needsUpdate = true;
  return geo;
}

function glyphTexture(kind) {
  const S = 128;
  const c = document.createElement('canvas'); c.width = S; c.height = S * 0.64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#d9dbe0';
  const cx = S / 2, cy = c.height / 2, s = 22;
  ctx.beginPath();
  if (kind === 'play') { ctx.moveTo(cx - s * 0.8, cy - s); ctx.lineTo(cx + s, cy); ctx.lineTo(cx - s * 0.8, cy + s); ctx.closePath(); }
  else if (kind === 'pause') { ctx.rect(cx - s, cy - s, s * 0.7, s * 2); ctx.rect(cx + s * 0.3, cy - s, s * 0.7, s * 2); }
  else { ctx.rect(cx - s, cy - s, s * 2, s * 2); }
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Turntable {
  constructor(stage) {
    this.stage = stage;
    this.group = new THREE.Group();
    this.mats = {
      satin: new THREE.MeshStandardMaterial(SATIN),
      satinDark: new THREE.MeshStandardMaterial(SATIN_DARK),
      polish: new THREE.MeshStandardMaterial(POLISH),
      chamfer: new THREE.MeshStandardMaterial({ ...POLISH, roughness: 0.24 }),   // the platter's 3 mm bevel: a touch less mirror, so its thin highlight doesn't sparkle
      steel: new THREE.MeshStandardMaterial(STEEL),
      felt: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 1, metalness: 0 }),
      accent: new THREE.MeshStandardMaterial({ color: 0x0d1dcc, roughness: 0.35, metalness: 0.1 }),
      led: new THREE.MeshStandardMaterial({ color: 0x0d1dcc, emissive: 0x3350ff, emissiveIntensity: 0.4, roughness: 0.3 }),
    };
    this.keys = {};
    this.platterAngle = 0;
    this.buildPlinth();
    this.buildPlatter();
    this.buildTonearm();
    this.buildKeys();
    stage.scene.add(this.group);
    this.setArmAngle(0);
    this.setArmY(T.tonearm.restY);
    this.cueAngle = this.solveCueAngle(T.leadInR);
    this.assertFit();
  }

  // ------------------------------------------------------------ plinth
  buildPlinth() {
    const p = T.plinth, bevel = 2;
    const w = p.x1 - p.x0 - bevel * 2, d = p.z1 - p.z0 - bevel * 2, r = p.radius - bevel;
    // shape y = −world z (the mesh is rotated −90° about x)
    const cx = (p.x0 + p.x1) / 2, cy = -(p.z0 + p.z1) / 2;
    const shape = new THREE.Shape();
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - d / 2, y1 = cy + d / 2;
    shape.moveTo(x0 + r, y0);
    shape.lineTo(x1 - r, y0); shape.quadraticCurveTo(x1, y0, x1, y0 + r);
    shape.lineTo(x1, y1 - r); shape.quadraticCurveTo(x1, y1, x1 - r, y1);
    shape.lineTo(x0 + r, y1); shape.quadraticCurveTo(x0, y1, x0, y1 - r);
    shape.lineTo(x0, y0 + r); shape.quadraticCurveTo(x0, y0, x0 + r, y0);
    const hole = new THREE.Path();
    hole.absarc(0, 0, T.wellR + bevel, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const depth = p.height - bevel * 2;
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 48, steps: 1,
    });
    const lid = new THREE.MeshPhysicalMaterial({ ...SATIN, map: plinthTopTexture(), anisotropy: 0.45, anisotropyRotation: 0 });
    const plinth = new THREE.Mesh(geo, [lid, this.mats.polish]);
    plinth.rotation.x = -Math.PI / 2;
    plinth.position.y = p.top - (depth + bevel);
    plinth.castShadow = true; plinth.receiveShadow = true;
    this.group.add(plinth);
    this.plinth = plinth;

    // feet (four shallow discs) and the well floor
    const foot = new THREE.CylinderGeometry(22, 22, p.feet, 24);
    for (const [fx, fz] of [[p.x0 + 50, p.z0 + 50], [p.x1 - 50, p.z0 + 50], [p.x0 + 50, p.z1 - 50], [p.x1 - 50, p.z1 - 50]]) {
      const m = new THREE.Mesh(foot, this.mats.felt); m.position.set(fx, p.feet / 2, fz); this.group.add(m);
    }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(T.wellR + 1, 96), this.mats.satinDark);
    floor.rotation.x = -Math.PI / 2; floor.position.y = p.top - T.wellDepth; floor.receiveShadow = true;
    this.group.add(floor);
  }

  // ------------------------------------------------------------ platter
  buildPlatter() {
    const g = new THREE.Group();
    const bottom = T.platterTop - T.platterThick, ch = T.platterChamfer;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(T.platterR, T.platterR, T.platterThick - ch, 128, 1), this.mats.satin);
    body.position.y = bottom + (T.platterThick - ch) / 2;
    const cham = new THREE.Mesh(new THREE.CylinderGeometry(T.platterR - ch, T.platterR, ch, 128, 1), this.mats.chamfer);
    cham.position.y = T.platterTop - ch / 2;
    // the top face: a satin disc (chamfer cylinder's cap is polished — cover it)
    const top = new THREE.Mesh(new THREE.CircleGeometry(T.platterR - ch + 0.5, 128), this.mats.satin);
    top.rotation.x = -Math.PI / 2; top.position.y = T.platterTop + 0.02;
    const st = strobeTextures();
    const strobe = new THREE.Mesh(
      polarRing(STROBE_IN, STROBE_OUT, 256),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: st.map, roughnessMap: st.rough, roughness: 1, metalness: 0.75 }),
    );
    strobe.rotation.x = -Math.PI / 2; strobe.position.y = T.platterTop + 0.08;
    const mat = new THREE.Mesh(new THREE.CylinderGeometry(T.matR, T.matR, T.matTop - T.platterTop, 128, 1), this.mats.felt);
    mat.position.y = (T.platterTop + T.matTop) / 2;
    mat.receiveShadow = true;
    for (const m of [body, cham, top]) { m.castShadow = true; m.receiveShadow = true; }
    g.add(body, cham, top, strobe, mat);
    this.group.add(g);
    this.platter = g;
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(T.spindleR, T.spindleR, T.spindleTop - T.platterTop, 24), this.mats.steel);
    spindle.position.y = (T.platterTop + T.spindleTop) / 2;
    this.group.add(spindle);
  }

  setPlatterAngle(a) { this.platterAngle = a; this.platter.rotation.y = -a; }

  // ------------------------------------------------------------ tonearm
  buildTonearm() {
    const ta = T.tonearm, p = T.plinth;
    const fixed = new THREE.Group();            // base + rest post, never move
    fixed.position.set(ta.pivot.x, p.top, ta.pivot.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(22, 24, 8, 48), this.mats.polish);
    base.position.y = 4; base.castShadow = true;
    const baseTop = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 10, 48), this.mats.satinDark);
    baseTop.position.y = 13;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 24, 16), this.mats.satinDark);
    post.position.set(-(ta.pivot.x + 45), 12, 0);          // rest post at world x −45
    const cradle = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 12), this.mats.satinDark);
    cradle.position.set(-(ta.pivot.x + 45), 25, 0);
    // anti-skate dial — a small knob by the pivot
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 6, 24), this.mats.polish);
    dial.position.set(36, 3, 26);
    fixed.add(base, baseTop, post, cradle, dial);
    this.group.add(fixed);

    const arm = new THREE.Group();               // rotates about y, rises in y
    arm.position.set(ta.pivot.x, ta.restY, ta.pivot.z);
    const gimbal = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 14, 32), this.mats.polish);
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(26, 6, 22), this.mats.satinDark);
    yoke.position.y = 4;
    const tubeLen = ta.length - 36;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, tubeLen, 20), this.mats.polish);
    tube.rotation.z = Math.PI / 2;
    tube.position.x = -(tubeLen / 2 + 8);
    // headshell, offset 22°, with the brand-blue cartridge under it; stylus tip at (−L, −6, 0)
    const head = new THREE.Group();
    head.position.x = -(ta.length - 18);
    head.rotation.y = THREE.MathUtils.degToRad(ta.headshellOffsetDeg);
    const shell = new THREE.Mesh(new THREE.BoxGeometry(26, 5, 14), this.mats.polish);
    shell.position.x = 2;
    const cart = new THREE.Mesh(new THREE.BoxGeometry(18, 7, 12), this.mats.accent);
    cart.position.set(-14, -4.5, 0);
    const cant = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 9, 8), this.mats.steel);
    cant.rotation.z = Math.PI / 2; cant.position.set(-19, -8.5, 0);
    const lift = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 16, 12), this.mats.polish);
    lift.rotation.x = Math.PI / 2; lift.position.set(4, 0, 12);
    head.add(shell, cart, cant, lift);
    const cw = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 30, 48), this.mats.satinDark);
    cw.rotation.z = Math.PI / 2; cw.position.x = ta.counterweightX - ta.pivot.x - 15;
    const cwRing = new THREE.Mesh(new THREE.CylinderGeometry(16.3, 16.3, 2, 48), this.mats.polish);
    cwRing.rotation.z = Math.PI / 2; cwRing.position.x = cw.position.x - 8;
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 40, 16), this.mats.polish);
    stub.rotation.z = Math.PI / 2; stub.position.x = 24;
    arm.add(gimbal, yoke, tube, head, cw, cwRing, stub);
    arm.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; } });
    this.group.add(arm);
    this.arm = arm;

    // cue lever beside the pivot, on the fixed base
    const lever = new THREE.Group();
    lever.position.set(30, 8, -8);
    const leverArm = new THREE.Mesh(new THREE.BoxGeometry(18, 3, 5), this.mats.polish);
    leverArm.position.x = 9;
    lever.add(leverArm);
    fixed.add(lever);
    this.cueLever = lever;
  }

  /** Stylus position in the plinth plane for an arm angle (degrees). */
  stylusAt(deg) {
    const a = THREE.MathUtils.degToRad(deg), ta = T.tonearm;
    return { x: ta.pivot.x - ta.length * Math.cos(a), z: ta.pivot.z + ta.length * Math.sin(a) };
  }
  solveCueAngle(radius) {
    let lo = 0, hi = 40;
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2, s = this.stylusAt(mid);
      if (Math.hypot(s.x, s.z) > radius) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  setArmAngle(deg) { this.armAngle = deg; this.arm.rotation.y = THREE.MathUtils.degToRad(deg); }
  setArmY(y) { this.armY = y; this.arm.position.y = y; }
  setCueLever(t) { this.cueLever.rotation.z = -t * 0.45; }

  // ------------------------------------------------------------ keys
  buildKeys() {
    const k = T.keys, p = T.plinth;
    k.names.forEach((name, i) => {
      const x = k.x0 + i * (k.w + k.gap) + k.w / 2, z = k.z0 + k.d / 2;
      const geo = new RoundedBoxGeometry(k.w, k.height, k.d, 2, 2.4);
      const mesh = new THREE.Mesh(geo, this.mats.satinDark);
      mesh.position.set(x, p.top + k.height / 2, z);
      mesh.castShadow = true;
      const glyph = new THREE.Mesh(
        new THREE.PlaneGeometry(14, 9),
        new THREE.MeshBasicMaterial({ map: glyphTexture(name), transparent: true, toneMapped: false }),
      );
      glyph.rotation.x = -Math.PI / 2; glyph.position.set(0, k.height / 2 + 0.05, 0);
      mesh.add(glyph);
      const key = { mesh, name, x, z, baseY: mesh.position.y, rect: { x0: x - k.w / 2, x1: x + k.w / 2, z0: z - k.d / 2, z1: z + k.d / 2, y: p.top + k.height } };
      if (name === 'play') {
        const led = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), this.mats.led);
        led.position.set(k.w / 2 - 4, k.height / 2, -k.d / 2 + 4);
        mesh.add(led);
        key.led = led;
      }
      this.keys[name] = key;
      this.group.add(mesh);
    });
  }
  setKeyPress(name, t) {
    const key = this.keys[name];
    key.mesh.position.y = key.baseY - T.keys.travel * t;
  }
  setLed(intensity) { this.mats.led.emissiveIntensity = intensity; }

  // ------------------------------------------------------------ invariants
  assertFit() {
    const ok = [];
    const check = (cond, msg) => { ok.push({ cond, msg }); if (!cond) console.error('[turntable] ' + msg); };
    check(T.recordR < T.platterR, `record r${T.recordR} < platter r${T.platterR}`);
    check(T.recordR > T.matR, `record r${T.recordR} > mat r${T.matR}`);
    check(T.strobe.r0 >= T.recordR + 3, `strobe band (r≥${T.strobe.r0}) stays visible outside the record`);
    check(T.wellR > T.platterR, `well r${T.wellR} > platter r${T.platterR}`);
    const s = this.stylusAt(this.cueAngle), rr = Math.hypot(s.x, s.z);
    check(Math.abs(rr - T.leadInR) < 1, `stylus lands at r${rr.toFixed(1)} (lead-in ${T.leadInR})`);
    const rest = this.stylusAt(0);
    check(Math.hypot(rest.x, rest.z) > T.wellR, 'arm at rest clears the well');
    this.checks = ok;
    return ok.every((c) => c.cond);
  }
}
