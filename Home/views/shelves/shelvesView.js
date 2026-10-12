// The Shelves view — three shelves of five jackets on the Rack's wall, all in
// view at once; zoom and drag to explore; a click raises a jacket (closed) and
// shows its title; Back drops it onto the shelf and it tips back against the
// wall; Go fades to the report. (SHELVES-VIEW-BRIEF.md)
//
//   EXPLORE ⇄ (click) FOCUSING → FOCUS → (Back) DROPPING → EXPLORE
//   FOCUS → (Go to report) LEAVING → navigate

import * as THREE from 'three';
import { RECORDS } from '../../data/records.js';
import { JACKET } from '../../scene/layout.js';
import { contactSpriteTexture } from '../../scene/shadows.js';
import { tween, sequence, cancelAllTweens, hasActiveTweens, tweenActivity } from '../../motion/tween.js';
import { EASE } from '../../motion/bezier.js';
import { buildWall, buildFloor, buildLedge, walnutMaterial } from '../shared/wall.js';
import { COLS, ROWS, SHELF_TOPS, LEDGE_X, WALL_X, WALL_H, COVER_Z, CAM, FOCUS, T, LIGHT, LEAN_DEG, REST, colX } from './layout.js';
import { buildSlots, shelfName } from './slots.js';
import { ShelfJacket, WallShadow, ledgeShadow, coverMaterial, cardMaterial } from './shelfJacket.js';
import { FILM } from '../../scene/film.js';
import { Explorer } from './explorer.js';
import { ShelvesInput } from './input.js';

export const STATE = { EXPLORE: 'explore', FOCUSING: 'focusing', FOCUS: 'focus', DROPPING: 'dropping', LEAVING: 'leaving' };
const S = JACKET.size, TAN = Math.tan(THREE.MathUtils.degToRad(CAM.fov / 2));
const d2r = THREE.MathUtils.degToRad;
const L = (a, b, v) => a + (b - a) * v;

export class ShelvesView {
  constructor(app) {
    this.app = app;
    this.id = 'shelves';
    this.el = app.el;
    this.stage = app.stage;
    this.audio = app.audio;
    this.reduced = app.reduced;
    this.scene = new THREE.Scene();
    this.ctx = app.makeContext(this.scene);
    this.state = STATE.EXPLORE;
    this.built = false;
    this.T = T;
    this.focused = null;
    this.layoutMode = null;
    this.hintGone = false;
    this.touch = app.coarse;
    this.held = false;
    this.gridFocus = 0;
  }
  get index() { return this.app.index; }
  set index(v) { this.app.index = v; }
  get booted() { return this.app.booted; }
  canSwitch() { return this.state === STATE.EXPLORE; }

  // ---------------------------------------------------------------- build / enter / leave
  async build(assets) {
    if (this.built) return;
    const sc = this.scene;
    sc.environment = assets.env;
    sc.environmentIntensity = 1.0;
    this.room = new THREE.Group();
    sc.add(this.room);
    this.room.add(buildWall(assets, { x0: WALL_X.x0, x1: WALL_X.x1, height: WALL_H }));
    this.room.add(buildFloor(assets, { x0: WALL_X.x0, x1: WALL_X.x1 }));
    const walnut = walnutMaterial(assets);
    this.ledges = SHELF_TOPS.map((top) => { const { ledge, lip } = buildLedge(walnut, { x0: LEDGE_X.x0, x1: LEDGE_X.x1, top, shadows: false }); this.room.add(ledge, lip); return { ledge, lip, top }; });
    // lights: the fill, and the focus light (off at rest) — nothing casts (no shadow map here)
    this.hemi = new THREE.HemisphereLight(0xc8dff3, 0x1a1410, LIGHT.hemi);
    this.ambient = new THREE.AmbientLight(0x3a3e5a, LIGHT.ambient);
    this.key = new THREE.DirectionalLight(LIGHT.key.color, LIGHT.key.intensity);
    this.key.position.set(...LIGHT.key.dir).multiplyScalar(5000).add(new THREE.Vector3(0, 1400, 0)); this.key.target.position.set(0, 1400, 0); this.key.target.updateMatrixWorld();
    this.room.add(this.hemi, this.ambient, this.key, this.key.target);
    const f = LIGHT.focus;
    this.focusLight = new THREE.SpotLight(f.color, 0, 0, d2r(f.angleDeg), f.penumbra, f.decay);
    this.focusLight.target = new THREE.Object3D();
    this.room.add(this.focusLight, this.focusLight.target);
    this.dim = 1;

    // the fifteen jackets: one material per cover texture, one card material
    this.slots = buildSlots(RECORDS);
    const covers = new Map(), card = cardMaterial(assets.coverEnvShelves);
    this.coverMats = covers; this.card = card;
    this.focusMats = new Map();            // the raised jacket's own copy of its cover material: it stays at full brightness while the room dims
    this.jackets = this.slots.map((slot) => {
      const id = slot.record.id;
      if (!covers.has(id)) { covers.set(id, coverMaterial(assets.covers.get(id), assets.coverEnvShelves, assets.film)); this.focusMats.set(id, coverMaterial(assets.covers.get(id), assets.coverEnvShelves, assets.film)); }
      const j = new ShelfJacket(slot, { card, cover: covers.get(id) });
      sc.add(j.mesh);
      return j;
    });
    this.meshes = this.jackets.map((j) => j.mesh);
    this.buildSprites();
    this.explorer = new Explorer({ reduced: this.reduced });
    this.camera = this.explorer.camera;
    this.explorer.resize(this.stage.width, this.stage.height);
    this.input = new ShelvesInput(this);
    this.input.bind();
    this.buildGrid();
    this.bindOverlay();
    this.state = STATE.EXPLORE;             // the state only: enter() applies it to the shared DOM (this may be an idle prebuild)
    this.lift(this.jackets[0], true);
    await this.app.warmUp(this.scene, this.camera, [this.liveLedge.mesh, this.liveWall.mesh]);
    this.lift(this.jackets[0], false);
    this.built = true;
  }
  /** Contact sprites: one instanced mesh for the ledge shadows, one for the wall shadows (two draw calls for fifteen jackets), plus a pair that follows the raised jacket. */
  buildSprites() {
    const n = this.jackets.length, scale = 1 / (1 - 0.36);
    const ledgeTex = contactSpriteTexture('rack-jacket', { w: S, h: 24, radius: 0.02, blur: 0.08 });
    const wallTex = contactSpriteTexture('shelf-wall', { w: S, h: S, radius: 0.02, blur: 0.12 });
    const mat = (map, color, opacity) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, color, opacity, toneMapped: false });
    this.ledgeSprites = new THREE.InstancedMesh(new THREE.PlaneGeometry(S * scale, 24 * scale), mat(ledgeTex, 0x0a0604, 0.55), n);
    this.wallSprites = new THREE.InstancedMesh(new THREE.PlaneGeometry(S * scale, S * scale), mat(wallTex, 0x06040a, 0.35), n);
    for (const m of [this.ledgeSprites, this.wallSprites]) { m.renderOrder = 1; m.frustumCulled = false; this.scene.add(m); }
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this._flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    this._corners = [0, 1, 2, 3].map(() => new THREE.Vector3()); this._px = [];
    this.jackets.forEach((j, i) => this.setSprite(i, true));
    // the pair that follows the one moving jacket
    this.liveLedge = ledgeShadow(); this.liveLedge.mesh.visible = false; this.scene.add(this.liveLedge.mesh);
    this.liveWall = new WallShadow(); this.liveWall.mesh.visible = false; this.scene.add(this.liveWall.mesh);
  }
  setSprite(i, on) {
    const j = this.jackets[i], c = j.rest;
    const s = on ? 1 : 0;
    this._m4.compose(this._p.set(j.x, j.top + 0.3, c.z + 6), this._flat, this._s.set(s, s, 1));
    this.ledgeSprites.setMatrixAt(i, this._m4);
    this._q.identity();
    this._m4.compose(this._p.set(j.x + 18, c.y - 24, 0.3), this._q, this._s.set(s, s, 1));
    this.wallSprites.setMatrixAt(i, this._m4);
    this.ledgeSprites.instanceMatrix.needsUpdate = true; this.wallSprites.instanceMatrix.needsUpdate = true;
  }
  /** The live sprites follow a jacket's pose. */
  followSprites(j) {
    const o = j.offsets();
    this.liveLedge.surfaceY = j.top;
    this.liveLedge.update(j.x, j.rest.z + 6 + o.forward, o.lift);
    this.liveLedge.mesh.visible = o.lift < 60 && this.liveLedge.mesh.material.opacity > 0.005;
    const c = j.centre(this._p);
    this.liveWall.update(j.x, c.y, o.forward);
  }
  /** The keyboard's fifteen buttons, in shelf order. */
  buildGrid() {
    const grid = this.el.shelfGrid;
    grid.innerHTML = '';
    this.gridButtons = this.jackets.map((j, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'shelf-grid__btn'; b.tabIndex = i === 0 ? 0 : -1;
      const r = j.record, avail = r.status === 'available';
      b.setAttribute('aria-label', `${shelfName(j.slot.row)}, ${j.slot.col + 1} of ${COLS}: ${avail ? r.title + '. ' + r.eyebrow + '.' : 'Coming soon.'}`);
      b.addEventListener('click', () => { if (this.app.view === this) this.select(j); });
      b.addEventListener('focus', () => { this.ringFor = j; this.ringDirty = true; this.wake(); });
      b.addEventListener('blur', () => { this.ringFor = null; this.el.focusRing.hidden = true; });
      grid.appendChild(b);
      return b;
    });
  }
  bindOverlay() {
    const e = this.el, ex = this.explorer;
    e.zoomIn.addEventListener('click', () => { if (this.state === STATE.EXPLORE) { this.hideHint(); ex.zoomBy(CAM.keyStep); this.wake(); } });
    e.zoomOut.addEventListener('click', () => { if (this.state === STATE.EXPLORE) { this.hideHint(); ex.zoomBy(1 / CAM.keyStep); this.wake(); } });
    e.zoomFit.addEventListener('click', () => { if (this.state === STATE.EXPLORE) { this.hideHint(); ex.fit(T.glide.fit); this.wake(); } });
    e.focusGo.addEventListener('click', () => this.confirm());
    e.focusBack.addEventListener('click', () => this.back());
  }
  setGridFocus(i, focusIt = false) {
    this.gridButtons.forEach((b, k) => { b.tabIndex = k === i ? 0 : -1; });
    this.gridFocus = i;
    if (focusIt) this.gridButtons[i].focus({ preventScroll: true });
  }

  enter(index) {
    this.index = index;
    this.stage.setView(this.scene, this.camera, (w, h) => this.fit(w, h));
    this.setState(STATE.EXPLORE);
    this.explorer.resize(this.stage.width, this.stage.height);
    this.poseExplore(true);
    this.el.shelvesUi.hidden = false;
    this.el.hit.hidden = true;
    this.el.canvas.style.touchAction = 'none';
    this.el.stage.classList.add('is-shelves');
    const i = this.jackets.findIndex((j) => j.slot.index === index);
    this.setGridFocus(i >= 0 ? i : 0);
    this.showHint();
    this.announce(`Shelves. ${this.jackets.length} jackets on ${ROWS} shelves.`);
    this.layoutOverlay();
    this.wake();
  }
  leave() {
    this.el.shelvesUi.hidden = true;
    this.el.canvas.style.touchAction = '';
    this.el.stage.classList.remove('is-shelves', 'is-grabbing');
    this.el.hit.hidden = false;
    this.explorer.allowFloat(false);
    this.hideFocus(true);
    this.release();
  }
  reset() {
    cancelAllTweens();
    this.audio.stopAll();
    this.el.fade.classList.remove('is-in');
    this.setState(STATE.EXPLORE);
    this.poseExplore(true);
  }
  /** Everything at rest: the overview, every jacket in its rest pose, lights up. */
  poseExplore(snap) {
    this.jackets.forEach((j, i) => { j.onPose = null; j.setRest(); this.lift(j, false); this.setSprite(i, true); });
    this.liveLedge.mesh.visible = false; this.liveWall.mesh.visible = false;
    this.focused = null;
    this.setDim(1);
    this.explorer.allowFloat(false);
    if (snap) { const p = this.explorer.fitPose(); this.explorer.glideTo(p, 0); }
    this.stage.requestRender();
  }
  /** The room at `v` of its brightness (1 = all up; T.dimTo in FOCUS): the lights, and the covers' self-light and reflections — the raised jacket keeps its own. */
  setDim(v) {
    this.dim = v;
    this.hemi.intensity = LIGHT.hemi * v; this.ambient.intensity = LIGHT.ambient * v; this.key.intensity = LIGHT.key.intensity * v;
    for (const m of this.coverMats.values()) { m.emissiveIntensity = FILM.emissive * v; m.envMapIntensity = FILM.envIntensity * v; }
    this.card.envMapIntensity = FILM.envIntensity * v;
    this.focusLight.intensity = LIGHT.focus.intensity * (1 - v) / (1 - T.dimTo);
  }
  /** Give a jacket its own full-brightness cover (FOCUS), or the shared one back. */
  lift(j, on) { j.mesh.material = [this.card, on ? this.focusMats.get(j.record.id) : this.coverMats.get(j.record.id)]; }

  // ---------------------------------------------------------------- framing
  fit(w, h) {
    this.layoutMode = w / h >= 1 ? 'landscape' : 'portrait';
    this.explorer.resize(w, h);
    if (this.state === STATE.FOCUS && this.focused) { const p = this.focusPose(this.focused); this.explorer.glideTo(p, 0, EASE.glide, true); }
    this.layoutOverlay();
  }
  resize() { this.fit(this.stage.width, this.stage.height); }
  /** The raised jacket's centre and face, in world mm. */
  focusCentre(j) {
    const l0 = d2r(LEAN_DEG);
    const py = (a) => (-S / 2) * Math.cos(a) + (-1.3) * Math.sin(a), pz = (a) => (S / 2) * Math.sin(a) + (-1.3) * Math.cos(a);
    const yc = j.rest.y + py(l0) - py(0) + FOCUS.lift;
    const zc = j.rest.z + pz(l0) - pz(0) + FOCUS.forward + 2.65;
    return { x: j.x, y: yc, z: zc, face: zc + (6.6 - 2.65) };
  }
  /** The camera pose that frames a raised jacket (§5.4): 50% of the height, 10% high, the block fitting under it. */
  focusPose(j) {
    const ex = this.explorer, c = this.focusCentre(j), a = ex.aspect;
    let dFace = Math.max(S / (CAM.focusFill * 2 * TAN), S / (CAM.focusMaxW * 2 * TAN * a));
    const blockH = this.blockHeight();
    // the jacket's bottom edge projects at safe.cy + (157 − 0.1·frameH)/m, with m = 2·dFace·t/H; the block must end above the safe band
    const room = ex.safe.y1 - ex.safe.cy - CAM.focusBlockGap - blockH + CAM.focusRaise * ex.H;
    if (room > 0) { const mMin = (S / 2) / room; dFace = Math.max(dFace, (mMin * ex.H) / (2 * TAN)); }
    const y = c.y - CAM.focusRaise * (2 * dFace * TAN);
    return { x: c.x, y, d: dFace + (c.face - COVER_Z) };
  }
  blockHeight() {
    if (this._blockH) return this._blockH;
    const b = this.el.focus, was = b.hidden;
    if (was) { b.style.visibility = 'hidden'; b.hidden = false; }
    const h = b.offsetHeight;
    if (was) { b.hidden = true; b.style.visibility = ''; }
    return (this._blockH = h || 180);
  }

  // ---------------------------------------------------------------- state / overlay
  setState(s) {
    this.state = s;
    this.el.stage.dataset.state = s;
    this.app.onViewState(this, s);
    const explore = s === STATE.EXPLORE;
    this.el.zoomKeys.classList.toggle('is-out', !explore);
    if (!explore) this.el.shelvesHint.classList.add('is-out'); else if (!this.hintGone) this.el.shelvesHint.classList.remove('is-out');
    this.el.stage.classList.toggle('is-explore', explore);
    if (this.explorer) this.explorer.allowFloat(s === STATE.FOCUS);
    this.updateZoomKeys();
  }
  /** The zoom keys' disabled states — written to the DOM only when they change. */
  updateZoomKeys() {
    const ex = this.explorer; if (!ex) return;
    const fp = ex.fitPose(), atFit = ex.dTarget >= ex.dFit - 0.5;
    const k = (atFit ? 2 : 0) + (ex.dTarget <= ex.dMin + 0.5 ? 1 : 0) + (atFit && Math.abs(ex.x - fp.x) < 1 && Math.abs(ex.y - fp.y) < 1 ? 4 : 0);
    if (k === this._zk) return;
    this._zk = k;
    this.el.zoomIn.disabled = !!(k & 1); this.el.zoomOut.disabled = !!(k & 2); this.el.zoomFit.disabled = !!(k & 4);
  }
  showHint() {
    const h = this.el.shelvesHint;
    h.textContent = this.touch ? 'Drag to explore · Pinch to zoom · Tap a jacket' : 'Drag to explore · Scroll to zoom · Select a jacket';
    h.classList.toggle('is-out', this.hintGone);
  }
  hideHint() { if (this.hintGone) return; this.hintGone = true; this.el.shelvesHint.classList.add('is-out'); }
  announce(text) { this.app.announce(text); }
  /** Fill and place the focus block under the raised jacket (from the base poses; it never moves after). */
  showFocus(j) {
    const e = this.el, r = j.record, avail = r.status === 'available' && !j.slot.placeholder;
    e.focusEyebrow.textContent = avail ? r.eyebrow : 'Coming soon';
    e.focusEyebrow.classList.toggle('pill--soon', !avail);
    e.focusMeta.textContent = avail ? r.meta : 'In preparation';
    e.focusTitle.textContent = avail ? r.title : 'Coming Soon';
    e.focusGo.hidden = !avail;
    e.focusGo.disabled = false; e.focusBack.disabled = false;
    e.focus.hidden = false;
    e.focus.classList.remove('is-in', 'is-out');
    this.placeFocus(j);
    requestAnimationFrame(() => requestAnimationFrame(() => { e.focus.classList.add('is-in'); (avail ? e.focusGo : e.focusBack).focus({ preventScroll: true }); }));
  }
  placeFocus(j) {
    const e = this.el, ex = this.explorer, pose = this.focusPose(j), c = this.focusCentre(j);
    const bottom = ex.projectFrom(pose, [new THREE.Vector3(c.x, c.y - S / 2, c.face)])[0];
    const top = Math.min(bottom.y + CAM.focusBlockGap, ex.H - this.blockHeight() - 8);
    e.focus.style.left = bottom.x.toFixed(1) + 'px'; e.focus.style.top = top.toFixed(1) + 'px';
    this.focusRect = { x: bottom.x, top };
  }
  hideFocus(quick) {
    const b = this.el.focus; if (b.hidden) return;
    b.classList.remove('is-in'); b.classList.add('is-out');
    setTimeout(() => { b.hidden = true; b.classList.remove('is-out'); }, quick ? 0 : 200);
  }
  layoutOverlay() {
    if (this.state === STATE.FOCUS && this.focused) this.placeFocus(this.focused);
    this.ringDirty = true;
    if (this.app.debug) this.checkInvariants();
  }
  /** The keyboard focus ring around the projected jacket (live camera). */
  updateRing() {
    const j = this.ringFor, e = this.el.focusRing;
    if (!j || !document.activeElement || !document.activeElement.classList.contains('shelf-grid__btn')) { e.hidden = true; return; }
    const ps = this.explorer.projectLive(j.coverCorners(this._corners), this._px);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of ps) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
    x0 -= 4; x1 += 4; y0 -= 4; y1 += 4;
    e.hidden = false;
    e.style.transform = `translate(${x0.toFixed(1)}px, ${y0.toFixed(1)}px)`;
    e.style.width = (x1 - x0).toFixed(1) + 'px'; e.style.height = (y1 - y0).toFixed(1) + 'px';
  }

  // ---------------------------------------------------------------- per frame
  wake() { if (!this.held) { this.held = true; this.stage.hold('shelves'); } }
  release() { if (this.held) { this.held = false; this.stage.release('shelves'); } }
  frame(dt, now) {
    const ex = this.explorer;
    const moving = ex.frame(dt, now);
    const floating = this.state === STATE.FOCUS && ex.floatWeight.x > 0.0005;
    if (this.state === STATE.EXPLORE) this.updateZoomKeys();
    if (this.ringFor && (moving || floating || this.ringDirty)) { this.updateRing(); this.ringDirty = false; }
    if (!moving && !floating && !hasActiveTweens() && ex.floatWeight.settled) this.release();      // 0 rAF at rest
    else this.wake();
    if (!this.stage.lite) this.stage.renderEvery = floating && !moving && !tweenActivity().busy ? 2 : 1;
  }
  floatInfo() { return `${this.explorer.floatOn ? 'on' : 'off'} w=${this.explorer.floatWeight.x.toFixed(2)}`; }

  // ---------------------------------------------------------------- keys
  /** Keys this view takes before the shell's bindings. Returns true when handled. */
  onKey(ev) {
    if (this.app.view !== this) return false;
    const ex = this.explorer, k = ev.key, tag = (ev.target && ev.target.tagName) || '';
    const onGrid = ev.target instanceof Element && ev.target.classList.contains('shelf-grid__btn');
    if (this.state === STATE.EXPLORE) {
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
        if (ev.target instanceof Element && this.el.switcher.contains(ev.target)) return false;
        ev.preventDefault();
        const dx = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0, dy = k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0;
        if (ev.shiftKey) { this.hideHint(); const m = ex.mmPerPx(); ex.glideTo({ x: ex.x + dx * CAM.panStep * ex.safe.w * m, y: ex.y - dy * CAM.panStep * ex.safe.h * m, d: ex.d }, T.glide.pan); this.wake(); return true; }
        const j = this.jackets[this.gridFocus];
        const row = Math.min(ROWS - 1, Math.max(0, j.slot.row + dy)), col = Math.min(COLS - 1, Math.max(0, j.slot.col + dx));
        const i = this.jackets.findIndex((q) => q.slot.row === row && q.slot.col === col);
        this.setGridFocus(i, true);
        this.follow(this.jackets[i]);
        return true;
      }
      if (k === '+' || k === '=') { ev.preventDefault(); this.hideHint(); ex.zoomBy(CAM.keyStep); this.wake(); return true; }
      if (k === '-' || k === '_') { ev.preventDefault(); this.hideHint(); ex.zoomBy(1 / CAM.keyStep); this.wake(); return true; }
      if (k === '0') { ev.preventDefault(); this.hideHint(); ex.fit(T.glide.fit); this.wake(); return true; }
      if (k === 'Enter' && !onGrid && tag !== 'BUTTON' && tag !== 'A') { this.select(this.jackets[this.gridFocus]); return true; }
      if (k === 'Escape') return true;
      return (k === 'ArrowLeft' || k === 'ArrowRight');
    }
    if (this.state === STATE.FOCUS) {
      if (k === 'Escape') { ev.preventDefault(); this.back(); return true; }
      if (k === 'Enter' && tag !== 'BUTTON' && tag !== 'A') { ev.preventDefault(); this.confirm(); return true; }
      return k.startsWith('Arrow');
    }
    return k.startsWith('Arrow') || k === 'Escape' || k === 'Enter' || k === ' ';
  }
  /** Bring a jacket fully on screen at the current zoom if less than 60% of it is visible. */
  follow(j) {
    const r = { x0: j.x - S / 2, x1: j.x + S / 2, y0: j.rest.y - S / 2, y1: j.rest.y + S / 2 };
    if (this.explorer.onScreen(r) < 0.6) { this.explorer.bringIn(r, T.glide.follow); this.wake(); }
    else this.ringDirty = true;
  }
  go() { /* the arrows walk the grid here (onKey); a swipe pans */ }
  play() { /* no turntable in this view */ }
  eject() { if (this.state === STATE.FOCUS) this.back(); }

  // ---------------------------------------------------------------- rise (select → FOCUS)
  async select(j) {
    if (this.app.view !== this) return;
    if (this.state === STATE.FOCUS && this.focused && this.focused !== j) { this.queued = j; await this.back(); return; }
    if (this.state !== STATE.EXPLORE) return;
    this.hideHint();
    this.explorer.endDrag(false); this.explorer.vx = this.explorer.vy = 0;
    this.returnPose = this.explorer.pose();
    this.focused = j;
    if (j.slot.index >= 0) { this.index = j.slot.index; this.app.rememberIndex(); }
    this.setGridFocus(this.jackets.indexOf(j));
    this.setState(STATE.FOCUSING);
    const i = this.jackets.indexOf(j);
    this.lift(j, true);
    this.setSprite(i, false);
    j.onPose = (q) => this.followSprites(q);
    this.liveLedge.mesh.visible = true; this.liveWall.mesh.visible = true;
    this.followSprites(j);
    const c = this.focusCentre(j), o = LIGHT.focus.offset;
    this.focusLight.position.set(c.x + o.x, c.y + o.y, c.z + o.z);
    this.focusLight.target.position.set(c.x, c.y, c.z); this.focusLight.target.updateMatrixWorld();
    const pose = this.focusPose(j);
    this.wake();
    if (this.reduced) {
      await this.crossfade(() => { j.setPose({ lean: 0, lift: FOCUS.lift, forward: FOCUS.forward }); this.setDim(T.dimTo); this.explorer.glideTo(pose, 0, EASE.glide, true); });
      this.setState(STATE.FOCUS); this.showFocus(j); this.app.prefetch(j.record.href || ''); this.announce(`${j.record.title}. Go to the report?`);
      return;
    }
    const s = sequence(), p0 = { ...j.pose };
    s.at(...T.tipUp, { from: 0, to: 1, ease: EASE.reveal, onUpdate: (v) => j.setPose({ lean: L(p0.lean, 0, v) }) });
    s.at(...T.liftClear, { from: 0, to: 1, ease: EASE.reveal, onUpdate: (v) => j.setPose({ lift: L(p0.lift, FOCUS.liftClear, v) }) });
    s.at(...T.forward, { from: 0, to: 1, ease: EASE.reveal, onUpdate: (v) => j.setPose({ forward: L(p0.forward, FOCUS.forward, v), lift: L(FOCUS.liftClear, FOCUS.lift, v) }) });
    s.call(T.camera[0], () => this.explorer.glideTo(pose, T.camera[1] - T.camera[0], EASE.glide, true));
    s.at(...T.dim, { from: 1, to: T.dimTo, ease: EASE.ui, onUpdate: (v) => this.setDim(v) });
    s.call(T.block[0], () => { if (this.state === STATE.FOCUSING) { this.setState(STATE.FOCUS); this.showFocus(j); if (j.record.href) this.app.prefetch(j.record.href); this.announce(`${j.record.status === 'available' ? j.record.title : 'Coming soon'}. ${j.record.status === 'available' ? 'Go to the report?' : ''}`); } });
    this.running = s.run();
    await this.running;
    this.running = null;
    if (this.state === STATE.FOCUSING) { this.setState(STATE.FOCUS); this.showFocus(j); }
    this.layoutOverlay();
  }

  // ---------------------------------------------------------------- drop (Back → EXPLORE)
  async back() {
    if (this.state !== STATE.FOCUS && this.state !== STATE.FOCUSING) return;
    const j = this.focused; if (!j) return;
    cancelAllTweens();
    this.setState(STATE.DROPPING);
    this.hideFocus(false);
    const i = this.jackets.indexOf(j), ret = this.returnPose || this.explorer.fitPose();
    this.wake();
    if (this.reduced) {
      await this.crossfade(() => { j.setRest(); this.setDim(1); this.explorer.glideTo(ret, 0); });
      this.finishDrop(i);
      return;
    }
    const s = sequence(), p0 = { ...j.pose }, dim0 = this.dim;
    s.call(T.cameraBack[0], () => this.explorer.glideTo(ret, T.cameraBack[1] - T.cameraBack[0]));
    s.at(...T.undim, { from: 0, to: 1, ease: EASE.ui, onUpdate: (v) => this.setDim(L(dim0, 1, v)) });
    // back over its spot, still upright, the lift held above the lip
    s.at(...T.back, { from: 0, to: 1, ease: EASE.ui, onUpdate: (v) => j.setPose({ lean: L(p0.lean, 0, v), forward: L(p0.forward, 0, v), lift: L(p0.lift, FOCUS.liftClear, v) }) });
    // the drop, then the tip back against the wall (gravity: --ease-fall), then a small settle
    s.at(...T.fall, { from: FOCUS.liftClear, to: 0, ease: EASE.fall, onUpdate: (v) => j.setPose({ lift: v }) });
    s.at(...T.tipBack, { from: 0, to: LEAN_DEG, ease: EASE.fall, onUpdate: (v) => j.setPose({ lean: v }) });
    s.at(...T.settle1, { from: LEAN_DEG, to: LEAN_DEG - 0.8, ease: EASE.reveal, onUpdate: (v) => j.setPose({ lean: v }) });
    s.at(...T.settle2, { from: LEAN_DEG - 0.8, to: LEAN_DEG, ease: EASE.ui, onUpdate: (v) => j.setPose({ lean: v }) });
    this.running = s.run();
    await this.running;
    this.running = null;
    this.finishDrop(i);
  }
  finishDrop(i) {
    const j = this.jackets[i];
    j.onPose = null; j.setRest();
    this.lift(j, false);
    this.setSprite(i, true);
    this.liveLedge.mesh.visible = false; this.liveWall.mesh.visible = false;
    this.focused = null;
    this.setDim(1);
    this.setState(STATE.EXPLORE);
    this.announce('Back on the shelves.');
    if (document.activeElement === this.el.focusBack || document.activeElement === this.el.focusGo || document.activeElement === document.body) this.setGridFocus(i, document.activeElement !== document.body);
    this.layoutOverlay();
    if (this.queued) { const q = this.queued; this.queued = null; this.select(q); }
  }

  // ---------------------------------------------------------------- go (FOCUS → report)
  async confirm() {
    if (this.state !== STATE.FOCUS || !this.focused) return;
    const j = this.focused, r = j.record;
    if (r.status !== 'available' || j.slot.placeholder || !r.href) return;
    this.setState(STATE.LEAVING);
    this.el.focusGo.disabled = true; this.el.focusBack.disabled = true;
    this.hideFocus(false);
    this.explorer.allowFloat(false);
    this.wake();
    if (this.reduced) { this.el.fade.classList.add('is-in'); this.audio.fadeOut(0.3); setTimeout(() => this.app.navigate(r.href), 320); return; }
    const ex = this.explorer, p = ex.pose();
    const s = sequence();
    s.call(T.goCam[0], () => ex.glideTo({ x: p.x, y: p.y, d: p.d * 0.92 }, T.goCam[1] - T.goCam[0], EASE.glide, true));
    s.call(T.goFade[0], () => { this.el.fade.style.transitionDuration = (T.goFade[1] - T.goFade[0]) + 'ms'; this.el.fade.classList.add('is-in'); this.audio.fadeOut(0.5); });
    s.call(T.navigate, () => { this.el.fade.style.transitionDuration = ''; this.app.navigate(r.href); });
    await s.run();
  }

  crossfade(apply) {
    return new Promise((resolve) => {
      this.el.canvas.classList.add('is-xfade');
      setTimeout(() => { apply(); this.stage.render(); this.el.canvas.classList.remove('is-xfade'); setTimeout(resolve, 200); }, 200);
    });
  }

  // ---------------------------------------------------------------- debug
  checkInvariants() {
    const out = [], ok = (c, m) => out.push({ c, m });
    const ex = this.explorer, e = this.el;
    const R = (el) => { if (!el || el.hidden || el.classList.contains('is-out') || getComputedStyle(el).opacity === '0') return null; const r = el.getBoundingClientRect(); return r.width && r.height ? r : null; };
    const hits = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const inView = (r) => !r || (r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5);
    const dom = { zoomKeys: R(e.zoomKeys), hint: R(e.shelvesHint), focus: R(e.focus), switcher: R(e.switcher), sound: R(e.sound) };
    const names = Object.keys(dom);
    let clean = true;
    for (let i = 0; i < names.length; i++) for (let k = i + 1; k < names.length; k++) if (hits(dom[names[i]], dom[names[k]])) { clean = false; ok(false, `${names[i]} overlaps ${names[k]}`); }
    for (const n of names) if (!inView(dom[n])) { clean = false; ok(false, `${n} runs off the screen`); }
    if (clean) ok(true, 'no overlay element overlaps another or runs off-screen');
    if (this.state === STATE.EXPLORE && Math.abs(ex.d - ex.dFit) < 1) {
      // the overview: every jacket inside the safe rect
      const s = ex.safe; let inside = true, worst = 0;
      for (const j of this.jackets) for (const p of ex.project(j.coverCorners())) { const over = Math.max(s.x0 - p.x, p.x - s.x1, s.y0 - p.y, p.y - s.y1); if (over > 0.5) { inside = false; worst = Math.max(worst, over); } }
      ok(inside, inside ? 'all fifteen jackets inside the safe rect' : `a jacket passes the safe rect by ${worst.toFixed(1)} px`);
      const sJ = this.jackets[7] ? ex.project(this.jackets[7].coverCorners()) : null;
      if (sJ) ok(true, `a jacket is ${(Math.max(...sJ.map((p) => p.y)) - Math.min(...sJ.map((p) => p.y))).toFixed(0)} px tall at the overview`);
    }
    if (this.state === STATE.FOCUS && this.focused && dom.focus) {
      const j = this.focused, pose = this.focusPose(j), ps = ex.projectFrom(pose, j.coverCorners());
      const bottom = Math.max(...ps.map((p) => p.y)), cx = (Math.min(...ps.map((p) => p.x)) + Math.max(...ps.map((p) => p.x))) / 2;
      ok(dom.focus.top >= bottom + CAM.focusBlockGap - 1.5, `focus block ${(dom.focus.top - bottom).toFixed(1)} px under the jacket (≥ ${CAM.focusBlockGap})`);
      ok(Math.abs((dom.focus.left + dom.focus.right) / 2 - cx) < 1.5, `focus block centred on the jacket (${((dom.focus.left + dom.focus.right) / 2 - cx).toFixed(1)} px off)`);
      const live = ex.projectLive(j.coverCorners()), liveBottom = Math.max(...live.map((p) => p.y));
      ok(liveBottom < dom.focus.top - 2, 'the floating jacket stays clear of the block');
    }
    ok(document.documentElement.scrollHeight <= innerHeight + 1, 'no page scroll');
    ok(this.stage.stats.calls <= 48, `draw calls ${this.stage.stats.calls} ≤ 48`);
    this.invariants = out;
    return out;
  }
}

// ---------------------------------------------------------------- debug: physical clearance (tools/shelves-clear.mjs)
const _m = new THREE.Matrix4();
function obbOf(mesh) {
  const g = mesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
  const bb = g.boundingBox, c = new THREE.Vector3(), h = new THREE.Vector3();
  bb.getCenter(c); bb.getSize(h).multiplyScalar(0.5);
  mesh.updateWorldMatrix(true, false);
  _m.copy(mesh.matrixWorld);
  const sx = new THREE.Vector3().setFromMatrixColumn(_m, 0), sy = new THREE.Vector3().setFromMatrixColumn(_m, 1), sz = new THREE.Vector3().setFromMatrixColumn(_m, 2);
  h.x *= sx.length(); h.y *= sy.length(); h.z *= sz.length();
  return { c: c.applyMatrix4(_m), u: [sx.normalize(), sy.normalize(), sz.normalize()], e: [h.x, h.y, h.z] };
}
function obbDepth(a, b) {
  const axes = [...a.u, ...b.u];
  for (const p of a.u) for (const q of b.u) { const x = new THREE.Vector3().crossVectors(p, q); if (x.lengthSq() > 1e-8) axes.push(x.normalize()); }
  const d = new THREE.Vector3().subVectors(b.c, a.c);
  let min = Infinity;
  for (const ax of axes) {
    const ra = a.e[0] * Math.abs(a.u[0].dot(ax)) + a.e[1] * Math.abs(a.u[1].dot(ax)) + a.e[2] * Math.abs(a.u[2].dot(ax));
    const rb = b.e[0] * Math.abs(b.u[0].dot(ax)) + b.e[1] * Math.abs(b.u[1].dot(ax)) + b.e[2] * Math.abs(b.u[2].dot(ax));
    const o = ra + rb - Math.abs(d.dot(ax));
    if (o < min) min = o;
  }
  return min;
}
/** Penetration depths (mm; ≤ 0 = apart) between jacket i and everything it could touch. */
ShelvesView.prototype.clearance = function clearance(i) {
  const j = this.jackets[i], J = obbOf(j.mesh), out = [];
  for (const q of this.jackets) if (q !== j && Math.abs(q.slot.row - j.slot.row) <= 1 && Math.abs(q.slot.col - j.slot.col) <= 1) out.push({ a: 'jacket', b: `jacket ${q.slot.row}:${q.slot.col}`, depth: obbDepth(J, obbOf(q.mesh)) });
  for (const l of this.ledges) { out.push({ a: 'jacket', b: `ledge ${l.top}`, depth: obbDepth(J, obbOf(l.ledge)) }); out.push({ a: 'jacket', b: `lip ${l.top}`, depth: obbDepth(J, obbOf(l.lip)) }); }
  let zmin = Infinity;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const p = J.c.clone().addScaledVector(J.u[0], sx * J.e[0]).addScaledVector(J.u[1], sy * J.e[1]).addScaledVector(J.u[2], sz * J.e[2]); zmin = Math.min(zmin, p.z); }
  out.push({ a: 'jacket', b: 'wall', depth: -zmin });
  return out;
};
