// A closed jacket on a shelf: one box (two draw calls — the cover face, and the
// card edges + back), posed by { lean, lift, forward }. Leaning always pivots on
// the bottom-back edge resting on the ledge, so a jacket tipping upright swings
// its top off the wall and never pushes into the wall or the ledge.
//
// The box lives in the Rack gatefold's frame: back face z −1.3, front face z +6.6,
// so the shared rest pose (wallLayout REST, LEAN_DEG) holds unchanged.

import * as THREE from 'three';
import { JACKET } from '../../scene/layout.js';
import { ContactShadow, contactSpriteTexture } from '../../scene/shadows.js';
import { BACK_FACE, FRONT_FACE } from '../shared/wallLayout.js';
import { LEAN_DEG, REST, SHELF_TOPS, colX } from './layout.js';
import { filmedCoverMaterial, wrappedEdgeMaterial } from '../../scene/film.js';

const S = JACKET.size, THICK = FRONT_FACE - BACK_FACE, ZC = (FRONT_FACE + BACK_FACE) / 2;
const d2r = THREE.MathUtils.degToRad;
const L0 = d2r(LEAN_DEG);
export const CARD = 0x9a948b;

let geo = null;
/** The shared box, its faces regrouped: [edges + back] then [cover], two draw calls. */
export function jacketGeometry() {
  if (geo) return geo;
  const g = new THREE.BoxGeometry(S, S, THICK);
  g.translate(0, 0, ZC);
  const idx = g.index.array;                       // px nx py ny pz nz, 6 indices each
  const re = new Uint16Array(36);
  re.set(idx.subarray(0, 24), 0);                  // px nx py ny
  re.set(idx.subarray(30, 36), 24);                // nz (the back)
  re.set(idx.subarray(24, 30), 30);                // pz (the cover)
  g.setIndex(new THREE.BufferAttribute(re, 1));
  g.clearGroups();
  g.addGroup(0, 30, 0);
  g.addGroup(30, 6, 1);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return (geo = g);
}

/** The cover's material: the shared print under the shared shrink-wrap (as the Table and the Rack; scene/film.js). */
export function coverMaterial(map, envMap, film) { return filmedCoverMaterial(map, envMap, film); }
/** The card edges and back under the same wrap. */
export function cardMaterial(envMap) { return wrappedEdgeMaterial(CARD, envMap); }

/** The pivot's offset from the jacket's origin after a lean of `a` radians (rotation.x = −a). */
const P = { y: -S / 2, z: BACK_FACE };
const pivotY = (a) => P.y * Math.cos(a) + P.z * Math.sin(a);
const pivotZ = (a) => -P.y * Math.sin(a) + P.z * Math.cos(a);

export class ShelfJacket {
  constructor(slot, mats) {
    this.slot = slot;
    this.record = slot.record;
    this.x = colX(slot.col);
    this.top = SHELF_TOPS[slot.row];
    this.rest = { y: this.top + REST.dy, z: REST.z };
    this.mesh = new THREE.Mesh(jacketGeometry(), [mats.card, mats.cover]);
    this.mesh.name = `shelf:${slot.row}:${slot.col}`;
    this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.mesh.userData.jacket = this;
    this.pose = { lean: LEAN_DEG, lift: 0, forward: 0 };
    this.apply();
  }

  setPose(p) { Object.assign(this.pose, p); this.apply(); }
  /** The rest pose exactly (what a dropped jacket must end in). */
  setRest() { this.setPose({ lean: LEAN_DEG, lift: 0, forward: 0 }); }
  apply() {
    const p = this.pose, l0 = L0, l = d2r(p.lean);
    this.mesh.position.set(this.x, this.rest.y + pivotY(l0) - pivotY(l) + p.lift, this.rest.z + pivotZ(l0) - pivotZ(l) + p.forward);
    this.mesh.rotation.set(-l, 0, 0);
    if (this.onPose) this.onPose(this);
  }
  /** World position of the jacket's centre (the box's centre is at local z 2.65). */
  centre(out = new THREE.Vector3()) { this.mesh.updateMatrixWorld(); return out.set(0, 0, ZC).applyMatrix4(this.mesh.matrixWorld); }
  /** The four corners of the cover face in world space. */
  coverCorners(out = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]) {
    this.mesh.updateMatrixWorld();
    const h = S / 2, m = this.mesh.matrixWorld;
    out[0].set(-h, h, FRONT_FACE).applyMatrix4(m); out[1].set(h, h, FRONT_FACE).applyMatrix4(m);
    out[2].set(-h, -h, FRONT_FACE).applyMatrix4(m); out[3].set(h, -h, FRONT_FACE).applyMatrix4(m);
    return out;
  }
  /** The bottom edge's centre on the cover face (the title block hangs under it). */
  bottomCentre(out = new THREE.Vector3()) { this.mesh.updateMatrixWorld(); return out.set(0, -S / 2, FRONT_FACE).applyMatrix4(this.mesh.matrixWorld); }
  /** How far the jacket is off its rest, for the sprites: [lift above the ledge, forward off the wall]. */
  offsets(out = this._o || (this._o = { lift: 0, forward: 0 })) {
    const p = this.pose, l0 = L0, l = d2r(p.lean);
    out.lift = p.lift + (pivotY(l0) - pivotY(l)); out.forward = p.forward + (pivotZ(l0) - pivotZ(l));
    return out;
  }
}

/**
 * The soft shadow a jacket throws on the wall behind it: a rect sprite on the wall
 * plane, a little down and to the right. As the jacket comes forward the shadow
 * drifts further, grows and fades.
 */
export class WallShadow {
  constructor({ opacity = 0.35 } = {}) {
    const tex = contactSpriteTexture('shelf-wall', { w: S, h: S, radius: 0.02, blur: 0.12 });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: 0x06040a, opacity, toneMapped: false });
    const scale = 1 / (1 - 0.36);
    this.base = opacity;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(S * scale, S * scale), mat);
    this.mesh.renderOrder = 1;
    this.mesh.position.z = 0.3;
  }
  /** Place behind a jacket at (x, y) whose face is `forward` mm off its rest. */
  update(x, y, forward) {
    const f = Math.max(0, forward);
    this.mesh.position.set(x + 18 + f * 0.25, y - 24 - f * 0.35, 0.3);
    const s = 1 + f / 400;
    this.mesh.scale.set(s, s, 1);
    this.mesh.material.opacity = this.base / (1 + f / 120);
    this.mesh.visible = this.mesh.material.opacity > 0.005;
  }
}

/** The contact sprite on the ledge under a jacket's bottom edge. */
export function ledgeShadow() {
  return new ContactShadow({ w: S, d: 24, opacity: 0.55, key: 'rack-jacket', radius: 0.02, blur: 0.08 });
}
