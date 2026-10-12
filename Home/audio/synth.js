// Procedural placeholders for every cue, so the sequence always has sound
// until recorded files are listed in Home/audio/manifest.json. All of these
// build a small node graph at `when` on the shared AudioContext.

function noiseBuffer(ctx, seconds, { tint = 0 } = {}) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    last = tint ? last * tint + w * (1 - tint) : w;   // tint → brownish
    d[i] = last;
  }
  return buf;
}

function env(gain, when, points) {
  // points: [[t, value], ...] relative to `when`; exponential where value > 0
  gain.gain.cancelScheduledValues(when);
  gain.gain.setValueAtTime(Math.max(points[0][1], 0.0001), when);
  for (let i = 1; i < points.length; i++) {
    const [t, v] = points[i];
    if (v > 0.0005) gain.gain.exponentialRampToValueAtTime(v, when + t);
    else gain.gain.linearRampToValueAtTime(0, when + t);
  }
}

function burst(ctx, out, when, { dur, freq, q = 1.2, gain = 0.3, tint = 0, type = 'bandpass' }) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, dur, { tint });
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  env(g, when, [[0, gain], [dur * 0.25, gain * 0.5], [dur, 0]]);
  src.connect(f).connect(g).connect(out);
  src.start(when); src.stop(when + dur + 0.05);
}

function thump(ctx, out, when, { freq = 70, dur = 0.18, gain = 0.5, drop = 0.6 }) {
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(freq, when);
  o.frequency.exponentialRampToValueAtTime(freq * drop, when + dur);
  const g = ctx.createGain();
  env(g, when, [[0, gain], [dur, 0]]);
  o.connect(g).connect(out); o.start(when); o.stop(when + dur + 0.02);
}

function crackle(ctx, out, when, { dur, density = 30, gain = 0.25 }) {
  const n = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  const count = Math.floor(density * dur);
  for (let k = 0; k < count; k++) {
    const i = Math.floor(Math.random() * n), a = (Math.random() * 0.8 + 0.2) * (Math.random() > 0.9 ? 1 : 0.35);
    for (let j = 0; j < 40 && i + j < n; j++) d[i + j] += a * Math.exp(-j / 9) * (Math.random() * 2 - 1);
  }
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1400;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(out); src.start(when); src.stop(when + dur + 0.05);
}

export const SYNTH = {
  'ui-press-down': (ctx, out, t) => { burst(ctx, out, t, { dur: 0.03, freq: 2600, q: 2, gain: 0.35 }); thump(ctx, out, t, { freq: 180, dur: 0.05, gain: 0.12 }); },
  'ui-press-up':   (ctx, out, t) => { burst(ctx, out, t, { dur: 0.025, freq: 3400, q: 2, gain: 0.22 }); },
  'jacket-pick':   (ctx, out, t) => { burst(ctx, out, t, { dur: 0.07, freq: 900, q: 0.8, gain: 0.3, tint: 0.5 }); thump(ctx, out, t, { freq: 120, dur: 0.08, gain: 0.18 }); },
  'jacket-shift':  (ctx, out, t) => { burst(ctx, out, t, { dur: 0.18, freq: 1600, q: 0.6, gain: 0.12, tint: 0.3 }); },
  'sleeve-out':    (ctx, out, t, { duration = 0.65, envelope } = {}) => {
    // card-on-card friction; the envelope (0..1 samples) follows the slide's velocity
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, duration + 0.1, { tint: 0.35 });
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.5;
    const f2 = ctx.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = 500;
    const g = ctx.createGain();
    const curve = new Float32Array(envelope && envelope.length ? envelope.map((v) => v * 0.55 + 0.0001) : [0.0001, 0.3, 0.5, 0.45, 0.2, 0.0001]);
    g.gain.setValueCurveAtTime(curve, t, duration);
    src.connect(f).connect(f2).connect(g).connect(out); src.start(t); src.stop(t + duration + 0.1);
  },
  'record-set':    (ctx, out, t) => { thump(ctx, out, t, { freq: 60, dur: 0.22, gain: 0.5, drop: 0.5 }); burst(ctx, out, t, { dur: 0.05, freq: 700, q: 1, gain: 0.12, tint: 0.6 }); },
  'tonearm-lift':  (ctx, out, t) => { burst(ctx, out, t, { dur: 0.03, freq: 3000, q: 3, gain: 0.25 }); burst(ctx, out, t + 0.02, { dur: 0.22, freq: 1800, q: 0.7, gain: 0.08, type: 'lowpass' }); },
  'tonearm-swing': (ctx, out, t, { duration = 0.9 } = {}) => {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, duration + 0.1, { tint: 0.7 });
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.setValueCurveAtTime(new Float32Array([0.0001, 0.05, 0.1, 0.11, 0.09, 0.04, 0.0001]), t, duration);
    src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + duration + 0.1);
  },
  'needle-drop':   (ctx, out, t) => { thump(ctx, out, t, { freq: 110, dur: 0.12, gain: 0.35, drop: 0.5 }); crackle(ctx, out, t + 0.03, { dur: 0.4, density: 40, gain: 0.3 }); },
  'gatefold-open': (ctx, out, t, { duration = 0.9 } = {}) => {
    // a book's cover opening, not a slide: the crease letting go (a faint tick), the air the
    // board moves (a low, brown swell — nothing in the 1–3 kHz band that reads as friction),
    // and the board coming to rest on its back, muffled
    burst(ctx, out, t, { dur: 0.02, freq: 1700, q: 1.4, gain: 0.05, tint: 0.6 });
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, duration + 0.1, { tint: 0.9 });
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 480; f.Q.value = 0.3;
    const g = ctx.createGain();
    g.gain.setValueCurveAtTime(new Float32Array([0.0001, 0.05, 0.12, 0.15, 0.11, 0.05, 0.0001]), t + 0.03, duration * 0.8);
    src.connect(f).connect(g).connect(out); src.start(t); src.stop(t + duration + 0.1);
    const land = t + duration * 0.9;
    thump(ctx, out, land, { freq: 150, dur: 0.14, gain: 0.14, drop: 0.6 });   // low enough to be soft, high enough for a laptop speaker
    burst(ctx, out, land, { dur: 0.05, freq: 650, q: 0.7, gain: 0.05, tint: 0.85, type: 'lowpass' });
  },
  'gatefold-close': (ctx, out, t) => { burst(ctx, out, t, { dur: 0.06, freq: 800, q: 0.8, gain: 0.25, tint: 0.5 }); thump(ctx, out, t, { freq: 130, dur: 0.07, gain: 0.14 }); },
  'play-press':    (ctx, out, t) => { burst(ctx, out, t, { dur: 0.04, freq: 1900, q: 1.5, gain: 0.45 }); thump(ctx, out, t, { freq: 140, dur: 0.07, gain: 0.3 }); burst(ctx, out, t + 0.09, { dur: 0.03, freq: 2800, q: 2, gain: 0.2 }); },
};

/** A seamless 4 s loop: motor hum + surface noise + sparse crackle. */
export function spinLoopBuffer(ctx) {
  const dur = 4, n = ctx.sampleRate * dur;
  const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  const sr = ctx.sampleRate;
  let last = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const hum = Math.sin(2 * Math.PI * 50 * t) * 0.05 + Math.sin(2 * Math.PI * 100 * t) * 0.025;
    const w = Math.random() * 2 - 1;
    last = last * 0.92 + w * 0.08;
    d[i] = hum + last * 0.35;
  }
  // crackle, periodic in the loop (whole cycles of 4 s)
  for (let k = 0; k < 90; k++) {
    const i = Math.floor(Math.random() * n), a = (Math.random() * 0.6 + 0.2) * (Math.random() > 0.92 ? 1.2 : 0.3);
    for (let j = 0; j < 60 && i + j < n; j++) d[i + j] += a * Math.exp(-j / 10) * (Math.random() * 2 - 1) * 0.5;
  }
  // soften the seam: crossfade the last 2000 samples into the first
  const x = 2000;
  for (let i = 0; i < x; i++) { const a = i / x; d[n - x + i] = d[n - x + i] * (1 - a) + d[i] * a; }
  return buf;
}
