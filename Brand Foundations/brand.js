/* ------------------------------------------------------------
   Smooth scrolling — mouse wheels only
   SMOOTH_INTENSITY: 0 = almost native, 100 = very floaty.
   A notched mouse wheel jumps a whole click at a time; this eases
   those jumps. A trackpad, a precision touchpad, a free-spinning
   wheel, touch and the keyboard already move smoothly — they pass
   straight through to the browser's own scrolling, which runs off
   the main thread, so they never wait on this script.
   ------------------------------------------------------------ */
(function () {
  var SMOOTH_INTENSITY = 30;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var coarse  = window.matchMedia('(pointer: coarse)');
  // touch devices have their own inertia — never override it
  if (reduced.matches || coarse.matches) return;

  var i = Math.min(100, Math.max(0, SMOOTH_INTENSITY)) / 100;
  var ease = 0.25 * Math.pow(1 - i, 1.5) + 0.02;   // 30 → ~0.166 per frame (≈ 95% of a click in 270 ms)

  var target = window.scrollY;
  var current = target;
  var running = false;
  var animating = false;
  var last = 0;

  function limit() {
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }

  function frame(now) {
    if (!running) { last = 0; return; }            // stood down (a trackpad took over) — leave the page where it is
    var dt = last ? Math.min(now - last, 50) : 16.67;
    last = now;

    // frame-rate independent lerp
    var f = 1 - Math.pow(1 - ease, dt / 16.67);
    current += (target - current) * f;

    if (Math.abs(target - current) < 0.5) {
      current = target;
      running = false;
      last = 0;
    }

    animating = true;
    window.scrollTo(0, Math.round(current));
    animating = false;

    if (running) requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    last = 0;
    requestAnimationFrame(frame);
  }

  /* A click of a mouse wheel: line or page units, or the legacy ±120 per click.
     A trackpad sends small pixel deltas that are not multiples of 120. */
  function notched(e) {
    if (e.deltaMode !== 0) return true;
    var w = e.wheelDeltaY;
    return typeof w === 'number' && w !== 0 && w % 120 === 0 && Math.abs(e.deltaY) >= 50 && !e.deltaX;
  }

  window.addEventListener('wheel', function (e) {
    if (e.ctrlKey || e.defaultPrevented) return;   // leave pinch-zoom alone
    if (!notched(e)) {                             // a trackpad: the browser scrolls, and the eased run stands down
      if (running) { running = false; last = 0; target = current = window.scrollY; }
      return;
    }
    e.preventDefault();

    var delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 16;            // lines  → px
    else if (e.deltaMode === 2) delta *= window.innerHeight;   // pages → px

    target = Math.min(limit(), Math.max(0, target + delta));
    start();
  }, { passive: false });

  // keyboard, scrollbar drags and hash jumps still scroll natively — resync to them
  window.addEventListener('scroll', function () {
    if (animating || running) return;
    target = current = window.scrollY;
  }, { passive: true });

  window.addEventListener('resize', function () {
    target = Math.min(target, limit());
  }, { passive: true });

  // let other scripts (the nav) hand a destination to the same easing loop
  window.__smooth = {
    to: function (y) {
      target = Math.min(limit(), Math.max(0, y));
      start();
    }
  };
})();
/* ------------------------------------------------------------
   Nav bar: reveal on scroll, eased anchor jumps, mobile panel
   ------------------------------------------------------------ */
(function () {
  var nav = document.getElementById('site-nav');
  if (!nav) return;                  // pages without a nav — the PDF view, the component sheets
  var toggle = nav.querySelector('.nav__toggle');
  var panel = document.getElementById('nav-panel');
  var OFFSET = 48;   // breathing room above the target section

  /* --- reveal once the page has moved off the top, retract on the way back --- */
  var NEAR_TOP = 140;          // start retracting while the top is still approaching
  var lastY = window.scrollY;

  function sync() {
    var y = window.scrollY;
    var goingDown = y > lastY;
    lastY = y;

    if (y <= 1 || (!goingDown && y < NEAR_TOP)) {
      nav.classList.remove('is-visible');   // at rest, or heading back up near the top
      close();
    } else if (goingDown && y > 1) {
      nav.classList.add('is-visible');
    }
  }
  window.addEventListener('scroll', sync, { passive: true });
  sync();

  /* --- mobile panel --- */
  function open() {
    nav.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
  }
  function close() {
    if (!nav.classList.contains('is-open')) return;
    nav.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
  }
  toggle.addEventListener('click', function () {
    nav.classList.contains('is-open') ? close() : open();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });

  /* --- eased jump to a section, 48px clear of the top --- */
  function goTo(y) {
    if (window.__smooth) window.__smooth.to(y);
    else window.scrollTo({ top: y, behavior: 'smooth' });
  }

  // any in-page link gets the eased jump — nav links and the stack cards alike
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href^="#"]');
    if (!link || link.getAttribute('href') === '#') return;
    var hash = link.getAttribute('href');
    e.preventDefault();
    close();

    if (hash === '#top') { goTo(0); return; }

    var el = document.querySelector(hash);
    if (!el) return;
    var y = el.getBoundingClientRect().top + window.scrollY - OFFSET;
    goTo(Math.max(0, y));
  });
})();
/* ------------------------------------------------------------
   Chart tooltips — one delegated handler for every mark on the page.
   Any element with [data-tip] gets a hover/focus tooltip.
   ------------------------------------------------------------ */
(function () {
  var tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.setAttribute('role', 'status');
  document.body.appendChild(tip);

  function show(el) {
    var r = el.getBoundingClientRect();
    tip.innerHTML = el.getAttribute('data-tip');
    tip.style.left = (r.left + r.width / 2) + 'px';
    tip.style.top = r.top + 'px';
    tip.classList.add('is-on');
  }
  function hide() { tip.classList.remove('is-on'); }

  ['mouseover', 'focusin'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      var el = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (el) show(el);
    }, true);
  });
  ['mouseout', 'focusout', 'scroll'].forEach(function (ev) {
    document.addEventListener(ev, hide, true);
  });
})();
/* ------------------------------------------------------------
   Scroll reveal — opt-in per chart with .chart--reveal
   Bars ease up from zero and the figures count with them, once,
   the first time the chart enters the viewport. Charts without
   the class are untouched, and without JS every bar sits at its
   full value, so no figure is ever hidden behind this script.
   ------------------------------------------------------------ */
(function () {
  var charts = [].slice.call(document.querySelectorAll('.chart--reveal'));
  if (!charts.length) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DUR = 900;                                  // matches --reveal-dur
  var NUM = /^\s*(-?\d+(?:\.\d+)?)(.*)$/;         // "45%" · "28" · "2.8 / 5"

  /* the printed figures in one chart, with their decimal places and suffix */
  function figures(chart) {
    var out = [];
    [].slice.call(chart.querySelectorAll('.chart__row-value, .chart__bar-value'))
      .forEach(function (el) {
        var m = NUM.exec(el.textContent);
        if (!m) return;                           // leave anything non-numeric alone
        var raw = m[1];
        var dot = raw.indexOf('.');
        out.push({
          el:   el,
          to:   parseFloat(raw),
          dp:   dot < 0 ? 0 : raw.length - dot - 1,
          tail: m[2] || ''
        });
      });
    return out;
  }

  function count(items, t) {
    items.forEach(function (f) {
      f.el.textContent = (f.to * t).toFixed(f.dp) + f.tail;
    });
  }

  function reveal(chart) {
    chart.classList.remove('is-pending');
    var items = chart.__figs;
    if (!items || !items.length) return;
    if (reduced) { count(items, 1); return; }

    var start = 0;
    requestAnimationFrame(function frame(now) {
      if (!start) start = now;
      var t = Math.min(1, (now - start) / DUR);
      count(items, 1 - Math.pow(1 - t, 4));       // ≈ cubic-bezier(.22,1,.36,1)
      if (t < 1) requestAnimationFrame(frame);
    });
  }

  charts.forEach(function (c) {
    c.__figs = figures(c);
    c.classList.add('is-pending');
    count(c.__figs, 0);
  });

  if (reduced || !('IntersectionObserver' in window)) {
    charts.forEach(reveal);
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);                     // reveal once, never re-run
      reveal(e.target);
    });
  }, { threshold: 0, rootMargin: '0px 0px -15% 0px' });

  // one frame so the zero state paints before the transition starts
  requestAnimationFrame(function () {
    charts.forEach(function (c) { io.observe(c); });
  });
})();
/* ------------------------------------------------------------
   Action buttons — copy link, and labels on a touch screen
   The label itself is CSS (:hover / :focus-visible). This adds the
   two things CSS cannot do: put the URL on the clipboard, and say
   so afterwards; and reveal a label where there is no cursor to
   hover with. Every button works as a plain link or a no-op if
   this never runs, so nothing here is load-bearing.
   ------------------------------------------------------------ */
(function () {
  var HOLD = 1600;                 // how long a confirmation stands
  var TIP  = 1800;                 // how long a tapped label stands
  var live = null;                 // the button currently showing .is-tipped
  var timer = null;

  function clear() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!live) return;
    live.classList.remove('is-tipped');
    var b = live.querySelector('.action-button__bubble');
    if (b && b.dataset.restore) { b.textContent = b.dataset.restore; delete b.dataset.restore; }
    live = null;
  }

  function tip(btn, text, ms) {
    clear();
    var b = btn.querySelector('.action-button__bubble');
    if (b && text) { b.dataset.restore = b.textContent; b.textContent = text; }
    btn.classList.add('is-tipped');
    live = btn;
    timer = setTimeout(clear, ms);
  }

  /* Clipboard API first; the textarea is for a file:// page or an
     older browser, where writeText is missing or rejects. */
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-100px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject();
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-copy-link]');
    if (!btn) {
      /* A tap anywhere else puts the standing label away. */
      if (live && !(e.target.closest && e.target.closest('.action-button'))) clear();
      return;
    }
    e.preventDefault();
    var url = btn.getAttribute('data-copy-link') || location.href;
    copy(url).then(
      function () { tip(btn, 'Link Copied', HOLD); },
      function () { tip(btn, 'Press Ctrl+C', HOLD); }
    );
  });

  /* Touch only: reveal the label of a button that has nothing to copy
     and nowhere to go — on a pointer device :hover already did it. */
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.action-button');
      if (!btn || btn.hasAttribute('data-copy-link')) return;
      if (btn.tagName === 'A' && btn.getAttribute('href')) return;   // let it navigate
      tip(btn, null, TIP);
    });
  }

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') clear(); });
  window.addEventListener('scroll', clear, { passive: true });
})();
