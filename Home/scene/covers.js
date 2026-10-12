// Jacket cover art, drawn at runtime with Canvas 2D from the RECORDS data:
// a brand plate, the PMF lockup and the report title. Nothing downloaded.

import * as THREE from 'three';
import { BRAND } from '../data/records.js';
import { drawLogo } from './record.js';
import { JACKET } from './layout.js';

let fontsReady = null;
export function loadFonts() {
  if (!fontsReady) {
    fontsReady = Promise.all([
      document.fonts.load('400 48px Zodiak'),
    ]).catch(() => {});
  }
  return fontsReady;
}

function plate(ctx, S, kind) {
  if (kind === 'radial-navy') {
    const g = ctx.createRadialGradient(S / 2, 0, 0, S / 2, 0, S * 1.3);
    g.addColorStop(0, BRAND.navy); g.addColorStop(0.628, BRAND.navy); g.addColorStop(1, BRAND.blue);
    ctx.fillStyle = g;
  } else if (kind === 'edge-lit') {
    const g = ctx.createLinearGradient(0, 0, S, 0);
    [[0, '#fff'], [0.02, BRAND.ice], [0.04, BRAND.blue], [0.06, BRAND.navy], [0.94, BRAND.navy], [0.96, BRAND.blue], [0.98, BRAND.ice], [1, '#fff']]
      .forEach(([s, c]) => g.addColorStop(s, c));
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = { cream: BRAND.cream, ice: BRAND.ice, slate: BRAND.slate }[kind] || BRAND.cream;
  }
  ctx.fillRect(0, 0, S, S);
}

function wrap(ctx, text, maxWidth) {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  // no single-word last line
  if (lines.length > 1 && !lines[lines.length - 1].includes(' ')) {
    const prev = lines[lines.length - 2].split(' ');
    if (prev.length > 2) { lines[lines.length - 1] = prev.pop() + ' ' + lines[lines.length - 1]; lines[lines.length - 2] = prev.join(' '); }
  }
  return lines;
}

/** Title lines at the largest size (from `max` down) that fits `maxLines` within `width`. */
function fitTitle(ctx, text, width, max, min, maxLines) {
  let fs = max, lines;
  for (;;) {
    ctx.font = `400 ${fs}px Zodiak`;
    ctx.letterSpacing = `${-0.02 * fs}px`;
    lines = wrap(ctx, text, width);
    if (lines.length <= maxLines || fs <= min) break;
    fs -= 0.5;
  }
  return { fs, lines };
}

/**
 * A cover carries two things only: the PMF lockup and the report title.
 * Margins are 34 mm all round; the title runs at most 86% of the inner width
 * so its rag never meets the right margin, and leads at 1.14.
 */
const coverTitle = (record) => (record.status === 'available' ? record.title : 'Coming Soon');

/**
 * One title size for every jacket: the largest size (≤ 25 mm) at which the longest
 * title still fits three lines. Covers then match each other, not just themselves.
 */
export function sharedTitleSize(records, size = 1024) {
  const px = size / JACKET.size, m = 34 * px, inner = size - m * 2;
  const ctx = document.createElement('canvas').getContext('2d');
  return Math.min(...records.map((r) => fitTitle(ctx, coverTitle(r), inner * 0.86, 25 * px, 16 * px, 3).fs)) / px;
}

export function renderCover(record, size = 1024, titleMm = 25) {
  const S = size, px = S / JACKET.size;          // px per mm
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  plate(ctx, S, record.plate);
  const dark = record.plate === 'radial-navy' || record.plate === 'edge-lit' || record.plate === 'slate';
  const ink = dark ? '#fff' : BRAND.navy;
  const m = 34 * px;                             // margin, all four sides (clear of the edge-lit band)
  const inner = S - m * 2;
  const logoW = 100 * px;
  const { fs, lines } = fitTitle(ctx, coverTitle(record), inner * 0.86, titleMm * px, 16 * px, 3);
  const lead = fs * 1.14;
  ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  // One layout for every jacket: the lockup on the top margin, the title's last
  // baseline on the bottom margin, both flush left.
  drawLogo(ctx, m, m, logoW, ink);
  ctx.font = `400 ${fs}px Zodiak`;
  ctx.letterSpacing = `${-0.02 * fs}px`;
  ctx.fillStyle = ink;
  const last = S - m;
  lines.forEach((l, i) => ctx.fillText(l, m, last - (lines.length - 1 - i) * lead));
  ctx.letterSpacing = '0px';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The open edge of the sleeve: two cardboard lips with a dark slit between. */
export function sleeveEdgeTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 32;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#cfccc6'; ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = '#1a1a1e'; ctx.fillRect(0, 13, 64, 6);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 10, 64, 3); ctx.fillRect(0, 19, 64, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
