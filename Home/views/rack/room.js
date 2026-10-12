// The Rack view's room: limewash wall, carpet floor, walnut ledge, walnut console,
// a picture light that travels with the focus, and the hemisphere fill.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { JACKET } from '../../scene/layout.js';
import { ContactShadow } from '../../scene/shadows.js';
import { PITCH, LEDGE, WALL, CONSOLE, SPOT_OFFSET, consoleCentreX } from './layout.js';
import { buildWall, buildFloor, buildLedge, buildFill, walnutMaterial, walnutUv } from '../shared/wall.js';

const SPOT_DIST = Math.hypot(SPOT_OFFSET.x, SPOT_OFFSET.y, SPOT_OFFSET.z);

export class Room {
  constructor(ctx, assets, n) {
    this.ctx = ctx;
    this.n = n;
    this.group = new THREE.Group();
    ctx.scene.add(this.group);
    ctx.scene.environment = assets.env;
    ctx.scene.environmentIntensity = 1.0;
    const span = (n - 1) * PITCH;

    // Wall, floor, ledge: the shared wall room (views/shared/wall.js)
    const wall = buildWall(assets, { x0: -WALL.margin, x1: span + WALL.margin });
    const floor = buildFloor(assets, { x0: -WALL.margin, x1: span + WALL.margin });
    this.walnut = walnutMaterial(assets);
    const half = (JACKET.size + LEDGE.overhang * 2) / 2;
    const { ledge, lip } = buildLedge(this.walnut, { x0: -half, x1: span + half, top: LEDGE.top });
    this.group.add(wall, floor, ledge, lip);
    this.ledge = ledge;
    this.lip = lip;

    // Console below the rack, on a dark toe kick
    const cx = consoleCentreX(n);
    const consoleGeo = new RoundedBoxGeometry(CONSOLE.width, CONSOLE.top - CONSOLE.toe, CONSOLE.depth, 3, CONSOLE.edge);
    walnutUv(consoleGeo, CONSOLE.width, CONSOLE.depth);
    const sideboard = new THREE.Mesh(consoleGeo, this.walnut);
    sideboard.position.set(cx, CONSOLE.toe + (CONSOLE.top - CONSOLE.toe) / 2, CONSOLE.depth / 2);
    sideboard.castShadow = true; sideboard.receiveShadow = true;
    const toe = new THREE.Mesh(new THREE.BoxGeometry(CONSOLE.width - 80, CONSOLE.toe, CONSOLE.depth - 60), new THREE.MeshStandardMaterial({ color: 0x15110e, roughness: 0.9 }));
    toe.position.set(cx, CONSOLE.toe / 2, CONSOLE.depth / 2 - 20);
    this.group.add(sideboard, toe);
    this.console = sideboard;
    const consoleShadow = new ContactShadow({ w: CONSOLE.width, d: CONSOLE.depth, opacity: 0.7, surfaceY: 0, key: 'rack-console', radius: 0.03, blur: 0.12 });
    consoleShadow.update(cx, CONSOLE.depth / 2, 40);
    this.group.add(consoleShadow.mesh);

    // Picture light: one warm spot that travels with the focus; the only map shadow
    const spot = new THREE.SpotLight(0xffe6cc, 5.5e6, 0, THREE.MathUtils.degToRad(22), 0.8, 2);
    spot.castShadow = true;
    const sm = ctx.lite || ctx.coarse ? 256 : 512;      // a picture light's pool is ~1 m across: 512² + the VSM blur is plenty, and each glide re-renders it
    spot.shadow.mapSize.set(sm, sm);
    spot.shadow.camera.near = 300; spot.shadow.camera.far = 4000;
    spot.shadow.radius = ctx.lite ? 2 : 3; spot.shadow.blurSamples = ctx.lite ? 4 : 8;
    spot.shadow.bias = -0.0005;
    spot.target = new THREE.Object3D();
    this.group.add(spot, spot.target);
    this.spot = spot;

    this.group.add(...buildFill());
  }

  /** Aim the picture light at a focus point (the active jacket, the record in flight, the platter). */
  focus(x, y, z) {
    const o = SPOT_OFFSET;
    (this.at || (this.at = new THREE.Vector3())).set(x, y, z);
    this.spot.position.set(x + o.x, y + o.y, z + o.z);       // a constant offset: the same light level wherever it goes
    this.spot.target.position.set(x, y, z);
    this.spot.target.updateMatrixWorld();
    this.ctx.markShadowDirty();
  }
  focusOn(v) { this.focus(v.x, v.y, v.z); }
  /** Aim at a point from a given unit direction, at the usual distance. */
  focusFrom(v, dir) {
    const d = SPOT_DIST;
    (this.at || (this.at = new THREE.Vector3())).copy(v);
    this.spot.position.set(v.x + dir.x * d, v.y + dir.y * d, v.z + dir.z * d);
    this.spot.target.position.copy(v);
    this.spot.target.updateMatrixWorld();
    this.ctx.markShadowDirty();
  }
}
