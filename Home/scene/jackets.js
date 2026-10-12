// The jackets: five 314 mm sleeves with a glossy printed cover. Only the active
// jacket is ever on the console — no jacket sits on another. Its open edge faces
// the turntable: −x in landscape, −z (up) in portrait.

import * as THREE from 'three';
import { JACKET } from './layout.js';
import { sleeveEdgeTexture } from './covers.js';
import { ContactShadow } from './shadows.js';
import { filmedCoverMaterial, wrappedEdgeMaterial, FILM } from './film.js';

const CARD = 0xd9d6d0;
// BoxGeometry material slots: [ +x, −x, +y cover, −y back, +z, −z ]
const OPEN_SLOT = { left: 1, top: 5 };

export class Jacket {
  constructor(record, shared) {
    this.record = record;
    this.group = new THREE.Group();
    this.group.name = 'jacket:' + record.id;
    const s = JACKET.size, t = JACKET.thick;
    // The printed board sealed in shrink-wrap (scene/film.js): the print faintly self-lit
    // (emissive = the cover art) so brand colours read at full strength in a dark room,
    // the film over it. The cover map and the reflection world arrive in setCovers /
    // setCoverEnvironment; until then the material is the film over a white board.
    const cover = filmedCoverMaterial(null, shared.coverEnv, shared.film);
    const edge = wrappedEdgeMaterial(CARD, shared.coverEnv);                  // the wrap goes round the edges
    const open = new THREE.MeshStandardMaterial({ map: shared.edgeTex, roughness: 0.9 });   // the sleeve's open side: inside, not wrapped
    const back = new THREE.MeshStandardMaterial({ color: 0xe9e6e0, roughness: 0.9 });
    this.mats = { cover, edge, open, back };
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(s, t, s), [edge, edge, cover, back, edge, edge]);
    // grounded by its contact-shadow sprite, so the jacket stays out of the shadow map:
    // browsing never forces a shadow-map update
    this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.mesh.position.y = t / 2;
    this.group.add(this.mesh);
    this.setOpenSide('left');
    this.shadow = new ContactShadow({ w: s, d: s, opacity: 0.5, key: 'square', radius: 0.02, blur: 0.06 });
    this.pose = { x: 0, z: 0, baseY: JACKET.baseY, lift: 0, press: 0 };
    this.extraY = 0; this.extraZ = 0; this.extraX = 0; this.extraRot = 0;     // choreography offsets
    this.opacity = 1;
    this.covered = false;
  }

  /** Which edge of the sleeve is open — the one facing the turntable. */
  setOpenSide(side) {
    const m = this.mesh.material.slice();
    for (const i of [0, 1, 4, 5]) m[i] = this.mats.edge;
    m[OPEN_SLOT[side]] = this.mats.open;
    this.mesh.material = m;
  }

  /** Put the shared cover texture on the front face (once). */
  setCover(tex) {
    if (this.covered) return;
    this.mats.cover.map = tex; this.mats.cover.emissiveMap = tex; this.mats.cover.needsUpdate = true;
    this.covered = true;
  }

  setPose(p) { Object.assign(this.pose, p); this.apply(); }
  apply() {
    const p = this.pose;
    const y = p.baseY + p.lift - p.press + this.extraY;
    this.group.position.set(p.x + this.extraX, y, p.z + this.extraZ);
    this.group.rotation.set(0, THREE.MathUtils.degToRad(this.extraRot), 0);
    // the shadow's lift is measured from the jacket's resting height
    this.shadow.extra = this.opacity;
    this.shadow.update(this.group.position.x, this.group.position.z, y - p.baseY, THREE.MathUtils.degToRad(this.extraRot), 1);
    this.shadow.mesh.visible = this.group.visible && this.shadow.mesh.material.opacity > 0.005;
  }
  setOpacity(o) {
    this.opacity = o;
    const vis = o > 0.005;
    this.group.visible = vis;
    for (const m of Object.values(this.mats)) { m.transparent = o < 1; m.opacity = o; }
    this.shadow.extra = o;
    this.shadow.mesh.visible = vis && this.shadow.mesh.material.opacity > 0.005;
    this.apply();
  }
  /** World-space rect of the cover's top face. */
  rect() {
    const h = JACKET.size / 2;
    const x = this.group.position.x, z = this.group.position.z;
    return { x0: x - h, x1: x + h, z0: z - h, z1: z + h, y: this.group.position.y + JACKET.thick };
  }
}

export class Jackets {
  constructor(stage, records, assets = null) {
    this.stage = stage;
    this.shared = { edgeTex: sleeveEdgeTexture(), coverEnv: assets ? assets.coverEnvTop : null, film: assets ? assets.film : { normal: null, haze: null } };
    if (!this.shared.coverEnv) this.shared.coverEnv = { print: null, film: null };
    this.list = records.map((r) => new Jacket(r, this.shared));
    this.group = new THREE.Group();
    for (const j of this.list) { this.group.add(j.group); this.group.add(j.shadow.mesh); }
    stage.scene.add(this.group);
    this.active = 0;
    this.center = { x: 580, z: 0 };
  }

  setOpenSide(side) { for (const j of this.list) j.setOpenSide(side); }

  /** Give every cover (and every wrapped edge) the top-down reflection worlds ({ print, film }). */
  setCoverEnvironment(env, intensity = FILM.envIntensity) {
    for (const j of this.list) {
      for (const m of [j.mats.cover, j.mats.edge]) { m.envMap = env.print; m.userData.filmWorld = env.film; m.envMapIntensity = intensity; m.needsUpdate = true; }
    }
  }

  /** Only the active jacket is shown; every other one waits, hidden, in the same place. */
  layout(active = this.active) {
    this.active = active;
    this.list.forEach((j, i) => {
      j.extraX = j.extraY = j.extraZ = j.extraRot = 0;
      j.setPose({ x: this.center.x, z: this.center.z, baseY: JACKET.baseY, lift: 0, press: 0 });
      j.setOpacity(i === active ? 1 : 0);
    });
    this.stage.requestRender();                  // jackets cast no map shadow — nothing to re-shadow
  }

  get activeJacket() { return this.list[this.active]; }

  /** Give every jacket its cover from the shared assets. */
  setCovers(assets) { for (const j of this.list) j.setCover(assets.covers.get(j.record.id)); }
}
