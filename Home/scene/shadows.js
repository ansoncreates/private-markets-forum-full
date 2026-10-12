// Contact shadows: pre-blurred sprites laid 0.3 mm above a surface.
// For an object at height h above its surface the sprite offsets along the
// key light, spreads and fades — which is what makes a lift read from above.

import * as THREE from 'three';
import { LIGHT_DIR } from './layout.js';

const sprites = new Map();

/** A blurred rounded-rect alpha sprite (256²) — made once per shape key. */
export function contactSpriteTexture(key, { w = 1, h = 1, radius = 0.06, blur = 0.08, circle = false } = {}) {
  if (sprites.has(key)) return sprites.get(key);
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  const pad = S * 0.18;
  const bw = (S - pad * 2) * (w >= h ? 1 : w / h), bh = (S - pad * 2) * (h >= w ? 1 : h / w);
  const x = (S - bw) / 2, y = (S - bh) / 2;
  // shadowBlur, not ctx.filter — it works in every engine
  ctx.shadowColor = 'rgba(0,0,0,1)';
  ctx.shadowBlur = S * blur;
  ctx.fillStyle = 'rgba(0,0,0,1)';
  ctx.beginPath();
  if (circle) ctx.arc(S / 2, S / 2, Math.min(bw, bh) / 2, 0, Math.PI * 2);
  else ctx.roundRect(x, y, bw, bh, Math.min(bw, bh) * radius);
  // draw off-canvas and let only the shadow land, twice for density
  ctx.save(); ctx.translate(0, S * 2); ctx.shadowOffsetY = -S * 2; ctx.fill(); ctx.fill(); ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  sprites.set(key, tex);
  return tex;
}

export class ContactShadow {
  /**
   * @param {object} o  w,d footprint (mm); opacity at rest; surfaceY; key for sprite cache
   */
  constructor({ w, d, opacity = 0.5, surfaceY = 0, key = 'rect', circle = false, radius = 0.06, blur = 0.08 }) {
    this.w = w; this.d = d; this.base = opacity; this.surfaceY = surfaceY;
    const tex = contactSpriteTexture(key, { w, h: d, circle, radius, blur });
    const mat = new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, color: 0x0a0604, opacity, toneMapped: false,
    });
    const scale = 1 / (1 - 0.36);   // the sprite's shape fills 64% of the texture
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w * scale, d * scale), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 1;
    this.mesh.matrixAutoUpdate = true;
    this.light = new THREE.Vector3(...LIGHT_DIR).normalize();
    this.extra = 1;                  // external fade multiplier (e.g. a dimmed neighbour)
    this.update(0, 0, 0);
  }
  /** Place under an object whose base is `h` mm above the surface at (x, z). */
  update(x, z, h, rotY = 0, scale = 1) {
    const lift = Math.max(0, h);
    const k = 0.6;                   // shadow offset per mm of lift, opposite the light
    this.mesh.position.set(x - this.light.x * lift * k, this.surfaceY + 0.3, z - this.light.z * lift * k);
    const spread = (1 + lift * 0.002) * scale;
    this.mesh.scale.set(spread, spread, 1);
    this.mesh.rotation.z = -rotY;
    this.mesh.material.opacity = this.base * Math.max(0, 1 - lift / 150) * this.extra;
    this.mesh.visible = this.mesh.material.opacity > 0.005;
  }
}
