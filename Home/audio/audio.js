// Web Audio: one context unlocked on the first gesture, a master gain, a
// mute toggle remembered in localStorage, and cues that come from recorded
// files when Home/audio/manifest.json lists them, otherwise from synth.js.

import { SYNTH, spinLoopBuffer } from './synth.js';

const LEVELS = {   // dB below master
  'ui-press-down': -12, 'ui-press-up': -12, 'jacket-pick': -14, 'jacket-shift': -18, 'sleeve-out': -10,
  'record-set': -12, 'tonearm-lift': -14, 'tonearm-swing': -18, 'needle-drop': -12, 'play-press': -10, 'spin': -16,
  'gatefold-open': -14, 'gatefold-close': -14,
};
const db = (v) => Math.pow(10, v / 20);

export class Audio {
  constructor({ base = 'Home/audio/' } = {}) {
    this.base = base;
    this.ctx = null; this.master = null;
    this.buffers = new Map();
    this.manifest = [];
    this.spinSrc = null; this.spinGain = null;
    let muted = false;
    try { muted = localStorage.getItem('pmf-home-sound') === 'off'; } catch (e) { /* storage unavailable */ }
    this.muted = muted;
    this.unlocked = false;
    this.onChange = null;
    // files are fetched (as ArrayBuffer) when the page is idle; decoded after unlock
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
    idle(() => this.prefetch());
  }

  async prefetch() {
    if (location.protocol === 'file:') return;          // fetch() cannot read file:// — synth placeholders
    try {
      const res = await fetch(this.base + 'manifest.json', { cache: 'force-cache' });
      if (!res.ok) return;
      const list = await res.json();
      if (!Array.isArray(list)) return;
      this.manifest = list;
      this.raw = new Map();
      await Promise.all(list.map(async (name) => {
        try { const r = await fetch(this.base + name); if (r.ok) this.raw.set(name, await r.arrayBuffer()); } catch (e) { /* silent */ }
      }));
    } catch (e) { /* no manifest — synth placeholders */ }
  }

  /** Call on the first pointerdown / keydown. */
  unlock() {
    if (this.unlocked) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
      this.unlocked = true;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.decodeAll();
    } catch (e) { this.unlocked = false; }
  }

  async decodeAll() {
    if (!this.raw) return;
    for (const [name, ab] of this.raw) {
      try { this.buffers.set(name.replace(/\.mp3$/, ''), await this.ctx.decodeAudioData(ab.slice(0))); } catch (e) { /* keep synth */ }
    }
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('pmf-home-sound', m ? 'off' : 'on'); } catch (e) { /* storage unavailable */ }
    if (this.master) { const t = this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setTargetAtTime(m ? 0 : 0.6, t, 0.03); }
    this.onChange && this.onChange(m);
  }

  _out(name) {
    const g = this.ctx.createGain(); g.gain.value = db(LEVELS[name] ?? -12); g.connect(this.master); return g;
  }

  /** Play a cue now (or at +delay s). Options pass through to the synth. */
  play(name, opts = {}) {
    if (!this.unlocked || this.muted) return;
    try {
      const t = this.ctx.currentTime + (opts.delay || 0);
      const out = this._out(name);
      const buf = this.buffers.get(name);
      if (buf) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.connect(out); s.start(t); return; }
      const fn = SYNTH[name];
      fn && fn(this.ctx, out, t, opts);
    } catch (e) { /* never throw from audio */ }
  }

  spinStart({ fadeIn = 0.9 } = {}) {
    if (!this.unlocked || this.spinSrc) return;
    try {
      const ctx = this.ctx, t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.buffers.get('spin-loop') || (this._spinBuf || (this._spinBuf = spinLoopBuffer(ctx)));
      src.loop = true;
      src.playbackRate.setValueAtTime(0.7, t);
      src.playbackRate.setTargetAtTime(1.0, t, fadeIn / 3);
      const g = this._out('spin');
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(db(LEVELS.spin), t + fadeIn);
      src.connect(g); src.start(t);
      this.spinSrc = src; this.spinGain = g;
    } catch (e) { /* silent */ }
  }

  /** Fade everything out (the hand-over to the report). */
  fadeOut(seconds = 0.6) {
    if (!this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(0, t, seconds / 3);
  }

  stopAll() {
    try {
      if (this.spinSrc) { this.spinSrc.stop(); this.spinSrc.disconnect(); this.spinSrc = null; }
      if (this.master) { const t = this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.setValueAtTime(this.muted ? 0 : 0.6, t); }
    } catch (e) { /* silent */ }
  }
}
