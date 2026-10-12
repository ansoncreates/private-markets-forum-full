// Everything the views share, built once at boot: the surface tiles, the four
// environment maps, the film's two maps, every cover texture (one layout, one
// title size) and every record label. Views only ever reference these — one upload each.

import * as THREE from 'three';
import { TEXTURES } from '../data/textures.js';
import { RECORDS } from '../data/records.js';
import { renderCover, sharedTitleSize, loadFonts } from '../scene/covers.js';
import { renderLabel } from '../scene/record.js';
import { studioScene } from '../scene/environment.js';
import { filmTextures, filmWorldFront, filmWorldTop, printStudio, printStudioFront } from '../scene/film.js';

const loader = new THREE.TextureLoader();
function tex(url, { srgb = true, repeat = 1, aniso = 8 } = {}) {
  return new Promise((resolve, reject) => {
    loader.load(url, (t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = aniso;
      if (typeof repeat === 'number') t.repeat.set(repeat, repeat); else t.repeat.set(...repeat);
      resolve(t);
    }, undefined, reject);
  });
}

/**
 * An even, dim room with no strip lights: what the Rack's record reflects, so
 * it looks the same standing in a jacket as lying on the platter (a record
 * reflecting the studio's ceiling strips flat, and its dark walls upright,
 * visibly changes colour as it turns).
 */
function evenScene() {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.11, 0.11, 0.13), side: THREE.BackSide })));
  return scene;
}

export async function buildAssets(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const [carpetMap, carpetNormal, walnutMap, walnutRough, wallMap, wallNormal] = await Promise.all([
    tex(TEXTURES.carpetMap, { repeat: 4, aniso }),
    tex(TEXTURES.carpetNormal, { srgb: false, repeat: 4, aniso }),
    tex(TEXTURES.walnutMap, { repeat: [1, 1], aniso }),
    tex(TEXTURES.walnutRough, { srgb: false, repeat: [1, 1], aniso }),
    TEXTURES.wallMap ? tex(TEXTURES.wallMap, { repeat: 1, aniso }) : null,
    TEXTURES.wallNormal ? tex(TEXTURES.wallNormal, { srgb: false, repeat: 1, aniso }) : null,
    loadFonts(),
  ]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(studioScene(), 0.035).texture;
  // the covers: the paper's reflection world, the film's analytic worlds, and the film's two maps (scene/film.js)
  const print = pmrem.fromScene(printStudio(), 0.035).texture;                 // the paper under the film: the dark studio alone
  const inner = pmrem.fromScene(printStudioFront(), 0.02).texture;             // the Rack's inner faces: laminated prints, the old strip
  const coverEnvTop = { print, film: filmWorldTop() };                           // film: the analytic world the clearcoat reflects (no texture)
  const coverEnvFront = { print, inner, film: filmWorldFront('rack') };
  const coverEnvShelves = { print, film: filmWorldFront('shelves') };
  const envEven = pmrem.fromScene(evenScene(), 0.04).texture;
  const film = filmTextures();
  pmrem.dispose();

  // Covers: one layout and one title size for every jacket, drawn once.
  const titleMm = sharedTitleSize(RECORDS, 1024);
  const covers = new Map();
  for (const r of RECORDS) { const t = renderCover(r, 1024, titleMm); t.anisotropy = aniso; covers.set(r.id, t); }
  const labels = new Map();
  for (const r of RECORDS) labels.set(r.id, renderLabel(r));

  return { maps: { carpetMap, carpetNormal, walnutMap, walnutRough, wallMap, wallNormal, film: film.normal, filmHaze: film.haze }, film, env, coverEnvTop, coverEnvFront, coverEnvShelves, envEven, covers, labels, titleMm };
}

/** Upload a texture now, so its first use never stalls a frame. */
export function uploadAll(renderer, assets) {
  const up = (t) => { if (t) { try { renderer.initTexture(t); } catch (e) { /* upload on first use */ } } };
  for (const t of Object.values(assets.maps)) up(t);
  for (const t of assets.covers.values()) up(t);
  for (const t of assets.labels.values()) up(t);
}
