// Carpet, console, lights and the room's environment map (the covers' own reflection
// worlds are in scene/film.js).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { CARPET_Y, LIGHT_DIR } from './layout.js';
import { ContactShadow } from './shadows.js';

/**
 * A dark studio for the environment map: a near-black room with one long warm
 * strip light (top-left, where the key light sits) and a dim cool fill strip.
 * Polished surfaces seen from above then show a soft streak, not a white wash.
 */
export function studioScene() {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: 0x0a0a0e, side: THREE.BackSide })));
  const strip = (w, h, rgb, pos, rot) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(...rgb), side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot); scene.add(m);
  };
  strip(6.5, 0.7, [7.0, 6.2, 5.2], [-1.8, 4.9, -2.4], [Math.PI / 2, 0, 0.35]);   // warm key strip, top-left
  strip(4.0, 0.5, [1.1, 1.3, 1.7], [2.6, 4.9, 2.8], [Math.PI / 2, 0, -0.3]);     // cool fill strip, bottom-right
  strip(0.5, 3.0, [0.9, 0.9, 1.0], [-4.9, 2.2, 0.5], [0, Math.PI / 2, 0]);        // a pale wall panel for grazing edges
  strip(0.5, 3.0, [0.5, 0.5, 0.6], [4.9, 2.2, -0.5], [0, Math.PI / 2, 0]);
  return scene;
}

export class Environment {
  constructor(stage) {
    this.stage = stage;
    this.group = new THREE.Group();
    stage.scene.add(this.group);
    this.console = null;
    this.consoleShadow = null;
  }

  /** Build the room from the shared assets (textures + env maps built once in core/assets.js). */
  load(assets) {
    const { carpetMap, carpetNormal, walnutMap, walnutRough } = assets.maps;
    this.maps = assets.maps;
    this.coverEnv = assets.coverEnvTop;
    this.stage.scene.environment = assets.env;
    this.stage.scene.environmentIntensity = 1.0;

    // Carpet
    const carpetMat = new THREE.MeshStandardMaterial({
      map: carpetMap, normalMap: carpetNormal, normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 1, metalness: 0, color: 0xb4b6cc,
    });
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), carpetMat);
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.y = CARPET_Y;
    carpet.receiveShadow = true;
    this.group.add(carpet);
    this.carpet = carpet;

    // Lights
    const key = new THREE.DirectionalLight(0xffe6cc, 2.2);
    const dir = new THREE.Vector3(...LIGHT_DIR).normalize();
    key.position.copy(dir).multiplyScalar(2400).add(new THREE.Vector3(285, 0, 10));
    key.target.position.set(285, 0, 10);
    key.castShadow = true;
    const coarse = this.stage.coarse, lite = this.stage.lite;
    const sm = lite || coarse ? 512 : 1024;      // soft VSM blur hides the lower resolution
    key.shadow.mapSize.set(sm, sm);
    key.shadow.camera.near = 800; key.shadow.camera.far = 4200;
    key.shadow.camera.left = -760; key.shadow.camera.right = 760;
    key.shadow.camera.top = 760; key.shadow.camera.bottom = -760;
    key.shadow.radius = lite ? 2 : 3; key.shadow.blurSamples = lite ? 4 : 8; key.shadow.bias = -0.0004; key.shadow.intensity = 0.65;
    this.group.add(key, key.target);
    this.key = key;

    const fill = new THREE.HemisphereLight(0xc8dff3, 0x1a1410, 0.7);
    this.group.add(fill);

    this.consoleMat = new THREE.MeshPhysicalMaterial({
      map: walnutMap, roughnessMap: walnutRough, roughness: 1, metalness: 0,
      clearcoat: 1, clearcoatRoughness: 0.08, color: 0xffffff,
    });
  }

  /** Build (or rebuild) the console for a layout. */
  setLayout(layout) {
    const c = layout.console;
    const w = c.x1 - c.x0, d = c.z1 - c.z0, h = c.height;
    if (this.console) { this.group.remove(this.console); this.console.geometry.dispose(); }
    const geo = new RoundedBoxGeometry(w, h, d, 3, c.edge);
    // grain along x: scale uv so one texture tile spans ~1150 mm
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 1150), uv.getY(i) * (d / 600));
    uv.needsUpdate = true;
    const mesh = new THREE.Mesh(geo, this.consoleMat);
    mesh.position.set((c.x0 + c.x1) / 2, -h / 2, (c.z0 + c.z1) / 2);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.group.add(mesh);
    this.console = mesh;

    // The console's own soft shadow on the carpet, baked as a sprite.
    if (this.consoleShadow) this.group.remove(this.consoleShadow.mesh);
    this.consoleShadow = new ContactShadow({ w, d, opacity: 0.75, surfaceY: CARPET_Y, key: 'console:' + w + 'x' + d, radius: 0.03, blur: 0.12 });
    this.consoleShadow.update((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2, 60);
    this.group.add(this.consoleShadow.mesh);

    // Re-aim the key light's shadow frustum at this console.
    const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    const half = Math.max(w, d) * 0.66;
    const dir = new THREE.Vector3(...LIGHT_DIR).normalize();
    this.key.position.copy(dir).multiplyScalar(2400).add(new THREE.Vector3(cx, 0, cz));
    this.key.target.position.set(cx, 0, cz);
    const cam = this.key.shadow.camera;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.updateProjectionMatrix();
    this.stage.markShadowDirty();
  }
}
