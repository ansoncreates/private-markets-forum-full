// The record: a 300 mm disc with procedural grooves (roughness + normal
// in the fragment shader, fwidth-faded so they never moiré), tangential
// micro-grooves expressed as radial anisotropic sheen, and a navy label
// carrying the PMF lockup. One record object, re-labelled per report.

import * as THREE from 'three';
import { TURNTABLE as T } from './layout.js';
import { LOGO_PATHS, LOGO_VIEWBOX } from '../data/logo.js';
import { BRAND } from '../data/records.js';
import { ContactShadow } from './shadows.js';

function anisotropyMap() {
  // rg = highlight direction in the uv tangent frame (radial), b = strength
  const S = 256;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S), d = img.data;
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      const u = (px + 0.5) / S - 0.5, v = 0.5 - (py + 0.5) / S;   // canvas y down → v up
      const phi = Math.atan2(v, u);
      const i = (py * S + px) * 4;
      d[i] = (Math.cos(phi) + 1) * 127.5; d[i + 1] = (Math.sin(phi) + 1) * 127.5; d[i + 2] = 255; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
  return tex;
}

const GROOVE_VERT_DECL = `
varying float vRad;
varying vec3 vRadial;
`;
const GROOVE_VERT = `
vRad = length(position.xy);
vRadial = normalize(normalMatrix * vec3(position.x, position.y, 0.0));
`;
const GROOVE_FRAG_DECL = `
varying float vRad;
varying vec3 vRadial;
uniform float uPitch;
float gapAt(float r, float c, float w) {
  return smoothstep(c - w - 0.6, c - w + 0.6, r) - smoothstep(c + w - 0.6, c + w + 0.6, r);
}
float groovedMask(float r) {
  float leadIn = smoothstep(145.4, 146.6, r);
  float runOut = 1.0 - smoothstep(59.4, 60.6, r);
  float gaps = gapAt(r, 132.0, 1.1) + gapAt(r, 116.0, 1.1) + gapAt(r, 98.0, 1.1);
  return clamp(1.0 - leadIn - runOut - gaps, 0.0, 1.0);
}
`;
const GROOVE_ROUGH = `
float gr_r = vRad;
float gr_mask = groovedMask(gr_r);
float gr_fw = fwidth(gr_r) / uPitch;
float gr_vis = 1.0 - smoothstep(0.18, 0.55, gr_fw);
float gr_wave = sin(gr_r * 6.28318530 / uPitch);
float gr_fine = mix(0.0, gr_wave * gr_vis, gr_mask);
roughnessFactor = mix(0.12, 0.30, gr_mask) + gr_fine * 0.05;
`;
const GROOVE_NORMAL = `
normal = normalize(normal + vRadial * (cos(vRad * 6.28318530 / uPitch) * gr_vis * gr_mask * 0.22));
`;

function makeGrooveMaterial(aniso) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x050507, roughness: 0.3, metalness: 0.0,
    clearcoat: 0.6, clearcoatRoughness: 0.18,
    anisotropy: 0.75, anisotropyMap: aniso, anisotropyRotation: 0,
    specularIntensity: 1.0,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPitch = { value: 0.95 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + GROOVE_VERT_DECL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + GROOVE_VERT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GROOVE_FRAG_DECL)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + GROOVE_ROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + GROOVE_NORMAL);
  };
  mat.customProgramCacheKey = () => 'pmf-groove';
  return mat;
}

/** Draw the PMF lockup with Path2D, `width` px wide, top-left at (x, y). */
export function drawLogo(ctx, x, y, width, color) {
  const k = width / LOGO_VIEWBOX.w;
  ctx.save();
  ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = color;
  for (const d of LOGO_PATHS) ctx.fill(new Path2D(d));
  ctx.restore();
  return LOGO_VIEWBOX.h * k;
}

function wrapCentered(ctx, text, maxWidth) {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > 1 && !lines[lines.length - 1].includes(' ')) {
    const prev = lines[lines.length - 2].split(' ');
    if (prev.length > 2) { lines[lines.length - 1] = prev.pop() + ' ' + lines[lines.length - 1]; lines[lines.length - 2] = prev.join(' '); }
  }
  return lines;
}

/**
 * The label carries two things only: the PMF lockup above the spindle hole and
 * the report title below it, both centred, on the navy-to-blue plate.
 */
export function renderLabel(record, size = 1024) {
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const px = size / (T.labelR * 2);                // px per mm
  const cx = size / 2, cy = size / 2;
  // navy with a soft radial lift toward blue at the edge
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  g.addColorStop(0, BRAND.navy); g.addColorStop(0.62, BRAND.navy); g.addColorStop(1, BRAND.blue);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  // lockup, 52 mm wide, its foot 9 mm above the spindle centre
  const logoW = 52 * px, logoH = LOGO_VIEWBOX.h / LOGO_VIEWBOX.w * logoW;
  drawLogo(ctx, cx - logoW / 2, cy - 9 * px - logoH, logoW, '#fff');
  // title, centred, its cap line 9 mm below the spindle centre, ≤ 3 lines within 62 mm
  const title = record.status === 'available' ? record.title : 'Coming Soon';
  let fs = 5.2 * px, lines;
  for (;;) {
    ctx.font = `400 ${fs}px Zodiak`;
    ctx.letterSpacing = `${-0.01 * fs}px`;
    lines = wrapCentered(ctx, title, 62 * px);
    if (lines.length <= 3 || fs <= 3.6 * px) break;
    fs -= 0.1 * px;
  }
  const cap = ctx.measureText('H').actualBoundingBoxAscent || fs * 0.7;
  const lead = fs * 1.18;
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  lines.forEach((l, i) => ctx.fillText(l, cx, cy + 9 * px + cap + i * lead));
  ctx.letterSpacing = '0px';
  // the spindle hole's edge
  ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, T.holeR * px + 1, 0, Math.PI * 2); ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class Record {
  constructor(stage, { labels = null } = {}) {
    this.stage = stage;
    this.group = new THREE.Group();
    this.group.name = 'record';
    const R = T.recordR, h = T.holeR, th = T.recordThick;
    this.top = new THREE.Mesh(new THREE.RingGeometry(h, R, 256, 6), makeGrooveMaterial(anisotropyMap()));
    this.top.rotation.x = -Math.PI / 2; this.top.position.y = th;
    this.bottom = new THREE.Mesh(new THREE.RingGeometry(h, R, 128, 1), new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.5 }));
    this.bottom.rotation.x = Math.PI / 2; this.bottom.position.y = 0;
    this.side = new THREE.Mesh(new THREE.CylinderGeometry(R, R, th, 128, 1, true), new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.5 }));
    this.side.position.y = th / 2;
    this.labelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0 });
    this.label = new THREE.Mesh(new THREE.RingGeometry(h, T.labelR, 96, 1), this.labelMat);
    this.label.rotation.x = -Math.PI / 2; this.label.position.y = th + 0.04;
    for (const m of [this.top, this.bottom, this.side]) { m.castShadow = true; m.receiveShadow = true; }
    this.label.receiveShadow = true;
    this.group.add(this.top, this.bottom, this.side, this.label);
    stage.scene.add(this.group);
    this.shadow = new ContactShadow({ w: R * 2, d: R * 2, opacity: 0.55, key: 'disc', circle: true, blur: 0.07 });
    stage.scene.add(this.shadow.mesh);
    this.surfaceY = 0;
    this.labels = labels || new Map();
    this.spin = 0;              // radians, label-upright at 0
  }

  /** Swap the label to a report's (textures come from the shared assets, or are drawn once). */
  setRecord(record) {
    let tex = this.labels.get(record.id);
    if (!tex) { tex = renderLabel(record); this.labels.set(record.id, tex); }
    const first = !this.labelMat.map;
    this.labelMat.map = tex;
    if (first) this.labelMat.needsUpdate = true;     // a texture swap needs no new shader
  }

  /** Place the record's base at (x, y, z); shadows follow on the given surface. */
  place(x, y, z, { surfaceY = 0, rotY = null } = {}) {
    this.group.position.set(x, y, z);
    this.surfaceY = surfaceY;
    if (rotY !== null) this.spin = rotY;
    this.group.rotation.y = -this.spin;
    this.shadow.surfaceY = surfaceY;
    this.shadow.update(x, z, y - surfaceY);
    if (this.shadowHidden) this.shadow.mesh.visible = false;
  }
  setVisible(v) { this.group.visible = v; this.shadow.mesh.visible = v && !this.shadowHidden && this.shadow.mesh.material.opacity > 0.005; }
  setSpin(a) { this.spin = a; this.group.rotation.y = -a; }
  /** Hide the contact sprite (e.g. while the record stands upright in a pocket). */
  setShadowVisible(v) { this.shadow.mesh.visible = v && this.shadow.mesh.material.opacity > 0.005; this.shadowHidden = !v; }
}
