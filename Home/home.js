// The Private Markets Forum — homepage shell.
// One renderer, one selected report, one sound setting, three views:
//   Table   — the top-down listening room (views/table), the default
//   Rack    — the eye-level shelf (views/rack), opt-in from the switcher
//   Shelves — three shelves of fifteen, explored freely (views/shelves)
// The shell owns boot, the view switcher, the shared overlay bits (sound,
// switcher, live region, fallback, debug) and dispatches input to the active view.

import * as THREE from 'three';
import { RECORDS } from './data/records.js';
import { Stage } from './scene/stage.js';
import { CAMERA } from './scene/layout.js';
import { buildAssets, uploadAll } from './core/assets.js';
import { FILM } from './scene/film.js';
import { TableView } from './views/table/tableView.js';
import { RackView } from './views/rack/rackView.js';
import { ShelvesView } from './views/shelves/shelvesView.js';
import { Audio } from './audio/audio.js';
import { EASE } from './motion/bezier.js';
import { hasActiveTweens } from './motion/tween.js';

const $ = (id) => document.getElementById(id);
const VIEWS = ['table', 'rack', 'shelves'];
const ANNOUNCE = { table: 'Table view.', rack: 'Rack view.', shelves: 'Shelves view.' };

// ------------------------------------------------------------------ support
function supportsWebGL2() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2')); } catch (e) { return false; }
}
function showFallback(reason) {
  const fb = $('fallback'), st = $('stage');
  fb.hidden = false; fb.classList.add('is-shown');
  st.classList.add('is-hidden');
  document.body.classList.add('has-fallback');
  if (reason) console.info('[home] fallback: ' + reason);
}

class App {
  constructor() {
    this.el = {
      stage: $('stage'), canvas: $('scene'), overlay: $('overlay'), fade: $('fade'),
      hit: $('hit'), browse: $('browse'), prev: $('prev'), next: $('next'), info: $('info'),
      eyebrow: $('info-eyebrow'), meta: $('info-meta'), title: $('info-title'), index: $('info-index'), pdf: $('info-pdf'),
      prompt: $('prompt'), play: $('play'), eject: $('eject'), playHit: $('play-hit'), sound: $('sound'), soundLabel: $('sound-label'),
      live: $('live'), debug: $('debug'),
      tableUi: $('table-ui'), rackUi: $('rack-ui'),
      rackPrev: $('rack-prev'), rackNext: $('rack-next'), rackInfo: $('rack-info'),
      rackEyebrow: $('rack-eyebrow'), rackMeta: $('rack-meta'), rackTitle: $('rack-title'), rackIndex: $('rack-index'), rackPdf: $('rack-pdf'),
      confirm: $('confirm'), confirmTitle: $('confirm-title'), confirmGo: $('confirm-go'), confirmBack: $('confirm-back'),
      switcher: $('switcher'), switchTable: $('switch-table'), switchRack: $('switch-rack'), switchShelves: $('switch-shelves'), switchLabel: $('switch-label'),
      shelvesUi: $('shelves-ui'), zoomKeys: $('zoom-keys'), zoomIn: $('zoom-in'), zoomOut: $('zoom-out'), zoomFit: $('zoom-fit'), shelvesHint: $('shelves-hint'),
      focus: $('focus'), focusEyebrow: $('focus-eyebrow'), focusMeta: $('focus-meta'), focusTitle: $('focus-title'), focusGo: $('focus-go'), focusBack: $('focus-back'),
      focusRing: $('focus-ring'), shelfGrid: $('shelf-grid'),
    };
    this.switchButtons = { table: this.el.switchTable, rack: this.el.switchRack, shelves: this.el.switchShelves };
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.coarse = matchMedia('(pointer: coarse)').matches;
    this.hover = matchMedia('(hover: hover)').matches;
    const q = new URLSearchParams(location.search);
    this.debug = q.get('debug') === '1';
    // tuning hook for the film tools (debug only): ?film={"room":{"ceiling":[.1,.1,.1]},"haze":{"base":.03}} merges one level deep
    if (this.debug && q.get('film')) { try { for (const [k, v] of Object.entries(JSON.parse(q.get('film')))) FILM[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...FILM[k], ...v } : v; } catch (e) { console.warn('film override ignored', e); } }
    this.lite = q.get('lite') === '1';           // test hook for software GL: tiny shadow map, sparse renders
    this.index = this.initialIndex();
    this.viewId = this.initialView(q.get('view'));
    this.switching = false;
    this.lastInput = 0;
  }

  initialIndex() {
    const hash = location.hash.replace('#', '');
    const h = RECORDS.findIndex((r) => r.id === hash);
    if (h >= 0) return h;
    try { const s = parseInt(sessionStorage.getItem('pmf-home-index'), 10); if (s >= 0 && s < RECORDS.length) return s; } catch (e) { /* unavailable */ }
    return 0;
  }
  rememberIndex() { try { sessionStorage.setItem('pmf-home-index', String(this.index)); } catch (e) { /* unavailable */ } }
  initialView(param) {
    if (VIEWS.includes(param)) return param;
    try { const v = localStorage.getItem('pmf-home-view'); if (VIEWS.includes(v)) return v; } catch (e) { /* unavailable */ }
    return 'table';
  }
  rememberView() { try { localStorage.setItem('pmf-home-view', this.viewId); } catch (e) { /* unavailable */ } }

  /** A view's handle on the shared stage, with its own scene. */
  makeContext(scene) {
    const st = this.stage;
    return {
      scene, renderer: st.renderer, coarse: st.coarse, lite: st.lite,
      markShadowDirty: () => st.markShadowDirty(), requestRender: () => st.requestRender(),
      hold: (t) => st.hold(t), release: (t) => st.release(t),
    };
  }

  // ---------------------------------------------------------------- boot
  async boot() {
    this.audio = new Audio();
    this.stage = new Stage(this.el.canvas, { coarse: this.coarse, lite: this.lite });
    if (this.debug) this.stage.renderer.debug.checkShaderErrors = true;
    if (this.lite) this.stage.renderEvery = 10;
    this.tableCamera = this.stage.camera;           // the top-down camera the Stage made
    this.el.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); showFallback('context lost'); }, false);
    this.stage.resize();
    this.assets = await buildAssets(this.stage.renderer);
    uploadAll(this.stage.renderer, this.assets);
    if (this.debug) console.info('film maps', JSON.stringify(this.assets.film.stats));   // GLOSS-FILM-BRIEF §11.1

    this.views = { table: new TableView(this), rack: new RackView(this), shelves: new ShelvesView(this) };
    await this.views.table.build(this.assets);       // the Table is always built: it is the default and the fallback for the switcher
    this.view = this.views.table;
    if (this.viewId !== 'table') {
      await this.views[this.viewId].build(this.assets);
      this.views.table.leave();
      this.view = this.views[this.viewId];
    }
    this.view.enter(this.index);
    this.bindInput();
    this.syncSwitcher();
    this.stage.render();                            // the page, directly — no intro
    this.el.stage.classList.remove('is-booting');
    this.view.layoutOverlay();
    this.stage.onFrame.push((dt, now) => this.view.frame(dt, now));
    this.booted = true;
    if (this.debug) this.debugLoop();
    this.schedulePrebuild();
  }

  /** Build a view once; concurrent callers share the same build. */
  ensureBuilt(id) {
    const v = this.views[id];
    if (v.built) return Promise.resolve();
    if (!v.buildPromise) v.buildPromise = v.build(this.assets);
    return v.buildPromise;
  }
  /**
   * Build the two views not on screen while the page sits idle, one at a time, so a switch
   * is only the navy fade — never a build and a shader compile behind it. Waits for a quiet
   * moment: nothing animating, no input for 800 ms, no switch under way.
   */
  schedulePrebuild() {
    const queue = VIEWS.filter((id) => !this.views[id].built);
    const idle = window.requestIdleCallback ? (f) => window.requestIdleCallback(f, { timeout: 3000 }) : (f) => setTimeout(f, 250);
    const step = () => {
      if (!queue.length) return;
      // the idle float (Rack) keeps the loop running but is not busy; a transition (a tween) is,
      // and so is a visitor who moved or pressed something in the last 800 ms
      if (hasActiveTweens() || this.switching || performance.now() - this.lastInput < 800 || document.hidden) { setTimeout(() => idle(step), 700); return; }
      const id = queue.shift();
      this.ensureBuilt(id).then(() => setTimeout(() => idle(step), 400), () => setTimeout(() => idle(step), 400));
    };
    setTimeout(() => idle(step), 1200);
  }

  /**
   * Compile every shader and upload every texture a view needs before its first
   * frame, so nothing stalls on first use later. `reveal` lists objects that are
   * hidden now but will show later (the record, the jackets).
   */
  async warmUp(scene, camera, reveal = []) {
    const r = this.stage.renderer;
    const show = () => { const was = reveal.map((o) => o.visible); reveal.forEach((o) => { o.visible = true; }); return () => reveal.forEach((o, i) => { o.visible = was[i]; }); };
    let restore = show();
    try {
      if (r.compileAsync && r.extensions.has('KHR_parallel_shader_compile')) await r.compileAsync(scene, camera);
      else r.compile(scene, camera);
    } catch (e) { /* compile on first use instead */ }
    restore();
    // One draw of everything, culling off and the shadow maps on: a driver (and software GL)
    // finishes building a pipeline on its first draw, which would otherwise land on the first
    // frame that shows it — a hitch on the first select, the first focus, the first switch.
    // Drawn into the canvas and painted over in the same task, so it is never seen.
    restore = show();
    const culled = [];
    try {
      scene.traverse((o) => { if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
      r.shadowMap.needsUpdate = true;
      r.render(scene, camera);
    } catch (e) { /* first use will build it */ }
    culled.forEach((o) => { o.frustumCulled = true; });
    restore();
    if (this.view) this.stage.render();              // put the visible frame back before the task ends
    else this.stage.markShadowDirty();
  }

  // ---------------------------------------------------------------- views
  /** Switch views (only from BROWSE). Navy out → leave/build/enter → navy in. */
  async switchTo(id) {
    if (!VIEWS.includes(id) || id === this.viewId || this.switching) return;
    if (!this.canSwitch()) return;
    this.switching = true;
    this.syncSwitcher();
    const fade = this.el.fade;
    const dur = this.reduced ? 200 : 280;
    fade.style.transitionDuration = dur + 'ms';
    fade.classList.add('is-in');
    await new Promise((res) => setTimeout(res, dur + 20));
    const next = this.views[id];
    this.view.leave();
    if (!next.built) await this.ensureBuilt(id);       // normally already built while the page sat idle
    this.view = next; this.viewId = id;
    this.rememberView();
    next.enter(this.index);
    this.stage.render();
    next.layoutOverlay();
    fade.style.transitionDuration = (this.reduced ? 200 : 420) + 'ms';
    fade.classList.remove('is-in');
    await new Promise((res) => setTimeout(res, (this.reduced ? 200 : 420) + 20));
    fade.style.transitionDuration = '';
    this.switching = false;
    this.syncSwitcher();
    this.announce(id === 'rack' ? 'Rack view. Report ' + (this.index + 1) + ' of ' + RECORDS.length + '.' : ANNOUNCE[id]);
  }
  /** Only a view's browsing state can be left (BROWSE on the Table and the Rack, EXPLORE on the Shelves). */
  canSwitch() { const v = this.view; return v ? (v.canSwitch ? v.canSwitch() : v.state === 'browse') : false; }

  /** The switcher reflects the active view and is usable only in BROWSE. */
  syncSwitcher() {
    const e = this.el, busy = this.switching || !this.canSwitch();
    for (const id of VIEWS) { const b = this.switchButtons[id]; b.setAttribute('aria-checked', String(this.viewId === id)); b.tabIndex = this.viewId === id ? 0 : -1; }
    e.switcher.setAttribute('aria-disabled', String(busy));
    e.switchLabel.textContent = busy ? (this.viewId === 'shelves' ? 'Return to the shelves first' : 'Return to the collection first') : 'Choose a view';
  }
  /** A view reports a state change (the switcher follows it). */
  onViewState() { if (this.el.switcher) this.syncSwitcher(); }

  announce(text) { this.el.live.textContent = ''; setTimeout(() => { this.el.live.textContent = text; }, 30); }
  prefetch(href) {
    if (this.prefetched === href) return;
    this.prefetched = href;
    const l = document.createElement('link'); l.rel = 'prefetch'; l.href = href; document.head.appendChild(l);
  }
  navigate(href) { location.assign(href); }

  // ---------------------------------------------------------------- input
  bindInput() {
    const e = this.el;
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    // the idle prebuild waits for a pause in input
    const touched = () => { this.lastInput = performance.now(); };
    for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, touched, { passive: true, capture: true });

    // the Table's controls
    e.prev.addEventListener('click', () => this.view.go(-1));
    e.next.addEventListener('click', () => this.view.go(1));
    e.hit.addEventListener('click', () => this.view.select());
    e.play.addEventListener('click', () => this.view.play());
    e.playHit.addEventListener('click', () => this.view.play());
    e.eject.addEventListener('click', () => this.view.eject());
    // the Rack's
    e.rackPrev.addEventListener('click', () => this.view.go(-1));
    e.rackNext.addEventListener('click', () => this.view.go(1));
    e.confirmGo.addEventListener('click', () => this.view.confirm && this.view.confirm());
    e.confirmBack.addEventListener('click', () => this.view.back && this.view.back());

    // view switcher
    for (const id of VIEWS) this.switchButtons[id].addEventListener('click', () => this.switchTo(id));
    e.switcher.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        ev.preventDefault(); ev.stopPropagation();
        const i = VIEWS.indexOf(this.viewId), next = VIEWS[(i + (ev.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length];
        this.switchTo(next).then(() => this.switchButtons[next].focus());
      }
    });

    e.sound.addEventListener('click', () => {
      this.audio.setMuted(!this.audio.muted);
      e.sound.setAttribute('aria-pressed', String(!this.audio.muted));
      e.soundLabel.textContent = this.audio.muted ? 'Sound off' : 'Sound on';
      if (this.coarse) { e.sound.classList.add('is-tipped'); setTimeout(() => e.sound.classList.remove('is-tipped'), 1200); }
    });
    e.sound.setAttribute('aria-pressed', String(!this.audio.muted));
    e.soundLabel.textContent = this.audio.muted ? 'Sound off' : 'Sound on';

    window.addEventListener('keydown', (ev) => {
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const v = this.view, tag = (ev.target && ev.target.tagName) || '';
      if (v.onKey && v.onKey(ev)) return;              // a view with its own keys (the Shelves) takes them first
      const inSwitcher = ev.target instanceof Node && e.switcher.contains(ev.target);
      if (ev.key === 'ArrowLeft' && !inSwitcher) { ev.preventDefault(); v.go(-1); }
      else if (ev.key === 'ArrowRight' && !inSwitcher) { ev.preventDefault(); v.go(1); }
      else if (ev.key === 'Escape') { if (v.state === 'confirm' && v.back) v.back(); else v.eject(); }
      else if ((ev.key === 'Enter' || ev.key === ' ') && v.state === 'ready' && tag !== 'BUTTON' && tag !== 'A') { ev.preventDefault(); v.play(); }
      else if (ev.key === 'Enter' && v.state === 'confirm' && v.confirm && tag !== 'BUTTON' && tag !== 'A') { ev.preventDefault(); v.confirm(); }
      else if (ev.key === 'Enter' && v.state === 'browse' && tag !== 'BUTTON' && tag !== 'A') { v.select(); }
    });

    // swipe to browse
    let swipe = null;
    e.stage.addEventListener('pointerdown', (ev) => { if (ev.pointerType !== 'mouse') swipe = { x: ev.clientX, y: ev.clientY, t: performance.now() }; }, { passive: true });
    e.stage.addEventListener('pointerup', (ev) => {
      if (!swipe) return;
      const dx = ev.clientX - swipe.x, dy = ev.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.5) this.view.go(dx < 0 ? 1 : -1);
    }, { passive: true });

    window.addEventListener('resize', () => { clearTimeout(this.rsz); this.rsz = setTimeout(() => this.onResize(), 100); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.stage.requestRender(); });
    window.addEventListener('pagehide', () => this.audio.stopAll());
    window.addEventListener('pageshow', (ev) => { if (ev.persisted) this.restoreFromBfcache(); });
    window.addEventListener('hashchange', () => {
      const i = RECORDS.findIndex((r) => r.id === location.hash.replace('#', ''));
      if (i >= 0 && i !== this.index && this.view.state === 'browse') this.view.go(i - this.index);
    });
  }

  onResize() {
    if (!this.stage.resize()) return;
    this.view.resize();
    this.view.layoutOverlay();
    this.stage.markShadowDirty();
    this.stage.requestRender();
  }

  restoreFromBfcache() {
    this.el.fade.classList.remove('is-in');
    for (const v of Object.values(this.views)) if (v.built) v.reset();
    this.view.enter(this.index);
    this.view.layoutOverlay();
  }

  // ---------------------------------------------------------------- debug
  debugLoop() {
    this.el.debug.hidden = false;
    const tick = () => {
      const s = this.stage.stats, v = this.view;
      const inv = (v.invariants || []).map((i) => (i.c ? '✓ ' : '✗ ') + i.m).join('\n');
      this.el.debug.innerHTML = `fps ${s.fps}  calls ${s.calls}  tris ${s.tris}  pr ${(this.stage.pixelRatio || 1).toFixed(2)}\nview ${this.viewId}  state ${v.state}  ${this.stage.width}×${this.stage.height} ${v.layoutMode || ''}${v.floatInfo ? '  float ' + v.floatInfo() : ''}\n` +
        inv.replace(/✗[^\n]*/g, (m) => `<span class="bad">${m}</span>`);
      setTimeout(tick, 500);
    };
    tick();
  }
}

// ------------------------------------------------------------------ go
window.__pmfShowFallback = showFallback;
if (!supportsWebGL2()) {
  showFallback('no WebGL2');
} else {
  const app = new App();
  window.__app = app;
  // the tests and the debug panel reach the active view here
  Object.defineProperty(window, '__home', { get: () => app.view, configurable: true });
  app.boot().catch((err) => { console.error(err); showFallback('boot failed: ' + (err && err.message)); });
}
void THREE; void CAMERA; void EASE;
