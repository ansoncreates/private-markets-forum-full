/* ------------------------------------------------------------
   Copy fitting — no short last line on a paragraph
   The CSS already refuses hyphens and the pages glue each run's
   final two words, so a paragraph never ends on a single word.
   What CSS cannot do is decide *how short* the last line may be:
   "complexity it manages." on a line of its own still reads as a
   stub. This tracks each paragraph by a hair — up to .015em tighter
   or .01em looser, then up to .08em of word space — until its last
   line is at least 30% of the measure, the way a typesetter tightens
   a paragraph to pull a stub back. Tracking moves first, because it
   is the least visible; a word space never leaves 68–132% of itself.

   Headings are held to two lines on a wide measure the same way, by
   stepping their size down (see fitHead).

   Runs once the faces have loaded and again after a resize (the
   measure changes with the window). Every candidate is measured on a
   hidden clone, so the page does not reflow while the fitter thinks.
   The PDF build calls run() itself and bakes the result into the
   sheets as inline styles, so the viewer needs no script.
   ------------------------------------------------------------ */
(function () {
  var SEL = [
    'p', 'blockquote > footer',
    '.hero__subtitle', '.layer__subtitle', '.stack__note', '.stack__eyebrow',
    '.callout__body', '.insight__aside-body', '.action-card__body', '.force-card__body',
    '.figure__credit', '.chart__source', '.stat__note', '.closing__thanks-text',
    /* sheets */
    '.pg-text p', '.pg-lead', '.pg-note', '.pg-sm', '.pg-credit', '.pg-source',
    '.pg-aside__body', '.pg-quote__text', '.pg-quote__by', '.pg-closing__note', '.pg-stat__label'
  ].join(',');
  var MIN = 0.30;                         // last line ≥ 30% of the measure
  var LS  = [0, -0.005, 0.005, -0.01, 0.01, -0.015];    // em of tracking, tighter first at equal distance
  var WS  = [0, -0.04, 0.04, -0.08, 0.08];               // em of word space — a space stays within 68–132% of itself
  var MAX_COST = 4.8;                                    // |ls|·100 + |ws|·60: the full word-space move only on its own

  function rows(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    var rects = [].slice.call(range.getClientRects()).filter(function (r) { return r.width > 0 && r.height > 0; });
    if (!rects.length) return [];
    var lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.4;
    rects.sort(function (a, b) { return a.top - b.top || a.left - b.left; });
    var out = [];
    rects.forEach(function (r) {
      var cur = out[out.length - 1];
      if (cur && r.top < cur.top + lh * 0.6) {
        if (r.left < cur.left) cur.left = r.left;
        if (r.right > cur.right) cur.right = r.right;
      } else out.push({ top: r.top, left: r.left, right: r.right });
    });
    return out;
  }
  function ratio(el, width) {
    var rs = rows(el);
    if (rs.length < 2) return { n: rs.length, r: 1 };
    var last = rs[rs.length - 1];
    return { n: rs.length, r: (last.right - last.left) / width };
  }

  function fit(el) {
    el.style.letterSpacing = ''; el.style.wordSpacing = ''; el.style.textWrap = ''; el.style.maxWidth = ''; el.removeAttribute('data-fit');
    var width = el.getBoundingClientRect().width;
    if (!width) return;
    var base = ratio(el, width);
    if (base.n < 2 || base.r >= MIN) return;

    var cs = getComputedStyle(el);
    var fs = parseFloat(cs.fontSize) || 16;
    var ls0 = parseFloat(cs.letterSpacing) || 0;           // 'normal' → 0
    var ws0 = parseFloat(cs.wordSpacing) || 0;

    var clone = el.cloneNode(true);
    clone.removeAttribute('id');
    clone.setAttribute('aria-hidden', 'true');
    clone.style.cssText += ';position:absolute!important;left:0!important;top:0!important;visibility:hidden!important;' +
      'pointer-events:none!important;width:' + width + 'px!important;max-width:none!important;margin:0!important;' +
      'transition:none!important;animation:none!important;';
    el.parentNode.insertBefore(clone, el.nextSibling);

    // cheapest change first: a small tracking move, then a little word space, then both —
    // but never the most of both at once, which reads as a squeezed line
    var trials = [];
    LS.forEach(function (ls) { WS.forEach(function (ws) { trials.push({ ls: ls, ws: ws, cost: Math.abs(ls) * 100 + Math.abs(ws) * 60 }); }); });
    trials = trials.filter(function (t) { return t.cost <= MAX_COST; });
    trials.sort(function (a, b) { return a.cost - b.cost; });
    var best = null, partial = null;
    for (var i = 0; i < trials.length; i++) {
      var t = trials[i];
      if (!t.ls && !t.ws) continue;
      clone.style.letterSpacing = (ls0 + t.ls * fs).toFixed(3) + 'px';
      clone.style.wordSpacing = (ws0 + t.ws * fs).toFixed(3) + 'px';
      var m = ratio(clone, width);
      if (m.n > base.n) continue;                          // never add a line
      if (m.r >= MIN) { best = t; break; }                 // the first fit at the lowest cost wins
      if (!partial || m.r > partial.r) partial = { ls: t.ls, ws: t.ws, r: m.r };
    }
    // Tracking cannot pull back a stub on a two-line run (there is not enough text
    // to move); those balance instead — two even lines, no stub. On a narrow measure
    // (a phone, an aside) a run of up to four lines may balance too. Longer runs on
    // a wide measure are left alone: balanced, they would read as a narrower column.
    // A run of three lines or more that tracking could not settle gives up a little
    // measure instead — 2% at a time, to 88% — so the words that made the stub come
    // back up into a fuller last line. The rag already moves by that much, so a
    // paragraph set to 94% of the column does not read as a narrower one.
    if (!best && base.n >= 3) {
      clone.style.letterSpacing = ''; clone.style.wordSpacing = '';
      for (var k = 0.98; k >= 0.875 && !best; k -= 0.02) {
        var w2 = Math.floor(width * k);
        clone.style.setProperty('width', w2 + 'px', 'important');
        var mw = ratio(clone, w2);
        if (mw.n <= base.n && mw.r >= MIN) best = { maxWidth: w2 };
      }
      clone.style.setProperty('width', width + 'px', 'important');
    }
    if (!best && (base.n <= 2 || (base.n <= 4 && width < 500))) {
      clone.style.letterSpacing = ''; clone.style.wordSpacing = ''; clone.style.textWrap = 'balance';
      var mb = ratio(clone, width);
      if (mb.n <= base.n && mb.r >= MIN) best = { wrap: 'balance' };
    }
    // Longer runs fall back to the engine's own orphan control, `pretty`, which
    // spends a shorter line or two above to give the last one company. Only the
    // paragraphs tracking could not settle take it, so the rest keep full lines.
    if (!best && base.n >= 3) {
      clone.style.letterSpacing = ''; clone.style.wordSpacing = ''; clone.style.textWrap = 'pretty';
      var mp = ratio(clone, width);
      if (mp.n <= base.n && (mp.r >= MIN || (mp.r >= 0.2 && mp.r > base.r + 0.08 && (!partial || mp.r > partial.r)))) best = { wrap: 'pretty', r: mp.r };
    }
    clone.parentNode.removeChild(clone);
    // no candidate reaches 30%: take the longest last line on offer if it is a real improvement
    if (!best && partial && partial.r >= 0.2 && partial.r > base.r + 0.08) best = partial;
    if (!best) return;
    if (best.wrap) { el.style.textWrap = best.wrap; el.setAttribute('data-fit', best.wrap); return; }
    if (best.maxWidth) { el.style.maxWidth = best.maxWidth + 'px'; el.setAttribute('data-fit', Math.round(best.maxWidth / width * 100) + '% measure'); return; }
    el.style.letterSpacing = (ls0 + best.ls * fs).toFixed(3) + 'px';
    el.style.wordSpacing = (ws0 + best.ws * fs).toFixed(3) + 'px';
    el.setAttribute('data-fit', ((best.ls ? (best.ls > 0 ? '+' : '') + best.ls + 'em' : '') + (best.ws ? ' ' + (best.ws > 0 ? '+' : '') + best.ws + 'em ws' : '')).trim());
  }

  // ---- headings: two lines at most on a wide measure ----
  // A section or insight title runs the full reading column and is set 4px
  // smaller than it was, which holds every title in the reports to two lines
  // at 1440. Where one still runs to three — a long title, a narrower window
  // — it steps down 2px at a time (leading with it), never more than 8px.
  var SEL_H = '.intro__title, .forces__title, .insight__title, .actions__title, .sponsors__title, .pg-h2, .pg-h3, .pg-h5';
  var MAX_LINES = 2, HEAD_STEP = 2, HEAD_FLOOR = 8, HEAD_MIN_WIDTH = 560;

  function fitHead(el) {
    el.style.fontSize = ''; el.style.lineHeight = ''; el.removeAttribute('data-fit');
    var width = el.getBoundingClientRect().width;
    if (width < HEAD_MIN_WIDTH) return;                    // a phone or tablet column wraps as it must
    if (rows(el).length <= MAX_LINES) return;
    var cs = getComputedStyle(el);
    var fs0 = parseFloat(cs.fontSize), lh0 = parseFloat(cs.lineHeight) || fs0 * 1.14;
    for (var d = HEAD_STEP; d <= HEAD_FLOOR; d += HEAD_STEP) {
      var fs = fs0 - d;
      el.style.fontSize = fs + 'px';
      el.style.lineHeight = Math.round(fs * lh0 / fs0) + 'px';
      if (rows(el).length <= MAX_LINES) { el.setAttribute('data-fit', MAX_LINES + ' lines: ' + fs + 'px'); return; }
    }
    el.style.fontSize = ''; el.style.lineHeight = '';          // could not: leave it at its size
  }

  function run(root) {
    var heads = [].slice.call((root || document).querySelectorAll(SEL_H));
    heads.forEach(fitHead);
    var els = [].slice.call((root || document).querySelectorAll(SEL));
    // innermost only — a <p> inside a <blockquote> is fitted once
    els = els.filter(function (el) { return !el.querySelector(SEL); });
    els.forEach(fit);
    return els.length + heads.length;
  }

  window.pmfCopyfit = { run: run, SEL: SEL, MIN: MIN };
  if (document.documentElement.hasAttribute('data-no-autofit')) return;

  var timer = null, lastW = 0;
  function go() { lastW = window.innerWidth; run(document); }
  function ready() {
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go); else go();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
  window.addEventListener('resize', function () {
    if (window.innerWidth === lastW) return;               // a height-only resize (mobile chrome) changes no measure
    clearTimeout(timer); timer = setTimeout(go, 150);
  });
})();
