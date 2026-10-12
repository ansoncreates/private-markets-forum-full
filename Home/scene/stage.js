// Renderer, top-down camera, and the on-demand frame loop.
// The loop runs only while something is moving (a tween, a spring, the
// spinning platter) and stops by itself — an idle BROWSE page is 0 rAF/s.

import * as THREE from 'three';
import { CAMERA, LIGHT_DIR } from './layout.js';
import { stepTweens, hasActiveTweens, onTweenAdded, tweenActivity } from '../motion/tween.js';
import { stepSprings, hasActiveSprings, onSpringWoken } from '../motion/spring.js';

/**
 * Resolution policy. The canvas renders at up to 1.5 device pixels per CSS pixel, but never more
 * than a 2560 × 1440 frame's worth of pixels in all (a maximised window on a 4K screen at 150% would
 * otherwise draw 2.25× the pixels of a 1440p one, for no visible gain under MSAA), and never below
 * 1 device pixel. If frames run long while something moves, it steps down a quarter at a time; the
 * level a device settles at is remembered (per device pixel ratio, for 30 days), so the next visit
 * starts there instead of stuttering through the first transition again. A session that then runs
 * smoothly for ~5 s of animation tries one quarter step back up.
 */
const PR = { max: 1.5, budget: 2560 * 1440, step: 0.25, slowMs: 22, window: 20, smoothMs: 18, smoothFrames: 300, key: 'pmf-home-pr', keepDays: 30 };
function readLearned(dpr) {
  try {
    const v = JSON.parse(localStorage.getItem(PR.key) || 'null');
    if (v && v.dpr === dpr && Date.now() - v.at < PR.keepDays * 864e5 && v.pr > 0) return v.pr;
  } catch (e) { /* storage unavailable */ }
  return Infinity;
}
function writeLearned(dpr, pr, atMax) {
  try { if (atMax) localStorage.removeItem(PR.key); else localStorage.setItem(PR.key, JSON.stringify({ dpr, pr, at: Date.now() })); } catch (e) { /* storage unavailable */ }
}

export class Stage {
  constructor(canvas, { coarse = false, lite = false } = {}) {
    this.canvas = canvas;
    this.coarse = coarse; this.lite = lite;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance', alpha: false, stencil: false,
    });
    const r = this.renderer;
    // Resolution: see PR above and _adapt(). Set for the real size in resize().
    this.dpr = window.devicePixelRatio || 1;
    this.minPixelRatio = Math.min(this.dpr, 1);
    this.learnedPR = lite ? Infinity : readLearned(this.dpr);
    this.pixelRatio = lite ? 1 : Math.max(this.minPixelRatio, Math.min(this.dpr, PR.max, this.learnedPR));
    this._downs = 0; this._fast = 0; this._upTried = false;
    r.setPixelRatio(this.pixelRatio);
    // three.js reads every program's info logs on its first use, a synchronous round trip
    // to the GPU process; the shaders are fixed, so that check is for ?debug=1 only (home.js)
    r.debug.checkShaderErrors = false;
    r.outputColorSpace = THREE.SRGBColorSpace;
    // Khronos PBR Neutral: keeps brand colours (navy, blue, ice) true where AgX greys them
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.4;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.VSMShadowMap;
    r.shadowMap.autoUpdate = false;      // dirty-flagged: only frames where a caster moved
    r.setClearColor(0x090c2a, 1);

    // The active view's scene and camera. A view with its own camera rig sets
    // `customFit` so resize() re-fits through it instead of the top-down framing.
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 100, 20000);
    this.camera.up.set(0, 0, -1);       // −z is screen-top
    this.customFit = null;
    this.lookAt = new THREE.Vector3(0, 0, 0);
    this.distance = 2200;
    this.parallax = { x: 0, z: 0 };     // radians, pointer parallax (desktop only)
    this.framing = { x0: -290, x1: 860, z0: -290, z1: 310 };

    this.width = 1; this.height = 1;
    this.needsRender = true;
    this.shadowDirty = true;
    this.running = false;
    this.lastNow = 0;
    this.continuous = new Set();        // tokens that keep the loop alive (the spinning platter)
    this.onFrame = [];                  // per-frame callbacks (dt, now)
    this.stats = { fps: 0, frames: 0, t0: 0, calls: 0, tris: 0 };
    this.renderEvery = 1;               // test hook: render every Nth stepped frame (software GL)
    this._tick = 0;
    this._runFrames = 0;                // frames since the loop last woke

    this._loop = this._loop.bind(this);
    onTweenAdded(() => this.wake());
    onSpringWoken(() => this.wake());
  }

  setFraming(box) { this.framing = box; this.fit(); }

  /** Make a view's scene + camera the ones rendered. */
  setView(scene, camera, customFit = null) {
    this.scene = scene; this.camera = camera; this.customFit = customFit;
    if (customFit) customFit(this.width, this.height); else this.fit();
    this.markShadowDirty();
  }

  /** Fit the framing box into the viewport ("contain" + 5% margin). */
  fit() {
    if (this.customFit) { this.customFit(this.width, this.height); this.needsRender = true; return; }
    const w = this.width, h = this.height;
    const aspect = w / h;
    this.camera.aspect = aspect;
    const { x0, x1, z0, z1 } = this.framing;
    const bw = (x1 - x0) * (1 + CAMERA.margin * 2);
    const bd = (z1 - z0) * (1 + CAMERA.margin * 2);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2));
    const dForDepth = bd / (2 * tanHalf);
    const dForWidth = bw / (2 * tanHalf * aspect);
    this.distance = Math.max(dForDepth, dForWidth);
    this.lookAt.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    this.applyCamera();
    this.camera.updateProjectionMatrix();
    this.needsRender = true;
  }

  applyCamera() {
    const c = this.camera;
    const px = Math.sin(this.parallax.x) * this.distance;
    const pz = Math.sin(this.parallax.z) * this.distance;
    c.position.set(this.lookAt.x + px, this.distance, this.lookAt.z + pz);
    c.lookAt(this.lookAt);
  }

  /** Visible extent (mm) of the y = 0 plane. */
  visible() {
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2));
    const h = 2 * this.distance * tanHalf;
    return { w: h * this.camera.aspect, h, cx: this.lookAt.x, cz: this.lookAt.z };
  }

  /** The highest pixel ratio this size may use (before what the device has learned). */
  maxPixelRatio(w = this.width, h = this.height) {
    if (this.lite) return 1;
    return Math.max(this.minPixelRatio, Math.min(this.dpr, PR.max, Math.sqrt(PR.budget / Math.max(1, w * h))));
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (w === this.width && h === this.height) return false;
    this.width = w; this.height = h;
    const pr = this.lite ? 1 : Math.max(this.minPixelRatio, Math.min(this.maxPixelRatio(w, h), this.learnedPR));
    if (pr !== this.pixelRatio) { this.pixelRatio = pr; this.renderer.setPixelRatio(pr); this.stats.pr = pr; }
    this.renderer.setSize(w, h, false);
    this.fit();
    return true;
  }

  /** World point → CSS px in the stage. */
  project(x, y, z, out = {}) {
    const v = this._v || (this._v = new THREE.Vector3());
    v.set(x, y, z).project(this.camera);
    out.x = (v.x + 1) / 2 * this.width;
    out.y = (1 - v.y) / 2 * this.height;
    return out;
  }

  /** Bounding rect in CSS px of a horizontal square/rect at height y. */
  projectRect(x0, x1, z0, z1, y) {
    const pts = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => this.project(x, y, z, {}));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  }

  /** mm per CSS px on the y = 0 plane (for swipe thresholds etc.). */
  mmPerPx() { return this.visible().h / this.height; }

  wake() {
    this.needsRender = true;
    if (this.running) return;
    this.running = true;
    this._runFrames = 0;
    this.lastNow = performance.now();
    requestAnimationFrame(this._loop);
  }
  hold(token) { this.continuous.add(token); this.wake(); }
  release(token) { this.continuous.delete(token); }
  requestRender() { this.wake(); }
  markShadowDirty() { this.shadowDirty = true; this.needsRender = true; }

  _loop(now) {
    if (!this.running) return;
    const interval = now - this.lastNow;
    const dt = Math.min(0.1, interval / 1000);
    this.lastNow = now;
    if (++this._runFrames > 3) this._adapt(interval);
    stepTweens(now);
    const springsActive = stepSprings(dt);
    for (const fn of this.onFrame) fn(dt, now);
    // A frame is drawn when something moved: a tween that changed something, a spring, a hold
    // (the spin, the float), or a request. A tween waiting out its delay moves nothing; an
    // ambient glow alone (the READY LED, 1.6 s a swell) is drawn at a third of the rate.
    const ta = tweenActivity();
    const busy = ta.busy || springsActive || this.continuous.size > 0;
    const ambient = !busy && ta.ambient;
    if (busy || ambient) this.needsRender = true;
    this._tick++;
    const every = ambient ? Math.max(3, this.renderEvery) : this.renderEvery;
    if (this.needsRender && (this._tick % every === 0)) this.render();
    const keepGoing = hasActiveTweens() || hasActiveSprings() || this.continuous.size > 0 || this.needsRender;
    if (keepGoing && !document.hidden) requestAnimationFrame(this._loop);
    else this.running = false;
  }

  /**
   * Dynamic resolution (PR above). The last 20 frame intervals while something moves, less the
   * single longest (one hitch — a collection, an upload — is not a trend): if they average past
   * 22 ms (under 45 fps) the pixel ratio drops a quarter step, never below 1×, and the window
   * starts over. A busy GPU can show as steady long frames or as bursts of short ones and a stall;
   * the mean sees both. One step back up per session, after 300 smooth frames in a row, and never
   * after this session has stepped down.
   */
  _adapt(interval) {
    if (this.lite || interval > 1000) return;         // a background tab, not a frame
    const W = PR.window, iv = this._iv || (this._iv = new Float32Array(W));
    iv[this._ivI = ((this._ivI || 0) + 1) % W] = interval;
    this._ivN = Math.min(W, (this._ivN || 0) + 1);
    this._fast = interval < PR.smoothMs ? this._fast + 1 : 0;
    if (this._ivN < W) return;
    let sum = 0, max = 0;
    for (let i = 0; i < W; i++) { sum += iv[i]; if (iv[i] > max) max = iv[i]; }
    const mean = (sum - max) / (W - 1);
    if (mean > PR.slowMs && this.pixelRatio > this.minPixelRatio + 1e-3) {
      this._ivN = 0; this._fast = 0; this._downs++;
      this._setPixelRatio(Math.max(this.minPixelRatio, this.pixelRatio - PR.step));
    } else if (this._fast >= PR.smoothFrames && !this._downs && !this._upTried && this.pixelRatio < this.maxPixelRatio() - 1e-3) {
      this._upTried = true; this._fast = 0; this._ivN = 0;
      this._setPixelRatio(Math.min(this.maxPixelRatio(), this.pixelRatio + PR.step));
    }
  }
  _setPixelRatio(pr) {
    this.pixelRatio = pr;
    const atMax = pr >= this.maxPixelRatio() - 1e-3;
    this.learnedPR = atMax ? Infinity : pr;
    writeLearned(this.dpr, pr, atMax);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.width, this.height, false);
    this.stats.pr = pr;
    this.needsRender = true;
  }

  render() {
    if (this.shadowDirty) { this.renderer.shadowMap.needsUpdate = true; this.shadowDirty = false; }
    if (!this.customFit) this.applyCamera();
    this.renderer.render(this.scene, this.camera);
    this.needsRender = false;
    const s = this.stats, info = this.renderer.info.render;
    s.calls = info.calls; s.tris = info.triangles; s.frames++;
    const t = performance.now();
    if (t - s.t0 > 500) { s.fps = Math.round(s.frames * 1000 / (t - s.t0)); s.frames = 0; s.t0 = t; }
  }

  lightDirection() { return new THREE.Vector3(...LIGHT_DIR).normalize(); }
}
