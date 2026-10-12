/* ------------------------------------------------------------
   PDF VIEW — the bar's behaviour
   Three things: the chapter picker opens and closes, a row takes
   you to its sheet, and the trigger keeps naming the sheet you
   are actually looking at. Everything here degrades to a plain
   scrolling stack of sheets if the script never runs.
   ------------------------------------------------------------ */
(function () {
  var picker  = document.querySelector('.pdf-picker');
  var sheets  = [].slice.call(document.querySelectorAll('.pdf-page[data-chapter]'));
  if (!picker || !sheets.length) return;

  var trigger = picker.querySelector('.pdf-picker__trigger');
  var panel   = picker.querySelector('.pdf-picker__panel');
  var rows    = [].slice.call(picker.querySelectorAll('.pdf-toc__row'));
  var num     = picker.querySelector('.pdf-picker__num');
  var name    = picker.querySelector('.pdf-picker__name');

  /* --- open / close ------------------------------------------------ */
  function open() {
    picker.dataset.open = 'true';
    trigger.setAttribute('aria-expanded', 'true');
  }
  function close() {
    if (picker.dataset.open !== 'true') return;
    picker.dataset.open = 'false';
    trigger.setAttribute('aria-expanded', 'false');
  }
  trigger.addEventListener('click', function (e) {
    e.stopPropagation();
    picker.dataset.open === 'true' ? close() : open();
  });
  document.addEventListener('click', function (e) {
    if (!picker.contains(e.target)) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { close(); trigger.focus(); }
  });
  /* Arrow keys walk the open panel, so the control is usable without a mouse. */
  panel.addEventListener('keydown', function (e) {
    var i = rows.indexOf(document.activeElement);
    if (i < 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); rows[Math.min(i + 1, rows.length - 1)].focus(); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); rows[Math.max(i - 1, 0)].focus(); }
  });

  /* --- a row takes you to its sheet -------------------------------- */
  function goTo(y) {
    if (window.__smooth) window.__smooth.to(y);
    else window.scrollTo({ top: y, behavior: 'smooth' });
  }
  rows.forEach(function (row) {
    row.addEventListener('click', function () {
      var target = document.getElementById(row.getAttribute('data-goto'));
      close();
      if (!target) return;
      /* A sheet is painted by a transform, so its box still measures full
         size. getBoundingClientRect reports what is on screen, which is
         what we want to scroll to. */
      var y = target.getBoundingClientRect().top + window.scrollY - 24;
      goTo(Math.max(0, y));
    });
  });

  /* --- the trigger names the sheet you are looking at --------------- */
  function label(el) {
    var n = el.getAttribute('data-chapter-num') || '';
    var t = el.getAttribute('data-chapter') || '';
    if (num) { num.textContent = n; num.hidden = !n; }
    if (name) name.textContent = t;
    rows.forEach(function (r) {
      var on = r.getAttribute('data-goto') === el.id;
      on ? r.setAttribute('aria-current', 'true') : r.removeAttribute('aria-current');
    });
  }

  /* Whichever sheet covers the middle of the window is the one being read.
     rootMargin pins the test line there rather than at the viewport edge. */
  if ('IntersectionObserver' in window) {
    var seen = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && en.target !== seen) { seen = en.target; label(en.target); }
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    sheets.forEach(function (s) { io.observe(s); });
  }
  label(sheets[0]);

  /* --- fit the sheet to a narrow window ----------------------------- */
  /* Above 1000px the artboards' own 0.7456 is used, so the preview matches
     the file. Below it there is no room for that, and the sheet follows the
     window instead — width minus a 24px gutter each side. */
  function fit() {
    var root = document.documentElement;
    if (window.innerWidth > 1000) { root.style.removeProperty('--fit-scale'); return; }
    var scale = Math.max(.25, (window.innerWidth - 48) / 1191);
    root.style.setProperty('--fit-scale', scale.toFixed(5));
  }
  window.addEventListener('resize', fit);
  fit();
})();
