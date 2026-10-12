// A gatefold jacket: two hinged boards on a spine at the left, the record held
// on the back board's inner face behind a pocket flap. Group origin = the spine,
// boards extend to +x; the closed jacket faces +z (the camera).
//
//   closed:  front board over the back board, cover out
//   open:    front board swung −170° about the spine, toward the camera and left

import * as THREE from 'three';
import { JACKET, TURNTABLE as T } from '../../scene/layout.js';
import { BRAND } from '../../data/records.js';
import { drawLogo } from '../../scene/record.js';
import { ContactShadow } from '../../scene/shadows.js';
import { OPEN } from './layout.js';
import { filmedCoverMaterial, wrappedEdgeMaterial } from '../../scene/film.js';

const S = JACKET.size, BOARD = 2.6, SPINE = 6;
const CARD = 0x9a948b;      // board core, a shade darker than the Table's: it sits under a picture light
const PLATE = { 'radial-navy': BRAND.navy, 'edge-lit': BRAND.navy, cream: BRAND.cream, ice: BRAND.ice, slate: BRAND.slate };
const INK = { 'radial-navy': '#fff', 'edge-lit': '#fff', cream: BRAND.navy, ice: BRAND.navy, slate: '#fff' };

/** The inner faces: the plate colour, the lockup bottom-left at 60 mm (front), or a lighter plate (back). */
function innerTexture(record, { logo = true, lighter = false } = {}) {
  const size = 1024, px = size / S;          // 1024: the lockup stays crisp in the open-spread close-up
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = PLATE[record.plate] || BRAND.navy;
  ctx.fillRect(0, 0, size, size);
  if (lighter) { ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, 0, size, size); }   // an sRGB lift, not a linear one
  if (logo) drawLogo(ctx, 34 * px, size - 34 * px - 60 * (34 / 191) * px, 60 * px, INK[record.plate] || '#fff');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class GatefoldJacket {
  constructor(record, coverTex, shared) {
    this.record = record;
    this.group = new THREE.Group();
    this.group.name = 'gatefold:' + record.id;
    // the inner faces: a glossy laminated print (no film — the wrap is on the outside)
    const gloss = (map) => new THREE.MeshPhysicalMaterial({
      map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.32, color: 0xffffff,
      roughness: 0.55, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, envMap: shared.coverEnv.inner, envMapIntensity: 0.8,
    });
    const edge = wrappedEdgeMaterial(CARD, shared.coverEnv);        // the wrap goes round the spine and the edges
    // the outside wears the shrink-wrap (scene/film.js); the inside faces only open on a report, so only those get drawn
    const open = record.status === 'available';
    this.mats = {
      cover: filmedCoverMaterial(coverTex, shared.coverEnv, shared.film),
      front: open ? gloss(innerTexture(record)) : new THREE.MeshStandardMaterial({ color: PLATE[record.plate] || BRAND.navy, roughness: 0.6 }),
      back: open ? gloss(innerTexture(record, { logo: false, lighter: true })) : new THREE.MeshStandardMaterial({ color: PLATE[record.plate] || BRAND.navy, roughness: 0.6 }),
      edge,
    };

    // back board (fixed): x 0 → S, z −1.3 → 1.3; its +z face is the inner (pocket) face
    // BoxGeometry slots: [+x, −x, +y, −y, +z, −z]
    const back = new THREE.Mesh(new THREE.BoxGeometry(S, S, BOARD), [edge, edge, edge, edge, this.mats.back, edge]);
    back.position.set(S / 2, 0, 0);
    // pocket flap: the lower 35% of the inner face, with a thumb cut, 0.5 mm proud
    const flap = new THREE.Mesh(flapGeometry(), this.mats.back);
    flap.position.set(S / 2, 0, 3.6);
    // spine
    const spine = new THREE.Mesh(new THREE.BoxGeometry(SPINE, S, 7.9), edge);
    spine.position.set(-SPINE / 2 + 0.5, 0, 2.65);
    // front board, on a pivot at the spine's front edge: x 0 → S, the −z face is the inner face
    this.pivot = new THREE.Group();
    this.pivot.position.set(0, 0, 4.0);
    const front = new THREE.Mesh(new THREE.BoxGeometry(S, S, BOARD), [edge, edge, edge, edge, this.mats.cover, this.mats.front]);
    front.position.set(S / 2, 0, BOARD / 2);
    this.pivot.add(front);
    for (const mm of [back, flap, spine, front]) { mm.castShadow = true; mm.receiveShadow = true; }
    this.group.add(back, flap, spine, this.pivot);
    this.front = front; this.back = back;

    // the record's home in the pocket (record group: y up = disc normal; stood upright with rotation.x = +90°)
    // record faces z 1.4 → 3.2: in front of the back board (≤ 1.3), behind the flap (≥ 3.3) and the front board (≥ 4.0)
    this.recordHome = new THREE.Vector3(S / 2, -S / 2 + T.recordR + 10, 1.4);
    this.shadow = new ContactShadow({ w: S, d: 24, opacity: 0.55, key: 'rack-jacket', radius: 0.02, blur: 0.08 });
    this.angle = 0;
    this.pose = { x: 0, y: 0, z: 0, lean: 0, lift: 0, forward: 0, shift: 0, tip: 0 };
  }

  setAngle(deg) { this.angle = deg; this.pivot.rotation.y = THREE.MathUtils.degToRad(deg); }
  setPose(p) { Object.assign(this.pose, p); this.apply(); }
  apply() {
    const p = this.pose;
    // a tip brings the top `tip` mm off the wall, pivoting on the bottom back edge (which
    // rests on the ledge) — a hand taking hold; nothing slides into the wall or the ledge
    const l = THREE.MathUtils.degToRad(p.lean), l2 = l - p.tip / S;
    const ey = (a) => (-S / 2) * Math.cos(a) - 1.3 * Math.sin(a), ez = (a) => (S / 2) * Math.sin(a) - 1.3 * Math.cos(a);
    this.group.position.set(p.x - S / 2 + p.shift, p.y + p.lift + ey(l) - ey(l2), p.z + p.forward + ez(l) - ez(l2));
    this.group.rotation.set(-l2, 0, 0);
    // the contact shadow sits on the ledge under the bottom edge
    this.shadow.update(p.x + p.shift, p.z + p.forward + 6, p.lift, 0, 1);
    this.shadow.mesh.visible = this.group.visible && p.lift < 60 && this.shadow.mesh.material.opacity > 0.005;
  }
  setVisible(v) { this.group.visible = v; this.shadow.mesh.visible = v && this.shadow.mesh.material.opacity > 0.005; }

  /** World-space centre and half-size of the closed cover's front face (for the hit target). */
  coverRect() {
    const p = this.pose, c = new THREE.Vector3(p.x + p.shift, p.y + p.lift, p.z + p.forward + 4.0 + BOARD);
    return { centre: c, half: S / 2, lean: p.lean };
  }
  /** World-space x extent of the whole jacket (open or closed), for clearance checks. */
  extentX() {
    const p = this.pose, spine = p.x - S / 2 + p.shift;
    const a = THREE.MathUtils.degToRad(this.angle);
    const frontFar = spine + S * Math.cos(a);
    return { min: Math.min(spine, frontFar), max: Math.max(spine + S, frontFar) };
  }
  /** World position of the record's home, following the jacket. */
  recordWorld(out = new THREE.Vector3()) { this.group.updateMatrixWorld(true); return this.group.localToWorld(out.copy(this.recordHome)); }
  get openShift() { return OPEN.shift; }
}

/** The pocket flap: a plate covering the lower 35% of the disc, with a semicircular thumb cut at the top centre. */
function flapGeometry() {
  const w = S - 20, h = S * 0.35, r = 34;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -h / 2);
  shape.lineTo(w / 2, -h / 2);
  shape.lineTo(w / 2, h / 2);
  shape.lineTo(r, h / 2);
  shape.absarc(0, h / 2, r, 0, Math.PI, true);
  shape.lineTo(-w / 2, h / 2);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false, curveSegments: 24 });
  geo.translate(0, -S / 2 + h / 2 + 10, -0.3);
  return geo;
}
