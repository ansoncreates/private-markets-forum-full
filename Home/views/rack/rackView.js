// The Rack view — jackets face-out on a wall ledge, one close-up at a time
// (RACK-VIEW-BRIEF.md).
//
//   BROWSE ⇄ (go) BROWSE
//   BROWSE → OPENING → CONFIRM → CLOSING → BROWSE                       (Back / Esc)
//   CONFIRM → TRANSFER → CUEING → READY → PLAYING → LEAVING → navigate   (Go to report)
//   READY → EJECTING → BROWSE

import * as THREE from 'three';
import { RECORDS } from '../../data/records.js';
import { Turntable } from '../../scene/turntable.js';
import { Record } from '../../scene/record.js';
import { TURNTABLE as T, JACKET } from '../../scene/layout.js';
import { tween, sequence, cancelAllTweens, hasActiveTweens, tweenActivity } from '../../motion/tween.js';
import { EASE } from '../../motion/bezier.js';
import { addCue, addUncue, addPlay } from '../shared/cue.js';
import { Room } from './room.js';
import { GatefoldJacket } from './gatefold.js';
import { CameraRig } from './cameraRig.js';
import { PITCH, LEAN_DEG, JACKET_REST, CONSOLE, LEDGE, OPEN, POCKET, CAM, SPOT_OFFSET, consoleCentreX } from './layout.js';

export const STATE = {
  BROWSE: 'browse', OPENING: 'opening', CONFIRM: 'confirm', CLOSING: 'closing', TRANSFER: 'transfer',
  CUEING: 'cueing', READY: 'ready', PLAYING: 'playing', LEAVING: 'leaving', EJECTING: 'ejecting',
};
const SPREAD_W = JACKET.size * 2 - 5, SPREAD_H = JACKET.size;
const ARC = { up: 60, out: 150 };
const X_AXIS = new THREE.Vector3(1, 0, 0);
// the picture light's direction in the record's own frame (y = the disc's axis): lying flat, and standing upright
const _sd = new THREE.Vector3(SPOT_OFFSET.x, SPOT_OFFSET.y, SPOT_OFFSET.z).normalize();
const LIGHT_FLAT = { th: Math.acos(_sd.y), ph: Math.atan2(_sd.z, _sd.x) };
const LIGHT_UP = (() => { const l = _sd.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); let ph = Math.atan2(l.z, l.x); if (ph < LIGHT_FLAT.ph) ph += 2 * Math.PI; return { th: Math.acos(l.y), ph }; })();      // the record's flight between the pocket and the platter: Bézier control above and in front of the midpoint

export class RackView {
  constructor(app) {
    this.app = app;
    this.id = 'rack';
    this.el = app.el;
    this.stage = app.stage;
    this.audio = app.audio;
    this.reduced = app.reduced;
    this.scene = new THREE.Scene();
    this.ctx = app.makeContext(this.scene);
    this.state = STATE.BROWSE;
    this.built = false;
    this.queuedStep = 0;
    this.omega = 0; this.spinAngle = 0;
    this.layoutMode = null;
    this.wheel = { acc: 0, lockUntil: 0, lastEvent: 0 };
  }
  get index() { return this.app.index; }
  set index(v) { this.app.index = v; }
  get booted() { return this.app.booted; }

  // ---------------------------------------------------------------- build / enter / leave
  async build(assets) {
    if (this.built) return;
    const n = RECORDS.length;
    this.room = new Room(this.ctx, assets, n);
    // turntable on the console; its group is the record's parent so the cue runs in local mm
    this.ttGroup = new THREE.Group();
    this.ttGroup.position.set(consoleCentreX(n), CONSOLE.top, CONSOLE.depth / 2);
    this.scene.add(this.ttGroup);
    this.ttGroup.updateMatrixWorld(true);
    const ttCtx = { ...this.ctx, scene: this.ttGroup };
    this.turntable = new Turntable(ttCtx);
    this.record = new Record(ttCtx, { labels: assets.labels });
    this.record.setVisible(false);
    // the record reflects an even, dim room — it reads the same standing in a jacket,
    // turning in flight and lying on the platter (no strip lights sliding across it)
    for (const m of [this.record.top.material, this.record.bottom.material, this.record.side.material, this.record.labelMat]) { m.envMap = assets.envEven; m.needsUpdate = true; }
    this.recordFree = true;                 // parented to the turntable group (false: in a jacket's pocket)
    this.pocket = { dy: 0, dz: 0 };
    // what the turntable framing centres: the plinth, its feet, and the counterweight (the highest point at the back)
    const P = T.plinth, g0 = this.ttGroup.position;
    this.ttPoints = [];
    for (const x of [P.x0, P.x1]) for (const y of [0, P.top]) for (const z of [P.z0, P.z1]) this.ttPoints.push(new THREE.Vector3(g0.x + x, g0.y + y, g0.z + z));
    for (const x of [240, 270]) for (const z of [-202, -170]) this.ttPoints.push(new THREE.Vector3(g0.x + x, g0.y + 108, g0.z + z));
    this.fx = 0; this.fy = 0; this.followAnchor = null;
    this.platter = new THREE.Vector3(this.ttGroup.position.x, this.ttGroup.position.y + T.recordTop - 2, this.ttGroup.position.z);
    // jackets
    const shared = { coverEnv: assets.coverEnvFront, film: assets.film };
    this.jackets = RECORDS.map((r, i) => {
      const j = new GatefoldJacket(r, assets.covers.get(r.id), shared);
      this.scene.add(j.group, j.shadow.mesh);
      j.shadow.surfaceY = 1400;
      this.restPose(j, i);
      return j;
    });
    this.rig = new CameraRig(this.stage, { reduced: this.reduced, hover: this.app.hover });
    this.camera = this.rig.camera;
    this.rig.resize(this.stage.width, this.stage.height);
    this.bindRackInput();
    this.state = STATE.BROWSE;              // the state only: enter() applies it to the shared DOM (this may be an idle prebuild)
    this.poseBrowse(true);
    await this.app.warmUp(this.scene, this.camera, [this.record.group]);
    // inner-face textures and the wall are this view's own — upload now
    const r = this.stage.renderer;
    for (const j of this.jackets) for (const m of [j.mats.front, j.mats.back]) if (m.map) { try { r.initTexture(m.map); } catch (e) { /* on first use */ } }
    this.built = true;
  }
  restPose(j, i) {
    j.setAngle(0);
    j.setPose({ x: i * PITCH, y: JACKET_REST.y, z: JACKET_REST.z, lean: LEAN_DEG, lift: 0, forward: 0, shift: 0, tip: 0 });
    j.setVisible(true);
  }
  enter(index) {
    this.index = index;
    this.stage.setView(this.scene, this.camera, (w, h) => this.fit(w, h));
    this.record.setRecord(RECORDS[this.index]);
    this.setState(STATE.BROWSE);
    this.poseBrowse(true);
    this.el.rackUi.hidden = false;
    this.el.hit.hidden = false;
    this.rig.input();
    this.rig.allowFloat(true);
    this.layoutOverlay();
  }
  leave() {
    this.rig.allowFloat(false);
    this.rig.releaseHold();
    this.el.rackUi.hidden = true;
    this.hidePrompt(true);
    this.hideConfirm(true);
  }
  reset() {
    cancelAllTweens();
    this.audio.stopAll();
    this.stage.release('spin');
    this.omega = 0;
    this.hidePrompt(true); this.hideConfirm(true);
    this.setState(STATE.BROWSE);
    this.poseBrowse(true);
  }

  // ---------------------------------------------------------------- framing
  fit(w, h) {
    this.rig.resize(w, h);
    this.layoutMode = w / h >= 1 ? 'landscape' : 'portrait';
    this._promptH = 0;
    if (this.state === STATE.BROWSE) this.rig.set(...this.closeUp(this.index));
    else if (this.state === STATE.CONFIRM) this.rig.set(...this.openUp(this.index));
    else if (this.state === STATE.READY) this.rig.set(...this.turntableFrame());
  }
  resize() { this.fit(this.stage.width, this.stage.height); }
  /** [pos, target] of the close-up on jacket i. */
  closeUp(i) {
    const d = this.rig.closeDistance(PITCH, JACKET.size);
    const t = new THREE.Vector3(i * PITCH, JACKET_REST.y - CAM.raise * this.rig.frameHeight(d), JACKET_REST.z);
    return [new THREE.Vector3(t.x, t.y + CAM.above, t.z + d), t];
  }
  /** [pos, target] framing the open spread of jacket i. */
  openUp(i) {
    const d = this.rig.openDistance(SPREAD_W, SPREAD_H);
    const t = new THREE.Vector3(i * PITCH + 2, JACKET_REST.y + OPEN.lift - CAM.raiseOpen * this.rig.frameHeight(d), JACKET_REST.z + OPEN.forward);
    return [new THREE.Vector3(t.x, t.y + CAM.above, t.z + d), t];
  }
  /**
   * [pos, target] for the turntable: 52° elevation, the plinth across 64% of the width
   * (78% portrait), the plinth's centre on the vertical centre line, and the turntable
   * plus the prompt under it centred top-to-bottom as one block.
   */
  turntableFrame() {
    const g = this.ttGroup.position, P = T.plinth, rig = this.rig, H = this.stage.height;
    let d = rig.widthDistance(P.x1 - P.x0, rig.aspect < 1 ? CAM.plinthFillPortrait : CAM.plinthFill);
    const el = THREE.MathUtils.degToRad(CAM.turntableElevDeg);
    const back = new THREE.Vector3(0, Math.sin(el), Math.cos(el)), up = new THREE.Vector3(0, Math.cos(el), -Math.sin(el));
    const target = new THREE.Vector3(g.x + (P.x0 + P.x1) / 2, g.y + P.top, g.z + (P.z0 + P.z1) / 2);
    const pos = new THREE.Vector3(), block = CAM.promptGap + this.promptHeight();
    for (let k = 0; k < 6; k++) {
      pos.copy(target).addScaledVector(back, d);
      const r = rig.rectFrom(pos, target, this.ttPoints);
      const hPx = r.bottom - r.top;
      if (hPx + block > 0.84 * H) { d *= hPx / Math.max(40, 0.84 * H - block); continue; }    // a very wide screen: step back until it fits
      const err = (r.top + r.bottom + block) / 2 - H / 2;          // px the block's centre sits below the screen's
      if (Math.abs(err) < 0.2) break;
      target.addScaledVector(up, -err * (rig.frameHeight(d) / H));
    }
    pos.copy(target).addScaledVector(back, d);
    return [pos, target];
  }
  /** The READY prompt's height in px (measured once per layout). */
  promptHeight() {
    if (this._promptH) return this._promptH;
    const p = this.el.prompt, was = p.hidden;
    if (was) { p.style.visibility = 'hidden'; p.hidden = false; }
    const h = p.offsetHeight;
    if (was) { p.hidden = true; p.style.visibility = ''; }
    return (this._promptH = h || 78);
  }

  // ---------------------------------------------------------------- the record's parent
  /** The record stands in jacket j's pocket, parented to it: it leans, lifts and turns with the jacket. dy up, dz toward the camera. */
  pocketRecord(j, dy, dz, force = false) {
    if (this.recordFree && !force) return;          // already handed to the turntable: a late tween frame must not pull it back
    const g = this.record.group;
    if (g.parent !== j.group) j.group.add(g);
    this.recordFree = false;
    g.position.set(j.recordHome.x, j.recordHome.y + dy, j.recordHome.z + dz);
    g.rotation.set(Math.PI / 2, 0, 0);
    this.pocket.dy = dy; this.pocket.dz = dz;
    this.record.setShadowVisible(false);
  }
  /** Hand the record to the turntable group, keeping its world pose. */
  freeRecord() {
    const g = this.record.group;
    if (g.parent !== this.ttGroup) { g.parent.updateWorldMatrix(true, false); this.ttGroup.attach(g); }
    this.recordFree = true;
  }
  /** Inside a closed jacket the record is hidden; it shows once the front board has swung clear. */
  revealRecord(j) { if (!this.recordFree) this.record.group.visible = j.angle < POCKET.revealDeg; }
  recordWorld(out = this._rw || (this._rw = new THREE.Vector3())) { return this.record.group.getWorldPosition(out); }
  /**
   * The light on the record in flight. Held at one angle to the disc's axis the whole way
   * (≈46°, so the same light falls on its face), it swings round the disc's left side
   * as the disc turns between upright and flat. With the light fixed in the room instead,
   * the turning disc passes through the light's mirror angle and a glare sweeps over it.
   */
  lightRecord() {
    const a = this.record.group.rotation.x, s = THREE.MathUtils.clamp(a / (Math.PI / 2), 0, 1);
    const th = LIGHT_FLAT.th + (LIGHT_UP.th - LIGHT_FLAT.th) * s, ph = LIGHT_FLAT.ph + (LIGHT_UP.ph - LIGHT_FLAT.ph) * s;
    const dir = (this._ld || (this._ld = new THREE.Vector3())).set(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
    dir.applyAxisAngle(X_AXIS, a);                // the disc's frame → the room (it only ever turns about x)
    this.room.focusFrom(this.recordWorld(), dir);
  }

  // ---------------------------------------------------------------- poses
  poseBrowse(snap = false) {
    this.jackets.forEach((j, i) => this.restPose(j, i));
    this.freeRecord();
    this.record.setVisible(false);
    this.record.setShadowVisible(true);
    this.record.setSpin(0);
    this.record.place(0, T.recordTop - T.recordThick, 0, { surfaceY: T.matTop, rotY: 0 });
    this.record.group.rotation.x = 0;
    const tt = this.turntable;
    tt.setArmAngle(0); tt.setArmY(T.tonearm.restY); tt.setCueLever(0); tt.setPlatterAngle(0); tt.setKeyPress('play', 0); tt.setLed(0.4);
    this.spinAngle = 0; this.omega = 0;
    const [pos, target] = this.closeUp(this.index);
    if (snap) this.rig.set(pos, target);
    this.room.focus(this.index * PITCH, JACKET_REST.y, JACKET_REST.z);
    this.updateInfo();
    this.stage.markShadowDirty(); this.stage.requestRender();
  }

  // ---------------------------------------------------------------- state / overlay
  setState(s) {
    this.state = s;
    this.el.stage.dataset.state = s;
    this.app.onViewState(this, s);
    const browse = s === STATE.BROWSE;
    this.el.hit.disabled = !browse;
    for (const el of [this.el.rackInfo, this.el.rackPrev, this.el.rackNext]) el.classList.toggle('is-out', !browse);
    this.updateArrows();
    this.el.playHit.hidden = s !== STATE.READY;
    if (s === STATE.READY) this.showPrompt(); else if (s !== STATE.CUEING) this.hidePrompt(s === STATE.PLAYING);
    if (s === STATE.READY) this.startLed(); else this.stopLed();
    if (this.rig) this.rig.allowFloat(browse || s === STATE.CONFIRM || s === STATE.READY);
  }
  updateArrows() {
    const browse = this.state === STATE.BROWSE;
    this.el.rackPrev.disabled = !browse || this.index === 0;
    this.el.rackNext.disabled = !browse || this.index === RECORDS.length - 1;
  }
  updateInfo() {
    const r = RECORDS[this.index], e = this.el;
    e.rackEyebrow.textContent = r.status === 'available' ? r.eyebrow : 'Coming soon';
    e.rackEyebrow.classList.toggle('pill--soon', r.status !== 'available');
    e.rackMeta.textContent = r.status === 'available' ? r.meta : 'In preparation';
    e.rackTitle.textContent = r.status === 'available' ? r.title : 'Coming Soon';
    e.rackIndex.textContent = `${String(this.index + 1).padStart(2, '0')} / ${String(RECORDS.length).padStart(2, '0')}`;
    if (r.pdf) { e.rackPdf.hidden = false; e.rackPdf.href = r.pdf; e.rackPdf.setAttribute('aria-label', `Download PDF: ${r.short}`); } else e.rackPdf.hidden = true;
    e.hit.setAttribute('aria-label', r.status === 'available' ? `Open ${r.title}` : 'Coming soon');
    e.confirmTitle.textContent = r.title;
    this.updateArrows();
    this.app.rememberIndex();
  }
  swapInfo(dir) {
    const el = this.el.rackInfo;
    if (this.reduced || !el.animate) { this.updateInfo(); return; }
    if (this.infoAnim) this.infoAnim.cancel();
    // a crossfade in place: the text never slides
    const out = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: EASE.ui.css, fill: 'forwards' });
    this.infoAnim = out;
    out.onfinish = () => {
      this.updateInfo();
      const inn = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: EASE.reveal.css, fill: 'forwards' });
      this.infoAnim = inn;
      inn.onfinish = () => { inn.cancel(); this.infoAnim = null; };
    };
  }
  announce(text) { this.app.announce(text); }

  /**
   * DOM controls over their 3D anchors, from the base pose. The idle float and the
   * pointer parallax then carry them with the scene (followOverlay), so nothing the
   * float moves ever slides under, or away from, its label.
   */
  layoutOverlay() {
    const st = this.stage, e = this.el, j = this.jackets[this.index], rig = this.rig;
    const pos = rig.pos, tgt = rig.target;
    const rect = (pts, p = pos, t = tgt) => rig.rectFrom(p, t, pts);
    const B = (this.base = {});
    // the closed cover's front face
    const cr = j.coverRect(), h = cr.half, lean = THREE.MathUtils.degToRad(cr.lean), c = cr.centre;
    const corner = (sx, sy) => new THREE.Vector3(c.x + sx * h, c.y + sy * h * Math.cos(lean), c.z - sy * h * Math.sin(lean));
    const pr = rect([corner(-1, 1), corner(1, 1), corner(-1, -1), corner(1, -1)]);
    this.hitRect = pr;
    B.hit = [pr.left, pr.top];
    e.hit.style.width = (pr.right - pr.left).toFixed(1) + 'px'; e.hit.style.height = (pr.bottom - pr.top).toFixed(1) + 'px';
    // title row 28 px under the jacket
    e.rackInfo.style.setProperty('--info-w', Math.max(220, Math.min(420, pr.right - pr.left)) + 'px');
    e.rackInfo.style.left = ((pr.left + pr.right) / 2).toFixed(1) + 'px'; e.rackInfo.style.top = (pr.bottom + 28).toFixed(1) + 'px';
    // edge keys, vertically centred on the jacket
    const cy = (pr.top + pr.bottom) / 2, inset = this.layoutMode === 'portrait' ? 10 : 24;
    B.prev = [inset, cy - 24]; B.next = [st.width - inset - 48, cy - 24];
    // confirm panel under the open spread
    const [op, ot] = this.openUp(this.index);
    const sb = rig.projectFrom(op, ot, [new THREE.Vector3(ot.x, JACKET_REST.y + OPEN.lift - SPREAD_H / 2, ot.z)])[0];
    e.confirm.style.left = sb.x.toFixed(1) + 'px'; e.confirm.style.top = Math.min(sb.y + 24, st.height - 130).toFixed(1) + 'px';
    // READY: the prompt 16 px under the turntable's lowest edge, centred on the plinth; the play-key target
    const [tp, tt] = this.turntableFrame();
    const tr = rect(this.ttPoints, tp, tt), g = this.ttGroup.position, P = T.plinth;
    const mid = rig.projectFrom(tp, tt, [new THREE.Vector3(g.x + (P.x0 + P.x1) / 2, g.y + P.top, g.z + P.z1)])[0];
    this.ttRect = tr;
    B.prompt = [mid.x, Math.min(tr.bottom + CAM.promptGap, st.height - this.promptHeight() - 8)];
    const k = this.turntable.keys.play.rect;
    const kr = rect([new THREE.Vector3(g.x + k.x0, g.y + k.y, g.z + k.z0), new THREE.Vector3(g.x + k.x1, g.y + k.y, g.z + k.z0), new THREE.Vector3(g.x + k.x0, g.y + k.y, g.z + k.z1), new THREE.Vector3(g.x + k.x1, g.y + k.y, g.z + k.z1)], tp, tt);
    const w = Math.max(44, kr.right - kr.left), hh = Math.max(44, kr.bottom - kr.top);
    B.play = [(kr.left + kr.right) / 2 - w / 2, (kr.top + kr.bottom) / 2 - hh / 2];
    e.playHit.style.width = w + 'px'; e.playHit.style.height = hh + 'px';
    // what the float is measured on: the jacket, the open spread, or the turntable
    const s = this.state;
    this.followAnchor = s === STATE.READY || s === STATE.CUEING ? tt.clone()
      : s === STATE.CONFIRM || s === STATE.OPENING ? ot.clone() : c.clone();
    this.fx = 0; this.fy = 0; this._placed = false;
    this.placeOverlay();
    this.followOverlay(true);
    if (this.app.debug) this.checkInvariants();
  }
  /**
   * Write the overlay. Everything you can read stays exactly where it was laid out —
   * the title row, the edge keys, the confirm panel, the prompt never move with the
   * float. Only the two invisible click targets (the jacket, the play key) follow it,
   * so a click still lands on what it looks like it lands on.
   */
  placeOverlay() {
    const e = this.el, B = this.base, dx = this.fx, dy = this.fy;
    if (!B) return;
    const t = (x, y) => `translate(${(x + dx).toFixed(1)}px, ${(y + dy).toFixed(1)}px)`;
    e.hit.style.transform = t(...B.hit);
    e.playHit.style.transform = t(...B.play);
    if (this._placed) return;                       // the text: written once per layout, never per frame
    this._placed = true;
    e.rackInfo.style.translate = '';
    e.rackPrev.style.transform = `translate(${B.prev[0]}px, ${B.prev[1].toFixed(1)}px)`;
    e.rackNext.style.transform = `translate(${B.next[0].toFixed(1)}px, ${B.next[1].toFixed(1)}px)`;
    e.confirm.style.transform = '';
    e.prompt.style.transform = `translate(${B.prompt[0].toFixed(1)}px, ${B.prompt[1].toFixed(1)}px) translate(-50%, 0)`;
  }
  /** Per frame: carry the overlay with the float and the parallax (a ¼ px dead band). */
  followOverlay(force = false) {
    if (!this.followAnchor || !this.base) return;
    this.camera.updateMatrixWorld();
    const d = this.rig.liveDelta(this.followAnchor, this._fd || (this._fd = { x: 0, y: 0 }));
    if (!force && Math.abs(d.x - this.fx) < 0.25 && Math.abs(d.y - this.fy) < 0.25) return;
    this.fx = d.x; this.fy = d.y;
    this.placeOverlay();
  }

  showPrompt() { const p = this.el.prompt; p.hidden = false; p.classList.remove('is-out'); requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('is-in'))); }
  hidePrompt(quick) { const p = this.el.prompt; if (p.hidden) return; p.classList.remove('is-in'); p.classList.add('is-out'); setTimeout(() => { p.hidden = true; p.classList.remove('is-out'); }, quick ? 200 : 280); }
  showConfirm() { const c = this.el.confirm; c.hidden = false; c.classList.remove('is-out'); requestAnimationFrame(() => requestAnimationFrame(() => { c.classList.add('is-in'); this.el.confirmGo.focus({ preventScroll: true }); })); }
  hideConfirm(quick) { const c = this.el.confirm; if (c.hidden) return; c.classList.remove('is-in'); c.classList.add('is-out'); setTimeout(() => { c.hidden = true; c.classList.remove('is-out'); }, quick ? 0 : 200); }
  startLed() {
    if (this.ledTween) return;
    const pulse = (up) => {
      this.ledTween = tween({ from: up ? 0.4 : 1.6, to: up ? 1.6 : 0.4, duration: 1600, ease: EASE.ui, ambient: true, onUpdate: (v) => this.turntable.setLed(v) })
        .then(() => { if (this.state === STATE.READY && this.ledTween) pulse(!up); });
    };
    pulse(true);
  }
  stopLed() { this.ledTween = null; this.turntable.setLed(0.4); }

  // ---------------------------------------------------------------- per frame
  frame(dt, now) {
    if (this.omega > 0) { this.spinAngle += this.omega * dt; this.turntable.setPlatterAngle(this.spinAngle); this.record.setSpin(this.spinAngle); }
    this.rig.frame(dt, now);
    this.followOverlay();
    // The idle float is a slow drift (≤ ~10 px/s): it renders at 30 fps, half the GPU work
    // while the page sits idle. Anything else that moves — a glide, the parallax, a tween —
    // runs at the full frame rate.
    if (!this.stage.lite) {
      const r = this.rig, driftOnly = r.floatWeight.x > 0.02 && !this.anim && !r.moving && r.par.x.settled && r.par.y.settled && !tweenActivity().busy;
      this.stage.renderEvery = driftOnly ? 2 : 1;
    }
  }
  floatInfo() { return this.rig ? this.rig.floatInfo() : ''; }

  // ---------------------------------------------------------------- input
  bindRackInput() {
    const e = this.el, st = e.stage;
    const input = () => this.rig.input();
    for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, () => { if (this.app.view === this) input(); }, { passive: true });
    window.addEventListener('pointermove', (ev) => {
      if (this.app.view !== this) return;
      this.rig.setParallax((ev.clientX / innerWidth) * 2 - 1, (ev.clientY / innerHeight) * 2 - 1);
    }, { passive: true });
    document.addEventListener('mouseleave', () => this.rig.setParallax(0, 0));
    st.addEventListener('wheel', (ev) => {
      if (this.app.view !== this || this.state !== STATE.BROWSE) return;
      const now = performance.now(), w = this.wheel;
      if (now - w.lastEvent > 180) { w.acc = 0; w.lockUntil = 0; }
      w.lastEvent = now;
      if (now < w.lockUntil) { ev.preventDefault(); return; }
      const k = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? innerHeight : 1;
      w.acc += (ev.deltaX + ev.deltaY) * k;
      if (Math.abs(w.acc) >= 60) {
        const step = Math.sign(w.acc);
        w.acc = 0; w.lockUntil = now + 1e9;        // locked until the burst ends (180 ms of silence)
        const target = this.index + step;
        if (target >= 0 && target < RECORDS.length) { ev.preventDefault(); this.go(step); }
      }
    }, { passive: false });
    e.hit.addEventListener('click', () => { if (this.app.view === this) this.select(); });
    st.addEventListener('pointerdown', (ev) => {
      // click outside the open spread and its panel = Back
      if (this.app.view !== this || this.state !== STATE.CONFIRM) return;
      if (e.confirm.contains(ev.target) || e.switcher.contains(ev.target) || e.sound.contains(ev.target)) return;
      this.back();
    });
  }

  // ---------------------------------------------------------------- browse
  go(step) {
    if (this.state !== STATE.BROWSE) return;
    if (this.navBusy) { this.queuedStep = Math.sign(step); return; }
    const target = Math.max(0, Math.min(RECORDS.length - 1, this.index + step));
    if (target === this.index) return;
    this.navBusy = true;
    const dir = Math.sign(target - this.index);
    this.index = target;
    this.record.setRecord(RECORDS[target]);
    this.app.rememberIndex();
    this.updateArrows();
    this.announce(`Report ${target + 1} of ${RECORDS.length}: ${RECORDS[target].status === 'available' ? RECORDS[target].title : 'Coming soon'}`);
    this.swapInfo(dir);
    const [pos, tgt] = this.closeUp(target);
    this.room.focus(target * PITCH, JACKET_REST.y, JACKET_REST.z);
    let done;
    if (this.reduced) {
      done = this.crossfade(() => { this.rig.set(pos, tgt); });
    } else {
      this.anim = true;
      const d = this.rig.closeDistance(PITCH, JACKET.size);
      const light = (u) => this.room.focus((target - dir) * PITCH + dir * PITCH * u, JACKET_REST.y, JACKET_REST.z);
      done = Promise.all([
        this.rig.moveTo(pos, tgt, { duration: CAM.glide, easePos: EASE.glide, easeTarget: EASE.glide, bump: CAM.bump * d, lead: CAM.lead }),
        tween({ from: 0, to: 1, duration: CAM.glide, ease: EASE.glide, onUpdate: light }),
      ]);
    }
    done.then(() => {
      this.anim = false; this.navBusy = false;
      this.rig.set(pos, tgt);
      this.layoutOverlay();
      if (this.queuedStep) { const q = this.queuedStep; this.queuedStep = 0; this.go(q); }
    });
  }

  // ---------------------------------------------------------------- open / back
  async select() {
    if (this.state !== STATE.BROWSE || this.navBusy) return;
    const rec = RECORDS[this.index], j = this.jackets[this.index];
    if (rec.status !== 'available') {
      this.announce('Coming soon');
      this.audio.play('jacket-pick');
      if (!this.reduced) {
        await tween({ from: 0, to: 4, duration: 220, ease: EASE.ui, onUpdate: (v) => j.setPose({ shift: v }) });
        await tween({ from: 4, to: 0, duration: 220, ease: EASE.ui, onUpdate: (v) => j.setPose({ shift: v }) });
      }
      return;
    }
    this.setState(STATE.OPENING);
    this.el.hit.blur();
    this.record.setRecord(rec);
    this.pocketRecord(j, 0, 0, true);
    this.record.setVisible(true);
    this.revealRecord(j);
    if (this.reduced) {
      await this.crossfade(() => { this.poseOpen(j); });
      this.setState(STATE.CONFIRM); this.showConfirm(); this.announce('Jacket open. Go to the report?'); this.layoutOverlay();
      return;
    }
    this.anim = true;
    const dirty = () => this.stage.markShadowDirty();
    const [pos, tgt] = this.openUp(this.index);
    const s = sequence();
    // the opening is silent (Anson, round 4): no pick-up click, no hinge
    // O1 taken hold of: the top tips 4 mm off the wall, pivoting on the bottom edge
    s.at(0, 110, { from: 0, to: 4, ease: EASE.ui, onUpdate: (v) => { j.setPose({ tip: v }); dirty(); } });
    // O2a straight up first, until the bottom edge has cleared the ledge lip …
    s.at(110, 400, { from: 0, to: 1, ease: EASE.reveal, onUpdate: (v) => { j.setPose({ tip: 4 * (1 - v), lift: OPEN.lift * v }); dirty(); } });
    // O2b … then toward the camera, to the right and upright
    s.at(340, 820, { from: 0, to: 1, ease: EASE.reveal, onUpdate: (v) => { j.setPose({ forward: OPEN.forward * v, shift: OPEN.shift * v, lean: LEAN_DEG * (1 - v) }); dirty(); } });
    // O3 camera
    s.call(250, () => this.rig.moveTo(pos, tgt, { duration: 820, easePos: EASE.glide, easeTarget: EASE.glide }));
    // O4 the front board swings open; the record shows once it has swung clear
    s.at(700, 1600, { from: 0, to: OPEN.angleDeg, ease: EASE.mech, onUpdate: (v) => { j.setAngle(v); this.revealRecord(j); dirty(); } });
    // O5 the record rises 6 mm in its pocket — up only: the flap is in front of it
    s.at(1350, 1750, { from: 0, to: POCKET.breath, ease: EASE.reveal, onUpdate: (v) => { this.pocketRecord(j, v, 0); dirty(); } });
    s.call(1550, () => { if (this.state === STATE.OPENING) { this.setState(STATE.CONFIRM); this.showConfirm(); this.layoutOverlay(); this.announce('Jacket open. Go to the report?'); } });
    this.running = s.run();
    await this.running;
    this.running = null; this.anim = false;
    this.layoutOverlay();
  }
  poseOpen(j) {
    j.setPose({ tip: 0, lift: OPEN.lift, forward: OPEN.forward, shift: OPEN.shift, lean: 0 });
    j.setAngle(OPEN.angleDeg);
    this.pocketRecord(j, POCKET.breath, 0, true);
    this.record.setVisible(true);
    this.revealRecord(j);
    this.rig.set(...this.openUp(this.index));
  }

  /**
   * Back to the collection, from wherever the opening got to: the record settles into
   * its pocket, the front board closes, the jacket goes back over the ledge with its
   * lift held (so its bottom edge passes above the lip), then sets down.
   */
  async back() {
    if (this.state !== STATE.CONFIRM && this.state !== STATE.OPENING) return;
    cancelAllTweens();
    this.setState(STATE.CLOSING);
    this.hideConfirm(false);
    const j = this.jackets[this.index];
    if (this.reduced) { await this.crossfade(() => this.poseBrowse(true)); this.setState(STATE.BROWSE); this.layoutOverlay(); return; }
    this.anim = true;
    const dirty = () => this.stage.markShadowDirty();
    const L = (a, b, v) => a + (b - a) * v;
    const a = { ...j.pose }, ang = j.angle, rec = { ...this.pocket };
    const f0 = this.room.at.clone(), f1 = new THREE.Vector3(this.index * PITCH, JACKET_REST.y, JACKET_REST.z), f = new THREE.Vector3();
    const lift = a.forward > 0.5 ? Math.max(a.lift, OPEN.lift * 0.7) : a.lift;   // out over the lip: keep it high enough to pass back over
    const [pos, tgt] = this.closeUp(this.index);
    const s = sequence();
    s.at(0, 260, { from: 0, to: 1, ease: EASE.ui, onUpdate: (v) => { this.pocketRecord(j, L(rec.dy, 0, v), L(rec.dz, 0, v)); } });
    s.call(120, () => this.audio.play('gatefold-close'));
    s.at(80, 760, { from: 0, to: 1, ease: EASE.mech, onUpdate: (v) => { j.setAngle(L(ang, 0, v)); this.revealRecord(j); dirty(); } });
    s.at(0, 1000, { from: 0, to: 1, ease: EASE.ui, onUpdate: (v) => { this.room.focusOn(f.lerpVectors(f0, f1, v)); } });
    s.call(520, () => this.rig.moveTo(pos, tgt, { duration: 780, easePos: EASE.glide, easeTarget: EASE.glide }));
    s.at(700, 1060, { from: 0, to: 1, ease: EASE.ui, onUpdate: (v) => {
      j.setPose({ forward: L(a.forward, 0, v), shift: L(a.shift, 0, v), lean: L(a.lean, LEAN_DEG, v), lift: L(a.lift, lift, v), tip: 0 }); dirty();
    } });
    s.at(1060, 1320, { from: lift, to: 0, ease: EASE.reveal, onUpdate: (v) => { j.setPose({ lift: v }); dirty(); } });
    await s.run();
    this.anim = false;
    this.record.setVisible(false);
    this.poseBrowse(true);
    this.setState(STATE.BROWSE);
    this.layoutOverlay();
    this.announce(`Report ${this.index + 1} of ${RECORDS.length}: ${RECORDS[this.index].title}`);
  }

  // ---------------------------------------------------------------- go to report
  async confirm() {
    if (this.state !== STATE.CONFIRM) return;
    const rec = RECORDS[this.index], j = this.jackets[this.index], tt = this.turntable, rc = this.record, st = this.stage;
    this.setState(STATE.TRANSFER);
    this.hideConfirm(false);
    this.el.confirmGo.blur();
    const [tp, tg] = this.turntableFrame();
    if (this.reduced) {
      await this.crossfade(() => { this.restPose(j, this.index); this.poseReady(); this.rig.set(tp, tg); });
      this.setState(STATE.READY); this.layoutOverlay(); this.announce('Record loaded. Press Play to open the report.');
      return;
    }
    this.anim = true;
    const dirty = () => st.markShadowDirty();
    const L = (a, b, v) => a + (b - a) * v;
    const recRest = T.recordTop - T.recordThick;
    const top = POCKET.breath + POCKET.rise;
    const s = sequence();
    // the picture light leaves the jacket and stays on the record — one offset, one light level, the whole way down
    const f0 = this.room.at.clone(), f = new THREE.Vector3();
    s.at(0, 700, { from: 0, to: 1, ease: EASE.ui, onUpdate: (v) => { this.room.focusOn(f.lerpVectors(f0, this.recordWorld(), v)); } });
    // T2a the record rises straight up until its lower edge clears the flap …
    s.call(0, () => this.audio.play('sleeve-out', { duration: 0.7, envelope: velocityEnvelope(EASE.mech, 24) }));
    s.at(0, 420, { from: POCKET.breath, to: top, ease: EASE.mech, onUpdate: (v) => { this.pocketRecord(j, v, this.pocket.dz); dirty(); } });
    // T2b … then comes toward the camera
    s.at(320, 680, { from: 0, to: POCKET.out, ease: EASE.mech, onUpdate: (v) => { this.pocketRecord(j, this.pocket.dy, v); dirty(); } });
    // T3 camera travels down to the turntable, bulging toward +z
    // (position and look-at on the record's own curve, so the record stays in frame the whole way down)
    s.call(640, () => this.rig.moveTo(tp, tg, { duration: 1760, easePos: EASE.mech, easeTarget: EASE.mech, bulge: new THREE.Vector3(0, 0, 250) }));
    // T4 record flies to 120 mm above the spindle, turning flat (handed to the turntable group first)
    let p0 = null;
    s.at(700, 2300, { from: 0, to: 1, ease: EASE.mech, onUpdate: (v, p) => {
      if (!p0) { this.freeRecord(); p0 = rc.group.position.clone(); }
      const end = new THREE.Vector3(0, recRest + 120, 0);
      const ctrl = new THREE.Vector3((p0.x + end.x) / 2, (p0.y + end.y) / 2 + ARC.up, (p0.z + end.z) / 2 + ARC.out);   // a shallow arc the camera can keep in frame
      rc.group.position.set(bez(p0.x, ctrl.x, end.x, v), bez(p0.y, ctrl.y, end.y, v), bez(p0.z, ctrl.z, end.z, v));
      rc.group.rotation.set((Math.PI / 2) * (1 - EASE.ui(p)), 0, 0);
      if (p > 0.6) { rc.setShadowVisible(true); rc.shadow.surfaceY = T.matTop; rc.shadow.update(rc.group.position.x, rc.group.position.z, rc.group.position.y - T.matTop); }
      this.lightRecord();
      dirty();
    } });
    // T4b settle to 1.5 mm above the mat, T5 drop
    s.at(2300, 2480, { from: 0, to: 1, ease: EASE.ui, onUpdate: lazyY((a, v) => { rc.place(0, a + (recRest + 1.5 - a) * v, 0, { surfaceY: T.matTop, rotY: 0 }); this.lightRecord(); }, () => rc.group.position.y) });
    s.call(2480, () => this.audio.play('record-set'));
    s.at(2480, 2660, { from: recRest + 1.5, to: recRest, ease: EASE.reveal, onUpdate: (v) => { rc.place(0, v, 0, { surfaceY: T.matTop, rotY: 0 }); this.lightRecord(); dirty(); } });
    // T6 off-screen, once the record is well below it: the jacket closes, goes back over the lip, sets down
    s.at(1900, 2400, { from: OPEN.angleDeg, to: 0, ease: EASE.mech, onUpdate: (v) => { j.setAngle(v); } });
    s.at(2400, 2750, { from: 0, to: 1, ease: EASE.ui, onUpdate: (v) => { j.setPose({ forward: L(OPEN.forward, 0, v), shift: L(OPEN.shift, 0, v), lean: L(0, LEAN_DEG, v), lift: OPEN.lift, tip: 0 }); } });
    s.at(2750, 3000, { from: OPEN.lift, to: 0, ease: EASE.reveal, onUpdate: (v) => { j.setPose({ lift: v }); } });
    // cue (S8–S11) from the settle
    addCue(s, 2660, { turntable: tt, audio: this.audio, dirty, prefetch: () => this.app.prefetch(rec.href),
      onReady: () => { if (this.state === STATE.CUEING) { this.setState(STATE.READY); this.layoutOverlay(); this.announce('Record loaded. Press Play to open the report.'); } } });
    this.setState(STATE.CUEING);
    this.running = s.run();
    await this.running;
    this.running = null; this.anim = false;
    this.rig.set(tp, tg);
    this.room.focusOn(this.recordWorld());
    if (this.state === STATE.CUEING) { this.setState(STATE.READY); this.announce('Record loaded. Press Play to open the report.'); }
    this.layoutOverlay();
  }
  poseReady() {
    const tt = this.turntable;
    this.freeRecord();
    this.record.group.rotation.set(0, 0, 0);
    this.record.setShadowVisible(true);
    this.record.setVisible(true);
    this.record.place(0, T.recordTop - T.recordThick, 0, { surfaceY: T.matTop, rotY: 0 });
    this.room.focusOn(this.recordWorld());
    tt.setArmAngle(tt.cueAngle); tt.setArmY(T.tonearm.playY); tt.setCueLever(1);
    this.stage.markShadowDirty(); this.stage.requestRender();
  }

  async play() {
    if (this.state !== STATE.READY) return;
    const rec = RECORDS[this.index], tt = this.turntable, st = this.stage;
    this.setState(STATE.PLAYING);
    this.el.play.blur(); this.el.playHit.blur();
    this.audio.play('play-press');
    if (this.reduced) { this.el.fade.classList.add('is-in'); this.audio.fadeOut(0.4); setTimeout(() => this.navigate(rec.href), 400); return; }
    const s = sequence();
    addPlay(s, 0, { turntable: tt, audio: this.audio, stage: st, dirty: () => st.markShadowDirty(), setOmega: (w) => { this.omega = w; },
      onLeaving: () => { this.setState(STATE.LEAVING); this.el.fade.classList.add('is-in'); this.audio.fadeOut(0.6); },
      navigate: () => this.navigate(rec.href) });
    await s.run();
  }
  navigate(href) { this.app.navigate(href); }

  // ---------------------------------------------------------------- eject (READY → BROWSE)
  async eject() {
    if (this.state !== STATE.READY && this.state !== STATE.CUEING) return;
    cancelAllTweens();
    this.setState(STATE.EJECTING);
    this.el.play.blur(); this.el.eject.blur();
    const j = this.jackets[this.index], tt = this.turntable, rc = this.record, st = this.stage;
    if (this.reduced) { await this.crossfade(() => this.poseBrowse(true)); this.setState(STATE.BROWSE); this.layoutOverlay(); return; }
    this.anim = true;
    const dirty = () => st.markShadowDirty();
    const k = 0.75, lazy = (get, apply) => { let a = null; return (v, p) => { if (a === null) a = get(); apply(a, v, p); }; };
    const L = (a, b, v) => a + (b - a) * v;
    const s = sequence();
    let t = addUncue(s, 0, { turntable: tt, audio: this.audio, dirty }, k);
    // the camera rises back to the open spread; the jacket lifts clear of the lip, comes forward and opens —
    // fully open before the record gets anywhere near it
    const [pos, tgt] = this.openUp(this.index);
    s.call(t + 150, () => this.rig.moveTo(pos, tgt, { duration: 1400, easePos: EASE.mech, easeTarget: EASE.mech, bulge: new THREE.Vector3(0, 0, 250) }));   // on the record's curve
    s.at(t, t + 260, { from: 0, to: OPEN.lift, ease: EASE.reveal, onUpdate: (v) => { j.setPose({ lift: v, tip: 0 }); dirty(); } });
    s.at(t + 200, t + 560, { from: 0, to: 1, ease: EASE.ui, onUpdate: (v) => { j.setPose({ forward: OPEN.forward * v, shift: OPEN.shift * v, lean: LEAN_DEG * (1 - v) }); dirty(); } });
    s.at(t + 400, t + 860, { from: 0, to: OPEN.angleDeg, ease: EASE.mech, onUpdate: (v) => { j.setAngle(v); dirty(); } });
    // the record lifts, turns upright and flies to just above its pocket, the light with it
    const top = POCKET.breath + POCKET.rise, home = new THREE.Vector3(), f = new THREE.Vector3();
    let a0 = null;
    s.at(t + 150, t + 1550, { from: 0, to: 1, ease: EASE.mech, onUpdate: (v, p) => {
      if (!a0) { this.freeRecord(); a0 = rc.group.position.clone(); }
      j.group.updateMatrixWorld(true);
      home.set(j.recordHome.x, j.recordHome.y + top, j.recordHome.z + POCKET.out);
      this.ttGroup.worldToLocal(j.group.localToWorld(home));
      const ctrl = new THREE.Vector3((a0.x + home.x) / 2, (a0.y + home.y) / 2 + ARC.up, (a0.z + home.z) / 2 + ARC.out);
      rc.group.position.set(bez(a0.x, ctrl.x, home.x, v), bez(a0.y, ctrl.y, home.y, v), bez(a0.z, ctrl.z, home.z, v));
      rc.group.rotation.set((Math.PI / 2) * EASE.ui(p), 0, 0);
      if (p > 0.3) rc.setShadowVisible(false);
      this.lightRecord();
      dirty();
    } });
    // into the pocket: in toward the back board first (its lower edge still above the flap), then down
    s.call(t + 1550, () => { this.pocketRecord(j, top, POCKET.out, true); this.audio.play('sleeve-out', { duration: 0.5, envelope: velocityEnvelope(EASE.mech, 24) }); });
    s.at(t + 1560, t + 1860, { from: POCKET.out, to: 0, ease: EASE.ui, onUpdate: (v) => { this.pocketRecord(j, this.pocket.dy, v); this.room.focusOn(this.recordWorld()); dirty(); } });
    s.at(t + 1820, t + 2220, { from: top, to: POCKET.breath, ease: EASE.mech, onUpdate: (v) => { this.pocketRecord(j, v, this.pocket.dz); this.room.focusOn(this.recordWorld()); dirty(); } });
    await s.run();
    this.anim = false;
    this.setState(STATE.CONFIRM);
    this.back();
  }

  crossfade(apply) {
    return new Promise((resolve) => {
      this.el.canvas.classList.add('is-xfade');
      setTimeout(() => { apply(); this.stage.render(); this.el.canvas.classList.remove('is-xfade'); setTimeout(resolve, 200); }, 200);
    });
  }

  // ---------------------------------------------------------------- debug
  checkInvariants() {
    const out = [];
    const ok = (c, m) => out.push({ c, m });
    const R = (el) => { if (!el || el.hidden || el.classList.contains('is-out') || getComputedStyle(el).opacity === '0') return null; const r = el.getBoundingClientRect(); return r.width && r.height ? r : null; };
    const hits = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const inView = (r) => !r || (r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5);
    const e = this.el;
    const dom = { prev: R(e.rackPrev), next: R(e.rackNext), title: R(e.rackInfo), confirm: R(e.confirm), prompt: R(e.prompt), switcher: R(e.switcher), sound: R(e.sound) };
    const names = Object.keys(dom);
    let clean = true;
    for (let i = 0; i < names.length; i++) for (let k = i + 1; k < names.length; k++) if (hits(dom[names[i]], dom[names[k]])) { clean = false; ok(false, `${names[i]} overlaps ${names[k]}`); }
    const hr = this.hitRect, jr = this.state === STATE.BROWSE && hr ? { left: hr.left + this.fx, right: hr.right + this.fx, top: hr.top + this.fy, bottom: hr.bottom + this.fy } : null;
    for (const n of names) {
      if (jr && n !== 'title' && hits(dom[n], jr)) { clean = false; ok(false, `${n} overlaps the jacket`); }
      if (jr && n === 'title' && hits(dom[n], jr)) { clean = false; ok(false, 'title overlaps the jacket'); }
      if (!inView(dom[n])) { clean = false; ok(false, `${n} runs off the screen`); }
    }
    if (clean) ok(true, 'no overlay element overlaps another, the jacket or runs off-screen');
    // neighbours off-screen in the close-up
    if (this.state === STATE.BROWSE && jr) {
      const half = JACKET.size / 2, c = this.jackets[this.index].coverRect().centre;
      const nb = [this.index - 1, this.index + 1].filter((i) => i >= 0 && i < RECORDS.length).map((i) => this.stage.project(i * PITCH + (i < this.index ? half : -half), c.y, c.z, {}));
      const off = nb.every((p) => p.x < 0 || p.x > innerWidth);
      ok(off || this.rig.aspect > 2.4, 'neighbours off-screen');
    }
    // the turntable shot: plinth on the centre line, turntable + prompt centred as one block, the prompt clear of the turntable
    if (this.state === STATE.READY && this.ttRect && dom.prompt) {
      const tr = this.ttRect, pr = dom.prompt, W = this.stage.width, H = this.stage.height;
      const g = this.ttGroup.position, P = T.plinth;
      const [tp, tt] = this.turntableFrame();
      const mid = this.rig.projectFrom(tp, tt, [new THREE.Vector3(g.x + (P.x0 + P.x1) / 2, g.y + P.top, g.z + (P.z0 + P.z1) / 2)])[0];
      ok(Math.abs(mid.x - W / 2) < 1.5, `plinth centred (${(mid.x - W / 2).toFixed(1)} px off)`);
      ok(Math.abs((pr.left + pr.right) / 2 - W / 2) < 2, `prompt centred (${((pr.left + pr.right) / 2 - W / 2).toFixed(1)} px off)`);
      const blockMid = (tr.top + pr.bottom) / 2;
      ok(Math.abs(blockMid - H / 2) < 6, `turntable + prompt centred top-to-bottom (${(blockMid - H / 2).toFixed(1)} px off)`);
      ok(pr.top >= tr.bottom + this.fy + 4, 'prompt clear of the turntable (with the float)');
    }
    ok(document.documentElement.scrollHeight <= innerHeight + 1, 'no page scroll');
    for (const t of this.turntable.checks) ok(t.cond, t.msg);
    this.invariants = out;
    return out;
  }
}

// ---------------------------------------------------------------- debug: physical clearance
// Oriented boxes (centre, three unit axes, half-extents) from meshes, tested with the
// separating-axis theorem. The record is its disc's bounding square.
const _m = new THREE.Matrix4();
function obbOf(mesh) {
  const g = mesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
  const bb = g.boundingBox, c = new THREE.Vector3(), h = new THREE.Vector3();
  bb.getCenter(c); bb.getSize(h).multiplyScalar(0.5);
  mesh.updateWorldMatrix(true, false);
  _m.copy(mesh.matrixWorld);
  const sx = new THREE.Vector3().setFromMatrixColumn(_m, 0), sy = new THREE.Vector3().setFromMatrixColumn(_m, 1), sz = new THREE.Vector3().setFromMatrixColumn(_m, 2);
  h.x *= sx.length(); h.y *= sy.length(); h.z *= sz.length();
  return { c: c.applyMatrix4(_m), u: [sx.normalize(), sy.normalize(), sz.normalize()], e: [h.x, h.y, h.z], name: mesh.name };
}
/** Penetration depth (mm) of two oriented boxes; ≤ 0 = apart (negative: the gap along the best separating axis). */
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
RackView.prototype.clearance = function clearance() {
  const j = this.jackets[this.index], out = [];
  const name = (m, n) => { m.name = m.name || n; return m; };
  const parts = { back: j.back, front: j.front, flap: j.group.children[1], spine: j.group.children[2] };
  const room = { lip: this.room.lip, ledge: this.room.ledge };
  const rcBox = () => {
    const g = this.record.group; g.updateWorldMatrix(true, false);
    const c = new THREE.Vector3(0, T.recordThick / 2, 0).applyMatrix4(g.matrixWorld);
    const u = [new THREE.Vector3().setFromMatrixColumn(g.matrixWorld, 0).normalize(), new THREE.Vector3().setFromMatrixColumn(g.matrixWorld, 1).normalize(), new THREE.Vector3().setFromMatrixColumn(g.matrixWorld, 2).normalize()];
    return { c, u, e: [T.recordR, T.recordThick / 2, T.recordR] };
  };
  const pairs = [];
  if (this.record.group.visible) for (const [n, m] of Object.entries(parts)) pairs.push(['record', n, rcBox(), obbOf(m)]);
  if (this.record.group.visible) for (const [n, m] of Object.entries(room)) if (m) pairs.push(['record', n, rcBox(), obbOf(m)]);
  for (const jn of ['back', 'front', 'spine']) for (const [n, m] of Object.entries(room)) if (m) pairs.push([jn, n, obbOf(parts[jn]), obbOf(m)]);
  for (const [a, b, A, Bx] of pairs) out.push({ a, b, depth: obbDepth(A, Bx) });
  // in the pocket, the record may only come forward once its lower edge is above the flap (−37 mm in the jacket's frame)
  if (!this.recordFree && this.record.group.visible) out.push({ a: 'record', b: 'flap-rule', depth: this.pocket.dz > 0.05 ? -37 - (j.recordHome.y - T.recordR + this.pocket.dy) : -1 });
  // nothing behind the wall plane (z 0)
  for (const jn of ['back', 'front', 'spine']) {
    const o = obbOf(parts[jn]); let zmin = Infinity;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const p = o.c.clone().addScaledVector(o.u[0], sx * o.e[0]).addScaledVector(o.u[1], sy * o.e[1]).addScaledVector(o.u[2], sz * o.e[2]);
      zmin = Math.min(zmin, p.z);
    }
    out.push({ a: jn, b: 'wall', depth: -zmin });
  }
  return out;
};

function bez(a, c, b, v) { return (1 - v) * (1 - v) * a + 2 * (1 - v) * v * c + v * v * b; }
function lazyY(apply, get) { let a = null; return (v) => { if (a === null) a = get(); apply(a, v); }; }

function velocityEnvelope(ease, n) {
  const out = []; let max = 0;
  for (let i = 0; i < n; i++) { const v = Math.abs(ease((i + 1) / n) - ease(i / n)) * n; out.push(v); if (v > max) max = v; }
  return out.map((v) => v / (max || 1));
}
