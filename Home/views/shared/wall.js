// The wall room's shared builders — the limewash wall, the carpet floor, a walnut
// ledge with its lip, the fill lights — used by the Rack (one ledge, a console)
// and the Shelves (three ledges). Every number comes from wallLayout.js; the
// materials come from the shared assets.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { LEDGE, WALL } from './wallLayout.js';

/** Dark limewash plaster, tiled per WALL.tile, spanning x0 → x1 and y 0 → height at z 0. */
export function buildWall(assets, { x0, x1, height = WALL.height }) {
  const m = assets.maps;
  const wallW = x1 - x0;
  // Each wall tiles the shared limewash at its own size: its own Texture objects over the shared
  // image (one upload). Setting the repeat on the shared textures made the Rack's wall take the
  // Shelves' tiling, or the other way round, depending on which view was built last.
  const tile = (t) => { if (!t) return null; const c = t.clone(); c.repeat.set(wallW / WALL.tile, height / WALL.tile); return c; };
  const wallMat = new THREE.MeshStandardMaterial({
    map: tile(m.wallMap), normalMap: tile(m.wallNormal), normalScale: new THREE.Vector2(0.9, 0.9),
    color: m.wallMap ? 0xffffff : 0x1a1c26, roughness: 0.92, metalness: 0,
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(wallW, height), wallMat);
  wall.position.set((x0 + x1) / 2, height / 2, 0);
  wall.receiveShadow = true;
  return wall;
}

/** The carpet tile at y 0, 4 tiles per metre, from the wall out to z 6000. */
export function buildFloor(assets, { x0, x1 }) {
  const m = assets.maps;
  const carpetMat = new THREE.MeshStandardMaterial({
    map: m.carpetMap, normalMap: m.carpetNormal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1, metalness: 0, color: 0xb4b6cc,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 4000, 6000), carpetMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((x0 + x1) / 2, 0, 3000);
  floor.receiveShadow = true;
  return floor;
}

/** The walnut shared with the Table's console. */
export function walnutMaterial(assets) {
  const m = assets.maps;
  return new THREE.MeshPhysicalMaterial({
    map: m.walnutMap, roughnessMap: m.walnutRough, roughness: 1, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, color: 0xffffff,
  });
}
/** Map the walnut tile (1150 × 600 mm) onto a box's uvs. */
export function walnutUv(geo, w, d) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 1150), uv.getY(i) * (d / 600));
  uv.needsUpdate = true;
}

/** A ledge against the wall with a front lip, its top at `top`, running x0 → x1. Returns { ledge, lip }. */
export function buildLedge(walnut, { x0, x1, top, shadows = true }) {
  const len = x1 - x0, cx = (x0 + x1) / 2;
  const ledgeGeo = new RoundedBoxGeometry(len, LEDGE.thick, LEDGE.depth, 2, 3);
  walnutUv(ledgeGeo, len, LEDGE.depth);
  const ledge = new THREE.Mesh(ledgeGeo, walnut);
  ledge.position.set(cx, top - LEDGE.thick / 2, LEDGE.depth / 2);
  ledge.castShadow = shadows; ledge.receiveShadow = shadows;
  const lipGeo = new RoundedBoxGeometry(len, LEDGE.lipH + 4, LEDGE.lipD, 2, 2);
  walnutUv(lipGeo, len, LEDGE.lipD);
  const lip = new THREE.Mesh(lipGeo, walnut);
  lip.position.set(cx, top + LEDGE.lipH / 2 - 2, LEDGE.depth - LEDGE.lipD / 2);
  lip.castShadow = shadows; lip.receiveShadow = shadows;
  return { ledge, lip };
}

/** The dim fill: a hemisphere plus a little bounce. Returns [hemisphere, ambient]. */
export function buildFill() {
  return [new THREE.HemisphereLight(0xc8dff3, 0x1a1410, 0.55), new THREE.AmbientLight(0x3a3e5a, 0.35)];
}
