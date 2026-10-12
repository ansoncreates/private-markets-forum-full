// The Shelves' input: pointer drag (mouse, pen, one finger) → pan; two touches →
// pinch zoom + pan; wheel → zoom toward the cursor (ctrl/⌘ + wheel = trackpad
// pinch); a short press → a click (raycast to a jacket); double-click on the
// wall → zoom ×2 there. Keys are handled by the view (onKey).

import * as THREE from 'three';
import { CAM } from './layout.js';

const CLICK_PX = 6, CLICK_MS = 500, DBL_MS = 320;

export class ShelvesInput {
  constructor(view) {
    this.view = view;
    this.el = view.el.stage;
    this.ex = view.explorer;
    this.pointers = new Map();
    this.press = null;                       // { id, x, y, t, moved }
    this.pinch = null;                       // { d0, mx, my }
    this.lastClick = { t: 0, x: 0, y: 0 };
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.bound = false;
    this.handlers = {
      down: (e) => this.onDown(e), move: (e) => this.onMove(e), up: (e) => this.onUp(e), cancel: (e) => this.onCancel(e),
      wheel: (e) => this.onWheel(e), dbl: (e) => this.onDbl(e), blur: () => this.onCancel(null),
      ctx: (e) => { if (this.active()) e.preventDefault(); },
    };
  }
  active() { return this.view.app.view === this.view; }
  bind() {
    if (this.bound) return; this.bound = true;
    const h = this.handlers, el = this.el;
    el.addEventListener('pointerdown', h.down);
    el.addEventListener('pointermove', h.move);
    el.addEventListener('pointerup', h.up);
    el.addEventListener('pointercancel', h.cancel);
    el.addEventListener('wheel', h.wheel, { passive: false });
    el.addEventListener('dblclick', h.dbl);
    window.addEventListener('blur', h.blur);
  }

  /** The jacket under a screen point, or null. */
  pick(px, py) {
    const v = this.view;
    this.ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.ex.camera);
    const hits = this.ray.intersectObjects(v.meshes, false);
    return hits.length ? hits[0].object.userData.jacket : null;
  }
  overControl(e) {
    const t = e.target;
    return t instanceof Element && (t.closest('button, a, [role="dialog"], .switcher') !== null);
  }

  onDown(e) {
    if (!this.active() || this.overControl(e)) return;
    if (e.button !== undefined && e.button !== 0) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { this.el.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    this.view.touch = e.pointerType === 'touch';
    if (this.pointers.size === 1) {
      this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
      if (this.view.state === 'explore') { this.ex.beginDrag(e.clientX, e.clientY); this.el.classList.add('is-grabbing'); }
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.ex.endDrag(false);
      this.press = null;
      this.pinch = { d0: Math.hypot(b.x - a.x, b.y - a.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, dStart: this.ex.dTarget };
      this.ex.beginDrag(this.pinch.mx, this.pinch.my);
    }
    this.view.wake();
  }
  onMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.press && this.press.id === e.pointerId && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > CLICK_PX) this.press.moved = true;
    if (this.view.state !== 'explore') return;
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(b.x - a.x, b.y - a.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      this.ex.dragTo(mx, my);
      const want = this.pinch.dStart * (this.pinch.d0 / Math.max(1, d));
      this.ex.zoomBy(this.ex.dTarget / Math.min(this.ex.dFit, Math.max(this.ex.dMin, want)), mx, my);
      this.view.hideHint();
    } else if (this.ex.drag) {
      this.ex.dragTo(e.clientX, e.clientY);
      if (this.press && this.press.moved) this.view.hideHint();
    }
    this.view.wake();
  }
  onUp(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    try { this.el.releasePointerCapture(e.pointerId); } catch (err) { /* fine */ }
    const p = this.press;
    if (this.pinch) {
      if (this.pointers.size === 1) {        // two fingers → one: carry on as a pan, no jump
        const [a] = [...this.pointers.values()];
        this.pinch = null;
        this.ex.endDrag(false);
        this.ex.beginDrag(a.x, a.y);
      } else if (this.pointers.size === 0) { this.pinch = null; this.ex.endDrag(false); }
    } else if (this.pointers.size === 0) {
      this.ex.endDrag(true);
      this.el.classList.remove('is-grabbing');
      if (p && p.id === e.pointerId && !p.moved && performance.now() - p.t < CLICK_MS) this.click(e.clientX, e.clientY, e);
    }
    if (p && p.id === e.pointerId) this.press = null;
    this.view.wake();
  }
  onCancel(e) {
    if (e && !this.pointers.has(e.pointerId)) return;
    this.pointers.clear(); this.press = null; this.pinch = null;
    this.ex.endDrag(false);
    this.el.classList.remove('is-grabbing');
    this.view.wake();
  }
  click(px, py, e) {
    const v = this.view;
    const now = performance.now(), last = this.lastClick;
    const isDbl = now - last.t < DBL_MS && Math.hypot(px - last.x, py - last.y) < 24;
    this.lastClick = { t: now, x: px, y: py };
    if (v.state === 'explore') {
      const j = this.pick(px, py);
      if (j) v.select(j);
      else if (isDbl && this.view.touch) this.zoomAt(px, py);      // double-tap on the wall
    } else if (v.state === 'focus') {
      const j = this.pick(px, py);
      if (j && j !== v.focused) v.select(j);
      else if (!j) v.back();
      // a click on the raised jacket itself: nothing
    }
  }
  onDbl(e) {
    if (!this.active() || this.overControl(e) || this.view.state !== 'explore' || this.view.touch) return;
    e.preventDefault();
    if (this.pick(e.clientX, e.clientY)) return;
    this.zoomAt(e.clientX, e.clientY);
  }
  zoomAt(px, py) {
    const ex = this.ex;
    this.view.hideHint();
    if (ex.dTarget <= ex.dMin + 0.5) { ex.fit(this.view.T.glide.fit); return; }
    const w = ex.worldAt(px, py), d = Math.max(ex.dMin, ex.dTarget / CAM.dblStep);
    const m = (2 * d * Math.tan(THREE.MathUtils.degToRad(CAM.fov / 2))) / ex.H;
    ex.glideTo({ x: w.x - (px - ex.safe.cx) * m, y: w.y + (py - ex.safe.cy) * m, d }, this.view.T.glide.dbl);
    this.view.wake();
  }
  onWheel(e) {
    if (!this.active()) return;
    e.preventDefault();                       // the page never scrolls; browser zoom stays off the canvas
    if (this.view.state !== 'explore') return;
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
    const dy = e.deltaY * k;
    const factor = Math.exp(-dy * (e.ctrlKey || e.metaKey ? CAM.pinchK : CAM.wheelK));
    this.ex.zoomBy(factor, e.clientX, e.clientY);
    this.view.hideHint();
    this.view.wake();
  }
}
