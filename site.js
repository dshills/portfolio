/* Hills Consulting — site behaviour. No dependencies.
   1. Contour maps   — any element with [data-contours] gets a live topographic canvas
   2. Scroll reveals — .reveal elements fade up once
   3. Filters        — [data-filter] containers get search + topic chips */
(function () {
  'use strict';
  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 1. contour maps ─────────────────────────────────────────── */

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeNoise(seed) {
    var rnd = mulberry32(seed), p = new Uint8Array(512), i, j, t;
    for (i = 0; i < 256; i++) p[i] = i;
    for (i = 255; i > 0; i--) { j = (rnd() * (i + 1)) | 0; t = p[i]; p[i] = p[j]; p[j] = t; }
    for (i = 0; i < 256; i++) p[i + 256] = p[i];
    function grad(h, x, y) {
      switch (h & 7) {
        case 0: return x + y; case 1: return x - y; case 2: return -x + y; case 3: return -x - y;
        case 4: return x; case 5: return -x; case 6: return y; default: return -y;
      }
    }
    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    return function (x, y) {
      var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      x -= Math.floor(x); y -= Math.floor(y);
      var u = fade(x), v = fade(y), a = p[X] + Y, b = p[X + 1] + Y;
      var n0 = grad(p[a], x, y), n1 = grad(p[b], x - 1, y);
      var n2 = grad(p[a + 1], x, y - 1), n3 = grad(p[b + 1], x - 1, y - 1);
      var l0 = n0 + u * (n1 - n0), l1 = n2 + u * (n3 - n2);
      return l0 + v * (l1 - l0);
    };
  }

  // marching-squares lookup: corner bits are tl=8 tr=4 br=2 bl=1; edges are 0 top, 1 right, 2 bottom, 3 left
  var CASES = [
    [], [3, 2], [2, 1], [3, 1], [0, 1], [0, 3, 2, 1], [0, 2], [0, 3],
    [0, 3], [0, 2], [0, 1, 3, 2], [0, 1], [3, 1], [2, 1], [3, 2], []
  ];

  function contourMap(host) {
    var canvas = host.querySelector('canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var readout = host.querySelector('[data-elev]');
    var interactive = host.hasAttribute('data-interactive') && !reduceMotion;
    var noise = makeNoise(parseInt(host.getAttribute('data-seed') || '7', 10));
    var STEP = 11, INTERVAL = 0.055, INDEX_EVERY = 5;
    var W = 0, H = 0, cols = 0, rows = 0, base = null, field = null;
    var colors = { minor: '#c9ac85', index: '#a8825a' };
    var rise = reduceMotion ? 1 : 0, riseStart = 0;
    var ptr = { x: 0, y: 0, tx: 0, ty: 0, amp: 0, tamp: 0 };
    var raf = 0, visible = true;

    function build() {
      var r = host.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(W / STEP); rows = Math.ceil(H / STEP);
      base = new Float32Array((cols + 1) * (rows + 1));
      field = new Float32Array(base.length);
      var f = 1 / 420, i = 0, x, y, n;
      for (y = 0; y <= rows; y++) {
        for (x = 0; x <= cols; x++) {
          var px = x * STEP, py = y * STEP;
          n = 0.62 * noise(px * f, py * f) + 0.27 * noise(px * f * 2.1 + 40, py * f * 2.1 + 40) + 0.11 * noise(px * f * 4.3 + 90, py * f * 4.3 + 90);
          base[i++] = Math.min(1, Math.max(0, n * 0.72 + 0.5));
        }
      }
      var cs = getComputedStyle(host);
      colors.minor = cs.getPropertyValue('--contour').trim() || colors.minor;
      colors.index = cs.getPropertyValue('--contour-index').trim() || colors.index;
    }

    function draw() {
      var i, x, y, sigma = 150, s2 = 2 * sigma * sigma, n = base.length;
      var r = 0.25 + 0.75 * rise;
      if (ptr.amp > 0.002) {
        i = 0;
        for (y = 0; y <= rows; y++) {
          var dy = y * STEP - ptr.y;
          for (x = 0; x <= cols; x++) {
            var dx = x * STEP - ptr.x;
            field[i] = base[i] * r + ptr.amp * 0.3 * Math.exp(-(dx * dx + dy * dy) / s2);
            i++;
          }
        }
      } else {
        for (i = 0; i < n; i++) field[i] = base[i] * r;
      }

      var minor = new Path2D(), index = new Path2D(), rowLen = cols + 1;
      var ex = [0, 0, 0, 0], ey = [0, 0, 0, 0];
      for (y = 0; y < rows; y++) {
        for (x = 0; x < cols; x++) {
          var o = y * rowLen + x;
          var tl = field[o], tr = field[o + 1], bl = field[o + rowLen], br = field[o + rowLen + 1];
          var lo = Math.min(tl, tr, bl, br), hi = Math.max(tl, tr, bl, br);
          var k0 = Math.ceil(lo / INTERVAL), k1 = Math.floor(hi / INTERVAL);
          for (var k = k0; k <= k1; k++) {
            var L = k * INTERVAL;
            var c = (tl > L ? 8 : 0) | (tr > L ? 4 : 0) | (br > L ? 2 : 0) | (bl > L ? 1 : 0);
            var segs = CASES[c];
            if (!segs.length) continue;
            var x0 = x * STEP, y0 = y * STEP;
            ex[0] = x0 + STEP * (L - tl) / (tr - tl); ey[0] = y0;
            ex[1] = x0 + STEP; ey[1] = y0 + STEP * (L - tr) / (br - tr);
            ex[2] = x0 + STEP * (L - bl) / (br - bl); ey[2] = y0 + STEP;
            ex[3] = x0; ey[3] = y0 + STEP * (L - tl) / (bl - tl);
            var path = (k % INDEX_EVERY === 0) ? index : minor;
            for (var s = 0; s < segs.length; s += 2) {
              path.moveTo(ex[segs[s]], ey[segs[s]]);
              path.lineTo(ex[segs[s + 1]], ey[segs[s + 1]]);
            }
          }
        }
      }
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round';
      ctx.strokeStyle = colors.minor; ctx.lineWidth = 1; ctx.stroke(minor);
      ctx.strokeStyle = colors.index; ctx.lineWidth = 1.9; ctx.stroke(index);

      if (readout) {
        var gx = Math.min(cols, Math.max(0, Math.round(ptr.x / STEP)));
        var gy = Math.min(rows, Math.max(0, Math.round(ptr.y / STEP)));
        var h = ptr.amp > 0.05 ? field[gy * rowLen + gx] : 0.125;
        var ft = Math.round(900 + h * 400);
        readout.innerHTML = 'Elev <b>' + ft.toLocaleString('en-US') + '</b> ft';
      }
    }

    function tick(now) {
      raf = 0;
      var busy = false;
      if (rise < 1) {
        if (!riseStart) riseStart = now;
        var t = Math.min(1, (now - riseStart) / 1900);
        rise = 1 - Math.pow(1 - t, 3);
        busy = t < 1;
      }
      ptr.x += (ptr.tx - ptr.x) * 0.14; ptr.y += (ptr.ty - ptr.y) * 0.14;
      ptr.amp += (ptr.tamp - ptr.amp) * 0.08;
      if (Math.abs(ptr.tx - ptr.x) > 0.3 || Math.abs(ptr.ty - ptr.y) > 0.3 || Math.abs(ptr.tamp - ptr.amp) > 0.004) busy = true;
      draw();
      if (busy && visible) kick();
    }
    function kick() { if (!raf) raf = requestAnimationFrame(tick); }

    build(); draw();
    if (!reduceMotion) kick();

    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        var r = host.getBoundingClientRect();
        if (Math.round(r.width) === W && Math.round(r.height) === H) return;
        build(); if (raf) return; draw();
      }).observe(host);
    }
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting; if (visible && !reduceMotion) kick();
      }).observe(host);
    }
    if (interactive) {
      host.addEventListener('pointermove', function (e) {
        var r = host.getBoundingClientRect();
        ptr.tx = e.clientX - r.left; ptr.ty = e.clientY - r.top;
        if (ptr.amp < 0.01) { ptr.x = ptr.tx; ptr.y = ptr.ty; }
        ptr.tamp = 1; kick();
      });
      host.addEventListener('pointerleave', function () { ptr.tamp = 0; kick(); });
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll('[data-contours]'), contourMap);

  /* ── 2. scroll reveals ───────────────────────────────────────── */

  var reveals = document.querySelectorAll('.reveal');
  if (reduceMotion || !window.IntersectionObserver) {
    Array.prototype.forEach.call(reveals, function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -4% 0px' });
    var vh = window.innerHeight;
    Array.prototype.forEach.call(reveals, function (el) {
      // anything already above the fold line (e.g. after a #hash jump) shows immediately
      if (el.getBoundingClientRect().top < vh * 0.1) el.classList.add('in'); else io.observe(el);
    });
  }

  /* ── 3. search + topic filters ───────────────────────────────── */

  Array.prototype.forEach.call(document.querySelectorAll('[data-filter]'), function (root) {
    var input = root.querySelector('[data-q]');
    var chips = root.querySelectorAll('[data-tag]');
    var items = root.querySelectorAll('[data-item]');
    var groups = root.querySelectorAll('[data-group]');
    var count = root.querySelector('[data-count]');
    var empty = root.querySelector('[data-empty]');
    var noun = (count && count.getAttribute('data-noun')) || 'items';
    var tag = 'all';

    function apply() {
      var q = input ? input.value.trim().toLowerCase() : '', shown = 0;
      Array.prototype.forEach.call(items, function (el) {
        var okTag = tag === 'all' || (el.getAttribute('data-tags') || '').split(' ').indexOf(tag) > -1;
        var okQ = !q || el.textContent.toLowerCase().indexOf(q) > -1;
        el.hidden = !(okTag && okQ);
        if (!el.hidden) shown++;
      });
      Array.prototype.forEach.call(groups, function (g) {
        g.hidden = !g.querySelector('[data-item]:not([hidden])');
      });
      if (count) count.textContent = shown + ' of ' + items.length + ' ' + noun;
      if (empty) empty.classList.toggle('show', shown === 0);
    }

    if (input) input.addEventListener('input', apply);
    Array.prototype.forEach.call(chips, function (chip) {
      chip.addEventListener('click', function () {
        tag = chip.getAttribute('data-tag');
        Array.prototype.forEach.call(chips, function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
        apply();
      });
    });
    document.addEventListener('keydown', function (e) {
      if (input && e.key === '/' && document.activeElement !== input && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
        e.preventDefault(); input.focus();
      }
    });
    apply();
  });
})();
