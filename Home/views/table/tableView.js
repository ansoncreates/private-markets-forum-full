// The Table view — the top-down listening room (HOMEPAGE-VINYL-BRIEF.md).
//
//   BROWSE ⇄ BROWSE (prev/next)
//   BROWSE → SELECTING → CUEING → READY → PLAYING → LEAVING → navigate
//   READY / CUEING → EJECTING → BROWSE

import * as THREE from 'three';
import { RECORDS } from '../../data/records.js';
import { Environment } from '../../scene/environment.js';
import { Turntable } from '../../scene/turntable.js';
import { Record } from '../../scene/record.js';
import { Jackets } from '../../scene/jackets.js';
import { TURNTABLE as T, JACKET, LAYOUTS } from '../../scene/layout.js';
import { tween, sequence, cancelAllTweens } from '../../motion/tween.js';
import { EASE } from '../../motion/bezier.js';
import { addCue, addUncue, addPlay } from '../shared/cue.js';

export const STATE = {
  BROWSE: 'browse', SELECTING: 'selecting', CUEING: 'cueing', READY: 'ready',
  PLAYING: 'playing', LEAVING: 'leaving', EJECTING: 'ejecting',
};

export class TableView {
  constructor(app) {
    this.app = app;
    this.id = 'table';
    this.el = app.el;
    this.stage = app.stage;
    this.audio = app.audio;
    this.reduced = app.reduced;
    this.scene = new THREE.Scene();
    this.ctx = app.makeContext(this.scene);
    this.state = STATE.BROWSE;
    this.queuedStep = 0;
    this.omega = 0; this.spinAngle = 0;
    this.layoutMode = null;
    this.built = false;
  }
  get index() { return this.app.index; }
  set index(v) { this.app.index = v; }
  get booted() { return this.app.booted; }

  // ---------------------------------------------------------------- build / enter / leave
  async build(assets) {
    if (this.built) return;
    this.env = new Environment(this.ctx);
    this.turntable = new Turntable(this.ctx);
    this.record = new Record(this.ctx, { labels: assets.labels });
    this.jackets = new Jackets(this.ctx, RECORDS, assets);
    this.env.load(assets);
    this.jackets.setCoverEnvironment(assets.coverEnvTop);
    this.jackets.setCovers(assets);
    this.record.setRecord(RECORDS[this.index]);
    this.stage.setView(this.scene, this.app.tableCamera);
    this.applyLayout(true);
    this.setState(STATE.BROWSE);
    this.poseBrowse();
    await this.app.warmUp(this.scene, this.app.tableCamera, [this.record.group, ...this.jackets.list.map((j) => j.group)]);
    this.built = true;
  }
  /** Make this the rendered view, in BROWSE at `index`. */
  enter(index) {
    this.index = index;
    this.stage.setView(this.scene, this.app.tableCamera);
    this.applyLayout(true);
    this.stage.fit();
    this.record.setRecord(RECORDS[this.index]);
    this.setState(STATE.BROWSE);
    this.poseBrowse();
    this.el.browse.classList.remove('is-out');
    this.el.tableUi.hidden = false;
    this.layoutOverlay();
  }
  leave() {
    this.el.tableUi.hidden = true;
    this.hidePrompt(true);
  }

  // ---------------------------------------------------------------- layout
  applyLayout(force = false) {
    const mode = (this.stage.width / this.stage.height) >= 1 ? 'landscape' : 'portrait';
    if (mode === this.layoutMode && !force) return false;
    this.layoutMode = mode;
    this.layout = LAYOUTS[mode];
    if (this.env.consoleMat) this.env.setLayout(this.layout);
    this.jackets.center = { ...this.layout.activeSlot };
    this.jackets.setOpenSide(this.layout.openSide);
    this.stage.framing = this.layout.framing;
    if (this.stage.scene === this.scene) this.stage.fit();
    return true;
  }

  resize() {
    const changed = this.applyLayout();
    this.stage.fit();
    if (changed && (this.state === STATE.BROWSE)) this.poseBrowse();
    if (changed && (this.state === STATE.READY)) this.poseReady();
    this.layoutOverlay();
    this.stage.markShadowDirty();
    this.stage.requestRender();
  }

  /** Place DOM controls over their 3D anchors. Only on resize / state change. */
  layoutOverlay() {
    const st = this.stage, j = this.jackets.activeJacket;
    const c = this.jackets.center, half = JACKET.size / 2;
    // jacket hit target = the active cover's projected rect
    const r = j.rect();
    const pr = st.projectRect(r.x0, r.x1, r.z0, r.z1, r.y);
    const hit = this.el.hit.style;
    hit.transform = `translate(${pr.left.toFixed(1)}px, ${pr.top.toFixed(1)}px)`;
    hit.width = (pr.right - pr.left).toFixed(1) + 'px';
    hit.height = (pr.bottom - pr.top).toFixed(1) + 'px';
    this.hitRect = pr;
    // browse row under the stack
    const below = st.project(c.x, 0, c.z + half + 44);
    const jacketPx = Math.max(200, Math.min(420, pr.right - pr.left));
    this.el.info.style.setProperty('--info-w', jacketPx + 'px');
    this.el.browse.style.transform = `translate(${(below.x).toFixed(1)}px, ${below.y.toFixed(1)}px) translate(-50%, 0)`;
    // the prompt, below the plinth
    const p = st.project((T.plinth.x0 + T.plinth.x1) / 2, 0, T.plinth.z1 + 26);
    this.el.prompt.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, 0)`;
    // play key hit target (≥ 44 px)
    const k = this.turntable.keys.play.rect;
    const kr = st.projectRect(k.x0, k.x1, k.z0, k.z1, k.y);
    const w = Math.max(44, kr.right - kr.left), h = Math.max(44, kr.bottom - kr.top);
    const cx = (kr.left + kr.right) / 2, cy = (kr.top + kr.bottom) / 2;
    const ph = this.el.playHit.style;
    ph.transform = `translate(${(cx - w / 2).toFixed(1)}px, ${(cy - h / 2).toFixed(1)}px)`;
    ph.width = w + 'px'; ph.height = h + 'px';
    if (this.app.debug) this.checkInvariants();
  }

  // ---------------------------------------------------------------- poses
  poseBrowse() {
    const tt = this.turntable;
    this.jackets.layout(this.index);
    this.record.setVisible(false);
    this.record.setSpin(0);
    tt.setArmAngle(0); tt.setArmY(T.tonearm.restY); tt.setCueLever(0);
    tt.setPlatterAngle(0); tt.setKeyPress('play', 0); tt.setLed(0.4);
    this.spinAngle = 0; this.omega = 0;
    this.updateInfo();
    this.stage.markShadowDirty(); this.stage.requestRender();
  }
  poseReady() {
    const tt = this.turntable;
    this.jackets.list.forEach((j) => j.setOpacity(0));
    this.record.setVisible(true);
    this.record.place(0, T.recordTop - T.recordThick, 0, { surfaceY: T.matTop, rotY: 0 });
    tt.setArmAngle(tt.cueAngle); tt.setArmY(T.tonearm.playY); tt.setCueLever(1);
    this.stage.markShadowDirty(); this.stage.requestRender();
  }

  // ---------------------------------------------------------------- state
  setState(s) {
    this.state = s;
    this.el.stage.dataset.state = s;
    this.app.onViewState(this, s);
    const browse = s === STATE.BROWSE;
    this.el.hit.disabled = !browse;
    this.updateArrows();
    this.el.playHit.hidden = s !== STATE.READY;
    if (s === STATE.READY) this.showPrompt(); else if (s !== STATE.CUEING) this.hidePrompt(s === STATE.PLAYING);
    if (s === STATE.READY) this.startLed(); else this.stopLed();
  }

  updateArrows() {
    const browse = this.state === STATE.BROWSE;
    this.el.prev.disabled = !browse || this.index === 0;
    this.el.next.disabled = !browse || this.index === RECORDS.length - 1;
  }

  /** Title row out, text swapped, title row in — one eased slide that follows the jacket. */
  swapInfo(dir) {
    const el = this.el.info;
    if (this.reduced || !el.animate) { this.updateInfo(); return; }
    if (this.infoAnim) this.infoAnim.cancel();
    const out = el.animate(
      [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${-12 * dir}px)` }],
      { duration: 240, easing: EASE.ui.css, fill: 'forwards' });
    this.infoAnim = out;
    out.onfinish = () => {
      this.updateInfo();
      const inn = el.animate(
        [{ opacity: 0, transform: `translateX(${12 * dir}px)` }, { opacity: 1, transform: 'translateX(0)' }],
        { duration: 420, easing: EASE.reveal.css, fill: 'forwards' });
      this.infoAnim = inn;
      inn.onfinish = () => { inn.cancel(); this.infoAnim = null; };
    };
  }

  updateInfo() {
    const r = RECORDS[this.index], e = this.el;
    e.eyebrow.textContent = r.status === 'available' ? r.eyebrow : 'Coming soon';
    e.eyebrow.classList.toggle('pill--soon', r.status !== 'available');
    e.meta.textContent = r.status === 'available' ? r.meta : 'In preparation';
    e.title.textContent = r.status === 'available' ? r.title : 'Coming Soon';
    e.index.textContent = `${String(this.index + 1).padStart(2, '0')} / ${String(RECORDS.length).padStart(2, '0')}`;
    if (r.pdf) { e.pdf.hidden = false; e.pdf.href = r.pdf; e.pdf.setAttribute('aria-label', `Download PDF: ${r.short}`); } else e.pdf.hidden = true;
    e.hit.setAttribute('aria-label', r.status === 'available' ? `Open ${r.title}` : 'Coming soon');
    this.updateArrows();
    this.app.rememberIndex();
  }
  announce(text) { this.app.announce(text); }

  showPrompt() {
    const p = this.el.prompt;
    p.hidden = false; p.classList.remove('is-out');
    requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add('is-in')));
  }
  hidePrompt(quick) {
    const p = this.el.prompt;
    if (p.hidden) return;
    p.classList.remove('is-in'); p.classList.add('is-out');
    setTimeout(() => { p.hidden = true; p.classList.remove('is-out'); }, quick ? 200 : 280);
  }
  startLed() {
    if (this.ledTween) return;
    const pulse = (up) => {
      this.ledTween = tween({ from: up ? 0.4 : 1.6, to: up ? 1.6 : 0.4, duration: 1600, ease: EASE.ui, ambient: true, onUpdate: (v) => this.turntable.setLed(v) })
        .then(() => { if (this.state === STATE.READY && this.ledTween) pulse(!up); });
    };
    pulse(true);
  }
  stopLed() { this.ledTween = null; this.turntable.setLed(0.4); }

  // ---------------------------------------------------------------- per-frame
  frame(dt) {
    if (this.omega > 0) {
      this.spinAngle += this.omega * dt;
      this.turntable.setPlatterAngle(this.spinAngle);
      this.record.setSpin(this.spinAngle);
    }
  }

  // ---------------------------------------------------------------- browse
  go(step) {
    if (this.state !== STATE.BROWSE) return;
    if (this.navBusy) { this.queuedStep = Math.sign(step); return; }
    const target = Math.max(0, Math.min(RECORDS.length - 1, this.index + step));
    if (target === this.index) return;
    this.navBusy = true;
    const out = this.jackets.activeJacket, inn = this.jackets.list[target];
    const dir = Math.sign(target - this.index);         // next → the jacket glides left
    this.index = target;
    this.jackets.active = target;
    this.record.setRecord(RECORDS[target]);
    this.app.rememberIndex();
    this.updateArrows();
    this.announce(`Report ${target + 1} of ${RECORDS.length}: ${RECORDS[target].status === 'available' ? RECORDS[target].title : 'Coming soon'}`);
    this.swapInfo(dir);
    const c = this.jackets.center, D = 44;              // mm each jacket travels while visible
    let done;
    if (this.reduced) {
      done = this.crossfade(() => this.jackets.layout(target));
    } else {
      // One eased progress u drives both jackets, so the motion never stops or jumps:
      // the outgoing jacket glides −dir and dissolves over the first half, the incoming
      // one continues the same glide from +dir over the second half. Speed is continuous
      // across the hand-over, and the two are never on the console together.
      const fadeOut = (k) => 1 - smooth(0, 0.8, k), fadeIn = (k) => smooth(0.2, 1, k);
      inn.setPose({ x: c.x + dir * D, z: c.z, baseY: JACKET.baseY, lift: 0, press: 0 });
      inn.setOpacity(0);
      let handedOver = false;
      done = tween({ from: 0, to: 1, duration: 680, ease: EASE.glide, onUpdate: (u) => {
        if (u < 0.5) {
          const k = u / 0.5;
          out.setPose({ x: c.x - dir * D * k }); out.setOpacity(fadeOut(k));
        } else {
          if (!handedOver) { handedOver = true; out.setOpacity(0); out.setPose({ x: c.x }); }
          const k = (u - 0.5) / 0.5;
          inn.setPose({ x: c.x + dir * D * (1 - k) }); inn.setOpacity(fadeIn(k));
        }
      } });
    }
    done.then(() => {
      this.navBusy = false;
      this.jackets.layout(target);
      this.layoutOverlay();
      if (this.queuedStep) { const q = this.queuedStep; this.queuedStep = 0; this.go(q); }
    });
  }

  // ---------------------------------------------------------------- select
  async select() {
    if (this.state !== STATE.BROWSE || this.navBusy) return;
    const rec = RECORDS[this.index], j = this.jackets.activeJacket;
    if (rec.status !== 'available') {
      this.announce('Coming soon');
      this.audio.play('jacket-pick');
      if (!this.reduced) {
        await tween({ from: 0, to: 4, duration: 220, ease: EASE.ui, onUpdate: (v) => { j.extraX = v; j.apply(); } });
        await tween({ from: 4, to: 0, duration: 220, ease: EASE.ui, onUpdate: (v) => { j.extraX = v; j.apply(); } });
      }
      return;
    }
    this.setState(STATE.SELECTING);
    this.el.browse.classList.add('is-out');
    this.el.hit.blur();
    this.record.setRecord(rec);
    if (this.reduced) { await this.crossfade(() => { this.poseReady(); }); this.setState(STATE.READY); this.announce('Record loaded. Press Play to open the report.'); return; }

    const tt = this.turntable, rc = this.record, st = this.stage;
    const dirty = () => st.markShadowDirty();
    const liftY = 90 - JACKET.baseY;                      // base 8 → 90
    const slideOut = this.layout.slideOut, [dx, dz] = this.layout.slideDir;
    const bow = this.layout.bow;
    const jx = j.pose.x, jz = j.pose.z;
    const vis = st.visible();
    const exitTop = (vis.cz - vis.h / 2) - 400 - JACKET.size / 2 - jz;      // Δz to leave by the top
    const exitRight = (vis.cx + vis.w / 2) + 400 + JACKET.size / 2 - jx;     // Δx to leave by the right (portrait)

    const s = sequence();
    // S1 press
    s.call(0, () => this.audio.play('jacket-pick'));
    s.at(0, 120, { from: 0, to: 2, ease: EASE.ui, onUpdate: (v) => { j.setPose({ press: v }); } });
    // S3 jacket lifts to y 90; the record rides inside
    s.at(120, 520, { from: 0, to: liftY, ease: EASE.reveal, onUpdate: (v) => { j.setPose({ press: 2 * (1 - Math.min(1, v / 12)), lift: v }); } });
    // S4 record slides out of the sleeve
    s.call(450, () => {
      rc.setVisible(true); rc.setSpin(-0.35);
      this.audio.play('sleeve-out', { duration: 0.8, envelope: velocityEnvelope(EASE.mech, 24) });
    });
    s.at(450, 1250, { from: 0, to: 1, ease: EASE.mech, onUpdate: (v) => {
      rc.place(jx + dx * slideOut * v, j.group.position.y + 0.8, jz + dz * slideOut * v, { surfaceY: 0 });
      dirty();
    } });
    // S5 jacket departs (top in landscape, right in portrait)
    s.at(1150, 1850, { from: 0, to: 1, ease: EASE.exit, onUpdate: (v) => {
      if (this.layout.jacketExit === 'top') j.extraZ = exitTop * v; else j.extraX = exitRight * v;
      j.extraY = 20 * v; j.extraRot = -4 * v; j.apply();
    } });
    s.call(1850, () => j.setOpacity(0));
    // S6 record transfers to the spindle
    const recRest = T.recordTop - T.recordThick;
    let p0 = null;
    s.at(1250, 2150, { from: 0, to: 1, ease: EASE.mech, onUpdate: (v, p) => {
      if (!p0) p0 = { x: rc.group.position.x, y: rc.group.position.y, z: rc.group.position.z, spin: rc.spin };
      const cxp = p0.x / 2 + bow[0], czp = p0.z / 2 + bow[1];             // control point bowed away from the tonearm
      const x = (1 - v) * (1 - v) * p0.x + 2 * (1 - v) * v * cxp + v * v * 0;
      const z = (1 - v) * (1 - v) * p0.z + 2 * (1 - v) * v * czp + v * v * 0;
      let y;
      if (p < 0.35) y = p0.y + (120 - p0.y) * EASE.reveal(p / 0.35);
      else if (p < 0.7) y = 120;
      else y = 120 + ((recRest + 1.5) - 120) * EASE.ui((p - 0.7) / 0.3);
      const spin = p0.spin * (1 - EASE.ui(p));
      rc.place(x, y, z, { surfaceY: p > 0.5 ? T.matTop : 0, rotY: spin });
      dirty();
    } });
    // S7 settle onto the mat
    s.call(2150, () => this.audio.play('record-set'));
    s.at(2150, 2330, { from: recRest + 1.5, to: recRest, ease: EASE.reveal, onUpdate: (v) => { rc.place(0, v, 0, { surfaceY: T.matTop, rotY: 0 }); dirty(); } });
    // S8–S11 (shared with the Rack view)
    addCue(s, 2300, { turntable: tt, audio: this.audio, dirty, prefetch: () => this.prefetch(rec.href),
      onReady: () => { if (this.state === STATE.CUEING) { this.setState(STATE.READY); this.announce('Record loaded. Press Play to open the report.'); } } });

    this.setState(STATE.CUEING);
    this.layoutOverlay();
    this.sequenceRunning = s.run();
    await this.sequenceRunning;
    this.sequenceRunning = null;
    if (this.state === STATE.CUEING) { this.setState(STATE.READY); this.announce('Record loaded. Press Play to open the report.'); }
  }

  prefetch(href) { this.app.prefetch(href); }

  // ---------------------------------------------------------------- play
  async play() {
    if (this.state !== STATE.READY) return;
    const rec = RECORDS[this.index], tt = this.turntable, st = this.stage;
    this.setState(STATE.PLAYING);
    this.el.play.blur(); this.el.playHit.blur();
    this.audio.play('play-press');
    if (this.reduced) {
      this.el.fade.classList.add('is-in');
      this.audio.fadeOut(0.4);
      setTimeout(() => this.navigate(rec.href), 400);
      return;
    }
    const dirty = () => st.markShadowDirty();
    const s = sequence();
    addPlay(s, 0, { turntable: tt, audio: this.audio, stage: st, dirty, setOmega: (w) => { this.omega = w; },
      onLeaving: () => { this.setState(STATE.LEAVING); this.el.fade.classList.add('is-in'); this.audio.fadeOut(0.6); },
      navigate: () => this.navigate(rec.href) });
    await s.run();
  }
  navigate(href) { this.app.navigate(href); }

  // ---------------------------------------------------------------- eject
  async eject() {
    if (this.state !== STATE.READY && this.state !== STATE.CUEING) return;
    cancelAllTweens();                                     // stops a running cue mid-way
    this.setState(STATE.EJECTING);
    this.el.play.blur(); this.el.eject.blur();
    const j = this.jackets.activeJacket, tt = this.turntable, rc = this.record, st = this.stage;
    if (this.reduced) {
      await this.crossfade(() => { this.poseBrowse(); });
      this.el.browse.classList.remove('is-out');
      this.setState(STATE.BROWSE); this.layoutOverlay();
      return;
    }
    const dirty = () => st.markShadowDirty();
    const k = 0.75;
    const slot = { x: this.jackets.center.x, z: this.jackets.center.z, baseY: JACKET.baseY };
    const [dx, dz] = this.layout.slideDir, bow = this.layout.bow;
    const vis = st.visible();
    const exitTop = (vis.cz - vis.h / 2) - 400 - JACKET.size / 2 - slot.z;
    const exitRight = (vis.cx + vis.w / 2) + 400 + JACKET.size / 2 - slot.x;
    const recRest = T.recordTop - T.recordThick;
    // every step starts from wherever the object is now
    const lazy = (get, apply) => { let a = null; return (v, p) => { if (a === null) a = get(); apply(a, v, p); }; };
    const L = (a, b, v) => a + (b - a) * v;
    const s = sequence();
    let t = 0;
    t = addUncue(s, t, { turntable: tt, audio: this.audio, dirty }, k);
    // the record lifts and flies back to the sleeve's mouth
    const backX = slot.x + dx * this.layout.slideOut, backY = 90 + 0.8, backZ = slot.z + dz * this.layout.slideOut;
    const recordOut = rc.group.visible;
    if (recordOut) {
      const onPlatter = Math.hypot(rc.group.position.x, rc.group.position.z) < 1;
      if (onPlatter) {
        s.at(t, t += 180 * k, { from: 0, to: 1, ease: EASE.reveal.mirror(), onUpdate: lazy(() => rc.group.position.y, (a, v) => { rc.place(0, L(a, recRest + 1.5, v), 0, { surfaceY: T.matTop, rotY: 0 }); dirty(); }) });
      }
      s.at(t, t += 900 * k, { from: 0, to: 1, ease: EASE.mech.mirror(), onUpdate: lazy(
        () => ({ x: rc.group.position.x, y: rc.group.position.y, z: rc.group.position.z, spin: rc.spin }),
        (a, v, p) => {
          const cxp = (a.x + backX) / 2 + bow[0], czp = (a.z + backZ) / 2 + bow[1];
          const x = (1 - v) * (1 - v) * a.x + 2 * (1 - v) * v * cxp + v * v * backX;
          const z = (1 - v) * (1 - v) * a.z + 2 * (1 - v) * v * czp + v * v * backZ;
          let y;
          if (p < 0.3) y = a.y + (120 - a.y) * EASE.reveal(p / 0.3);
          else if (p < 0.65) y = 120;
          else y = 120 + (backY - 120) * EASE.ui((p - 0.65) / 0.35);
          rc.place(x, y, z, { surfaceY: p < 0.5 && onPlatter ? T.matTop : 0, rotY: L(a.spin, -0.35, EASE.ui(p)) });
          dirty();
        }) });
    }
    // the jacket returns from off-screen (or from wherever it was), lifted at y 90
    const jacketBase = { x: slot.x, z: slot.z, baseY: slot.baseY };
    if (j.opacity < 1) {
      j.setPose({ ...jacketBase, lift: 90 - JACKET.baseY, press: 0 });
      if (this.layout.jacketExit === 'top') j.extraZ = exitTop; else j.extraX = exitRight;
      j.extraY = 20; j.extraRot = -4; j.apply();
    }
    const tj = recordOut ? t - 300 * k : t;
    s.call(tj, () => j.setOpacity(1));
    s.at(tj, t = tj + 400 * k, { from: 0, to: 1, ease: EASE.exit.mirror(), onUpdate: lazy(
      () => ({ x: j.extraX, y: j.extraY, z: j.extraZ, r: j.extraRot, lift: j.pose.lift }),
      (a, v) => { j.extraX = L(a.x, 0, v); j.extraY = L(a.y, 0, v); j.extraZ = L(a.z, 0, v); j.extraRot = L(a.r, 0, v); j.setPose({ ...jacketBase, press: 0, lift: L(a.lift, 90 - JACKET.baseY, v) }); }) });
    // the record slides into the sleeve
    if (recordOut) {
      s.call(t, () => this.audio.play('sleeve-out', { duration: 0.6, envelope: velocityEnvelope(EASE.mech.mirror(), 24) }));
      s.at(t, t += 800 * k, { from: 0, to: 1, ease: EASE.mech.mirror(), onUpdate: lazy(() => ({ x: rc.group.position.x, z: rc.group.position.z }), (a, v) => { rc.place(L(a.x, slot.x, v), j.group.position.y + 0.8, L(a.z, slot.z, v), { surfaceY: 0 }); dirty(); }) });
      s.call(t, () => rc.setVisible(false));
    }
    // the jacket lowers back onto the console
    s.at(t, t += 400 * k, { from: 0, to: 1, ease: EASE.reveal.mirror(), onUpdate: lazy(() => j.pose.lift, (a, v) => { j.setPose({ lift: L(a, 0, v) }); }) });
    await s.run();
    this.poseBrowse();
    this.el.browse.classList.remove('is-out');
    this.setState(STATE.BROWSE);
    this.layoutOverlay();
    this.announce(`Report ${this.index + 1} of ${RECORDS.length}: ${RECORDS[this.index].title}`);
  }

  /** Reduced motion: a 200 ms crossfade of the canvas around a pose change. */
  crossfade(apply) {
    return new Promise((resolve) => {
      this.el.canvas.classList.add('is-xfade');
      setTimeout(() => { apply(); this.stage.render(); this.el.canvas.classList.remove('is-xfade'); setTimeout(resolve, 200); }, 200);
    });
  }

  /** Back to BROWSE from any state, instantly (bfcache restore, view switch). */
  reset() {
    cancelAllTweens();
    this.audio.stopAll();
    this.stage.release('spin');
    this.omega = 0;
    this.el.fade.classList.remove('is-in');
    this.el.browse.classList.remove('is-out');
    this.hidePrompt(true);
    this.setState(STATE.BROWSE);
    this.poseBrowse();
    this.layoutOverlay();
  }

  // ---------------------------------------------------------------- debug
  checkInvariants() {
    const out = [];
    const ok = (c, m) => out.push({ c, m });
    const p = T.plinth, c = this.jackets.center, half = JACKET.size / 2;
    const overlap3d = !(c.x - half > p.x1 || c.x + half < p.x0 || c.z - half > p.z1 || c.z + half < p.z0);
    ok(!overlap3d, 'jacket clear of the plinth');
    const f = this.layout.framing, v = this.stage.visible();
    ok(f.x0 >= v.cx - v.w / 2 && f.x1 <= v.cx + v.w / 2 && f.z0 >= v.cz - v.h / 2 && f.z1 <= v.cz + v.h / 2, 'framing box inside the viewport');
    // nothing on screen sits on anything else
    const R = (el) => { if (!el || el.hidden || el.classList.contains('is-out') || getComputedStyle(el).opacity === '0') return null; const r = el.getBoundingClientRect(); return r.width && r.height ? r : null; };
    const inView = (r) => !r || (r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5);
    const hits = (a, b) => a && b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const st = this.stage;
    const jr = this.state === STATE.BROWSE ? this.hitRect : null;
    const pl = st.projectRect(p.x0, p.x1, p.z0, p.z1, p.top);
    const dom = { browse: R(this.el.browse), prompt: R(this.el.prompt), sound: R(this.el.sound), foot: R(document.querySelector('.foot')) };
    const names = Object.keys(dom);
    let clean = true;
    for (let i = 0; i < names.length; i++) for (let k = i + 1; k < names.length; k++) if (hits(dom[names[i]], dom[names[k]])) { clean = false; ok(false, `${names[i]} overlaps ${names[k]}`); }
    for (const n of names) {
      if (hits(dom[n], pl)) { clean = false; ok(false, `${n} overlaps the turntable`); }
      if (jr && hits(dom[n], jr)) { clean = false; ok(false, `${n} overlaps the jacket`); }
    }
    if (clean) ok(true, 'no overlay element overlaps another, the turntable or the jacket');
    for (const n of names) if (!inView(dom[n])) ok(false, `${n} runs off the screen`);
    ok(document.documentElement.scrollHeight <= innerHeight + 1, 'no page scroll');
    for (const t of this.turntable.checks) ok(t.cond, t.msg);
    this.invariants = out;
    return out;
  }
  // ---------------------------------------------------------------- debug (see app.debugLoop)
}

/** Hermite smoothstep between edges a and b. */
function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

/** Samples of |d/dt ease(t)| normalised to 0..1 — a sound envelope that follows motion. */
function velocityEnvelope(ease, n) {
  const out = [];
  let max = 0;
  for (let i = 0; i < n; i++) {
    const a = i / n, b = (i + 1) / n;
    const v = Math.abs(ease(b) - ease(a)) * n;
    out.push(v); if (v > max) max = v;
  }
  return out.map((v) => v / (max || 1));
}

