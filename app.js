/* =====================================================================
   Road to Immortal — APP (UI, routing, interactions)
   Vanilla JS. Reads derived values from engine; writes only raw logs.
   ===================================================================== */
(function () {
  'use strict';
  var U = window.RTI_UTIL, CFG = window.RTI_CONFIG, S = window.RTI_STORE, E = window.RTI_ENGINE;
  // increment 4 modules (rota / sanctum / oracle). May be undefined if a script
  // failed to load — every call site guards, showing a note instead of crashing.
  var R = window.RTI_ROTA, SAN = window.RTI_SANCTUM, ORA = window.RTI_ORACLE;
  var appEl = document.getElementById('app');
  var tabsEl = document.getElementById('tabs');
  var fab = document.getElementById('urge-fab');

  var state = { tab: 'today', viewDate: U.todayISO() };

  /* ---------- tiny helpers ---------- */
  function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  function esc(s) { return U.escapeHtml(s); }
  function today() { return U.todayISO(); }
  function reducedMotion() {
    return S.getSettings().reducedMotion ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function toast(msg, ms) {
    var t = h('<div class="toast">' + esc(msg) + '</div>'); document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 2200);
  }
  function fill(text, snap) {
    return text
      .replace(/\{day\}/g, snap.day)
      .replace(/\{streak\}/g, snap.streak.current)
      .replace(/\{rank\}/g, snap.rank.current ? snap.rank.current.name : '—')
      .replace(/\{next\}/g, snap.rank.next ? snap.rank.next.name : 'the summit')
      .replace(/\{toNext\}/g, snap.rank.daysToNext)
      .replace(/\{index\}/g, snap.meters.index);
  }
  function dailyPick(arr) {
    // deterministic per-day rotation so the quote is stable across a day
    var seed = U.daysBetween('2020-01-01', today());
    return arr[((seed % arr.length) + arr.length) % arr.length];
  }
  function shieldSVG(filled) {
    return '<svg class="shield' + (filled ? '' : ' empty') + '" viewBox="0 0 24 28"><path d="M12 1 L22 5 V13 C22 21 12 27 12 27 C12 27 2 21 2 13 V5 Z" fill="' +
      (filled ? 'url(#sg)' : 'rgba(255,255,255,0.15)') + '" stroke="rgba(98,216,255,0.6)"/>' +
      '<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bff0ff"/><stop offset="1" stop-color="#62d8ff"/></linearGradient></defs></svg>';
  }

  /* ---------- chart helpers (hand-rolled SVG, no CDN) ---------- */
  function barChart(items, color, unit) {
    if (!items.length) return '<p class="faint tiny">No data yet.</p>';
    var max = Math.max(1, Math.max.apply(null, items.map(function (i) { return i.value; })));
    var W = 320, H = 130, pad = 18, bw = (W - pad * 2) / items.length;
    var bars = items.map(function (it, i) {
      var bh = (it.value / max) * (H - pad * 2);
      var x = pad + i * bw + bw * 0.15, y = H - pad - bh, w = bw * 0.7;
      return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(0, bh).toFixed(1) +
        '" rx="3" fill="' + color + '" opacity="0.9"/>' +
        '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 4) + '" font-size="9" fill="#6a6f99" text-anchor="middle">' + esc(it.label) + '</text>';
    }).join('');
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">' + bars +
      '<text x="' + pad + '" y="12" font-size="9" fill="#6a6f99">max ' + max + (unit ? ' ' + unit : '') + '</text></svg>';
  }
  function lineChart(points, color, opt) {
    opt = opt || {};
    var pts = points.filter(function (p) { return p.y != null && !isNaN(p.y); });
    if (pts.length < 2) return '<p class="faint tiny">Not enough data yet.</p>';
    var W = 320, H = 130, pad = 22;
    var xs = pts.map(function (p) { return p.x; }), ys = pts.map(function (p) { return p.y; });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    var minY = opt.min != null ? opt.min : Math.min.apply(null, ys);
    var maxY = opt.max != null ? opt.max : Math.max.apply(null, ys);
    if (maxY === minY) maxY = minY + 1;
    function px(x) { return pad + (x - minX) / (maxX - minX || 1) * (W - pad * 2); }
    function py(y) { return H - pad - (y - minY) / (maxY - minY) * (H - pad * 2); }
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + px(p.x).toFixed(1) + ' ' + py(p.y).toFixed(1); }).join(' ');
    var dots = pts.map(function (p) { return '<circle cx="' + px(p.x).toFixed(1) + '" cy="' + py(p.y).toFixed(1) + '" r="2.5" fill="' + color + '"/>'; }).join('');
    var trend = '';
    if (opt.trend) {
      var lr = U.linreg(xs, ys);
      if (lr) trend = '<line x1="' + px(minX).toFixed(1) + '" y1="' + py(lr.intercept + lr.slope * minX).toFixed(1) +
        '" x2="' + px(maxX).toFixed(1) + '" y2="' + py(lr.intercept + lr.slope * maxX).toFixed(1) +
        '" stroke="#d6af4e" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.85"/>';
    }
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">' +
      '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" opacity="0.9"/>' + trend + dots +
      '<text x="' + pad + '" y="12" font-size="9" fill="#6a6f99">' + esc(opt.ylabel || '') + '</text>' +
      '<text x="' + (W - pad) + '" y="' + (H - 6) + '" font-size="9" fill="#6a6f99" text-anchor="end">' + esc(opt.xlabel || '') + '</text></svg>';
  }
  // Two series over a shared x-axis, each normalized to ITS OWN range so the
  // shapes can be read side by side (values labelled, not the axis).
  function dualLineChart(rows, aOpt, bOpt) {
    var W = 320, H = 144, pad = 22;
    var xs = rows.map(function (r) { return r.x; });
    if (xs.length < 2) return '<p class="faint tiny">Not enough data yet — keep logging.</p>';
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
    function norm(key) {
      var v = rows.map(function (r) { return r[key]; }).filter(function (x) { return x != null && !isNaN(x); });
      if (!v.length) return null;
      var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v);
      return { mn: mn, mx: mx, range: (mx - mn) || 1 };
    }
    function px(x) { return pad + (x - minX) / ((maxX - minX) || 1) * (W - pad * 2); }
    function py(t) { return H - pad - t * (H - pad * 2); }
    function path(key, n, color) {
      if (!n) return '';
      var d = '', started = false, dots = '';
      rows.forEach(function (r) {
        var v = r[key]; if (v == null || isNaN(v)) return;
        var t = (v - n.mn) / n.range, X = px(r.x).toFixed(1), Y = py(t).toFixed(1);
        d += (started ? 'L' : 'M') + X + ' ' + Y + ' '; started = true;
        dots += '<circle cx="' + X + '" cy="' + Y + '" r="1.8" fill="' + color + '"/>';
      });
      return '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" opacity="0.92"/>' + dots;
    }
    var na = norm('a'), nb = norm('b');
    var fmt = function (v) { return Math.abs(v) >= 100 ? Math.round(v) : U.round(v, 1); };
    var legend = '<div class="legend" style="justify-content:center">' +
      '<span><i style="background:' + aOpt.color + '"></i>' + esc(aOpt.label) + (na ? ' (' + fmt(na.mn) + '–' + fmt(na.mx) + ')' : '') + '</span>' +
      '<span><i style="background:' + bOpt.color + '"></i>' + esc(bOpt.label) + (nb ? ' (' + fmt(nb.mn) + '–' + fmt(nb.mx) + ')' : '') + '</span></div>';
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">' + path('a', na, aOpt.color) + path('b', nb, bOpt.color) +
      '<text x="' + (W - pad) + '" y="' + (H - 5) + '" font-size="9" fill="#6a6f99" text-anchor="end">day</text></svg>' + legend;
  }
  // count-up animation for a hero number (respects reduced motion)
  function countUp(el, target, ms) {
    if (!el) return;
    if (reducedMotion()) { el.textContent = Math.round(target).toLocaleString(); return; }
    var start = 0, t0 = null, dur = ms || 1400;
    function step(ts) {
      if (t0 == null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur), eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(start + (target - start) * eased).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* =================== AURORA BACKGROUND =================== */
  (function aurora() {
    var c = document.getElementById('aurora'), ctx = c.getContext('2d');
    var orbs = [], stars = [], raf = null, running = false;
    function size() { c.width = innerWidth; c.height = innerHeight; }
    function init() {
      size();
      orbs = [
        { x: .25, y: .2, r: .5, col: [154, 107, 255], p: 0 },
        { x: .8, y: .35, r: .45, col: [98, 216, 255], p: 2 },
        { x: .5, y: .9, r: .55, col: [214, 175, 78], p: 4 }
      ];
      stars = [];
      for (var i = 0; i < 40; i++) stars.push({ x: Math.random(), y: Math.random(), s: Math.random() * 1.5 + .3, tw: Math.random() * 6 });
    }
    var t0 = Date.now();
    function frame() {
      if (!running) return;
      var t = (Date.now() - t0) / 1000;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'lighter';
      orbs.forEach(function (o) {
        var x = (o.x + Math.sin(t * 0.06 + o.p) * 0.05) * c.width;
        var y = (o.y + Math.cos(t * 0.05 + o.p) * 0.05) * c.height;
        var r = o.r * Math.min(c.width, c.height);
        var g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(' + o.col[0] + ',' + o.col[1] + ',' + o.col[2] + ',0.10)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      });
      stars.forEach(function (s) {
        var a = 0.3 + 0.3 * Math.sin(t * 1.2 + s.tw);
        ctx.fillStyle = 'rgba(200,210,255,' + a.toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(s.x * c.width, s.y * c.height, s.s, 0, 7); ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    }
    function start() { if (running) return; if (reducedMotion()) { drawStatic(); return; } running = true; frame(); }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); }
    function drawStatic() {
      // single calm frame for reduced-motion / hidden tab
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.globalCompositeOperation = 'lighter';
      orbs.forEach(function (o) {
        var x = o.x * c.width, y = o.y * c.height, r = o.r * Math.min(c.width, c.height);
        var g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(' + o.col[0] + ',' + o.col[1] + ',' + o.col[2] + ',0.08)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
    }
    window.addEventListener('resize', function () { init(); reducedMotion() ? drawStatic() : null; });
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    init();
    window.RTI_AURORA = { start: start, stop: stop };
    start();
  })();

  /* =================== MILESTONE PARTICLES =================== */
  function celebrate(rankName) {
    var c = document.getElementById('fx'), ctx = c.getContext('2d');
    c.width = innerWidth; c.height = innerHeight;
    var ov = h('<div class="overlay" style="background:rgba(4,4,12,0.7)"><div class="day-num">RANK ATTAINED</div>' +
      '<h2 style="color:var(--gold-soft);text-shadow:0 0 30px rgba(214,175,78,.6);font-size:34px">' + esc(rankName) + '</h2>' +
      '<p class="muted">The order rises with you.</p><button class="btn gold" data-x="close">Onward</button></div>');
    ov.querySelector('[data-x=close]').onclick = function () { ov.remove(); ctx.clearRect(0, 0, c.width, c.height); };
    document.body.appendChild(ov);
    if (reducedMotion()) return;
    var parts = [];
    for (var i = 0; i < 140; i++) {
      var ang = Math.random() * 7, sp = Math.random() * 7 + 2;
      parts.push({ x: c.width / 2, y: c.height * 0.42, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 2,
        life: 1, col: Math.random() < .5 ? '214,175,78' : '98,216,255', s: Math.random() * 3 + 1 });
    }
    var t = 0;
    (function anim() {
      t++; ctx.clearRect(0, 0, c.width, c.height);
      parts.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life -= 0.012;
        ctx.fillStyle = 'rgba(' + p.col + ',' + Math.max(0, p.life).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 7); ctx.fill(); });
      if (t < 160 && document.body.contains(ov)) requestAnimationFrame(anim);
      else ctx.clearRect(0, 0, c.width, c.height);
    })();
  }
  function checkMilestone(snap) {
    var meta = S.getMeta();
    if (snap.rank.index > meta.lastSeenRankIndex && snap.rank.current) {
      if (meta.lastSeenRankIndex >= 0) celebrate(snap.rank.current.name); // don't fire on first ever load
      S.setMeta({ lastSeenRankIndex: snap.rank.index });
    }
  }

  /* =================== CHI BURST =================== */
  function chiBurst(amount, anchorEl) {
    var rect = anchorEl ? anchorEl.getBoundingClientRect() : { left: innerWidth / 2 - 20, top: innerHeight / 2 };
    var b = h('<div class="chi-burst">+' + amount + ' CHI</div>');
    b.style.left = (rect.left + (anchorEl ? rect.width / 2 : 0) - 20) + 'px';
    b.style.top = (rect.top - 6) + 'px';
    document.body.appendChild(b);
    setTimeout(function () { b.remove(); }, 1100);
  }

  /* =================== URGE INTERVENTION (section 7) =================== */
  function openUrge() {
    var snap = E.snapshot(today());
    var dangerQuote = dailyPick(CFG.quotes.dangerWindow);
    var fallFrom = snap.rank.current ? snap.rank.current.name : '—';
    var ov = h(
      '<div class="overlay">' +
        '<div class="day-num">HOLD THE LINE</div>' +
        '<p class="muted" style="max-width:340px">' + esc(dangerQuote) + '</p>' +
        '<div class="mini-meter" style="margin-top:6px">' +
          '<div class="meter m-chi"><div class="lbl"><span>Chi if you give in</span><b id="u-chi">' + snap.meters.chi + '</b></div>' +
          '<div class="bar drain"><i id="u-chibar" style="width:' + snap.meters.chi + '%"></i></div></div>' +
          '<div class="tiny faint" style="margin-top:8px">Streak <b id="u-streak" style="color:#ff8aa8">' + snap.streak.current + '</b> → 0 · you would fall from <b style="color:var(--gold-soft)">' + esc(fallFrom) + '</b></div>' +
        '</div>' +
        '<div class="breath run" id="u-breath">breathe</div>' +
        '<div class="timer" id="u-timer">ride it out · 90s</div>' +
        '<button class="btn gold full" style="max-width:340px;margin-top:18px" data-x="bank">Still here — urge passing</button>' +
        '<button class="btn ghost sm" style="margin-top:10px;color:var(--ink-faint)" data-x="leave">leave quietly</button>' +
      '</div>');
    document.body.appendChild(ov);

    // loss-aversion drain preview after a beat
    setTimeout(function () {
      var bar = ov.querySelector('#u-chibar'), chiv = ov.querySelector('#u-chi'), st = ov.querySelector('#u-streak');
      var drained = Math.round(snap.meters.chi * CFG.meters.chi.relapseDampen);
      if (bar) { bar.style.width = drained + '%'; chiv.textContent = drained; st.textContent = '0'; }
    }, 1400);

    // breathing pace text + 90s timer (early bank allowed)
    var left = 90, breath = ov.querySelector('#u-breath'), timer = ov.querySelector('#u-timer');
    var phase = ['breathe in', 'hold', 'breathe out'], pi = 0;
    var bi = setInterval(function () { if (breath) breath.textContent = phase[pi++ % phase.length]; }, 3000);
    var ti = setInterval(function () { left--; if (timer) timer.textContent = left > 0 ? 'ride it out · ' + left + 's' : 'the wave has passed'; if (left <= 0) clearInterval(ti); }, 1000);

    function cleanup() { clearInterval(bi); clearInterval(ti); ov.remove(); }
    ov._cleanup = cleanup; // so Esc/force-close also clears the intervals
    ov.querySelector('[data-x=leave]').onclick = cleanup;
    ov.querySelector('[data-x=bank]').onclick = function () {
      clearInterval(bi); clearInterval(ti); ov._cleanup = null;
      S.bankUrge(Date.now(), today());
      // victory + reward (what you'd miss + quote) using live stats
      var s2 = E.snapshot(today());
      var miss = fill(dailyPick(CFG.quotes.miss), s2);
      ov.innerHTML =
        '<div class="day-num" style="color:var(--good)">URGE RESISTED · BANKED</div>' +
        '<div class="breath" style="border-color:rgba(91,224,160,.6);background:radial-gradient(circle,rgba(91,224,160,.35),transparent 70%);color:#bdf5d8">✓</div>' +
        '<h2 style="color:var(--good)">+1 Willpower</h2>' +
        '<p class="muted" style="max-width:340px">' + esc(miss) + '</p>' +
        '<p class="codex-quote" style="font-size:17px;max-width:360px">' + esc(fill(dailyPick(CFG.quotes.daily), s2)) + '</p>' +
        '<button class="btn gold" data-x="done">Return stronger</button>';
      ov.querySelector('[data-x=done]').onclick = function () { ov.remove(); render(); };
      if (!reducedMotion()) celebrateSmall();
    };
  }
  function celebrateSmall() {
    var c = document.getElementById('fx'), ctx = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
    var parts = []; for (var i = 0; i < 60; i++) { var a = Math.random() * 7, sp = Math.random() * 5 + 1;
      parts.push({ x: c.width / 2, y: c.height / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, s: Math.random() * 2 + 1 }); }
    var t = 0; (function anim() { t++; ctx.clearRect(0, 0, c.width, c.height);
      parts.forEach(function (p) { p.x += p.vx; p.y += p.vy; p.life -= 0.02;
        ctx.fillStyle = 'rgba(91,224,160,' + Math.max(0, p.life).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, 7); ctx.fill(); });
      if (t < 70) requestAnimationFrame(anim); else ctx.clearRect(0, 0, c.width, c.height); })();
  }

  /* =================== RELAPSE (section 8, compassion) =================== */
  function openRelapse() {
    var snap = E.snapshot(today());
    var ov = h('<div class="overlay">' +
      '<div class="day-num">A FALL IS DATA, NOT A VERDICT</div>' +
      '<p class="muted" style="max-width:360px">This logs the moment and <b>keeps all your history</b>. Your Chi dims, it does not die. No shame here — just the next breath.</p>' +
      '<label class="field" style="width:min(360px,86vw);text-align:left"><span>A note for later you (optional)</span><textarea id="r-note" placeholder="What was happening? What would help next time?"></textarea></label>' +
      '<button class="btn full" style="max-width:360px;border-color:rgba(255,107,138,.5);color:#ffc2cf" data-x="confirm">Log it &amp; begin again</button>' +
      '<button class="btn ghost sm" style="margin-top:10px" data-x="cancel">cancel</button></div>');
    document.body.appendChild(ov);
    ov.querySelector('[data-x=cancel]').onclick = function () { ov.remove(); };
    ov.querySelector('[data-x=confirm]').onclick = function () {
      var note = ov.querySelector('#r-note').value;
      S.addRelapse({ date: today(), note: note, streakLengthAtReset: snap.streak.current });
      S.patchLog(today(), { clean: false });
      ov.innerHTML = '<div class="day-num" style="color:var(--cyan)">BEGIN AGAIN</div>' +
        '<p class="codex-quote">' + esc(dailyPick(CFG.quotes.recovery)) + '</p>' +
        '<p class="tiny faint">History preserved · longest streak still stands</p>' +
        '<button class="btn cyan" data-x="done">Continue</button>';
      ov.querySelector('[data-x=done]').onclick = function () { ov.remove(); state.tab = 'today'; render(); };
    };
  }

  /* =================== INCREMENT 3 VISUAL HELPERS =================== */
  // small completion ring (day-progress)
  function miniRing(pct) {
    var R = 22, C = 2 * Math.PI * R, off = C * (1 - pct / 100);
    return '<div class="cring"><svg viewBox="0 0 56 56" width="56" height="56">' +
      '<circle cx="28" cy="28" r="' + R + '" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="6"/>' +
      '<circle cx="28" cy="28" r="' + R + '" fill="none" stroke="url(#cgrad)" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 28 28)"/>' +
      '<defs><linearGradient id="cgrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5be0a0"/><stop offset="1" stop-color="#62d8ff"/></linearGradient></defs></svg>' +
      '<div class="cring-v">' + pct + '<span>%</span></div></div>';
  }
  // step-goal ring (steps in the centre)
  function stepRing(steps, goal) {
    var pct = Math.min(100, steps / goal * 100), R = 54, C = 2 * Math.PI * R, off = C * (1 - pct / 100);
    return '<div class="dial"><svg viewBox="0 0 128 128" width="128" height="128">' +
      '<circle cx="64" cy="64" r="' + R + '" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="10"/>' +
      '<circle cx="64" cy="64" r="' + R + '" fill="none" stroke="url(#stepg)" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 64 64)"/>' +
      '<defs><linearGradient id="stepg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5be0a0"/><stop offset="1" stop-color="#62d8ff"/></linearGradient></defs></svg>' +
      '<div class="val"><b>' + steps.toLocaleString() + '</b><span>steps</span></div></div>';
  }
  // the charging human body. Fill rises feet->head with power %.
  var FIG_SHAPES =
    '<circle cx="60" cy="22" r="15"/>' +
    '<rect x="54" y="33" width="12" height="9" rx="3"/>' +
    '<rect x="40" y="40" width="40" height="64" rx="16"/>' +
    '<rect x="28" y="44" width="13" height="56" rx="6"/>' +
    '<rect x="79" y="44" width="13" height="56" rx="6"/>' +
    '<rect x="45" y="98" width="14" height="96" rx="7"/>' +
    '<rect x="61" y="98" width="14" height="96" rx="7"/>';
  function powerBody(pct) {
    var top = 7, bottom = 194, fillTop = bottom - (pct / 100) * (bottom - top);
    var nodes = [150, 128, 106, 86, 66, 46, 28];
    var nodeEls = nodes.map(function (y) {
      var on = y >= fillTop;
      return '<circle cx="60" cy="' + y + '" r="' + (on ? 3.2 : 2.4) + '" fill="' + (on ? '#ffe7a3' : 'rgba(255,255,255,0.18)') + '"' + (on ? ' filter="url(#pglow)" class="pnode-on"' : '') + '/>';
    }).join('');
    var surface = pct > 1 ? '<g clip-path="url(#bclip)"><rect x="0" y="' + (fillTop - 1.5).toFixed(1) + '" width="120" height="3" fill="#ffffff" opacity="0.55"/></g>' : '';
    return '<svg class="pbody" viewBox="0 0 120 200" role="img" aria-label="Body charge ' + pct + '%">' +
      '<defs><clipPath id="bclip">' + FIG_SHAPES + '</clipPath>' +
      '<linearGradient id="pgrad" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#1d6e8f"/><stop offset="0.55" stop-color="#62d8ff"/><stop offset="1" stop-color="#ffe7a3"/></linearGradient>' +
      '<filter id="pglow"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
      '<g fill="rgba(255,255,255,0.05)" stroke="rgba(98,216,255,0.32)" stroke-width="1.2">' + FIG_SHAPES + '</g>' +
      '<g clip-path="url(#bclip)"><rect x="0" y="' + fillTop.toFixed(1) + '" width="120" height="' + (bottom - fillTop).toFixed(1) + '" fill="url(#pgrad)" opacity="0.92"/></g>' +
      surface + nodeEls + '</svg>';
  }
  // semicircular magnetism gauge
  function magnetGauge(pct) {
    var len = Math.PI * 80, off = len * (1 - pct / 100);
    return '<svg class="gauge" viewBox="0 0 200 120">' +
      '<defs><linearGradient id="mgrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a6bff"/><stop offset="1" stop-color="#ff7aa8"/></linearGradient></defs>' +
      '<path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="14" stroke-linecap="round"/>' +
      '<path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="url(#mgrad)" stroke-width="14" stroke-linecap="round" stroke-dasharray="' + len.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/>' +
      '<text x="100" y="90" text-anchor="middle" font-size="36" fill="#ffd9e6">' + pct + '</text>' +
      '<text x="100" y="111" text-anchor="middle" font-size="10" fill="#9aa0c7" letter-spacing="2">MAGNETISM</text></svg>';
  }

  /* =================== PROACTIVE COACH (Today) =================== */
  function mealLabelFor(k) { var o = CFG.nutrition.mealOrder; for (var i = 0; i < o.length; i++) if (o[i].key === k) return o[i].label; return 'meal'; }
  function cpBtn(act, label, cls, mk) { return '<button class="btn sm ' + (cls || '') + '" data-cp="' + act + '"' + (mk ? ' data-mk="' + mk + '"' : '') + '>' + esc(label) + '</button>'; }
  function coachPrimary(ag) {
    var p = ag.primary; if (!p) return '';
    // increment 4 — rota-aware day-type prompt: when today's rota code maps to a
    // known kind, offer a one-tap confirm instead of the blank question. [Change]
    // sets state._coachChange, which swaps back to the standard two buttons for
    // one render (the flag is consumed below, so it clears on the next render).
    if (p.kind === 'daytype' && R && !state._coachChange) {
      try {
        var sh = R.shiftOn(today()), kk = sh && sh.kind ? sh.kind : null;
        if (kk && kk.dayType) {
          var rctrls = cpBtn('rota-confirm', 'Confirm ' + (kk.dayType === 'shift' ? 'Shift' : 'Rest') + ' day', 'gold', kk.dayType) +
            cpBtn('rota-change', 'Change', '');
          return '<div class="coach-primary"><div class="cp-q">Your rota says <b>' + esc(kk.label) + '</b> today.</div>' +
            '<div class="cp-ctrls">' + rctrls + '</div></div>';
        }
      } catch (e) {}
    }
    if (p.kind === 'daytype') state._coachChange = false; // consume the flag — next render offers the rota prompt again
    var q = p.label, ctrls = '';
    switch (p.kind) {
      case 'daytype': q = 'Is today a shift day or a rest day?'; ctrls = cpBtn('shift', 'Shift day', 'gold') + cpBtn('rest', 'Rest day', ''); break;
      case 'plan': q = 'Pick today’s plan so meals & protein can track.'; ctrls = cpBtn('go-nutrition', 'Choose plan', 'gold'); break;
      case 'meal': var ml = mealLabelFor(p.mealKey); q = 'Had your ' + ml.toLowerCase() + ' yet? Log what you had.'; ctrls = cpBtn('go-nutrition', 'Log ' + ml.toLowerCase(), 'gold'); break;
      case 'clean': q = 'Did you hold the line today?'; ctrls = cpBtn('held', 'Held 🛡', 'gold') + cpBtn('slip', 'Slipped', ''); break;
      case 'breath': q = 'No energy breathing logged yet today.'; ctrls = cpBtn('breath', 'Breathe +5', 'cyan'); break;
      case 'med': q = 'A few minutes of stillness?'; ctrls = cpBtn('med', 'Meditate +5', 'cyan'); break;
      case 'move': q = 'Move the body — steps or cardio.'; ctrls = cpBtn('steps', '+1,000 steps', 'cyan'); break;
      case 'mood': q = 'How’s the inner weather today?'; ctrls = cpBtn('go-log', 'Log mood', ''); break;
      case 'targets': q = 'A few of today’s targets are still open ↓'; ctrls = ''; break;
    }
    return '<div class="coach-primary"><div class="cp-q">' + esc(q) + '</div>' + (ctrls ? '<div class="cp-ctrls">' + ctrls + '</div>' : '') + '</div>';
  }
  function coachCard(snap) {
    var hour = new Date().getHours();
    var ag = E.dailyAgenda(snap.settings, today(), hour);
    var ring = miniRing(ag.completionPct);
    var pend = ag.items.filter(function (it) { return !it.done && !it.blocked && (!ag.primary || it.id !== ag.primary.id); });
    pend.sort(function (a, b) { return (a.timely ? 0 : 1) - (b.timely ? 0 : 1); });
    var list = pend.slice(0, 6).map(function (it) {
      return '<button class="coach-item' + (it.timely ? ' now' : '') + '" data-ci="' + it.kind + '" data-mk="' + (it.mealKey || '') + '">' +
        '<span class="ci-dot"></span><span class="ci-l">' + esc(it.label) + '</span>' + (it.timely ? '<span class="ci-now">now</span>' : '') + '</button>';
    }).join('');
    var blockedPlan = ag.items.some(function (it) { return it.kind === 'meal' && it.blocked; });
    var planHint = (blockedPlan && pend.every(function (it) { return it.kind !== 'meal'; })) ?
      '<div class="tiny faint" style="margin-top:8px">Pick a day-type &amp; plan to unlock meal logging.</div>' : '';
    var allDone = ag.pendingCount === 0;
    // increment 4 — the Oracle's daily whisper, one tiny italic line. Fully
    // guarded: if the oracle module (or any engine piece it reads) is missing
    // or throws, the coach card simply renders without it.
    var whisper = '';
    try {
      if (ORA && CFG.oracle) {
        var wtxt = ORA.whisper(buildOracleCtx());
        if (wtxt) whisper = '<div class="tiny muted" style="margin-top:12px;font-style:italic">' + esc(CFG.oracle.whisperIntro + wtxt) + '</div>';
      }
    } catch (e) {}
    return '<div class="card coach">' +
      '<div class="coach-head"><div class="grow"><div class="day-num">' + esc(ag.greet) + ' · Day ' + snap.day + '</div>' +
        '<div class="tiny muted">' + esc(ag.line) + '</div></div>' + ring + '</div>' +
      (allDone ?
        '<div class="flag info" style="margin:12px 0 0">✓ Everything timely is logged. The line holds — rest in it.</div>' :
        coachPrimary(ag) + (list ? '<div class="coach-list">' + list + '</div>' : '') + planHint) +
      whisper +
    '</div>';
  }
  function wireCoach() {
    var d = today();
    appEl.querySelectorAll('[data-cp]').forEach(function (b) {
      b.onclick = function () {
        var a = b.getAttribute('data-cp');
        if (a === 'shift' || a === 'rest') { var nn = S.getLog(d).nutrition || {}; nn.dayType = a; nn.templateId = null; S.patchLog(d, { nutrition: nn }); state.tab = 'nutrition'; window.scrollTo(0, 0); render(); return; }
        // increment 4 — rota-aware coach: confirm applies the rota's day-type
        // (carried in data-mk) exactly like the shift/rest buttons above.
        if (a === 'rota-confirm') { var rdt = b.getAttribute('data-mk') || 'shift'; var rn = S.getLog(d).nutrition || {}; rn.dayType = rdt; rn.templateId = null; S.patchLog(d, { nutrition: rn }); state.tab = 'nutrition'; window.scrollTo(0, 0); render(); return; }
        if (a === 'rota-change') { state._coachChange = true; render(); return; }
        if (a === 'held') { S.patchLog(d, { clean: true }); toast('Held. The line holds.'); render(); return; }
        if (a === 'slip') { S.patchLog(d, { clean: false }); toast('Logged honestly. Begin again.'); render(); return; }
        if (a === 'breath') { quickAction('breath', b); return; }
        if (a === 'med') { quickAction('med', b); return; }
        if (a === 'steps') { quickAction('steps', b); return; }
        if (a === 'go-nutrition') { state.tab = 'nutrition'; window.scrollTo(0, 0); render(); return; }
        if (a === 'go-log') { state.tab = 'log'; window.scrollTo(0, 0); render(); return; }
      };
    });
    appEl.querySelectorAll('[data-ci]').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-ci');
        if (k === 'daytype' || k === 'plan' || k === 'meal') { state.tab = 'nutrition'; window.scrollTo(0, 0); render(); return; }
        if (k === 'clean') { var lg = S.getLog(d); S.patchLog(d, { clean: lg.clean === true ? false : true }); render(); return; }
        if (k === 'breath') { quickAction('breath', b); return; }
        if (k === 'med') { quickAction('med', b); return; }
        if (k === 'move') { quickAction('steps', b); return; }
        if (k === 'mood') { state.tab = 'log'; window.scrollTo(0, 0); render(); return; }
        if (k === 'targets') { window.scrollTo(0, document.body.scrollHeight); return; }
      };
    });
  }

  /* =================== DAILY TRIAL (Today) =================== */
  function autoHave(t, log) {
    switch (t.metric) {
      case 'steps':         return (+log.steps || 0).toLocaleString();
      case 'breathingMin':  return (+log.breathingMin || 0);
      case 'meditationMin': return (+log.meditationMin || 0);
      case 'cardioMin':     return (log.cardio && +log.cardio.minutes) || 0;
      case 'sleepHrs':      return log.sleepHrs != null ? log.sleepHrs : 0;
      default:              return '';
    }
  }
  function trialCard(snap) {
    var s = snap.settings, d = today();
    var dt = E.dailyTrial(s, d), st = E.trialStanding(s, d), t = dt.trial;
    var statusEl;
    if (dt.auto) {
      var log = S.getLog(d), hint = (t.hint || '').replace('{have}', autoHave(t, log));
      statusEl = dt.done ? '<div class="trial-state done">✓ Met</div>'
                         : '<div class="trial-state hint">' + esc(hint) + '</div>';
    } else {
      statusEl = '<button class="btn sm ' + (dt.done ? 'gold' : 'cyan') + '" data-trial="' + esc(t.id) + '">' +
        (dt.done ? '✓ Done' : 'Mark done') + '</button>';
    }
    return '<div class="card trial' + (dt.done ? ' won' : '') + '">' +
      '<div class="trial-head"><span class="day-num">Today’s Trial</span>' +
        '<span class="trial-tally">' + st.won + ' won · 🔥 ' + st.streak + '</span></div>' +
      '<div class="trial-title">' + esc(t.title) + '</div>' +
      '<div class="trial-desc tiny muted">' + esc(t.desc) + '</div>' +
      '<div class="trial-foot">' + statusEl +
        '<span class="trial-kind tiny faint">' + (dt.auto ? 'auto · from your log' : 'self-attested') + '</span></div>' +
    '</div>';
  }
  function wireTrial() {
    var tb = appEl.querySelector('[data-trial]');
    if (!tb) return;
    tb.onclick = function () {
      var d = today(), id = tb.getAttribute('data-trial');
      var cur = S.getLog(d).trial;
      var nextDone = !(cur && cur.id === id && cur.done);
      S.patchLog(d, { trial: { id: id, done: nextDone } });
      if (nextDone) { if (!reducedMotion()) celebrateSmall(); toast('Trial won. One more day forged.'); }
      render();
    };
  }

  /* =================== SCREENS =================== */
  function metersBlock(m) {
    function bar(cls, name, color, val) {
      return '<div class="meter ' + cls + '"><div class="lbl"><span>' + name + '</span><b>' + val + '</b></div>' +
        '<div class="bar"><i data-fill="' + val + '"></i></div></div>';
    }
    return bar('m-chi', 'Chi', 'chi', m.chi) + bar('m-vit', 'Vitality', 'vit', m.vitality) +
      bar('m-will', 'Willpower', 'will', m.willpower) + bar('m-pres', 'Presence', 'pres', m.presence);
  }
  function animateBars(root) {
    setTimeout(function () {
      root.querySelectorAll('.bar > i[data-fill]').forEach(function (i) { i.style.width = i.getAttribute('data-fill') + '%'; });
      var dial = root.querySelector('#idial');
      if (dial) dial.setAttribute('stroke-dashoffset', dial.getAttribute('data-doff'));
    }, 40);
  }

  function screenToday() {
    var snap = E.snapshot(today());
    var s = snap.settings, m = snap.meters;
    var shields = '';
    for (var i = 0; i < CFG.shields.maxStored; i++) shields += shieldSVG(i < snap.streak.shields);
    var log = S.getLog(today());
    var targets = s.dailyTargets || CFG.dailyTargets;
    var done = log.todayTargetsDone || [];
    var checklist = targets.map(function (t, idx) {
      var on = done[idx] === true;
      return '<div class="check' + (on ? ' on' : '') + '" data-target="' + idx + '"><span class="box">' + (on ? '✓' : '') + '</span><span class="txt">' + esc(t) + '</span></div>';
    }).join('');

    // backup reminder
    var meta = S.getMeta(), backupDue = !meta.lastExportISO || U.daysBetween(meta.lastExportISO, today()) >= CFG.backup.remindEveryDays;
    var backupBanner = backupDue ? '<div class="card" style="border-color:rgba(255,179,71,.35);background:rgba(255,179,71,.08)">' +
      '<div class="row"><div class="grow"><b>Back up your journey</b><div class="tiny muted">500 days of progress lives only on this device. Export a copy.</div></div>' +
      '<button class="btn sm gold" data-go="settings">Export</button></div></div>' : '';

    // streak catch-up nudge: count unlogged days between start and today (single parse, cheap)
    var allLogs = S.getLogs(), relSet = {};
    S.getRelapses().forEach(function (r) { relSet[r.date] = true; });
    var unloggedDays = 0;
    for (var ui = 0; ui < snap.day; ui++) {
      var ud = U.addDays(s.startDate, ui), lg = allLogs[ud];
      if (!relSet[ud] && !(lg && lg.clean != null)) unloggedDays++;
    }
    var catchupBanner = (unloggedDays >= 2) ?
      '<div class="card" style="border-color:rgba(98,216,255,.35);background:rgba(98,216,255,.07)">' +
        '<div class="row"><div class="grow"><b>Catch up your streak</b><div class="tiny muted">You’re on Day ' + snap.day + ' with a ' + snap.streak.current + '-day streak. ' + unloggedDays + ' earlier day' + (unloggedDays === 1 ? '' : 's') + ' aren’t logged — if you held clean then, record them so Immortal Power &amp; your stage reflect it.</div></div>' +
        '<button class="btn sm cyan" data-go="settings">Catch up</button></div></div>' : '';

    var html = '<div class="screen">' +
      header('today') + backupBanner + catchupBanner + coachCard(snap) + trialCard(snap) +
      '<div class="card today-hero">' +
        '<div class="day-num">Day ' + snap.day + ' · ' + snap.progress.pct + '% to Immortal · ' + snap.progress.daysToImmortal + ' days left</div>' +
        '<div class="rank-badge" data-go="road"><span class="nm">' + esc(snap.rank.current ? snap.rank.current.name : 'Before the Dawn') + '</span></div>' +
        '<div class="rank-sub">' + (snap.rank.next ? snap.rank.daysToNext + ' days to ' + esc(snap.rank.next.name) : 'You have reached the summit.') + '</div>' +
        '<div class="shields" style="margin-top:12px">' + shields + '<span class="tiny faint" style="margin-left:6px;align-self:center">streak shields</span></div>' +
        '<div class="index-wrap">' + indexDial(m.index) + '</div>' +
        '<div class="tiny faint">Immortal Index — how charged you are today</div>' +
      '</div>' +
      '<div class="card">' + metersBlock(m) + '</div>' +
      '<div class="card"><h3>Today’s targets</h3>' + checklist + '</div>' +
      '<div class="card"><h3>Quick log</h3><div class="quick">' +
        quickBtn('clean', log.clean === true ? '🛡' : (log.clean === false ? '⚠' : '◻'), log.clean === true ? 'Held' : (log.clean === false ? 'Slip' : 'Clean?')) +
        quickBtn('breath', '🫁', 'Breath +5') +
        quickBtn('med', '🧘', 'Meditate +5') +
        quickBtn('steps', '👣', 'Steps +1k') +
        quickBtn('workout', log.workout ? '💪' : '🏋', log.workout ? 'Workout ✓' : 'Workout') +
        quickBtn('fulllog', '📝', 'Full log') +
      '</div></div>' +
      '<div class="card"><div class="codex-quote" style="font-size:17px">' + esc(fill(dailyPick(CFG.quotes.daily), snap)) + '</div></div>' +
      '<div class="btn-grid"><button class="btn ghost" data-go="study">🔬 Study</button><button class="btn ghost" data-go="road">🏯 The Road</button></div>' +
      '<div class="btn-grid" style="margin-top:10px"><button class="btn ghost" data-go="ascension">🌌 Ascension</button><button class="btn ghost" data-go="photos">📸 Photos</button></div>' +
      '<div class="btn-grid" style="margin-top:10px"><button class="btn ghost" data-go="power">⚡ Immortal Power</button><button class="btn ghost" data-go="signals">👁 Signals</button></div>' +
      '<button class="btn ghost full" data-go="movement" style="margin-top:10px">🚶 Movement — steps · distance · calories</button>' +
      '<div class="btn-grid" style="margin-top:10px"><button class="btn ghost" data-go="oracle">🔮 Oracle</button><button class="btn ghost" data-go="rota">🗓 Rota</button></div>' +
      '<button class="btn ghost full" data-go="sanctum" style="margin-top:10px">🕉 Sanctum — breath · mala · cosmos</button>' +
    '</div>';
    appEl.innerHTML = ''; appEl.appendChild(h(html)); animateBars(appEl); wireCoach(); wireTrial();

    // wire
    appEl.querySelectorAll('[data-target]').forEach(function (el) {
      el.onclick = function () {
        var idx = +el.getAttribute('data-target');
        var lg = S.getLog(today()), d = (lg.todayTargetsDone || []).slice();
        while (d.length < targets.length) d.push(false);
        d[idx] = !d[idx]; S.patchLog(today(), { todayTargetsDone: d }); render();
      };
    });
    appEl.querySelectorAll('[data-q]').forEach(function (el) {
      el.onclick = function () { quickAction(el.getAttribute('data-q'), el); };
    });
  }
  function quickBtn(q, glyph, label) { return '<button class="btn" data-q="' + q + '"><b>' + glyph + '</b>' + label + '</button>'; }
  function indexDial(val) {
    var R = 54, C = 2 * Math.PI * R, off = C * (1 - val / 100);
    return '<div class="dial"><svg viewBox="0 0 128 128" width="128" height="128">' +
      '<circle cx="64" cy="64" r="' + R + '" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="10"/>' +
      '<circle cx="64" cy="64" r="' + R + '" fill="none" stroke="url(#ig)" stroke-width="10" stroke-linecap="round" ' +
      'stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '" data-doff="' + off.toFixed(1) + '" transform="rotate(-90 64 64)" style="transition:stroke-dashoffset 1.2s ease" id="idial"/>' +
      '<defs><linearGradient id="ig" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffce6a"/><stop offset="1" stop-color="#ff8a5b"/></linearGradient></defs></svg>' +
      '<div class="val"><b>' + val + '</b><span>Index</span></div></div>';
  }
  function quickAction(q, el) {
    var d = today(), log = S.getLog(d);
    if (q === 'clean') { var nx = log.clean === true ? false : true; S.patchLog(d, { clean: nx }); toast(nx ? 'Held. The line holds.' : 'Logged honestly. Begin again.'); render(); return; }
    if (q === 'breath') {
      var add = 5;
      S.patchLog(d, { breathingMin: (log.breathingMin || 0) + add });
      var delta = E.chiDeltaForBreathing(S.getSettings(), d, add);
      chiBurst(delta, el); render(); return;
    }
    if (q === 'med') { S.patchLog(d, { meditationMin: (log.meditationMin || 0) + 5 }); toast('+5 meditation'); render(); return; }
    if (q === 'steps') { S.patchLog(d, { steps: (log.steps || 0) + 1000 }); toast('+1000 steps'); render(); return; }
    if (q === 'workout') { S.patchLog(d, { workout: log.workout ? null : { type: 'Workout', notes: '' } }); render(); return; }
    if (q === 'fulllog') { state.tab = 'log'; render(); return; }
  }

  /* ---- LOG screen (full entry) ---- */
  function dateStepper(label) {
    var d = state.viewDate, isToday = d === today();
    return '<div class="card"><div class="row" style="align-items:center">' +
      '<button class="btn sm" data-date="prev">‹</button>' +
      '<div class="grow center"><div class="tiny faint">' + esc(label || 'Logging for') + '</div><b>' + esc(d) + (isToday ? ' · today' : '') + '</b></div>' +
      '<button class="btn sm" data-date="next"' + (isToday ? ' disabled style="opacity:.3"' : '') + '>›</button>' +
      '</div></div>';
  }
  function wireDateStepper() {
    var prev = appEl.querySelector('[data-date=prev]'), next = appEl.querySelector('[data-date=next]');
    if (prev) prev.onclick = function () { state.viewDate = U.addDays(state.viewDate, -1); render(); };
    if (next) next.onclick = function () { if (state.viewDate < today()) { state.viewDate = U.addDays(state.viewDate, 1); render(); } };
  }
  function screenLog() {
    var d = state.viewDate, log = S.getLog(d), s = S.getSettings();
    function num(field, label, step, ph) {
      return '<label class="field"><span>' + label + '</span><input type="number" inputmode="decimal" step="' + (step || 1) + '" data-f="' + field + '" value="' + (log[field] != null ? log[field] : '') + '" placeholder="' + (ph || '') + '"></label>';
    }
    var html = '<div class="screen">' + header('Daily Log') + dateStepper() +
      '<div class="card"><h3>The spine</h3>' +
        '<div class="seg">' +
          '<button data-clean="true" class="' + (log.clean === true ? 'on' : '') + '">Held clean 🛡</button>' +
          '<button data-clean="false" class="' + (log.clean === false ? 'on' : '') + '">Slipped</button>' +
        '</div>' +
        '<div class="tiny faint" style="margin-top:8px">Slipping here just marks the day. To log a full relapse event (keeps history, dims Chi), use the button below.</div>' +
      '</div>' +
      '<div class="card"><h3>Energy work</h3>' + num('breathingMin', 'Testicle / energy breathing (min)') + num('meditationMin', 'Meditation (min)') + '</div>' +
      '<div class="card"><h3>Body</h3>' + num('steps', 'Steps', 100) + num('kcalBurned', 'kcal burned', 10) +
        num('sleepHrs', 'Sleep (hrs)', 0.5) + num('fatPct', 'Body fat % (optional)', 0.1) + '</div>' +
      '<div class="card"><h3>Training</h3>' +
        '<label class="field"><span>Workout (free-form, no prescriptions)</span><input type="text" data-f="workoutType" value="' + esc(log.workout ? log.workout.type : '') + '" placeholder="e.g. push day, calisthenics"></label>' +
        '<label class="field"><span>Cardio type</span><input type="text" data-f="cardioType" value="' + esc(log.cardio ? log.cardio.type : '') + '" placeholder="e.g. walk, run"></label>' +
        '<label class="field"><span>Cardio minutes</span><input type="number" data-f="cardioMin" value="' + (log.cardio && log.cardio.minutes != null ? log.cardio.minutes : '') + '"></label>' +
      '</div>' +
      '<div class="card"><h3>Inner weather</h3>' + scale('mood', 'Mood', log.mood) + scale('urgeIntensity', 'Urge intensity', log.urgeIntensity) + '</div>' +
      '<div class="card"><h3>Moments worth remembering</h3><textarea data-f="notes" placeholder="A line for future you...">' + esc(log.notes || '') + '</textarea></div>' +
      '<button class="btn full" style="border-color:rgba(255,107,138,.4);color:#ffc2cf" data-go="relapse">Log a relapse (with compassion)</button>' +
      '<div style="height:8px"></div>' +
    '</div>';
    appEl.innerHTML = ''; appEl.appendChild(h(html)); wireDateStepper();

    appEl.querySelectorAll('[data-clean]').forEach(function (b) {
      b.onclick = function () { S.patchLog(d, { clean: b.getAttribute('data-clean') === 'true' }); render(); };
    });
    appEl.querySelectorAll('[data-f]').forEach(function (inp) {
      inp.addEventListener('change', function () { saveLogField(d, inp.getAttribute('data-f'), inp.value); });
    });
    appEl.querySelectorAll('[data-scale]').forEach(function (b) {
      b.onclick = function () { var f = b.getAttribute('data-scale'), v = +b.getAttribute('data-v');
        var cur = S.getLog(d)[f]; S.patchLog(d, mkPatch(f, cur === v ? null : v)); render(); };
    });
  }
  function mkPatch(f, v) { var p = {}; p[f] = v; return p; }
  function scale(field, label, val) {
    var b = ''; for (var i = 1; i <= 5; i++) b += '<button data-scale="' + field + '" data-v="' + i + '" class="' + (val === i ? 'on' : '') + '">' + i + '</button>';
    return '<label class="field"><span>' + label + ' (1–5)</span><div class="seg">' + b + '</div></label>';
  }
  function saveLogField(d, f, v) {
    var log = S.getLog(d);
    if (f === 'workoutType') { S.patchLog(d, { workout: v ? { type: v, notes: (log.workout && log.workout.notes) || '' } : null }); return; }
    if (f === 'cardioType' || f === 'cardioMin') {
      var c = log.cardio || { type: '', minutes: null, notes: '' };
      if (f === 'cardioType') c.type = v; else c.minutes = v === '' ? null : +v;
      S.patchLog(d, { cardio: (c.type || c.minutes != null) ? c : null }); return;
    }
    if (f === 'notes') { S.patchLog(d, { notes: v }); return; }
    var numFields = { breathingMin: 1, meditationMin: 1, steps: 1, kcalBurned: 1, sleepHrs: 1, fatPct: 1 };
    if (numFields[f]) { S.patchLog(d, mkPatch(f, v === '' ? (f === 'fatPct' || f === 'sleepHrs' ? null : 0) : +v)); return; }
  }

  /* ---- ROAD / RANK ladder ---- */
  function screenRoad() {
    var snap = E.snapshot(today());
    var steps = CFG.RANKS.map(function (r, i) {
      var done = snap.day >= r.reach, cur = (i === snap.rank.index);
      return '<div class="step' + (done ? ' done' : '') + (cur ? ' cur' : '') + '">' +
        '<div class="d">day ' + r.reach + '</div><div class="mark">' + (cur ? '◆' : (done ? '✓' : '○')) + '</div>' +
        '<div class="n">' + esc(r.name) + (r.note ? ' <span class="tiny faint">— ' + esc(r.note) + '</span>' : '') + '</div></div>';
    }).join('');
    var html = '<div class="screen">' + header('The Road') +
      '<div class="card center"><div class="day-num">Day ' + snap.day + '</div>' +
        '<div class="rank-badge" style="cursor:default"><span class="nm">' + esc(snap.rank.current ? snap.rank.current.name : '—') + '</span></div>' +
        '<div class="bar" style="margin-top:14px"><i style="width:' + snap.progress.pct + '%;background:linear-gradient(90deg,#8a6a1e,#ffce6a);box-shadow:0 0 14px #ffce6a"></i></div>' +
        '<div class="tiny faint" style="margin-top:8px">' + snap.progress.pct + '% to The Immortal · ' + snap.progress.daysToImmortal + ' days remain</div></div>' +
      '<div class="card ladder">' + steps + '</div></div>';
    appEl.innerHTML = ''; appEl.appendChild(h(html)); animateBars(appEl);
  }

  /* ---- STATS ---- */
  function screenStats() {
    var s = S.getSettings(), snap = E.snapshot(today());
    // heatmap last 8 weeks
    var weeks = 8, totalCells = weeks * 7, cells = '';
    var end = today();
    for (var i = totalCells - 1; i >= 0; i--) {
      var date = U.addDays(end, -i);
      if (U.daysBetween(s.startDate, date) < 0) { cells += '<div class="cell"></div>'; continue; }
      var st = E.dayStatus(date);
      cells += '<div class="cell ' + (st === 'clean' ? 'clean' : st === 'broken' ? 'broken' : '') + (date === end ? ' today' : '') + '" title="' + date + '"></div>';
    }
    // weekly totals chart (last 6 weeks of steps)
    var stepsByWeek = [], medByWeek = [], breathByWeek = [];
    for (var w = 5; w >= 0; w--) {
      var ws = 0, ms = 0, bs = 0;
      for (var dd = 0; dd < 7; dd++) {
        var dt = U.addDays(end, -(w * 7 + dd));
        var lg = S.getLog(dt); ws += (+lg.steps) || 0; ms += (+lg.meditationMin) || 0; bs += (+lg.breathingMin) || 0;
      }
      var lbl = 'w' + (6 - w);
      stepsByWeek.push({ label: lbl, value: Math.round(ws / 1000) });
      medByWeek.push({ label: lbl, value: ms });
      breathByWeek.push({ label: lbl, value: bs });
    }
    // fat% trend
    var fatPts = [];
    S.logsArray().forEach(function (lg) { if (lg.fatPct != null) fatPts.push({ x: E.dayNumber(s, lg.date), y: lg.fatPct }); });
    // danger window (urge timestamps by hour)
    var urges = S.getUrges(), byHour = new Array(24).fill(0);
    urges.forEach(function (u) { var hr = new Date(u.ts).getHours(); byHour[hr]++; });
    var peak = byHour.indexOf(Math.max.apply(null, byHour));
    var hourItems = byHour.map(function (v, i) { return { label: (i % 3 === 0 ? i : ''), value: v }; });

    var html = '<div class="screen">' + header('Stats') +
      '<div class="card"><h3>Clean streak</h3><div class="row"><div class="grow"><b style="font-size:30px;color:var(--good)">' + snap.streak.current + '</b><div class="tiny faint">current</div></div>' +
        '<div class="grow"><b style="font-size:30px">' + snap.streak.longest + '</b><div class="tiny faint">longest</div></div>' +
        '<div class="grow"><b style="font-size:30px;color:var(--cyan)">' + snap.streak.shields + '</b><div class="tiny faint">shields</div></div></div>' +
        '<div class="divider"></div><div class="heat">' + cells + '</div>' +
        '<div class="legend"><span><i style="background:#177a4d"></i>clean</span><span><i style="background:#b0445a"></i>slip</span><span><i style="background:rgba(255,255,255,0.05)"></i>unlogged</span></div></div>' +
      '<div class="card"><h3>Weekly steps (k)</h3>' + barChart(stepsByWeek, '#5be0a0', 'k') + '</div>' +
      '<div class="card"><h3>Weekly meditation (min)</h3>' + barChart(medByWeek, '#c98bff') + '</div>' +
      '<div class="card"><h3>Weekly breathing (min)</h3>' + barChart(breathByWeek, '#62d8ff') + '</div>' +
      '<div class="card"><h3>Body fat % trend</h3>' + lineChart(fatPts, '#ffce6a', { trend: true, xlabel: 'day', ylabel: 'fat %' }) +
        '<div class="tiny faint">Bodyweight alone lies — trust the monthly scan. Fat down + lean flat = muscle proof.</div></div>' +
      '<div class="card"><h3>Danger window</h3>' + (urges.length ? barChart(hourItems, '#ff7aa8') +
        '<div class="tiny muted">Most urges cluster around <b>' + peak + ':00</b>. Plan that hour: move the body, leave the room.</div>' :
        '<p class="faint tiny">No resisted urges banked yet. Each one you ride out is mapped here.</p>') + '</div>' +
    '</div>';
    appEl.innerHTML = ''; appEl.appendChild(h(html));
  }

  /* ---- ASCENSION / ENERGY BANK (increment 2, Part 1) ---- */
  function screenAscension() {
    var s = S.getSettings(), asOf = today();
    var chiMode = state._ascChi || 'daily';     // daily earned vs cumulative banked
    var hc = !!state._ascHC;
    var cs = E.correlationStatus(s, asOf, hc);   // total + lock + (maybe) spearman
    var data = E.ascensionData(s, asOf), rows = data.series;
    function chiVal(r) { return chiMode === 'cumulative' ? r.chiCumulative : r.chiEarned; }
    var chiLabel = chiMode === 'cumulative' ? 'Chi banked' : 'Chi/day';
    function chart(key, label, color, scale) {
      var rs = rows.map(function (r) {
        var ov = r[key]; return { x: r.day, a: chiVal(r), b: (ov == null ? null : (scale ? ov * scale : ov)) };
      });
      return dualLineChart(rs, { label: chiLabel, color: '#62d8ff' }, { label: label, color: color });
    }
    function cstr(c) { return c == null ? '—' : (c > 0 ? '+' : '') + c.toFixed(2); }

    // honest, non-overclaiming read
    var read;
    if (!cs.unlocked) {
      read = 'Chi is accruing steadily. The attraction signal-rate is still too sparse to call — keep logging opportunities and the zero-days. The shapes below are for your eyes, not a verdict.';
    } else {
      var sStreak = cstr(cs.spearmanStreak), sChi = cstr(cs.spearmanChi);
      read = 'Across ' + cs.nUsed + ' opportunity-days: signal-rate vs streak ' + sStreak + ', vs Chi ' + sChi + '. Association, not proof — and on ' + cs.behavedShare + '% of your signal days you also initiated more.';
    }

    // correlation card (locked / unlocked)
    function prog(lbl, cur, need) {
      var pct = U.clamp(cur / need * 100, 0, 100);
      return '<div style="margin:8px 0"><div class="row" style="justify-content:space-between"><span class="tiny muted">' + lbl + '</span><span class="tiny faint">' + cur + ' / ' + need + '</span></div>' +
        '<div class="bar" style="height:8px"><i style="width:' + pct + '%;background:linear-gradient(90deg,#5a2f9a,#c98bff)"></i></div></div>';
    }
    var lock = cs.thresholds, corrCard;
    if (!cs.unlocked) {
      corrCard = '<div class="card"><h3>Correlation</h3>' +
        '<div class="flag info">🔒 Correlation unlocks around <b>Day ' + lock.minDay + '</b>, once there’s enough data to mean anything. Right now you’re building the baseline.</div>' +
        prog('Day reached', cs.day, lock.minDay) +
        prog('Opportunity-days logged', cs.oppDays, lock.minOppDays) +
        prog('Days with a signal', cs.signalDays, lock.minSignalDays) +
        '</div>';
    } else {
      corrCard = '<div class="card"><h3>Correlation <span class="pill">unlocked</span></h3>' +
        '<div class="check' + (hc ? ' on' : '') + '" id="asc-hc"><span class="box">' + (hc ? '✓' : '') + '</span><span class="txt">High-confidence days only (4–5)</span></div>' +
        '<table style="width:100%;font-size:13px;margin-top:8px">' +
        '<tr><td class="muted">Signal-rate vs clean streak</td><td style="text-align:right"><b>' + cstr(cs.spearmanStreak) + '</b></td></tr>' +
        '<tr><td class="muted">Signal-rate vs Chi level</td><td style="text-align:right"><b>' + cstr(cs.spearmanChi) + '</b></td></tr></table>' +
        '<div class="flag info" style="margin-top:10px">Spearman rank — <b>association, not proof</b>. Confound: on ' + cs.behavedShare + '% of signal days you also initiated more.</div>' +
        '</div>';
    }

    var html = '<div class="screen">' + header('Ascension') +
      '<div class="card today-hero">' +
        '<div class="day-num">Total Chi Accumulated</div>' +
        '<div style="font-size:46px;line-height:1.1;color:var(--chi);text-shadow:0 0 28px rgba(98,216,255,.55);margin:6px 0"><b id="chi-total">0</b></div>' +
        '<div class="tiny faint">Lifetime energy banked. A relapse dims today’s level — it never erases this.</div>' +
      '</div>' +
      '<div class="card"><div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">Chi vs outcomes</h3>' +
        '<div class="seg"><button data-asc="daily" class="' + (chiMode === 'daily' ? 'on' : '') + '">daily</button><button data-asc="cumulative" class="' + (chiMode === 'cumulative' ? 'on' : '') + '">banked</button></div></div>' +
        '<div class="tiny faint" style="margin:6px 0 4px">Each line is normalized to its own range — read the shapes side by side.</div>' +
        '<div class="muted tiny" style="margin-top:10px">Chi vs attraction signal-rate</div>' + chart('signalRate', 'signal-rate %', '#c98bff', 100) +
        '<div class="muted tiny" style="margin-top:6px">Chi vs mood</div>' + chart('mood', 'mood', '#5be0a0') +
        '<div class="muted tiny" style="margin-top:6px">Chi vs urges resisted</div>' + chart('urges', 'urges', '#ff7aa8') +
        '<div class="muted tiny" style="margin-top:6px">Chi vs plan adherence</div>' + chart('adherence', 'adherence %', '#d6af4e', 100) +
      '</div>' +
      '<div class="card"><h3>What the data shows</h3><p class="muted" style="line-height:1.5;margin:0">' + esc(read) + '</p></div>' +
      corrCard +
    '</div>';
    appEl.innerHTML = ''; appEl.appendChild(h(html));
    countUp(appEl.querySelector('#chi-total'), cs.total);
    appEl.querySelectorAll('[data-asc]').forEach(function (b) { b.onclick = function () { state._ascChi = b.getAttribute('data-asc'); render(); }; });
    var ah = appEl.querySelector('#asc-hc'); if (ah) ah.onclick = function () { state._ascHC = !state._ascHC; render(); };
  }

  /* ---- PHOTOS (increment 2, Module A) ---- */
  function numOrNull(el) { return (el && el.value !== '') ? +el.value : null; }
  function intervalSummary(fromDate, toDate) {
    var workouts = 0, cardioMin = 0, adhSum = 0, adhN = 0, fatFrom = null, fatTo = null, days = 0, d = fromDate;
    while (d <= toDate && days < 400) {
      var lg = S.getLog(d);
      if (lg.workout) workouts++;
      if (lg.cardio && lg.cardio.minutes) cardioMin += (+lg.cardio.minutes || 0);
      var a = E.nutritionAdherence(lg); if (a.chosen) { adhSum += a.adherence; adhN++; }
      if (lg.fatPct != null) { if (fatFrom == null) fatFrom = lg.fatPct; fatTo = lg.fatPct; }
      days++; d = U.addDays(d, 1);
    }
    var fatTrend = null;
    if (fatFrom != null && fatTo != null) fatTrend = (fatTo < fatFrom - 0.2) ? 'down' : (fatTo > fatFrom + 0.2) ? 'up' : 'flat';
    return { workouts: workouts, cardioMin: cardioMin, adherencePct: adhN ? Math.round(adhSum / adhN * 100) : null, fatTrend: fatTrend, days: days };
  }
  function screenPhotos() {
    var type = state._photoType || 'face';
    var html = '<div class="screen">' + header('Photos') +
      '<div class="card"><div class="flag info" style="margin:0">📸 Weekly, same light, same distance. Metrics are <b>ratios</b> (size-independent). Faces shift daily — a real read needs ~' + CFG.photos.weeklyDays + ' days between shots.</div></div>' +
      '<div class="card"><h3>Capture</h3>' +
        '<div class="seg">' + ['face', 'body', 'side'].map(function (x) { return '<button data-pt="' + x + '" class="' + (type === x ? 'on' : '') + '">' + x + '</button>'; }).join('') + '</div>' +
        '<label class="field" style="margin-top:10px"><span>Weight (kg, optional)</span><input type="number" inputmode="decimal" id="p-weight"></label>' +
        '<label class="field"><span>Body fat % (optional)</span><input type="number" inputmode="decimal" id="p-fat"></label>' +
        '<button class="btn gold full" id="p-open">Open camera</button>' +
        '<div class="tiny faint" style="margin-top:6px">Camera needs HTTPS or localhost. Nothing is uploaded — photos stay on this device.</div>' +
      '</div>' +
      '<div class="card" id="p-timeline"><h3>Journey</h3><p class="faint tiny">Loading…</p></div>' +
      '<div class="card"><h3>Backup</h3><div class="tiny muted" style="margin-bottom:8px">Photos export <b>separately</b> from your main backup so it stays light.</div>' +
        '<div class="btn-grid"><button class="btn cyan" id="p-export">⤓ Export photo journey</button><button class="btn ghost" id="p-import">⤒ Import</button></div>' +
        '<input type="file" id="p-importfile" accept="application/json,.json" style="display:none"></div>' +
      '<details class="card"><summary class="muted">AI photo interpreter (coming later)</summary>' +
        '<div class="tiny muted" style="margin-top:8px">A future <b>opt-in</b> module could send <b>one weekly photo + the numbers this device already computed</b> to a vision model that <i>explains</i> them in words. It would never measure — only narrate — and you could switch it off any week. <b>It is off now; nothing leaves your device.</b></div>' +
        '<div class="check" style="opacity:.45;pointer-events:none;margin-top:8px"><span class="box"></span><span class="txt">Enable cloud interpreter (disabled)</span></div></details>' +
    '</div>';
    appEl.innerHTML = ''; appEl.appendChild(h(html));
    appEl.querySelectorAll('[data-pt]').forEach(function (b) { b.onclick = function () { state._photoType = b.getAttribute('data-pt'); render(); }; });
    appEl.querySelector('#p-open').onclick = function () { openCamera(state._photoType || 'face'); };
    appEl.querySelector('#p-export').onclick = exportPhotos;
    appEl.querySelector('#p-import').onclick = function () { appEl.querySelector('#p-importfile').click(); };
    appEl.querySelector('#p-importfile').onchange = importPhotos;
    fillPhotoTimeline();
  }
  function fillPhotoTimeline() {
    var host = appEl.querySelector('#p-timeline'); if (!host) return;
    RTI_PHOTO.all().then(function (ps) {
      if (!appEl.querySelector('#p-timeline')) return; // navigated away
      if (!ps.length) { host.innerHTML = '<h3>Journey</h3><p class="faint tiny">No photos yet. Capture your day-1 baseline.</p>'; return; }
      var type = state._photoType || 'face', ofType = ps.filter(function (p) { return p.type === type; });
      var recent = ofType.slice(-12); // strip shows only the selected pose — matches the heading, compare & trend
      var thumbs = recent.map(function (p) { return '<img class="pthumb" data-pid="' + p.id + '" title="' + p.date + '">'; }).join('');
      var cmp = ofType.length >= 2 ? '<div id="p-compare"></div>'
        : '<p class="faint tiny">' + (ofType.length === 0 ? 'No ' + type + ' photos yet — capture a baseline.' : '1 ' + type + ' photo so far — capture 1 more for a before/after.') + '</p>';
      host.innerHTML = '<h3>Journey · ' + type + ' (' + ofType.length + ')</h3><div style="overflow-x:auto;white-space:nowrap;padding-bottom:6px">' + thumbs + '</div>' +
        '<div class="divider"></div><div class="tiny muted">Before / after — drag to wipe</div>' + cmp +
        '<div class="divider"></div><div class="tiny muted">' + (type === 'face' ? 'Jaw ratio' : 'Shoulder ÷ hip') + ' vs cardio (per interval)</div>' + photoTrendChart(ofType, type) +
        '<div class="tiny faint" style="margin-top:6px">' + (type !== 'face' ? 'Body ratios are lower-confidence than face metrics.' : 'Lower jaw ratio = more tapered. Trust weekly shapes, not single frames.') + '</div>';
      recent.forEach(function (p) { var img = host.querySelector('[data-pid="' + p.id + '"]'); if (img) { var u = URL.createObjectURL(p.blob); img.onload = function () { URL.revokeObjectURL(u); }; img.src = u; } });
      if (ofType.length >= 2) buildCompare(host.querySelector('#p-compare'), ofType[0], ofType[ofType.length - 1]);
    }).catch(function (e) { host.innerHTML = '<h3>Journey</h3><p class="faint tiny">Photo store error: ' + esc(e.message) + '</p>'; });
  }
  function photoTrendChart(ofType, type) {
    var key = type === 'face' ? 'jawRatio' : 'shoulderHip', rows = [], prevDate = null;
    ofType.forEach(function (p) {
      if (!p.metrics || p.metrics[key] == null) return;
      var cardio = prevDate ? intervalSummary(prevDate, p.date).cardioMin : 0;
      rows.push({ x: p.day, a: p.metrics[key], b: cardio }); prevDate = p.date;
    });
    return dualLineChart(rows, { label: (type === 'face' ? 'jaw ratio' : 'sh/hip'), color: '#62d8ff' }, { label: 'cardio min', color: '#d6af4e' });
  }
  function buildCompare(el, a, b) {
    if (!el) return;
    var ua = URL.createObjectURL(a.blob), ub = URL.createObjectURL(b.blob);
    el.innerHTML = '<div class="cmp"><img src="' + ub + '"><img class="cmp-top" src="' + ua + '">' +
      '<span class="cmp-lbl" style="left:8px">' + a.date + '</span><span class="cmp-lbl" style="right:8px">' + b.date + '</span>' +
      '<input type="range" min="0" max="100" value="50" class="cmp-range"></div>';
    var imgs = el.querySelectorAll('img'); // [0]=bottom(ub), [1]=top(ua) — revoke once decoded
    if (imgs[0]) imgs[0].onload = function () { URL.revokeObjectURL(ub); };
    if (imgs[1]) imgs[1].onload = function () { URL.revokeObjectURL(ua); };
    var top = el.querySelector('.cmp-top'), rng = el.querySelector('.cmp-range');
    rng.oninput = function () { top.style.clipPath = 'inset(0 ' + (100 - rng.value) + '% 0 0)'; };
  }
  function guideSVG(type) {
    var shoulders = type === 'face' ? '' : '<line x1="18" y1="72" x2="82" y2="72" stroke="rgba(98,216,255,.6)" stroke-width="0.7"/>';
    return '<svg id="cam-guide" viewBox="0 0 100 100" preserveAspectRatio="none">' +
      '<ellipse cx="50" cy="' + (type === 'face' ? 42 : 28) + '" rx="' + (type === 'face' ? 22 : 14) + '" ry="' + (type === 'face' ? 28 : 18) + '" fill="none" stroke="rgba(214,175,78,.7)" stroke-width="0.7"/>' + shoulders + '</svg>';
  }
  function openCamera(type) {
    RTI_PHOTO.all().then(function (ps) {
      var prev = ps.filter(function (p) { return p.type === type; }).slice(-1)[0];
      var facing = state._photoFacing || 'user';
      var ov = h('<div class="overlay cam">' +
        '<div class="day-num">CAPTURE · ' + type.toUpperCase() + '</div>' +
        '<div class="cam-stage"><video id="cam-v" autoplay playsinline muted></video>' +
        (prev ? '<img id="cam-ghost">' : '') + guideSVG(type) + '</div>' +
        '<div id="cam-msg" class="tiny faint" style="min-height:34px;margin:8px 0;max-width:360px;text-align:center">Line up with the guide. Match your distance to the faint previous shot.</div>' +
        '<div class="row" style="gap:10px"><button class="btn ghost sm" data-c="flip">⟲ Flip</button>' +
        '<button class="btn gold" data-c="shoot">Capture</button>' +
        '<button class="btn ghost sm" data-c="cancel">Cancel</button></div></div>');
      document.body.appendChild(ov);
      var video = ov.querySelector('#cam-v'), stream = null;
      if (prev) { var gu = URL.createObjectURL(prev.blob); var gel = ov.querySelector('#cam-ghost'); gel.onload = function () { URL.revokeObjectURL(gu); }; gel.src = gu; }
      function start(f) {
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { ov.querySelector('#cam-msg').textContent = 'This browser/context has no camera access (needs HTTPS or localhost).'; return; }
        navigator.mediaDevices.getUserMedia({ video: { facingMode: f, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false })
          .then(function (s) { stream = s; video.srcObject = s; })
          .catch(function (e) { ov.querySelector('#cam-msg').textContent = 'Camera error: ' + e.message + '. Allow camera permission; needs HTTPS/localhost.'; });
      }
      start(facing);
      function close() { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); ov.remove(); }
      ov._cleanup = close;
      ov.querySelector('[data-c=cancel]').onclick = close;
      ov.querySelector('[data-c=flip]').onclick = function () { facing = facing === 'user' ? 'environment' : 'user'; state._photoFacing = facing; start(facing); };
      ov.querySelector('[data-c=shoot]').onclick = function () { captureFrom(video, type, prev, stream, ov); };
    });
  }
  function captureFrom(video, type, prev, stream, ov) {
    var msg = ov.querySelector('#cam-msg');
    if (!video.videoWidth) { msg.textContent = 'Camera not ready yet — give it a second.'; return; }
    msg.textContent = 'Measuring on-device…';
    var cc = RTI_PHOTO.toCanvas(video, video.videoWidth, video.videoHeight);
    var measure = type === 'face' ? RTI_PHOTO.measureFace(cc.canvas, cc.w, cc.h) : RTI_PHOTO.measureBody(cc.canvas, cc.w, cc.h);
    measure.then(function (res) {
      if (res.error) { msg.textContent = res.error; return; }
      if (type === 'face' && res.quality && !res.quality.ok) { msg.innerHTML = '↻ Re-shoot — ' + esc(res.quality.reasons.join(' · ')); return; }
      return RTI_PHOTO.canvasToBlob(cc.canvas).then(function (blob) {
        var d = today(), snap = E.snapshot(d);
        var rec = { date: d, day: snap.day, type: type, blob: blob, w: cc.w, h: cc.h,
          weightKg: numOrNull(appEl.querySelector('#p-weight')), fatPct: numOrNull(appEl.querySelector('#p-fat')),
          metrics: res.metrics, quality: res.quality || null, waistConfident: res.waistConfident || false, createdAt: Date.now() };
        return RTI_PHOTO.add(rec).then(function () {
          if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
          ov.remove();
          if (rec.fatPct != null) S.patchLog(d, { fatPct: rec.fatPct }); // so cross-checks see it
          showPhotoVerdict(type, rec);
        });
      });
    }).catch(function (e) { msg.textContent = 'Could not save: ' + (e && e.message || e); if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); });
  }
  function showPhotoVerdict(type, rec) {
    RTI_PHOTO.all().then(function (ps) {
      var ofType = ps.filter(function (p) { return p.type === type; });
      var base = ofType[0] ? ofType[0].metrics : null;
      var prevRec = ofType.length >= 2 ? ofType[ofType.length - 2] : null;
      var daysApart = prevRec ? U.daysBetween(prevRec.date, rec.date) : 0;
      var summary = prevRec ? intervalSummary(prevRec.date, rec.date) : intervalSummary(rec.date, rec.date);
      var v = RTI_PHOTO.verdict(prevRec ? prevRec.metrics : null, rec.metrics, base, summary, daysApart, type);
      var ov = h('<div class="overlay"><div class="day-num" style="color:var(--good)">CAPTURED · MEASURED ON-DEVICE</div>' +
        '<div class="flag ' + (v.tone === 'amber' ? 'amber' : 'info') + '" style="max-width:360px">' + esc(v.text) + '</div>' +
        metricReadout(type, rec.metrics, prevRec ? prevRec.metrics : null) +
        '<button class="btn gold" data-x="ok">Good</button></div>');
      ov.querySelector('[data-x=ok]').onclick = function () { ov.remove(); render(); };
      document.body.appendChild(ov);
    });
  }
  function metricReadout(type, m, prev) {
    function f(v) { return Math.abs(v) < 10 ? v.toFixed(3) : v.toFixed(1); }
    function row(lbl, v, pv) {
      var ds = (pv != null && v != null) ? ' <span class="tiny faint">(' + ((v - pv) >= 0 ? '+' : '') + f(v - pv) + ')</span>' : '';
      return '<tr><td class="muted">' + lbl + '</td><td style="text-align:right"><b>' + f(v) + '</b>' + ds + '</td></tr>';
    }
    var rows;
    if (type === 'face') rows = row('Jaw ratio', m.jawRatio, prev && prev.jawRatio) + row('fWHR', m.fWHR, prev && prev.fWHR) + row('Gonial angle°', m.gonialAngleDeg, prev && prev.gonialAngleDeg) + row('Cheek fullness', m.cheekFullness, prev && prev.cheekFullness);
    else rows = row('Shoulder ÷ hip', m.shoulderHip, prev && prev.shoulderHip) + (m.shoulderWaist != null ? row('Shoulder ÷ waist *', m.shoulderWaist, prev && prev.shoulderWaist) : '');
    return '<table style="width:min(360px,86vw);font-size:13px;margin:6px 0">' + rows + '</table>' + (type !== 'face' ? '<div class="tiny faint">* waist is a lower-confidence estimate</div>' : '');
  }
  function exportPhotos() {
    RTI_PHOTO.exportJourney().then(function (data) {
      var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      var url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = 'road-to-immortal-photos-' + today() + '.json';
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast('Photo journey exported.');
    });
  }
  function importPhotos(e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      var obj; try { obj = JSON.parse(r.result); } catch (err) { alert('That file is not valid JSON.'); return; }
      if (!confirm('Import this photo journey? Photos are ADDED to what you already have.')) return;
      RTI_PHOTO.importJourney(obj).then(function (res) { if (res.ok) { toast('Imported ' + res.count + ' photos.'); render(); } else alert(res.error); }).catch(function (err) { alert('Import failed: ' + (err && err.message || err)); });
    };
    r.readAsText(f);
  }

  /* ---- STUDY (section 6) ---- */
  function screenStudy() {
    var s = S.getSettings(), d = state.viewDate, log = S.getLog(d);
    var study = log.study || {};
    var meta = S.getMeta();
    // collect study days
    var rows = [];
    S.logsArray().forEach(function (lg) {
      var st = lg.study; if (!st || st.opportunities == null || st.opportunities <= 0) return;
      var opp = st.opportunities, clear = st.signalsClear || 0, amb = st.signalsAmbiguous || 0;
      rows.push({ date: lg.date, day: E.dayNumber(s, lg.date), opp: opp, clear: clear, amb: amb,
        conf: st.confidence || 0, setting: st.setting || 'other', behaved: !!st.behavedDifferently,
        rateClear: clear / opp, rateAll: (clear + amb) / opp,
        streak: E.streakAsOf(s, lg.date).current, meters: E.metersAsOf(s, lg.date),
        mood: lg.mood, sleep: lg.sleepHrs });
    });
    var hcOnly = state._studyHC;
    var used = hcOnly ? rows.filter(function (r) { return r.conf >= 4; }) : rows;
    var zeroDays = rows.filter(function (r) { return (r.clear + r.amb) === 0; }).length;
    var rateMode = state._studyRate || 'all';   // 'all' = clear+ambiguous, 'clear' = clear only
    function selRate(r) { return rateMode === 'clear' ? r.rateClear : r.rateAll; }

    // correlations (against the selected rate series)
    function corr(key) { return U.pearson(used.map(selRate), used.map(function (r) { return key(r); })); }
    function cstr(c) { return c == null ? '—' : (c > 0 ? '+' : '') + c.toFixed(2); }
    var cStreak = corr(function (r) { return r.streak; });
    var cChi = corr(function (r) { return r.meters.chi; });
    var cVit = corr(function (r) { return r.meters.vitality; });
    var cWill = corr(function (r) { return r.meters.willpower; });
    var cPres = corr(function (r) { return r.meters.presence; });
    var cIndex = corr(function (r) { return r.meters.index; });
    var behavedShare = used.length ? Math.round(used.filter(function (r) { return r.behaved && (r.clear + r.amb) > 0; }).length / Math.max(1, used.filter(function (r) { return (r.clear + r.amb) > 0; }).length) * 100) : 0;

    var scatter = lineChart(used.map(function (r) { return { x: r.day, y: Math.round(selRate(r) * 100) }; }).sort(function (a, b) { return a.x - b.x; }),
      rateMode === 'clear' ? '#62d8ff' : '#c98bff', { trend: true, min: 0, xlabel: 'day', ylabel: (rateMode === 'clear' ? 'clear' : 'clear+amb') + ' rate %' });

    var html = '<div class="screen">' + header('Attraction Study') + dateStepper('Study entry for') +
      '<div class="card"><div class="flag info" style="margin:0">⚖ Trust the <b>rate</b> (signals ÷ opportunities), the high-confidence days, and the zero-days. Raw counts rise just because you socialise more.</div></div>' +
      '<div class="card"><h3>Pre-registration</h3>' +
        (meta.preregLocked ?
          '<p class="muted" style="font-style:italic">' + esc(meta.prereg || '(empty)') + '</p><div class="tiny faint">Locked — your prediction is fixed so hindsight can’t reshape it.</div>' :
          '<label class="field"><span>What I expect to see (one-time)</span><textarea id="prereg" placeholder="e.g. Clear-signal rate roughly doubles after day 60, strongest in social settings.">' + esc(meta.prereg || '') + '</textarea></label>' +
          '<button class="btn sm gold" id="lockprereg">Lock prediction</button>') +
      '</div>' +
      '<div class="card"><h3>Today’s entry</h3>' +
        '<label class="field"><span>Opportunities — women in genuine interaction range (denominator, required)</span><input type="number" data-s="opportunities" value="' + (study.opportunities != null ? study.opportunities : '') + '"></label>' +
        '<label class="field"><span>Clear signals (initiated, touch, contact, explicit)</span><input type="number" data-s="signalsClear" value="' + (study.signalsClear != null ? study.signalsClear : '') + '"></label>' +
        '<label class="field"><span>Ambiguous signals (glances, a vibe)</span><input type="number" data-s="signalsAmbiguous" value="' + (study.signalsAmbiguous != null ? study.signalsAmbiguous : '') + '"></label>' +
        scaleS('confidence', 'Confidence in today’s read', study.confidence) +
        '<label class="field"><span>Setting</span><div class="seg" id="setting">' +
          ['gym', 'work', 'street', 'social', 'other'].map(function (x) { return '<button data-set="' + x + '" class="' + (study.setting === x ? 'on' : '') + '">' + x + '</button>'; }).join('') +
        '</div></label>' +
        '<div class="check' + (study.behavedDifferently ? ' on' : '') + '" id="behaved"><span class="box">' + (study.behavedDifferently ? '✓' : '') + '</span><span class="txt">I initiated more than usual today (confound flag)</span></div>' +
        '<div class="tiny faint" style="margin-top:8px">Log days with zero signals too — honesty is the whole point.</div>' +
      '</div>' +
      '<div class="card"><h3>Analysis</h3>' +
        '<div class="check' + (hcOnly ? ' on' : '') + '" id="hcfilter"><span class="box">' + (hcOnly ? '✓' : '') + '</span><span class="txt">High-confidence days only (4–5)</span></div>' +
        '<div class="tiny faint" style="margin:6px 0 8px">' + used.length + ' study days · ' + zeroDays + ' zero-signal days logged</div>' +
        '<div class="seg" style="margin:0 0 10px"><button data-rate="all" class="' + (rateMode === 'all' ? 'on' : '') + '">Clear + ambiguous</button><button data-rate="clear" class="' + (rateMode === 'clear' ? 'on' : '') + '">Clear only</button></div>' +
        scatter +
        '<div class="divider"></div>' +
        '<table style="width:100%;font-size:13px"><tr><td class="muted">Rate vs clean streak</td><td style="text-align:right"><b>' + cstr(cStreak) + '</b></td></tr>' +
        '<tr><td class="muted">Rate vs Chi</td><td style="text-align:right"><b>' + cstr(cChi) + '</b></td></tr>' +
        '<tr><td class="muted">Rate vs Vitality</td><td style="text-align:right"><b>' + cstr(cVit) + '</b></td></tr>' +
        '<tr><td class="muted">Rate vs Willpower</td><td style="text-align:right"><b>' + cstr(cWill) + '</b></td></tr>' +
        '<tr><td class="muted">Rate vs Presence</td><td style="text-align:right"><b>' + cstr(cPres) + '</b></td></tr>' +
        '<tr><td class="muted">Rate vs Immortal Index</td><td style="text-align:right"><b>' + cstr(cIndex) + '</b></td></tr></table>' +
        '<div class="tiny faint" style="margin-top:8px">' + (used.length < 5 ? 'Need ~5+ study days before correlations mean much.' : 'On ' + behavedShare + '% of your signal days you also initiated more — weigh that confound.') + '</div>' +
      '</div></div>';
    appEl.innerHTML = ''; appEl.appendChild(h(html)); wireDateStepper();

    var lp = appEl.querySelector('#lockprereg');
    if (lp) lp.onclick = function () { var v = appEl.querySelector('#prereg').value.trim(); if (!v) { toast('Write your prediction first.'); return; } S.setMeta({ prereg: v, preregLocked: true }); render(); };
    var pr = appEl.querySelector('#prereg'); if (pr) pr.addEventListener('change', function () { S.setMeta({ prereg: pr.value }); });

    appEl.querySelectorAll('[data-s]').forEach(function (inp) {
      inp.addEventListener('change', function () { var st = S.getLog(d).study || {}; st[inp.getAttribute('data-s')] = inp.value === '' ? null : +inp.value; S.patchLog(d, { study: st }); render(); });
    });
    appEl.querySelectorAll('[data-scaleS]').forEach(function (b) {
      b.onclick = function () { var f = b.getAttribute('data-scaleS'), v = +b.getAttribute('data-v'); var st = S.getLog(d).study || {}; st[f] = st[f] === v ? null : v; S.patchLog(d, { study: st }); render(); };
    });
    appEl.querySelectorAll('[data-set]').forEach(function (b) {
      b.onclick = function () { var st = S.getLog(d).study || {}; st.setting = b.getAttribute('data-set'); S.patchLog(d, { study: st }); render(); };
    });
    var bv = appEl.querySelector('#behaved'); if (bv) bv.onclick = function () { var st = S.getLog(d).study || {}; st.behavedDifferently = !st.behavedDifferently; S.patchLog(d, { study: st }); render(); };
    var hc = appEl.querySelector('#hcfilter'); if (hc) hc.onclick = function () { state._studyHC = !state._studyHC; render(); };
    appEl.querySelectorAll('[data-rate]').forEach(function (b) { b.onclick = function () { state._studyRate = b.getAttribute('data-rate'); render(); }; });
  }
  function scaleS(field, label, val) {
    var b = ''; for (var i = 1; i <= 5; i++) b += '<button data-scaleS="' + field + '" data-v="' + i + '" class="' + (val === i ? 'on' : '') + '">' + i + '</button>';
    return '<label class="field"><span>' + label + ' (1–5)</span><div class="seg">' + b + '</div></label>';
  }

  /* ---- NUTRITION (section 6C) ---- */
  function screenNutrition() {
    var s = S.getSettings(), d = state.viewDate, log = S.getLog(d);
    var n = log.nutrition || {};
    var dayType = n.dayType || null;
    var templates = CFG.nutrition.templates.filter(function (t) { return dayType ? t.dayType === dayType : false; });
    var tpl = n.templateId ? E.getTemplate(n.templateId) : null;
    var adh = E.nutritionAdherence(log);
    var flags = E.nutritionFlags(log);

    var typeSeg = '<div class="seg">' +
      '<button data-dt="shift" class="' + (dayType === 'shift' ? 'on' : '') + '">Shift Day</button>' +
      '<button data-dt="rest" class="' + (dayType === 'rest' ? 'on' : '') + '">Rest Day</button></div>' +
      '<div class="tiny faint" style="margin-top:6px">' + (dayType ? esc(CFG.nutrition.dayTypes[dayType].label) + ' · target ' + CFG.nutrition.dayTypes[dayType].planKcal + ' kcal · ' + CFG.nutrition.dayTypes[dayType].proteinLow + '–' + CFG.nutrition.dayTypes[dayType].proteinHigh + 'g protein' : 'Pick a day-type to begin (never auto-assumed).') + '</div>';

    var tplSeg = '';
    if (dayType) {
      tplSeg = '<div class="seg cyan" style="margin-top:10px">' + templates.map(function (t) {
        return '<button data-tpl="' + t.id + '" class="' + (n.templateId === t.id ? 'on' : '') + '">' + esc(t.name.split('—')[1] ? t.name.split('—')[1].trim() : t.name) + '</button>';
      }).join('') + '</div>';
    }

    var mealsHtml = '';
    if (tpl) {
      mealsHtml = CFG.nutrition.mealOrder.map(function (mo) {
        var meal = E.effectiveMeal(tpl, mo.key), status = (n.meals && n.meals[mo.key]) || null;
        var statuses = ['eaten', 'partial', 'swapped', 'skipped'];
        var seg = statuses.map(function (st) { return '<button data-meal="' + mo.key + '" data-st="' + st + '" class="' + (status === st ? 'on' : '') + '">' + st + '</button>'; }).join('');
        return '<div class="meal"><div class="mh"><span class="nm">' + mo.label + '</span>' +
          '<span class="tiny faint est-edit">~<input class="est-inp" type="number" inputmode="numeric" data-est="kcal" data-mk="' + mo.key + '" value="' + meal.kcal + '"> kcal · ' +
          '<input class="est-inp" type="number" inputmode="numeric" data-est="protein" data-mk="' + mo.key + '" value="' + meal.protein + '">g P</span></div>' +
          '<div class="items">' + esc(meal.items) + '</div><div class="seg">' + seg + '</div></div>';
      }).join('');
    }

    var leftHtml = '';
    if (tpl) {
      var remP = adh.remainingProtein, remK = adh.remainingKcal;
      leftHtml = '<div class="whatsleft">' +
        '<div class="stat"><b style="color:' + (adh.proteinHit ? 'var(--good)' : 'var(--ink)') + '">' + (remP > 0 ? remP + 'g' : '✓') + '</b><span>protein ' + (remP > 0 ? 'to go' : 'hit') + '</span></div>' +
        '<div class="stat"><b>' + remK + '</b><span>kcal left (est)</span></div>' +
        '<div class="stat"><b>' + Math.round(adh.adherence * 100) + '%</b><span>adherence</span></div></div>' +
        '<div class="estimate-note" style="margin-top:8px">Per-meal numbers are editable estimates (tap to change) — the plan day-total (' + tpl.planKcal + ' kcal · ' + tpl.planProtein + 'g protein) is the source of truth.</div>';
    }

    var flagsHtml = flags.map(function (f) { return '<div class="flag ' + f.level + '">' + (f.level === 'amber' ? '⚠' : 'ℹ') + ' <span>' + esc(f.msg) + '</span></div>'; }).join('');

    // supplements
    var sup = n.supplements || {};
    var supHtml = CFG.nutrition.supplements.map(function (su) {
      var on = !!sup[su.id]; return '<div class="check' + (on ? ' on' : '') + '" data-sup="' + su.id + '"><span class="box">' + (on ? '✓' : '') + '</span><span class="txt">' + esc(su.label) + '</span></div>';
    }).join('');

    var html = '<div class="screen">' + header('Nutrition') + dateStepper('Plan for') +
      '<div class="card"><h3>Day type &amp; plan</h3>' + typeSeg + tplSeg + '</div>' +
      (tpl ? '<div class="card"><h3>What’s left</h3>' + leftHtml + '</div>' : '') +
      (flagsHtml ? '<div class="card"><h3>Rule check</h3>' + flagsHtml + '</div>' : '') +
      (tpl ? '<div class="card"><h3>Meals</h3>' + mealsHtml +
        '<label class="field" style="margin-top:12px"><span>Off-plan / swap notes (logged, not judged)</span><textarea data-nf="offPlanNotes" placeholder="Anything outside the template...">' + esc(n.offPlanNotes || '') + '</textarea></label>' +
        '</div>' : '') +
      (tpl ? '<details class="card"><summary class="muted">Off-plan extras (feed the rule-checker)</summary>' +
        '<label class="field"><span>Nuts total today (g)</span><input type="number" inputmode="numeric" data-nx="nutsGrams" value="' + (n.nutsGrams != null ? n.nutsGrams : '') + '" placeholder="defaults to 25 if nuts eaten"></label>' +
        '<label class="field"><span>Coconut milk today (ml)</span><input type="number" inputmode="numeric" data-nx="coconutMl" value="' + (n.coconutMl != null ? n.coconutMl : '') + '" placeholder="light only, ≤100ml"></label>' +
        '<div class="check' + (n.extraButter ? ' on' : '') + '" data-nxb="extraButter"><span class="box">' + (n.extraButter ? '✓' : '') + '</span><span class="txt">Added butter today (beyond the template)</span></div>' +
        '<div class="tiny faint" style="margin-top:6px">Leave blank to use the template defaults. These let the nuts / coconut / butter rules catch off-plan amounts.</div>' +
        '</details>' : '') +
      '<div class="card"><h3>Supplements</h3>' + supHtml + '</div>' +
      nutritionEffect(s) +
      '<details class="card"><summary class="muted">Shopping list</summary>' + shoppingHtml() + '</details>' +
    '</div>';
    appEl.innerHTML = ''; appEl.appendChild(h(html)); wireDateStepper();

    appEl.querySelectorAll('[data-dt]').forEach(function (b) {
      b.onclick = function () { var nn = S.getLog(d).nutrition || {}; nn.dayType = b.getAttribute('data-dt'); nn.templateId = null; S.patchLog(d, { nutrition: nn }); render(); };
    });
    appEl.querySelectorAll('[data-tpl]').forEach(function (b) {
      b.onclick = function () { var id = b.getAttribute('data-tpl'); var nn = S.getLog(d).nutrition || {}; nn.templateId = id; S.patchLog(d, { nutrition: nn }); S.setSettings({ lastNutritionTemplate: id }); render(); };
    });
    appEl.querySelectorAll('[data-meal]').forEach(function (b) {
      b.onclick = function () { var k = b.getAttribute('data-meal'), st = b.getAttribute('data-st'); var nn = S.getLog(d).nutrition || {}; nn.meals = nn.meals || {}; nn.meals[k] = nn.meals[k] === st ? null : st; S.patchLog(d, { nutrition: nn }); render(); };
    });
    appEl.querySelectorAll('[data-sup]').forEach(function (b) {
      b.onclick = function () { var id = b.getAttribute('data-sup'); var nn = S.getLog(d).nutrition || {}; nn.supplements = nn.supplements || {}; nn.supplements[id] = !nn.supplements[id]; S.patchLog(d, { nutrition: nn }); render(); };
    });
    var op = appEl.querySelector('[data-nf=offPlanNotes]'); if (op) op.addEventListener('change', function () { var nn = S.getLog(d).nutrition || {}; nn.offPlanNotes = op.value; S.patchLog(d, { nutrition: nn }); });
    // editable per-meal estimates -> persisted as a per-template override in settings
    appEl.querySelectorAll('[data-est]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        if (!tpl) return;
        var key = inp.getAttribute('data-mk'), which = inp.getAttribute('data-est');
        var st = S.getSettings(), mo = st.mealOverrides || {};
        mo[tpl.id] = mo[tpl.id] || {}; mo[tpl.id][key] = mo[tpl.id][key] || {};
        mo[tpl.id][key][which] = inp.value === '' ? null : +inp.value;
        S.setSettings({ mealOverrides: mo }); render();
      });
    });
    // off-plan extras
    appEl.querySelectorAll('[data-nx]').forEach(function (inp) {
      inp.addEventListener('change', function () { var nn = S.getLog(d).nutrition || {}; nn[inp.getAttribute('data-nx')] = inp.value === '' ? null : +inp.value; S.patchLog(d, { nutrition: nn }); render(); });
    });
    var eb = appEl.querySelector('[data-nxb=extraButter]'); if (eb) eb.onclick = function () { var nn = S.getLog(d).nutrition || {}; nn.extraButter = !nn.extraButter; S.patchLog(d, { nutrition: nn }); render(); };
  }
  function shoppingHtml() {
    var sh = CFG.nutrition.shopping;
    function list(title, arr) { return '<div style="margin-top:8px"><b class="tiny muted">' + title + '</b>' + arr.map(function (x) { return '<div class="check"><span class="box"></span><span class="txt">' + esc(x) + '</span></div>'; }).join('') + '</div>'; }
    return list('Monthly / cupboard', sh.monthly) + list('Weekly / fresh', sh.weekly) + '<div class="tiny faint" style="margin-top:6px">(Ticks here are not saved — just a quick reference.)</div>';
  }
  function nutritionEffect(s) {
    // observation only — never prescriptive
    var arr = S.logsArray();
    var adhMood = { x: [], y: [] }; // adherence day d vs mood day d+1
    var adhUrge = { x: [], y: [] }; // adherence vs urgeIntensity same day
    var proteinVit = { hit: [], miss: [] };
    var fatPts = [];
    arr.forEach(function (lg, idx) {
      var a = E.nutritionAdherence(lg); if (!a.chosen) return;
      var vit = E.metersAsOf(s, lg.date).vitality;
      if (a.proteinHit) proteinVit.hit.push(vit); else proteinVit.miss.push(vit);
      if (lg.urgeIntensity != null) { adhUrge.x.push(a.adherence); adhUrge.y.push(lg.urgeIntensity); }
      var nextDate = U.addDays(lg.date, 1), next = S.getLog(nextDate);
      if (next && next.mood != null) { adhMood.x.push(a.adherence); adhMood.y.push(next.mood); }
      if (lg.fatPct != null) fatPts.push({ day: E.dayNumber(s, lg.date), fat: lg.fatPct });
    });
    function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
    var cMood = U.pearson(adhMood.x, adhMood.y);
    var cUrge = U.pearson(adhUrge.x, adhUrge.y);
    var vHit = avg(proteinVit.hit), vMiss = avg(proteinVit.miss);
    // stall detection: fat% over last 14 days flat (slope >= ~0)
    var recentFat = fatPts.filter(function (p) { return E.dayNumber(s, today()) - p.day <= 14; });
    var stall = null;
    if (recentFat.length >= 4) { var lr = U.linreg(recentFat.map(function (p) { return p.day; }), recentFat.map(function (p) { return p.fat; })); if (lr && lr.slope >= -0.01) stall = true; }
    function line(label, val) { return '<tr><td class="muted">' + label + '</td><td style="text-align:right"><b>' + val + '</b></td></tr>'; }
    var body = '<table style="width:100%;font-size:13px">' +
      line('Adherence → next-day mood', cMood == null ? 'need more data' : (cMood > 0 ? '+' : '') + cMood.toFixed(2)) +
      line('Adherence → urge intensity', cUrge == null ? 'need more data' : (cUrge > 0 ? '+' : '') + cUrge.toFixed(2)) +
      line('Vitality on protein-hit days', vHit == null ? '—' : Math.round(vHit) + (vMiss != null ? ' (vs ' + Math.round(vMiss) + ' off)' : '')) +
      '</table>';
    var notes = '<div class="tiny faint" style="margin-top:8px">Observation only — no prescriptions. ' +
      (cUrge != null && cUrge < -0.2 ? 'Watch this: lower adherence days track with stronger urges — under-fuelling may be feeding them. ' : '') +
      'Weekly adherence vs fat% is a long game: the monthly scan is the real judge.</div>';
    var stallTip = stall ? '<div class="flag info" style="margin-top:10px">ℹ Fat% has been flat ~2 weeks. If you choose to act, the plan’s own first move is to cut one rest-day carb portion — your call, not auto-applied.</div>' : '';
    return '<div class="card"><h3>Effect (observed)</h3>' + body + notes + stallTip + '</div>';
  }

  /* ---- CODEX (section 9) ---- */
  function screenCodex() {
    var snap = E.snapshot(today());
    var mode = state._codexMode || 'daily';
    var setArr = mode === 'recovery' ? CFG.quotes.recovery : mode === 'danger' ? CFG.quotes.dangerWindow : mode === 'dark' ? CFG.quotes.dark : CFG.quotes.daily;
    var quote = mode === 'daily' ? fill(dailyPick(setArr), snap) : dailyPick(setArr);
    var principles = CFG.quotes.codex.map(function (p) { return '<div class="principle"><h4>' + esc(p.title) + '</h4><p>' + esc(p.body) + '</p></div>'; }).join('');
    var html = '<div class="screen">' + header('Codex') +
      '<div class="card"><div class="seg" style="justify-content:center;margin-bottom:10px">' +
        '<button data-cx="daily" class="' + (mode === 'daily' ? 'on' : '') + '">Daily</button>' +
        '<button data-cx="recovery" class="' + (mode === 'recovery' ? 'on' : '') + '">Recovery</button>' +
        '<button data-cx="danger" class="' + (mode === 'danger' ? 'on' : '') + '">Danger hour</button>' +
        '<button data-cx="dark" class="' + (mode === 'dark' ? 'on' : '') + '">Dark</button></div>' +
        '<div class="codex-quote">' + esc(quote) + '</div>' +
        (mode === 'dark' ? '<div class="tiny faint center" style="margin-top:8px">Power <b>over the self</b>, not over others. Turned on people, these become a cage — for you.</div>' : '') +
      '</div>' +
      '<div class="card"><h3>Presence &amp; self-mastery</h3><div class="tiny faint" style="margin:-4px 0 8px">Becoming magnetic through self-mastery — never tactics on people.</div>' + principles + '</div>' +
      '<div class="btn-grid"><button class="btn ghost" data-go="signals">👁 Signals (field codex)</button><button class="btn ghost" data-go="power">⚡ Immortal Power</button></div>' +
    '</div>';
    appEl.innerHTML = ''; appEl.appendChild(h(html));
    appEl.querySelectorAll('[data-cx]').forEach(function (b) { b.onclick = function () { state._codexMode = b.getAttribute('data-cx'); render(); }; });
  }

  /* ---- IMMORTAL POWER (increment 3) ---- */
  function screenPower() {
    var s = S.getSettings(), asOf = today(), snap = E.snapshot(asOf);
    var aura = E.auraScores(s, asOf);
    var stage = E.stageFor(aura.streak.current);
    var longestStage = E.stageFor(aura.streak.longest);
    var perf = E.performanceSummary(s, asOf);
    var m = aura.meters;
    function bar(name, val, cls) { return '<div class="meter ' + cls + '"><div class="lbl"><span>' + name + '</span><b>' + val + '</b></div><div class="bar"><i data-fill="' + val + '"></i></div></div>'; }
    function stat(v, l) { return '<div class="st"><b>' + v + '</b><span>' + l + '</span></div>'; }
    function cuesList(arr) { return '<ul class="cues">' + arr.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>'; }
    var trendArrow = perf.indexTrend > 0 ? '<span class="trend up">▲</span>' : perf.indexTrend < 0 ? '<span class="trend down">▼</span>' : '<span class="trend flat">▬</span>';

    var ladder = CFG.stages.map(function (st, i) {
      var reached = aura.streak.current >= st.reach, cur = i === stage.index;
      return '<div class="pstage' + (cur ? ' cur' : '') + (reached ? ' done' : ' locked') + '">' +
        '<div class="ps-head"><span class="ps-n">' + esc(st.name) + '</span><span class="ps-meta">' + (reached ? (cur ? 'you are here' : '✓ held') : 'streak ' + st.reach + '+') + ' · ' + st.power + '</span></div>' +
        '<div class="ps-body tiny muted">' + esc(st.body) + '</div>' + cuesList(st.cues) + '</div>';
    }).join('');

    var html = '<div class="screen">' + header('Immortal Power') +
      '<div class="card today-hero">' +
        '<div class="day-num">Immortal Power</div>' +
        '<div class="power-wrap">' + powerBody(aura.power) + '</div>' +
        '<div class="power-pct"><b>' + aura.power + '</b><span>% charged</span></div>' +
        '<div class="rank-sub">Stage · <b style="color:var(--gold-soft)">' + esc(stage.current.name) + '</b>' + (stage.next ? ' · ' + stage.daysToNext + ' clean days to ' + esc(stage.next.name) : ' · the summit') + '</div>' +
        '<div class="tiny faint" style="margin-top:10px">Charge is mostly the <b>permanence of your streak</b>. A relapse genuinely discharges it; a kept streak rebuilds it, stage after stage.</div>' +
        '<button class="btn gold full" data-share-card style="margin-top:14px">🖼 Share your charge</button>' +
      '</div>' +
      '<div class="card center"><h3>Magnetism / attraction field</h3>' + magnetGauge(aura.magnetism) +
        '<div class="tiny faint" style="margin-top:2px">This reads <b>your own charge</b> — presence, retention, energy, will — not a promise about anyone else. Read yourself here; read the room in Signals.</div>' +
        '<button class="btn ghost sm" data-go="signals" style="margin-top:12px">👁 Open the Signals field codex</button>' +
      '</div>' +
      '<div class="card"><h3>Energy &amp; attractiveness acquired</h3>' +
        bar('Chi · energy now', m.chi, 'm-chi') + bar('Vitality · body', m.vitality, 'm-vit') +
        bar('Willpower · discipline', m.willpower, 'm-will') + bar('Presence · aura', m.presence, 'm-pres') +
        '<div class="divider"></div><table style="width:100%;font-size:13px">' +
        '<tr><td class="muted">Lifetime energy banked (Chi)</td><td style="text-align:right"><b>' + perf.totalChi.toLocaleString() + '</b></td></tr>' +
        '<tr><td class="muted">Streak permanence</td><td style="text-align:right"><b>' + aura.normStreak + '%</b></td></tr>' +
        '<tr><td class="muted">Current / longest streak</td><td style="text-align:right"><b>' + aura.streak.current + ' / ' + aura.streak.longest + '</b></td></tr>' +
        '<tr><td class="muted">Streak shields held</td><td style="text-align:right"><b>' + aura.streak.shields + '</b></td></tr>' +
        '<tr><td class="muted">Immortal Index (today)</td><td style="text-align:right"><b>' + m.index + '</b></td></tr></table>' +
      '</div>' +
      '<div class="card"><h3>Your stage now</h3>' +
        '<div class="rank-badge" style="cursor:default"><span class="nm">' + esc(stage.current.name) + '</span></div>' +
        '<div class="bar" style="margin-top:12px"><i data-fill="' + stage.progressPct + '" style="background:linear-gradient(90deg,#5a2f9a,#c98bff);box-shadow:0 0 12px #c98bff"></i></div>' +
        '<div class="tiny faint" style="margin-top:6px">' + (stage.next ? stage.progressPct + '% to ' + esc(stage.next.name) + ' · ' + stage.daysToNext + ' clean days' : 'Highest stage held.') + '</div>' +
        '<p class="muted" style="line-height:1.55;margin:12px 0 0">' + esc(stage.current.body) + '</p>' +
        (aura.streak.longest > aura.streak.current ? '<div class="tiny faint" style="margin-top:8px">Highest stage reached: <b>' + esc(longestStage.current.name) + '</b> (longest streak ' + aura.streak.longest + '). A slip lowers the live charge — never what you proved you can do.</div>' : '') +
      '</div>' +
      '<div class="card"><h3>What you may notice now</h3>' + cuesList(stage.current.cues) +
        '<div class="tiny faint">Tendencies, not promises — and your own rising initiative manufactures “signals” by itself. Read them lightly, act respectfully.</div></div>' +
      '<div class="card"><h3>Overall standing</h3>' +
        '<div class="stand">' + stat(perf.cleanRatePct == null ? '—' : perf.cleanRatePct + '%', 'clean rate') + stat(perf.currentStreak, 'streak') + stat(perf.longestStreak, 'longest') + '</div>' +
        '<div class="stand" style="margin-top:12px">' + stat((perf.avgIndex7 == null ? '—' : perf.avgIndex7) + ' ' + trendArrow, '7-day index') + stat(perf.adherencePct == null ? '—' : perf.adherencePct + '%', 'adherence') + stat(perf.relapses, 'relapses') + '</div>' +
        '<div class="tiny faint" style="margin-top:12px">Day ' + perf.day + ' · ' + perf.answeredDays + ' days logged · ' + perf.cleanDays + ' clean. ' + (perf.indexTrend > 0 ? 'Charge is trending up — keep the shape.' : perf.indexTrend < 0 ? 'Charge dipped this week — the coach on Today shows the quickest wins.' : 'Holding steady.') + '</div>' +
      '</div>' +
      '<div class="card"><h3>The stages — what comes, stage after stage</h3>' + ladder + '</div>' +
      '<div class="card"><div class="tiny faint">These numbers are a mirror of your own logs and streak — not a verdict, and never a claim about how anyone else must respond. Become someone worth meeting; the rest is theirs to decide freely.</div></div>' +
    '</div>';
    appEl.innerHTML = ''; appEl.appendChild(h(html)); animateBars(appEl);
    var sc = appEl.querySelector('[data-share-card]'); if (sc) sc.onclick = openShareCard;
  }

  /* ---- SIGNALS — body-language field codex (increment 3) ---- */
  function screenSignals() {
    var sig = CFG.signals;
    var entries = sig.entries.map(function (e) {
      return '<div class="signal"><h4>' + esc(e.title) + '</h4>' +
        '<div class="sig-row"><span class="sig-k">Looks like</span><p>' + esc(e.look) + '</p></div>' +
        '<div class="sig-row"><span class="sig-k">Can mean</span><p>' + esc(e.mean) + '</p></div>' +
        '<div class="sig-row carry"><span class="sig-k">Carry yourself</span><p>' + esc(e.carry) + '</p></div></div>';
    }).join('');
    var html = '<div class="screen">' + header('Signals') +
      '<div class="card"><div class="flag amber" style="margin:0">⚖ <span><b>Respect &amp; consent first.</b> ' + esc(sig.ethics) + '</span></div></div>' +
      '<div class="card"><h3>What a normal glance is</h3><p class="muted" style="line-height:1.6;margin:0">' + esc(sig.intro) + '</p></div>' +
      '<div class="card"><h3>The signals — and what they can mean</h3>' + entries + '</div>' +
      '<div class="card"><h3>The one rule</h3><p class="muted" style="line-height:1.6;margin:0">' + esc(sig.ethics) + '</p>' +
        '<button class="btn ghost sm" data-go="power" style="margin-top:12px">⚡ Back to Immortal Power</button></div>' +
    '</div>';
    appEl.innerHTML = ''; appEl.appendChild(h(html));
  }

  /* ---- MOVEMENT — steps · distance · weight-aware calories (increment 3.3) ---- */
  function screenMovement() {
    var s = S.getSettings(), d = today(), mv = E.movementSummary(s, d);
    var noBody = (s.heightCm == null || s.currentWeightKg == null);
    var dow = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    var stepsWk = [], distWk = [];
    for (var i = 6; i >= 0; i--) {
      var dt = U.addDays(d, -i), lg = S.getLog(dt), stp = (+lg.steps || 0), lbl = dow[U.fromISO(dt).getDay()];
      stepsWk.push({ label: lbl, value: Math.round(stp / 1000) });
      distWk.push({ label: lbl, value: +E.distanceKm(stp, s.heightCm).toFixed(1) });
    }
    var html = '<div class="screen">' + header('Movement') +
      '<div class="card today-hero">' +
        '<div class="day-num">Today · Movement</div>' +
        '<div class="index-wrap">' + stepRing(mv.steps, mv.goal) + '</div>' +
        '<div class="walk-stats" style="margin-top:4px">' +
          '<div><b>' + mv.distanceKm.toFixed(2) + '</b><span>km</span></div>' +
          '<div><b>' + mv.kcal + '</b><span>kcal (est)</span></div>' +
          '<div><b>' + Math.round(mv.pct) + '%</b><span>of ' + (mv.goal / 1000) + 'k goal</span></div></div>' +
        (noBody ? '<div class="flag info" style="margin-top:12px">Set your <b>height</b> &amp; <b>weight</b> in Settings for accurate distance &amp; calories. <button class="btn ghost sm" data-go="settings" style="margin-left:6px">Open</button></div>' : '') +
      '</div>' +
      '<div class="card"><h3>Set today’s steps</h3>' +
        '<div class="tiny muted" style="margin-bottom:8px">Read your all-day total off your phone’s step counter and enter it — distance &amp; calories update from your height &amp; weight. (A website can’t read the step sensor in the background; that total lives in your native counter.)</div>' +
        '<label class="field"><span>Steps today</span><input type="number" inputmode="numeric" id="mv-steps" value="' + (mv.steps || '') + '"></label>' +
        '<div class="seg"><button data-mv="1000">+1,000</button><button data-mv="500">+500</button><button data-mv="-500">−500</button><button data-mv="reset">reset</button></div>' +
      '</div>' +
      '<div class="card"><h3>Live walk</h3>' +
        '<div class="tiny muted" style="margin-bottom:8px">Let the app count a walk itself using the motion sensor — keep the screen on and the phone with you. It runs only while open, then adds to today’s steps, distance &amp; calories.</div>' +
        '<button class="btn gold full" id="mv-walk">▶ Start walk session</button></div>' +
      '<div class="card"><h3>This week</h3><div class="muted tiny">Steps (k) / day</div>' + barChart(stepsWk, '#5be0a0', 'k') +
        '<div class="muted tiny" style="margin-top:10px">Distance (km) / day</div>' + barChart(distWk, '#62d8ff', 'km') + '</div>' +
    '</div>';
    appEl.innerHTML = ''; appEl.appendChild(h(html));
    var inp = appEl.querySelector('#mv-steps');
    inp.addEventListener('change', function () { var v = inp.value === '' ? 0 : Math.max(0, Math.round(+inp.value)); S.patchLog(d, { steps: v }); render(); });
    appEl.querySelectorAll('[data-mv]').forEach(function (b) {
      b.onclick = function () {
        var a = b.getAttribute('data-mv'), cur = +S.getLog(d).steps || 0;
        var nx = a === 'reset' ? 0 : Math.max(0, cur + (+a));
        S.patchLog(d, { steps: nx }); render();
      };
    });
    appEl.querySelector('#mv-walk').onclick = openWalkSession;
  }
  function openWalkSession() {
    var s = S.getSettings();
    function begin() {
      var t0 = Date.now(), det = E.createStepDetector(), running = true, wake = null, lastVibe = 0;
      var ov = h('<div class="overlay walk">' +
        '<div class="day-num">LIVE WALK</div>' +
        '<div class="breath run" id="w-ring"><b id="w-steps">0</b></div>' +
        '<div class="walk-stats" style="width:min(360px,86vw)">' +
          '<div><b id="w-dist">0.00</b><span>km</span></div>' +
          '<div><b id="w-kcal">0</b><span>kcal</span></div>' +
          '<div><b id="w-time">0:00</b><span>time</span></div></div>' +
        '<div class="tiny faint" id="w-msg" style="max-width:340px;margin-top:8px">Keep the phone with you, screen on. Counting runs only while this is open.</div>' +
        '<button class="btn gold full" style="max-width:340px;margin-top:16px" data-w="stop">Finish &amp; log walk</button>' +
        '<button class="btn ghost sm" data-w="cancel" style="margin-top:8px">Cancel</button></div>');
      document.body.appendChild(ov);
      if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () {});
      var stepsEl = ov.querySelector('#w-steps'), distEl = ov.querySelector('#w-dist'), kcalEl = ov.querySelector('#w-kcal'), timeEl = ov.querySelector('#w-time');
      function onMotion(e) {
        var a = e.accelerationIncludingGravity || e.acceleration; if (!a) return;
        var mag = Math.sqrt((a.x || 0) * (a.x || 0) + (a.y || 0) * (a.y || 0) + (a.z || 0) * (a.z || 0));
        if (det.push(mag, e.timeStamp != null ? e.timeStamp : (Date.now() - t0))) {
          var c = det.count(), min = (Date.now() - t0) / 60000;
          stepsEl.textContent = c;
          distEl.textContent = E.distanceKm(c, s.heightCm).toFixed(2);
          kcalEl.textContent = Math.round(E.caloriesForSession(c, min, s.currentWeightKg, s.heightCm));
          if (c - lastVibe >= 1000) { lastVibe = c; if (navigator.vibrate && !reducedMotion()) navigator.vibrate(60); }
        }
      }
      window.addEventListener('devicemotion', onMotion);
      var ti = setInterval(function () { var sec = Math.floor((Date.now() - t0) / 1000); timeEl.textContent = Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }, 1000);
      function cleanup() { running = false; clearInterval(ti); window.removeEventListener('devicemotion', onMotion); if (wake && wake.release) { try { wake.release(); } catch (e) {} } ov.remove(); }
      ov._cleanup = cleanup;
      ov.querySelector('[data-w=cancel]').onclick = cleanup;
      ov.querySelector('[data-w=stop]').onclick = function () {
        var min = (Date.now() - t0) / 60000, n = det.count();
        cleanup();
        if (n > 0) {
          var log = S.getLog(today()), addKcal = Math.round(E.caloriesForSession(n, min, s.currentWeightKg, s.heightCm));
          S.patchLog(today(), { steps: (+log.steps || 0) + n, kcalBurned: (+log.kcalBurned || 0) + addKcal, cardio: { type: 'walk', minutes: Math.round(min), notes: 'live walk' } });
          toast('Walk logged · ' + n + ' steps · ' + E.distanceKm(n, s.heightCm).toFixed(2) + ' km');
        }
        render();
      };
      setTimeout(function () { if (running && det.count() === 0) { var m = ov.querySelector('#w-msg'); if (m) m.textContent = 'No motion detected. On iPhone allow motion access; on a desktop there is no sensor — use “Set today’s steps” instead.'; } }, 4500);
    }
    if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission().then(function (r) { if (r === 'granted') begin(); else toast('Motion access denied.'); }).catch(function () { toast('Motion access unavailable here.'); });
    } else if (window.DeviceMotionEvent) { begin(); }
    else { toast('This device exposes no motion sensor — use “Set today’s steps”.'); }
  }

  /* ---- SHAREABLE PROGRESS CARD (increment 3.1, offline canvas → PNG) ---- */
  function drawPowerBodyOnto(ctx, pct, x, y, w, hgt) {
    return new Promise(function (resolve, reject) {
      // standalone, self-sized SVG (the live node sizes via CSS class, which a detached Image lacks)
      var svg = powerBody(pct).replace('<svg class="pbody"', '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + hgt + '"');
      var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      var img = new Image();
      img.onload = function () { try { ctx.drawImage(img, x, y, w, hgt); } catch (e) {} URL.revokeObjectURL(url); resolve(); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('svg raster failed')); };
      img.src = url;
    });
  }
  function renderShareCard() {
    var data = E.shareCardData(S.getSettings(), today());
    var W = 1080, Hc = 1350, cv = document.createElement('canvas');
    cv.width = W; cv.height = Hc;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#06060e'; ctx.fillRect(0, 0, W, Hc);
    function orb(x, y, r, rgb, a) { var g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, Hc); }
    ctx.globalCompositeOperation = 'lighter';
    orb(W * 0.78, Hc * 0.08, 700, '214,175,78', 0.16);
    orb(W * 0.15, Hc * 0.95, 760, '98,216,255', 0.12);
    orb(W * 0.5, Hc * 0.5, 520, '154,107,255', 0.07);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(214,175,78,0.35)'; ctx.lineWidth = 3; ctx.strokeRect(28, 28, W - 56, Hc - 56);
    function text(t, x, y, font, color, ls) {
      ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      var has = ('letterSpacing' in ctx); if (has) ctx.letterSpacing = (ls || 0) + 'px';
      ctx.fillText(t, x, y); if (has) ctx.letterSpacing = '0px';
    }
    text('ROAD TO IMMORTAL', W / 2, 132, '700 52px system-ui, sans-serif', '#f0d488', 6);
    text((data.displayName ? data.displayName + ' · ' : '') + 'MONK MODE', W / 2, 180, '400 26px system-ui, sans-serif', '#6a6f99', 4);
    return drawPowerBodyOnto(ctx, data.power, W / 2 - 165, 250, 330, 550)
      .catch(function () {
        var cx = W / 2, cy = 525, r = 190; ctx.lineWidth = 26;
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
        ctx.strokeStyle = '#ffce6a'; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * data.power / 100); ctx.stroke();
      })
      .then(function () {
        text(data.power + '%', W / 2, 920, '700 130px system-ui, sans-serif', '#ffce6a', 0);
        text('IMMORTAL POWER · CHARGED', W / 2, 968, '400 24px system-ui, sans-serif', '#9aa0c7', 4);
        text(data.rank, W / 2, 1070, '700 56px system-ui, sans-serif', '#f0d488', 1);
        text('Stage · ' + data.stage, W / 2, 1118, '400 30px system-ui, sans-serif', '#9aa0c7', 1);
        function stat(label, val, x) { text(String(val), x, 1232, '700 64px system-ui, sans-serif', '#e9e9ff', 0); text(label, x, 1274, '400 22px system-ui, sans-serif', '#6a6f99', 3); }
        stat('DAY', data.day, W * 0.27); stat('STREAK', data.cleanStreak, W * 0.5); stat('INDEX', data.index, W * 0.73);
        text('kept only on this device · road to immortal', W / 2, 1322, '400 20px system-ui, sans-serif', '#6a6f99', 2);
        return cv;
      });
  }
  function openShareCard() {
    var ov = h('<div class="overlay sharecard">' +
        '<div class="day-num">YOUR CHARGE</div>' +
        '<div class="sc-preview"><canvas id="sc-cv"></canvas><div class="sc-load tiny faint">Forging your sigil…</div></div>' +
        '<div class="row" style="gap:10px;margin-top:14px">' +
          '<button class="btn gold" data-sc="share" style="display:none">Share</button>' +
          '<button class="btn cyan" data-sc="download">Download</button>' +
          '<button class="btn ghost sm" data-sc="close">Close</button></div></div>');
    document.body.appendChild(ov);
    ov._cleanup = function () { ov.remove(); };
    ov.querySelector('[data-sc=close]').onclick = ov._cleanup;
    renderShareCard().then(function (cv) {
      if (!document.body.contains(ov)) return;             // closed early
      var holder = ov.querySelector('#sc-cv'); holder.width = cv.width; holder.height = cv.height;
      holder.getContext('2d').drawImage(cv, 0, 0);
      var ld = ov.querySelector('.sc-load'); if (ld) ld.remove();
      ov._cardCanvas = cv;
      cv.toBlob(function (blob) {
        if (!blob || typeof File === 'undefined') return;
        var file = new File([blob], 'road-to-immortal-' + today() + '.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
          var sb = ov.querySelector('[data-sc=share]'); sb.style.display = '';
          sb.onclick = function () { navigator.share({ files: [file], title: 'Road to Immortal', text: 'Day ' + E.shareCardData(S.getSettings(), today()).day }).catch(function () {}); };
        }
      }, 'image/png');
    }).catch(function (e) { var ld = ov.querySelector('.sc-load'); if (ld) ld.textContent = 'Could not render: ' + (e && e.message || e); });
    ov.querySelector('[data-sc=download]').onclick = function () {
      var cv = ov._cardCanvas; if (!cv) { toast('Still forging — one moment.'); return; }
      cv.toBlob(function (blob) {
        var url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = 'road-to-immortal-' + today() + '.png';
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        toast('Sigil card saved.');
      }, 'image/png');
    };
  }

  /* =================== INCREMENT 4 — ROTA · ORACLE · SANCTUM (stage 1) =================== */
  // Shared context bundle for the Oracle (whisper + conversation). Every piece
  // is fetched inside its own try/catch so one missing module or engine
  // function can never take the whole screen down.
  function buildOracleCtx() {
    var s = S.getSettings(), asOf = today(), hour = new Date().getHours();
    var ctx = { settings: s, asOf: asOf, hour: hour, snap: null, risk: null, prophecy: null,
      eta: null, outlook: null, nut: null, rotaToday: null, upcoming: [], moon: null, sun: null, brahma: null };
    try { ctx.snap = E.snapshot(asOf); } catch (e) {}
    try { ctx.rotaToday = R ? R.shiftOn(asOf) : null; } catch (e) {}
    try { ctx.upcoming = (R && R.upcoming(asOf, 14)) || []; } catch (e) {}
    try { ctx.risk = E.riskForecast ? E.riskForecast(s, asOf, hour, ctx.rotaToday ? ctx.rotaToday.kindId : null) : null; } catch (e) {}
    try { ctx.prophecy = E.weeklyProphecy ? E.weeklyProphecy(s, asOf) : null; } catch (e) {}
    try { ctx.eta = E.rankETA ? E.rankETA(s, asOf) : null; } catch (e) {}
    try { ctx.outlook = E.survivalOutlook ? E.survivalOutlook(s, asOf) : null; } catch (e) {}
    try { ctx.nut = E.nutritionAdherence(S.getLog(asOf)); } catch (e) {}
    try { ctx.moon = SAN ? SAN.moonPhase(asOf) : null; } catch (e) {}
    try { if (SAN && s.latitude != null && s.longitude != null) ctx.sun = SAN.sunTimes(asOf, s.latitude, s.longitude); } catch (e) {}
    try { if (SAN && s.latitude != null && s.longitude != null) ctx.brahma = SAN.brahmaMuhurta(asOf, s.latitude, s.longitude); } catch (e) {}
    return ctx;
  }

  /* ---- ROTA — shift calendar, import, patterns (increment 4) ---- */
  function rotaKinds() { return (CFG.rota && CFG.rota.kinds) || []; }
  function rotaKindById(id) {
    try { if (R && R.kindById) return R.kindById(id); } catch (e) {}
    var ks = rotaKinds();
    for (var i = 0; i < ks.length; i++) if (ks[i].id === id) return ks[i];
    return null;
  }
  // normCode with a local fallback so a partial rota module can't crash the UI
  function normCodeSafe(c) {
    try { var n = R && R.normCode ? R.normCode(c) : null; if (n) return n; } catch (e) {}
    var t = (c == null ? '' : String(c)).replace(/^\s+|\s+$/g, '').toUpperCase();
    return t || null;
  }
  // existing mapped code for a kind if the codeMap has one, else the kind id uppercased
  function codeForKind(kindId, rota) {
    var cm = (rota && rota.codeMap) || {};
    for (var c in cm) if (cm[c] === kindId) return c;
    return String(kindId).toUpperCase();
  }
  // prefill for the import mapper: the chosen role preset's map wins, then kindFor
  function prefillKind(code, roleId, rota) {
    var norm = normCodeSafe(code);
    var presets = (CFG.rota && CFG.rota.rolePresets) || [];
    for (var i = 0; i < presets.length; i++) {
      if (presets[i].id === roleId && presets[i].map && norm && presets[i].map[norm]) return presets[i].map[norm];
    }
    try { return R && R.kindFor ? R.kindFor(code, rota) : null; } catch (e) { return null; }
  }
  var ROTA_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function rotaMonthLabel(ym) { return ROTA_MONTHS[(+ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4); }
  function shiftRotaMonth(ym, delta) {
    var d = new Date(+ym.slice(0, 4), (+ym.slice(5, 7)) - 1 + delta, 15); // mid-month = DST-safe
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }
  // Mon-first month grid; each cell shows the day number + kind icon, tinted
  // with the kind colour at low alpha, with a gold ring on today.
  function rotaCalendarHtml(ym, rota) {
    var first = ym + '-01';
    var firstDow = (U.fromISO(first).getDay() + 6) % 7;                       // Mon=0 … Sun=6
    var daysInMonth = new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate();
    var start = U.addDays(first, -firstDow);
    var cells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
    var t = today(), dows = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'], out = '';
    for (var i = 0; i < 7; i++) out += '<div class="rota-dow">' + dows[i] + '</div>';
    for (var c = 0; c < cells; c++) {
      var dISO = U.addDays(start, c), inMonth = dISO.slice(0, 7) === ym;
      var sh = null; try { sh = R.shiftOn(dISO, rota); } catch (e) {}
      var k = sh && sh.kind ? sh.kind : null;
      var tint = (k && k.color) ? ' style="background:' + k.color + '22"' : '';
      out += '<div class="rota-cell' + (inMonth ? '' : ' dim') + (dISO === t ? ' today' : '') + '" data-rd="' + dISO + '"' + tint + '>' +
        '<span class="dn">' + (+dISO.slice(8, 10)) + '</span>' +
        '<span class="ic">' + (k ? k.ic : (sh ? '·' : '')) + '</span></div>';
    }
    return '<div class="rota-cal">' + out + '</div>';
  }
  // tap-a-day picker: buttons from CFG.rota.kinds + Clear day
  function openRotaDayPicker(dateISO) {
    var rota = S.getRota(), cur = null;
    try { cur = R.shiftOn(dateISO, rota); } catch (e) {}
    var btns = rotaKinds().map(function (k) {
      var on = cur && cur.kindId === k.id;
      return '<button class="btn' + (on ? ' gold' : '') + '" data-rk="' + esc(k.id) + '" style="justify-content:flex-start">' + k.ic + ' ' + esc(k.label) + '</button>';
    }).join('');
    var ov = h('<div class="overlay" style="overflow-y:auto">' +
      '<div class="day-num">' + esc(dateISO) + (cur ? ' · ' + esc(cur.code) : '') + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;width:min(380px,88vw);margin-top:12px">' + btns + '</div>' +
      '<button class="btn ghost sm" data-rk="__clear" style="margin-top:14px;color:#ff8aa8">Clear day</button>' +
      '<button class="btn ghost sm" data-rk="__close" style="margin-top:8px">cancel</button></div>');
    document.body.appendChild(ov);
    ov._cleanup = function () { ov.remove(); };
    ov.querySelectorAll('[data-rk]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-rk');
        if (id === '__close') { ov.remove(); return; }
        if (id === '__clear') { try { R.setShift(dateISO, null); } catch (e) {} ov.remove(); render(); return; }
        // write the CODE for that kind (existing mapped code, else the kind id
        // uppercased) and make sure the codeMap knows what it means.
        var code = codeForKind(id, S.getRota());
        try { R.setShift(dateISO, code); } catch (e) {}
        var cm = {}, old = S.getRota().codeMap || {};
        for (var kk in old) cm[kk] = old[kk];
        cm[code] = id;
        S.setRota({ codeMap: cm });
        ov.remove(); render();
      };
    });
  }
  // Import wizard — step 1: role preset + paste/file + Parse; step 2: map codes → kinds, Apply.
  function openRotaImport() {
    var rota = S.getRota();
    var presets = (CFG.rota && CFG.rota.rolePresets) || [];
    var roleOpts = presets.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (rota.role === p.id ? ' selected' : '') + '>' + esc(p.label) + '</option>';
    }).join('');
    var ov = h('<div class="overlay" style="justify-content:flex-start;overflow-y:auto;padding-top:36px">' +
      '<div class="day-num">IMPORT YOUR ROTA</div>' +
      '<div class="card" style="width:min(440px,92vw);text-align:left">' +
        '<label class="field"><span>Your job / role (code presets)</span><select id="ri-role">' + roleOpts + '</select></label>' +
        '<label class="field"><span>Paste your rota — CSV, calendar (.ics) or plain text</span>' +
          '<textarea id="ri-text" style="min-height:130px" placeholder="2026-07-06, N&#10;Mon 6 Jul — Night shift&#10;06/07/2026 LD"></textarea></label>' +
        '<label class="field"><span>…or pick a file</span><input type="file" id="ri-file" accept=".csv,.ics,.txt,text/csv,text/calendar,text/plain"></label>' +
        '<button class="btn gold full" id="ri-parse">Parse</button>' +
        '<div class="tiny faint" style="margin-top:8px">Read entirely on this device — nothing is uploaded, ever.</div>' +
      '</div>' +
      '<button class="btn ghost sm" id="ri-close" style="margin-top:4px">cancel</button></div>');
    document.body.appendChild(ov);
    ov._cleanup = function () { ov.remove(); };
    ov.querySelector('#ri-close').onclick = ov._cleanup;
    ov.querySelector('#ri-file').onchange = function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () { ov.querySelector('#ri-text').value = String(rd.result || ''); };
      rd.readAsText(f);
    };
    ov.querySelector('#ri-parse').onclick = function () {
      var text = ov.querySelector('#ri-text').value;
      if (!text || !text.replace(/\s/g, '')) { toast('Paste your rota (or pick a file) first.'); return; }
      var roleId = ov.querySelector('#ri-role').value;
      var res = null;
      try { res = R.parse(text); } catch (e) {}
      if (!res || !res.entries || !res.entries.length) { toast('Could not find any dated entries in that.'); return; }
      rotaImportStep2(ov, res, roleId);
    };
  }
  function rotaImportStep2(ov, res, roleId) {
    var rota = S.getRota(), kinds = rotaKinds();
    var codesArr = res.codes || [];
    // entry count per (normalized) code, for the mapping rows
    var counts = {};
    res.entries.forEach(function (en) { var c = normCodeSafe(en.code); if (c) counts[c] = (counts[c] || 0) + 1; });
    function kindOpts(sel) {
      var o = '<option value="">— leave unmapped —</option>';
      kinds.forEach(function (k) { o += '<option value="' + esc(k.id) + '"' + (sel === k.id ? ' selected' : '') + '>' + k.ic + ' ' + esc(k.label) + '</option>'; });
      return o;
    }
    var rowsH = codesArr.map(function (code, i) {
      var norm = normCodeSafe(code);
      return '<div class="row" style="align-items:center;margin:8px 0"><div class="grow" style="overflow:hidden;text-overflow:ellipsis"><b>' + esc(code) + '</b> <span class="tiny faint">× ' + (counts[norm] || 0) + '</span></div>' +
        '<select data-ric="' + i + '" style="width:180px;flex:0 0 auto">' + kindOpts(prefillKind(code, roleId, rota)) + '</select></div>';
    }).join('');
    var warnH = (res.warnings && res.warnings.length) ?
      '<div class="flag amber" style="margin-top:10px">⚠ <span>' + res.warnings.map(function (w) { return esc(w); }).join('<br>') + '</span></div>' : '';
    ov.innerHTML = '<div class="day-num">IMPORT · MAP YOUR CODES</div>' +
      '<div class="card" style="width:min(440px,92vw);text-align:left">' +
        '<div class="tiny muted">Found <b>' + res.entries.length + '</b> dated entries (' + esc(res.format || 'text') + ') · ' + codesArr.length + ' unique code' + (codesArr.length === 1 ? '' : 's') + '. Tell the rota what each one means.</div>' +
        rowsH + warnH +
        '<button class="btn gold full" id="ri-apply" style="margin-top:12px">Apply to rota</button>' +
      '</div>' +
      '<button class="btn ghost sm" id="ri-back" style="margin-top:4px">‹ back</button>';
    ov.querySelector('#ri-back').onclick = function () { ov.remove(); openRotaImport(); };
    ov.querySelector('#ri-apply').onclick = function () {
      var map = {};
      ov.querySelectorAll('[data-ric]').forEach(function (sel) {
        var key = normCodeSafe(codesArr[+sel.getAttribute('data-ric')]);
        if (key && sel.value) map[key] = sel.value;
      });
      var applied = null;
      try { applied = R.applyEntries(res.entries, map); } catch (e) {}
      if (!applied) { toast('Could not apply — nothing was written.'); return; }
      S.setRota({ role: roleId });
      toast(applied.added + ' rota day' + (applied.added === 1 ? '' : 's') + ' imported.');
      var range = applied.days;
      ov.remove();
      // honest opt-in: never silently rewrites day plans
      if (range && range[0] && confirm('Also set day plans (shift / rest) for ' + range[0] + ' → ' + range[1] + '? Days you already answered are never touched.')) {
        var r2 = null; try { r2 = R.applyDayTypes(range[0], range[1]); } catch (e) {}
        if (r2) toast(r2.set + ' days planned · ' + r2.skipped + ' already answered');
      }
      render();
    };
  }
  function screenRota() {
    if (!R) {
      var mh = '<div class="screen">' + header('Rota') +
        '<div class="card"><p class="muted" style="margin:0">Rota module missing — rota.js did not load. Reload the app.</p></div></div>';
      appEl.innerHTML = ''; appEl.appendChild(h(mh)); return;
    }
    var ym = state._rotaMonth || (state._rotaMonth = today().slice(0, 7));
    var rota = S.getRota(), kinds = rotaKinds();
    var legend = '<div class="rota-legend">' + kinds.map(function (k) {
      return '<span style="border-color:' + k.color + '55">' + k.ic + ' ' + esc(k.label) + '</span>';
    }).join('') + '</div>';
    // next 7 days that have a rota entry
    var up = []; try { up = R.upcoming(today(), 7) || []; } catch (e) {}
    var dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var upH = up.length ? up.map(function (u) {
      var k = u.kind;
      return '<div class="row" style="justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.05)">' +
        '<span class="muted tiny">' + dowNames[U.fromISO(u.date).getDay()] + ' ' + esc(u.date.slice(5)) + '</span>' +
        '<span>' + (k ? k.ic + ' ' + esc(k.label) : esc(u.code) + ' <span class="tiny faint">unmapped</span>') +
        (k && k.start ? ' <span class="tiny faint">' + esc(k.start) + '–' + esc(k.end) + '</span>' : '') + '</span></div>';
    }).join('') : '<p class="faint tiny">Nothing on the rota for the next 7 days. Import it or tap days above.</p>';
    // month tallies
    var mc = null; try { mc = R.monthCounts(ym); } catch (e) {}
    var mcH;
    if (mc && mc.total) {
      var chips = [];
      kinds.forEach(function (k) { var n = mc.byKind && mc.byKind[k.id]; if (n) chips.push('<span style="border-color:' + k.color + '55">' + k.ic + ' ' + esc(k.label) + ' × ' + n + '</span>'); });
      if (mc.unmapped) chips.push('<span>❓ unmapped × ' + mc.unmapped + '</span>');
      mcH = '<div class="rota-legend" style="margin-top:0">' + chips.join('') + '</div>' +
        '<div class="tiny faint" style="margin-top:8px">' + mc.total + ' rota day' + (mc.total === 1 ? '' : 's') + ' this month.</div>';
    } else mcH = '<p class="faint tiny">No rota entries this month yet.</p>';

    var html = '<div class="screen">' + header('Rota') +
      '<div class="card">' +
        '<div class="row" style="align-items:center;justify-content:space-between">' +
          '<button class="btn sm" data-rm="prev">‹</button>' +
          '<b>' + esc(rotaMonthLabel(ym)) + '</b>' +
          '<button class="btn sm" data-rm="next">›</button></div>' +
        rotaCalendarHtml(ym, rota) + legend +
        '<div class="tiny faint" style="margin-top:8px">Tap a day to set or clear its shift.</div>' +
      '</div>' +
      '<div class="card"><h3>Next up</h3>' + upH + '</div>' +
      '<div class="card"><h3>This month</h3>' + mcH + '</div>' +
      '<div class="card"><h3>Import your rota</h3>' +
        '<div class="tiny muted" style="margin-bottom:10px">Paste or pick your rota — CSV, calendar (.ics) or plain text. Parsed entirely on this device; nothing leaves it.</div>' +
        '<button class="btn gold full" id="ro-import">⤒ Import rota</button></div>' +
      '<div class="card"><h3>Repeat a pattern</h3>' +
        '<div class="tiny muted" style="margin-bottom:4px">e.g. “4D 4OFF” — four day shifts then four off, cycling from the anchor date.</div>' +
        '<label class="field"><span>Anchor date (pattern day 1)</span><input type="date" id="rp-anchor" value="' + today() + '"></label>' +
        '<label class="field"><span>Pattern</span><input type="text" id="rp-pattern" placeholder="4D 4OFF"></label>' +
        '<label class="field"><span>Weeks to fill</span><input type="number" inputmode="numeric" id="rp-weeks" value="4" min="1" max="26"></label>' +
        '<div id="rp-preview" style="margin:6px 0 10px"></div>' +
        '<div class="btn-grid"><button class="btn cyan" id="rp-prev">Preview</button><button class="btn gold" id="rp-apply">Apply</button></div></div>' +
      '<div class="card"><h3>Apply to day plans</h3>' +
        '<div class="tiny muted" style="margin-bottom:4px">Sets each day’s shift/rest nutrition plan from the rota. Days you already answered are never overwritten.</div>' +
        '<label class="field"><span>From</span><input type="date" id="ap-from" value="' + today() + '"></label>' +
        '<label class="field"><span>To</span><input type="date" id="ap-to" value="' + U.addDays(today(), 30) + '"></label>' +
        '<button class="btn cyan full" id="ap-go">Plan those days</button></div>' +
      '<div class="card"><h3>Clear range</h3>' +
        '<label class="field"><span>From</span><input type="date" id="cr-from" value="' + today() + '"></label>' +
        '<label class="field"><span>To</span><input type="date" id="cr-to" value="' + U.addDays(today(), 30) + '"></label>' +
        '<button class="btn full" id="cr-go" style="border-color:rgba(255,107,138,.4);color:#ffc2cf">Clear rota entries</button></div>' +
    '</div>';
    appEl.innerHTML = ''; appEl.appendChild(h(html));

    appEl.querySelectorAll('[data-rm]').forEach(function (b) {
      b.onclick = function () { state._rotaMonth = shiftRotaMonth(ym, b.getAttribute('data-rm') === 'prev' ? -1 : 1); render(); };
    });
    appEl.querySelectorAll('[data-rd]').forEach(function (c) {
      c.onclick = function () { openRotaDayPicker(c.getAttribute('data-rd')); };
    });
    appEl.querySelector('#ro-import').onclick = openRotaImport;
    // pattern: read the three inputs, expand, preview/apply
    function patternEntries() {
      var codes = null;
      try { codes = R.parsePattern(appEl.querySelector('#rp-pattern').value); } catch (e) {}
      if (!codes || !codes.length) return null;
      var anchor = appEl.querySelector('#rp-anchor').value || today();
      var weeks = Math.max(1, Math.min(26, Math.round(+appEl.querySelector('#rp-weeks').value) || 4));
      var entries = null;
      try { entries = R.expandPattern(anchor, codes, weeks * 7); } catch (e) {}
      return (entries && entries.length) ? entries : null;
    }
    appEl.querySelector('#rp-prev').onclick = function () {
      var entries = patternEntries(), host = appEl.querySelector('#rp-preview');
      if (!entries) { host.innerHTML = '<p class="faint tiny" style="margin:0">Could not read that pattern — try like “4D 4OFF” or “2E 2L 2N 4OFF”.</p>'; return; }
      host.innerHTML = entries.slice(0, 14).map(function (en) {
        return '<span class="pill" style="margin:0 4px 4px 0">' + esc(String(en.date).slice(5)) + ' ' + esc(en.code) + '</span>';
      }).join('') + (entries.length > 14 ? ' <span class="tiny faint">+' + (entries.length - 14) + ' more</span>' : '');
    };
    appEl.querySelector('#rp-apply').onclick = function () {
      var entries = patternEntries();
      if (!entries) { toast('Write a pattern first — e.g. “4D 4OFF”.'); return; }
      var res = null;
      try { res = R.applyEntries(entries, {}); } catch (e) {}
      toast(((res && res.added) || 0) + ' days written to the rota.');
      render();
    };
    appEl.querySelector('#ap-go').onclick = function () {
      var from = appEl.querySelector('#ap-from').value || today();
      var to = appEl.querySelector('#ap-to').value || U.addDays(today(), 30);
      var r2 = null; try { r2 = R.applyDayTypes(from, to); } catch (e) {}
      if (!r2) { toast('Nothing to plan in that range.'); return; }
      toast(r2.set + ' days planned · ' + r2.skipped + ' already answered');
      render();
    };
    appEl.querySelector('#cr-go').onclick = function () {
      var from = appEl.querySelector('#cr-from').value || today();
      var to = appEl.querySelector('#cr-to').value || U.addDays(today(), 30);
      if (!confirm('Remove all rota entries from ' + from + ' to ' + to + '? Your day logs are untouched.')) return;
      var n = 0; try { n = R.clearRange(from, to) || 0; } catch (e) {}
      toast(n + ' rota entr' + (n === 1 ? 'y' : 'ies') + ' cleared.');
      render();
    };
  }

  /* ---- ORACLE — converse with your own ledger + the Sight (increment 4) ---- */
  // The conversation lives on `state` so it survives re-renders within this
  // session; a reload starts fresh. Nothing is ever persisted or sent — the
  // Oracle reads the ledger on this device and speaks only to its owner.
  function oracleMsgs() {
    if (!state._oracleMsgs) {
      var greet = (CFG.oracle && CFG.oracle.greetings && CFG.oracle.greetings.length) ?
        dailyPick(CFG.oracle.greetings) : 'Speak.';
      state._oracleMsgs = [{ who: 'oracle', text: greet, actions: [] }];
    }
    return state._oracleMsgs;
  }
  // speak a reply aloud when the owner has switched the voice on in Settings
  function oracleSpeak(say) {
    try {
      if (!say || !S.getSettings().oracleVoice || !('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();               // never queue over a pending line
      var u = new SpeechSynthesisUtterance(say);
      u.lang = 'en-GB';
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }
  // one-shot dictation (webkit only — the mic button renders only when it exists)
  function startOracleMic() {
    try {
      var rec = new window.webkitSpeechRecognition();
      rec.lang = 'en-GB'; rec.interimResults = false; rec.maxAlternatives = 1;
      rec.onresult = function (e) {
        var t = (e.results && e.results[0] && e.results[0][0]) ? e.results[0][0].transcript : '';
        var inp = appEl.querySelector('#or-input'); if (inp) inp.value = t;
        if (t) oracleSend(t);
      };
      rec.onerror = function () { toast('The Oracle could not hear — try typing.'); };
      rec.start();
      toast('Listening…');
    } catch (e) { toast('Voice input unavailable here.'); }
  }
  // the send flow: push the owner's words, ask the module, push the answer
  function oracleSend(raw) {
    var text = (raw == null ? '' : String(raw)).replace(/^\s+|\s+$/g, '');
    if (!text) return;
    var msgs = oracleMsgs();
    msgs.push({ who: 'you', text: text });
    var res = null;
    if (ORA) { try { res = ORA.respond(text, buildOracleCtx()); } catch (e) {} }
    if (!res || !res.text) {
      res = { text: (CFG.oracle && CFG.oracle.unknown && CFG.oracle.unknown.length) ?
        dailyPick(CFG.oracle.unknown) : 'The record is silent on that.', say: null, actions: [] };
    }
    msgs.push({ who: 'oracle', text: res.text, actions: res.actions || [] });
    oracleSpeak(res.say);
    render();
  }
  // execute an action chip. The Oracle only ever PROPOSES — every write
  // happens here, on the owner's tap, with the same semantics as quick log.
  function runOracleAction(act, payload) {
    var d = today(), log = S.getLog(d);
    if (act === 'steps') {                            // steps arrive as a daily TOTAL — set, not add
      var stp = Math.max(0, Math.round(+payload || 0));
      S.patchLog(d, { steps: stp }); toast('Steps set to ' + stp.toLocaleString() + '.'); render(); return;
    }
    if (act === 'med') {                              // additive, like quickAction
      var mm = Math.max(0, Math.round(+payload || 0));
      S.patchLog(d, { meditationMin: (+log.meditationMin || 0) + mm }); toast('+' + mm + ' min meditation'); render(); return;
    }
    if (act === 'breath') {                           // additive, like quickAction
      var bm = Math.max(0, Math.round(+payload || 0));
      S.patchLog(d, { breathingMin: (+log.breathingMin || 0) + bm }); toast('+' + bm + ' min breath'); render(); return;
    }
    if (act === 'sleep') { S.patchLog(d, { sleepHrs: +payload }); toast('Sleep logged · ' + (+payload) + 'h'); render(); return; }
    if (act === 'mood') { S.patchLog(d, { mood: Math.round(+payload) }); toast('Mood logged · ' + Math.round(+payload) + '/5'); render(); return; }
    if (act === 'clean') {                            // never flips a day already answered
      if (log.clean == null) { S.patchLog(d, { clean: true }); toast('Held. The line holds.'); render(); }
      else toast('Today is already answered — the log stands.');
      return;
    }
    if (act === 'goto') { state.tab = payload || 'today'; window.scrollTo(0, 0); render(); return; }
    if (act === 'breathwork') { openBreathSession(payload, null); return; }
    if (act === 'urge') { openUrge(); return; }
  }
  // suggestion chips — each sends its text through the normal flow
  var ORACLE_CHIPS = ['Status', 'Risk tonight', 'What’s left to eat', 'Next shift', 'Prophecy', 'Wisdom'];
  function oracleConverseHtml() {
    var msgs = oracleMsgs();
    var thread = msgs.map(function (m, mi) {
      var acts = '';
      if (m.who === 'oracle' && m.actions && m.actions.length) {
        acts = '<div class="chips">' + m.actions.map(function (a, ai) {
          return '<button class="btn sm cyan" data-oa="' + mi + ':' + ai + '">' + esc(a.label) + '</button>';
        }).join('') + '</div>';
      }
      return '<div class="msg ' + (m.who === 'you' ? 'you' : 'oracle') + '">' + esc(m.text).replace(/\n/g, '<br>') + acts + '</div>';
    }).join('');
    var chips = '<div class="chips" style="margin-top:10px">' + ORACLE_CHIPS.map(function (c, i) {
      return '<button class="btn sm" data-oc="' + i + '">' + esc(c) + '</button>';
    }).join('') + '</div>';
    var mic = ('webkitSpeechRecognition' in window) ?
      '<button class="btn sm" id="or-mic" aria-label="Speak to the Oracle" style="flex:0 0 auto">🎙</button>' : '';
    return '<div class="card">' +
      '<div class="chat-thread" id="or-thread">' + thread + '</div>' + chips +
      '<div class="chat-send"><input type="text" id="or-input" placeholder="Ask the Oracle…">' + mic +
        '<button class="btn sm gold" id="or-send" style="flex:0 0 auto">Send</button></div>' +
      '<div class="tiny faint" style="margin-top:8px">On-device only — the Oracle reads your own ledger, and nothing leaves the room.</div>' +
    '</div>';
  }
  /* ---- the Sight: risk · survival · rank horizon · weekly prophecy ---- */
  function sightStat(v, l) { return '<div class="st"><b>' + v + '</b><span>' + l + '</span></div>'; }
  // one honest line aimed at the WEAKEST number of the week (lowest normalized)
  function prophecyFocus(p) {
    var cands = [];
    if (p.answered < 7) cands.push({ v: p.answered / 7, t: (7 - p.answered) + ' of 7 days went unanswered — the record can only read what you write.' });
    if (p.answered > 0 && p.cleanDays < p.answered) cands.push({ v: p.cleanDays / p.answered, t: 'The line broke this week — guard the danger hour before anything else.' });
    if (p.adherencePct != null) cands.push({ v: p.adherencePct / 100, t: 'Plan adherence sat at ' + p.adherencePct + '% — the plate is the quietest lever you hold.' });
    if (p.avgSleep != null) cands.push({ v: Math.min(1, p.avgSleep / 8), t: 'Sleep averaged ' + p.avgSleep + 'h — the deep well feeds every other number.' });
    if (p.avgMood != null) cands.push({ v: p.avgMood / 5, t: 'Mood averaged ' + p.avgMood + ' of 5 — move the body; it lifts the inner weather.' });
    if (!cands.length) return 'A blank page — write one true day and the prophecy sharpens.';
    cands.sort(function (a, b) { return a.v - b.v; });
    return cands[0].t;
  }
  function oracleSightHtml() {
    var ctx = buildOracleCtx();
    var BAND_COL = { low: '#5be0a0', elevated: '#ffb347', high: '#ff6b8a' };
    // 1) tonight's risk — big score, band pill, named factors with signed deltas
    var r = ctx.risk, riskH;
    if (r && r.score != null) {
      var col = BAND_COL[r.band] || BAND_COL.low;
      var rows = (r.factors || []).map(function (f) {
        var up = f.delta > 0;
        return '<div class="risk-factor"><span>' + esc(f.label) + '</span><b class="' + (up ? 'up' : 'down') + '">' + (up ? '+' : '') + f.delta + '</b></div>';
      }).join('');
      riskH = '<div class="card center"><h3>Tonight’s risk</h3>' +
        '<div style="font-size:54px;line-height:1;color:' + col + ';text-shadow:0 0 26px ' + col + '66"><b>' + r.score + '</b></div>' +
        '<div style="margin-top:8px"><span class="pill" style="border:1px solid ' + col + '66;color:' + col + '">' + esc(r.band) + '</span></div>' +
        (rows ? '<div style="text-align:left;margin-top:12px">' + rows + '</div>' :
          '<p class="faint tiny" style="margin-top:12px">No named pressures tonight — the base rate alone.</p>') +
        '<div class="tiny faint" style="margin-top:10px">Association, not fate — the score reads your own ledger, never the future.</div>' +
      '</div>';
    } else {
      riskH = '<div class="card"><h3>Tonight’s risk</h3><p class="faint tiny">The forecast is not cast yet — keep logging sleep, mood and the days.</p></div>';
    }
    // 2) survival outlook — the current streak vs every completed past streak
    var o = ctx.outlook, survH;
    if (o && o.past > 0) {
      survH = '<div class="card"><h3>Survival outlook</h3>' +
        '<p class="muted" style="margin:0;line-height:1.5"><b style="font-size:26px;color:var(--cyan)">' + o.sharePct + '%</b> of your past streaks made it beyond this point — ' +
          o.madeItBeyond + ' of ' + o.past + ' lived past day ' + o.current + '.</p>' +
        '<div class="tiny faint" style="margin-top:8px">Association, not fate — past streaks describe who you were, not who you are tonight.</div></div>';
    } else {
      survH = '<div class="card"><h3>Survival outlook</h3>' +
        '<p class="muted" style="margin:0;line-height:1.5">No completed past streaks to measure against — this line is your first. Unwritten ground, walked carefully.</p>' +
        '<div class="tiny faint" style="margin-top:8px">Association, not fate.</div></div>';
    }
    // 3) rank horizon — projected arrival dates at the next ranks
    var eta = ctx.eta, rankH;
    if (eta && eta.projections && eta.projections.length) {
      var rrows = eta.projections.map(function (pr) {
        return '<tr><td class="muted">' + esc(pr.name) + ' <span class="tiny faint">day ' + pr.reach + '</span></td>' +
          '<td style="text-align:right"><b>' + esc(pr.etaISO) + '</b> <span class="tiny faint">~' + pr.daysAway + 'd</span></td></tr>';
      }).join('');
      rankH = '<div class="card"><h3>Rank horizon</h3><table style="width:100%;font-size:13px">' + rrows + '</table>' +
        '<div class="tiny faint" style="margin-top:8px">Projected at ' + Math.round((eta.cleanRate || 0) * 100) + '% of answered days clean — a projection, not a promise.</div></div>';
    } else {
      rankH = '<div class="card"><h3>Rank horizon</h3><p class="faint tiny">The ladder needs a written history to project from — log the days.</p></div>';
    }
    // 4) weekly prophecy — the 7 days ending today, summarised
    var p = ctx.prophecy, propH;
    if (p && p.answered != null) {
      propH = '<div class="card"><h3>Weekly prophecy</h3>' +
        '<div class="stand">' + sightStat(p.cleanDays + '/' + p.answered, 'clean') +
          sightStat(p.adherencePct == null ? '—' : p.adherencePct + '%', 'adherence') +
          sightStat(p.urges, 'urges held') + '</div>' +
        '<div class="stand" style="margin-top:12px">' + sightStat(p.avgMood == null ? '—' : p.avgMood, 'avg mood') +
          sightStat(p.avgSleep == null ? '—' : p.avgSleep + 'h', 'avg sleep') +
          sightStat((+p.chiEarned || 0).toLocaleString(), 'chi earned') + '</div>' +
        (p.bestDate ? '<div class="tiny muted" style="margin-top:12px">Finest day: <b>' + esc(p.bestDate) + '</b>' +
          (p.trialsWon ? ' · ' + p.trialsWon + ' trial' + (p.trialsWon === 1 ? '' : 's') + ' won' : '') + '</div>' : '') +
        '<div class="flag info" style="margin-top:10px">🔮 <span>' + esc(prophecyFocus(p)) + '</span></div>' +
        '<div class="tiny faint" style="margin-top:8px">' + esc(p.from) + ' → ' + esc(p.to) + ' · read from your own logs.</div></div>';
    } else {
      propH = '<div class="card"><h3>Weekly prophecy</h3><p class="faint tiny">A prophecy needs a written week — log the days as they pass.</p></div>';
    }
    return riskH + survH + rankH + propH;
  }
  function screenOracle() {
    if (!ORA) {
      var mh = '<div class="screen">' + header('The Oracle') +
        '<div class="card"><p class="muted" style="margin:0">Oracle module missing — oracle.js did not load. Reload the app.</p></div></div>';
      appEl.innerHTML = ''; appEl.appendChild(h(mh)); return;
    }
    var tab = state._oracleTab || (state._oracleTab = 'converse');
    var seg = '<div class="card"><div class="seg" style="justify-content:center">' +
      '<button data-ot="converse" class="' + (tab === 'converse' ? 'on' : '') + '">Converse</button>' +
      '<button data-ot="sight" class="' + (tab === 'sight' ? 'on' : '') + '">Sight</button></div></div>';
    var html = '<div class="screen">' + header('The Oracle') + seg +
      (tab === 'sight' ? oracleSightHtml() : oracleConverseHtml()) + '</div>';
    appEl.innerHTML = ''; appEl.appendChild(h(html));
    appEl.querySelectorAll('[data-ot]').forEach(function (b) {
      b.onclick = function () { state._oracleTab = b.getAttribute('data-ot'); render(); };
    });
    // converse wiring — every selector is null-safe so the Sight tab shares it
    var inp = appEl.querySelector('#or-input');
    function doSend() { if (!inp) return; var v = inp.value; inp.value = ''; oracleSend(v); }
    var sb = appEl.querySelector('#or-send'); if (sb) sb.onclick = doSend;
    if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSend(); });
    var mic = appEl.querySelector('#or-mic'); if (mic) mic.onclick = startOracleMic;
    appEl.querySelectorAll('[data-oc]').forEach(function (b) {
      b.onclick = function () { oracleSend(ORACLE_CHIPS[+b.getAttribute('data-oc')]); };
    });
    appEl.querySelectorAll('[data-oa]').forEach(function (b) {
      b.onclick = function () {
        var pr = b.getAttribute('data-oa').split(':');
        var m = state._oracleMsgs ? state._oracleMsgs[+pr[0]] : null;
        var a = (m && m.actions) ? m.actions[+pr[1]] : null;
        if (a) runOracleAction(a.act, a.payload);
      };
    });
    // keep the thread pinned to the newest exchange after every render
    var th = appEl.querySelector('#or-thread');
    if (th) th.scrollTop = th.scrollHeight;
  }

  /* ---- SANCTUM — pranayama, japa mala, cosmic clock (increment 4) ---- */
  // minutes options for a breath pattern: the standard lengths plus the
  // pattern's own default (selected), inserted in order when not listed
  function breathMinOpts(def) {
    var opts = [3, 5, 10, 15];
    if (def != null && opts.indexOf(def) < 0) { opts.push(def); opts.sort(function (a, b) { return a - b; }); }
    return opts.map(function (m) {
      return '<option value="' + m + '"' + (m === def ? ' selected' : '') + '>' + m + ' min</option>';
    }).join('');
  }
  // Guided breath overlay. The orb is the existing .breath circle, driven by
  // JS transform transitions per phase kind (in → grow, out → shrink, hold →
  // steady); reduced-motion keeps it still. Finishing NATURALLY banks the
  // planned minutes as breathingMin (additive, like the quick log); ending
  // early banks nothing. minutes may be null → the pattern's own default.
  function openBreathSession(patternId, minutes) {
    if (!SAN || !SAN.sessionPlan) { toast('Sanctum module missing — reload the app.'); return; }
    var plan = null;
    try { plan = SAN.sessionPlan(patternId, minutes); } catch (e) {}
    if (!plan) { toast('Unknown breath pattern.'); return; }
    var pat = plan.pattern, phases = pat.phases;
    var ov = h('<div class="overlay">' +
      '<div class="day-num">' + esc(pat.name) + ' · ' + plan.minutes + ' MIN</div>' +
      '<h2 id="bs-phase" style="min-height:34px;color:var(--cyan)">Ready…</h2>' +
      '<div class="breath" id="bs-orb" style="transform:scale(0.8)"><b id="bs-count" style="font-size:46px">·</b></div>' +
      '<div class="timer" id="bs-cycle">cycle 1 / ' + plan.cycles + '</div>' +
      '<p class="tiny muted" style="max-width:320px;margin-top:12px">' + esc(pat.note || '') + '</p>' +
      '<button class="btn ghost sm" data-b="end" style="margin-top:12px">End session</button></div>');
    document.body.appendChild(ov);
    var orb = ov.querySelector('#bs-orb'), phaseEl = ov.querySelector('#bs-phase'),
        countEl = ov.querySelector('#bs-count'), cycEl = ov.querySelector('#bs-cycle');
    var pi = 0, ci = 0, remain = +phases[0].secs, iv = null, done = false;
    function setOrb(kind, secs) {
      if (reducedMotion()) return;                    // stillness honoured
      orb.style.transition = 'transform ' + secs + 's ease-in-out';
      if (kind === 'in') orb.style.transform = 'scale(1.35)';
      else if (kind === 'out') orb.style.transform = 'scale(0.8)';
      // 'hold' — steady: the orb stays where the last phase brought it
    }
    function startPhase() {
      var ph = phases[pi];
      phaseEl.textContent = ph.label;
      countEl.textContent = Math.ceil(remain);
      cycEl.textContent = 'cycle ' + (ci + 1) + ' / ' + plan.cycles;
      setOrb(ph.kind, ph.secs);
      if (navigator.vibrate) { try { navigator.vibrate(30); } catch (e) {} }
    }
    function cleanup() { if (iv) clearInterval(iv); iv = null; ov.remove(); }
    ov._cleanup = cleanup;                            // Escape / force-close also clears the interval
    ov.querySelector('[data-b=end]').onclick = function () { cleanup(); render(); };
    function finish() {                               // the natural end — bank it
      if (done) return; done = true;
      cleanup();
      var d = today(), lg = S.getLog(d);
      S.patchLog(d, { breathingMin: (+lg.breathingMin || 0) + plan.minutes });
      toast('+' + plan.minutes + ' min breath banked');
      try { chiBurst(E.chiDeltaForBreathing(S.getSettings(), d, plan.minutes), null); } catch (e) {}
      if (!reducedMotion()) celebrateSmall();
      render();
    }
    startPhase();
    iv = setInterval(function () {
      remain -= 1;
      if (remain > 0.01) { countEl.textContent = Math.ceil(remain); return; }
      pi++;
      if (pi >= phases.length) {
        pi = 0; ci++;
        if (ci >= plan.cycles) { finish(); return; }
      }
      remain += +phases[pi].secs;                     // carries fractional cadence (5.5s phases)
      startPhase();
    }, 1000);
  }
  // Japa overlay: a circular tap zone counts beads to 108; every 27 lights a
  // quarter dot; 108 completes a mala (flash) and the bead count resets.
  // Minutes are banked as meditation ONLY on confirm at the finish.
  function openJapaSession(mantraId) {
    var jp = (CFG.sanctum && CFG.sanctum.japa) || null;
    if (!jp || !jp.mantras || !jp.mantras.length) { toast('Sanctum config missing — reload the app.'); return; }
    var mantra = jp.mantras[0];
    for (var i = 0; i < jp.mantras.length; i++) if (jp.mantras[i].id === mantraId) mantra = jp.mantras[i];
    var beadsTotal = jp.beads || 108, quarter = jp.quarterMark || 27, perMala = jp.minutesPerMala || 8;
    var beads = 0, malas = 0;
    var ov = h('<div class="overlay">' +
      '<div class="day-num">JAPA · ' + esc(mantra.translit) + '</div>' +
      '<div style="font-size:42px;line-height:1.4;color:var(--gold-soft);text-shadow:0 0 24px rgba(214,175,78,.5)">' + esc(mantra.text) + '</div>' +
      '<div class="tiny muted" style="margin-top:2px">' + esc(mantra.translit) + ' — ' + esc(mantra.meaning) + '</div>' +
      '<div class="mala" id="jp-mala"><b id="jp-beads">0</b><span class="tiny faint">of ' + beadsTotal + ' · tap the circle</span></div>' +
      '<div class="bar" style="width:min(260px,70vw);height:8px"><i id="jp-bar" style="width:0%;background:linear-gradient(90deg,#8a6a1e,#ffce6a);box-shadow:0 0 10px #ffce6a"></i></div>' +
      '<div class="bead-dots" id="jp-dots"><i></i><i></i><i></i><i></i></div>' +
      '<div class="tiny faint" id="jp-malas" style="margin-top:6px">0 malas held</div>' +
      '<button class="btn gold" data-j="finish" style="margin-top:14px">Finish</button></div>');
    document.body.appendChild(ov);
    var mala = ov.querySelector('#jp-mala'), beadsEl = ov.querySelector('#jp-beads'),
        barEl = ov.querySelector('#jp-bar'), malasEl = ov.querySelector('#jp-malas');
    var dots = ov.querySelectorAll('#jp-dots i');
    function update() {
      beadsEl.textContent = beads;
      barEl.style.width = Math.round(beads / beadsTotal * 100) + '%';
      for (var di = 0; di < dots.length; di++) {
        // dots at 27 / 54 / 81 light with the count; the 4th holds for malas
        var on = di < 3 ? beads >= quarter * (di + 1) : malas > 0;
        dots[di].className = on ? 'on' : '';
      }
      malasEl.textContent = malas + ' mala' + (malas === 1 ? '' : 's') + ' held' +
        (malas ? ' · ' + (malas * perMala) + ' min ready to bank' : '');
    }
    mala.onclick = function () {
      beads++;
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
      if (beads >= beadsTotal) {                      // a full round of the mala
        malas++; beads = 0;
        if (!reducedMotion()) {
          mala.classList.remove('pulse');
          mala.classList.add('flash');
          setTimeout(function () { mala.classList.remove('flash'); }, 900);
          celebrateSmall();
        }
      } else if (!reducedMotion()) {                  // re-trigger the tap pulse
        mala.classList.remove('pulse'); void mala.offsetWidth; mala.classList.add('pulse');
      }
      update();
    };
    ov._cleanup = function () { ov.remove(); };
    ov.querySelector('[data-j=finish]').onclick = function () {
      if (malas > 0) {
        var mins = malas * perMala;
        if (confirm('Bank ' + malas + ' mala' + (malas === 1 ? '' : 's') + ' as ' + mins + ' min of meditation?')) {
          var d = today(), lg = S.getLog(d);
          S.patchLog(d, { meditationMin: (+lg.meditationMin || 0) + mins });
          toast('+' + mins + ' min meditation banked');
        }
      }
      ov.remove(); render();
    };
  }
  function screenSanctum() {
    if (!SAN) {
      var mh = '<div class="screen">' + header('Sanctum') +
        '<div class="card"><p class="muted" style="margin:0">Sanctum module missing — sanctum.js did not load. Reload the app.</p></div></div>';
      appEl.innerHTML = ''; appEl.appendChild(h(mh)); return;
    }
    var s = S.getSettings(), d = today();
    // pranayama — one row per pattern: name, sub, note, minutes + Begin
    var pats = (CFG.sanctum && CFG.sanctum.patterns) || [];
    var patH = pats.map(function (p) {
      return '<div class="meal">' +
        '<div class="mh"><span class="nm">' + esc(p.name) + '</span><span class="tiny faint">' + esc(p.sub || '') + '</span></div>' +
        '<div class="items">' + esc(p.note || '') + '</div>' +
        '<div class="row" style="align-items:center">' +
          '<select data-bm="' + esc(p.id) + '" style="flex:1">' + breathMinOpts(p.minutes) + '</select>' +
          '<button class="btn sm gold" data-bp="' + esc(p.id) + '" style="flex:0 0 auto">Begin</button></div>' +
      '</div>';
    }).join('');
    // japa — mantra select (translit + meaning) + begin
    var mantras = (CFG.sanctum && CFG.sanctum.japa && CFG.sanctum.japa.mantras) || [];
    var manH = mantras.map(function (m, i) {
      return '<option value="' + esc(m.id) + '"' + (i === 0 ? ' selected' : '') + '>' + esc(m.translit) + ' — ' + esc(m.meaning) + '</option>';
    }).join('');
    // cosmic clock — the moon needs nothing; the sun needs the sacred location
    var moon = null; try { moon = SAN.moonPhase(d); } catch (e) {}
    var moonH = moon ?
      '<div class="row" style="align-items:center;gap:14px"><span style="font-size:42px;line-height:1">' + moon.emoji + '</span>' +
        '<div class="grow"><b>' + esc(moon.name) + '</b><div class="tiny faint">' + moon.illumPct + '% illuminated · age ' + moon.ageDays + 'd</div></div></div>' :
      '<p class="faint tiny">The moon could not be computed.</p>';
    var sunH;
    if (s.latitude != null && s.longitude != null) {
      var sun = null; try { sun = SAN.sunTimes(d, s.latitude, s.longitude); } catch (e) {}
      if (sun && sun.polar) {
        sunH = '<div class="divider"></div><div class="tiny muted">Polar ' + esc(sun.polar) + ' at your latitude — the sun does not ' +
          (sun.polar === 'day' ? 'set' : 'rise') + ' today.</div>';
      } else if (sun && sun.sunrise) {
        // Brahma Muhurta: if sunrise is already behind us, show tomorrow's window
        var nowM = new Date().getHours() * 60 + new Date().getMinutes();
        var bmDate = d, bmLbl = '';
        if (nowM > sun.sunriseMin) { bmDate = U.addDays(d, 1); bmLbl = ' (tomorrow)'; }
        var bm = null; try { bm = SAN.brahmaMuhurta(bmDate, s.latitude, s.longitude); } catch (e) {}
        sunH = '<div class="divider"></div><table style="width:100%;font-size:13px">' +
          '<tr><td class="muted">🌅 Sunrise</td><td style="text-align:right"><b>' + esc(sun.sunrise) + '</b></td></tr>' +
          '<tr><td class="muted">🌇 Sunset</td><td style="text-align:right"><b>' + esc(sun.sunset) + '</b></td></tr>' +
          (bm ? '<tr><td class="muted">🕉 Brahma Muhurta' + bmLbl + '</td><td style="text-align:right"><b>' + esc(bm.start) + '–' + esc(bm.end) + '</b></td></tr>' : '') +
        '</table>' +
        (bm ? '<div class="tiny faint" style="margin-top:6px">The creator’s hour — the classical window for practice, before first light.</div>' : '');
      } else {
        sunH = '<div class="divider"></div><p class="faint tiny" style="margin:0">The sun could not be computed for those coordinates — check them in Settings.</p>';
      }
    } else {
      sunH = '<div class="divider"></div><div class="tiny muted">Set your sacred location in Settings for sunrise, sunset &amp; the Brahma Muhurta. ' +
        '<button class="btn ghost sm" data-go="settings" style="margin-top:8px">Open Settings</button></div>';
    }
    var html = '<div class="screen">' + header('Sanctum') +
      '<div class="card"><h3>Pranayama — guided breath</h3>' +
        '<div class="tiny muted" style="margin-bottom:4px">Pick a pattern and a length; the orb breathes with you. Finishing banks the minutes to today’s log.</div>' +
        patH + '</div>' +
      '<div class="card"><h3>Japa — the mala</h3>' +
        '<div class="tiny muted" style="margin-bottom:4px">108 beads to a mala. Tap the circle with each repetition; bank full malas as meditation when you finish.</div>' +
        '<label class="field"><span>Mantra</span><select id="jp-mantra">' + manH + '</select></label>' +
        '<button class="btn gold full" id="jp-begin">Begin japa</button></div>' +
      '<div class="card"><h3>Cosmic clock</h3>' + moonH + sunH +
        '<div class="tiny faint" style="margin-top:10px">Computed on this device — nothing leaves it.</div></div>' +
    '</div>';
    appEl.innerHTML = ''; appEl.appendChild(h(html));
    appEl.querySelectorAll('[data-bp]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-bp');
        var sel = appEl.querySelector('[data-bm="' + id + '"]');
        openBreathSession(id, sel ? +sel.value : null);
      };
    });
    var jb = appEl.querySelector('#jp-begin');
    if (jb) jb.onclick = function () {
      var sel = appEl.querySelector('#jp-mantra');
      openJapaSession(sel ? sel.value : null);
    };
  }

  /* ---- SETTINGS / BACKUP ---- */
  function screenSettings() {
    var s = S.getSettings(), meta = S.getMeta();
    var swState = navigator.serviceWorker && navigator.serviceWorker.controller ? 'active (offline-ready)' : 'registering…';
    var html = '<div class="screen">' + header('Settings') +
      '<div class="card"><h3>The two anchors</h3>' +
        '<label class="field"><span>Start date (day 1)</span><input type="date" id="set-start" value="' + esc(s.startDate) + '"></label>' +
        '<label class="field"><span>Target date — The Immortal</span><input type="date" id="set-target" value="' + esc(s.targetDate) + '"></label>' +
        '<label class="field"><span>Display name (optional)</span><input type="text" id="set-name" value="' + esc(s.displayName || '') + '"></label>' +
        '<div class="tiny faint">Everything else — day, rank, streak, meters — is derived from these and your logs. You can’t fake the core numbers.</div>' +
      '</div>' +
      '<div class="card"><h3>Catch up your streak</h3>' +
        '<div class="tiny muted" style="margin-bottom:8px">Held clean before you started tapping it in daily? Record it here. This marks every <b>unlogged</b> day in the range as clean, so your streak, rank, Immortal Power and stage reflect the history you actually lived. Days you logged as a slip/relapse are left untouched — only mark days you were genuinely clean.</div>' +
        '<label class="field"><span>Clean since</span><input type="date" id="set-cleansince" value="' + esc(s.startDate) + '" min="' + esc(s.startDate) + '" max="' + esc(today()) + '"></label>' +
        '<button class="btn gold" id="do-backfill">Mark those days clean</button>' +
        '<div class="tiny faint" style="margin-top:8px">Began monk-mode before this app’s start date? Set an earlier start date above first.</div>' +
      '</div>' +
      '<div class="card"><h3>Body context (optional, fat% only)</h3>' +
        '<label class="field"><span>Height (cm)</span><input type="number" id="set-h" value="' + (s.heightCm != null ? s.heightCm : '') + '"></label>' +
        '<label class="field"><span>Current weight (kg)</span><input type="number" id="set-w" value="' + (s.currentWeightKg != null ? s.currentWeightKg : '') + '"></label>' +
      '</div>' +
      '<div class="card"><h3>Motion</h3><div class="check' + (s.reducedMotion ? ' on' : '') + '" id="set-rm"><span class="box">' + (s.reducedMotion ? '✓' : '') + '</span><span class="txt">Reduce animations (save battery)</span></div></div>' +
      '<div class="card"><h3>Sacred location</h3>' +
        '<div class="tiny muted" style="margin-bottom:8px">Used only on this device for sunrise &amp; Brahma Muhurta — never sent anywhere.</div>' +
        '<label class="field"><span>Latitude</span><input type="number" inputmode="decimal" step="0.0001" id="set-lat" value="' + (s.latitude != null ? s.latitude : '') + '" placeholder="e.g. 51.5074"></label>' +
        '<label class="field"><span>Longitude</span><input type="number" inputmode="decimal" step="0.0001" id="set-lng" value="' + (s.longitude != null ? s.longitude : '') + '" placeholder="e.g. -0.1278"></label>' +
        '<button class="btn cyan" id="set-geo">📍 Use my location</button>' +
      '</div>' +
      '<div class="card"><h3>The Oracle</h3><div class="check' + (s.oracleVoice ? ' on' : '') + '" id="set-ov"><span class="box">' + (s.oracleVoice ? '✓' : '') + '</span><span class="txt">Oracle voice — speak replies aloud</span></div></div>' +
      '<div class="card"><h3>Backup — your safety net</h3>' +
        '<div class="tiny muted" style="margin-bottom:10px">Last export: ' + (meta.lastExportISO || 'never') + '. 500 days of progress lives only on this device — export often.</div>' +
        '<div class="btn-grid"><button class="btn gold" id="do-export">⤓ Export JSON</button><button class="btn cyan" id="do-import">⤒ Import JSON</button></div>' +
        '<input type="file" id="file-import" accept="application/json,.json" style="display:none">' +
      '</div>' +
      '<div class="card"><h3>Relapse</h3><button class="btn full" style="border-color:rgba(255,107,138,.4);color:#ffc2cf" data-go="relapse">Log a relapse (with compassion)</button></div>' +
      '<div class="card"><h3>App</h3><div class="tiny muted">Service worker: ' + swState + '</div>' +
        '<div class="tiny faint" style="margin-top:6px">All data is local. No accounts, no network, no analytics.</div>' +
        '<button class="btn ghost sm" id="do-wipe" style="margin-top:10px;color:#ff8aa8">Erase all data on this device</button></div>' +
    '</div>';
    appEl.innerHTML = ''; appEl.appendChild(h(html));

    function bindDate(id, key) { var el = appEl.querySelector(id); el.addEventListener('change', function () { if (el.value) { S.setSettings(mkPatch(key, el.value)); toast('Saved.'); } }); }
    bindDate('#set-start', 'startDate'); bindDate('#set-target', 'targetDate');
    appEl.querySelector('#set-name').addEventListener('change', function (e) { S.setSettings({ displayName: e.target.value }); });
    appEl.querySelector('#do-backfill').onclick = function () {
      var ss = S.getSettings(), from = appEl.querySelector('#set-cleansince').value || ss.startDate, t = today();
      if (from < ss.startDate) from = ss.startDate;
      if (U.daysBetween(from, t) < 0) { toast('Pick a date on or before today.'); return; }
      if (!confirm('Mark every UNLOGGED day from ' + from + ' through today as clean? Only do this for days you were genuinely clean — logged slips / relapses are left as-is.')) return;
      var n = S.backfillClean(from, t), after = E.streakAsOf(S.getSettings(), t).current;
      toast(n + ' day' + (n === 1 ? '' : 's') + ' recorded · streak now ' + after);
      render();
    };
    appEl.querySelector('#set-h').addEventListener('change', function (e) { S.setSettings({ heightCm: e.target.value === '' ? null : +e.target.value }); });
    appEl.querySelector('#set-w').addEventListener('change', function (e) { S.setSettings({ currentWeightKg: e.target.value === '' ? null : +e.target.value }); });
    // increment 4 — sacred location (bound like heightCm) + one-shot geolocation
    appEl.querySelector('#set-lat').addEventListener('change', function (e) { S.setSettings({ latitude: e.target.value === '' ? null : +e.target.value }); });
    appEl.querySelector('#set-lng').addEventListener('change', function (e) { S.setSettings({ longitude: e.target.value === '' ? null : +e.target.value }); });
    appEl.querySelector('#set-geo').onclick = function () {
      if (!navigator.geolocation || !navigator.geolocation.getCurrentPosition) { toast('No location access in this browser — enter it manually.'); return; }
      navigator.geolocation.getCurrentPosition(function (pos) {
        S.setSettings({ latitude: U.round(pos.coords.latitude, 4), longitude: U.round(pos.coords.longitude, 4) });
        toast('Location saved — it stays on this device.'); render();
      }, function () { toast('Could not read location — enter it manually.'); });
    };
    // increment 4 — Oracle voice toggle (same pattern as reduce-motion)
    appEl.querySelector('#set-ov').onclick = function () { S.setSettings({ oracleVoice: !S.getSettings().oracleVoice }); render(); };
    appEl.querySelector('#set-rm').onclick = function () {
      var on = !S.getSettings().reducedMotion; S.setSettings({ reducedMotion: on });
      document.body.classList.toggle('reduce-motion', on);           // sync CSS animations immediately
      if (window.RTI_AURORA) { window.RTI_AURORA.stop(); window.RTI_AURORA.start(); } // re-evaluate bg motion
      render();
    };
    appEl.querySelector('#do-export').onclick = doExport;
    appEl.querySelector('#do-import').onclick = function () { appEl.querySelector('#file-import').click(); };
    appEl.querySelector('#file-import').onchange = doImport;
    appEl.querySelector('#do-wipe').onclick = function () {
      if (confirm('Erase ALL data on this device? Export first if unsure. This cannot be undone.')) { S.wipeAll(); state.tab = 'today'; render(); toast('Erased. A clean slate.'); }
    };
  }
  function doExport() {
    var data = JSON.stringify(S.exportBundle(), null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'road-to-immortal-backup-' + today() + '.json';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    S.setMeta({ lastExportISO: today() }); toast('Backup downloaded.'); render();
  }
  function doImport(e) {
    var file = e.target.files && e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var obj; try { obj = JSON.parse(reader.result); } catch (err) { alert('That file is not valid JSON.'); return; }
      if (!confirm('Import this backup? It will REPLACE all current data on this device.')) return;
      var res = S.importBundle(obj);
      if (res.ok) { state.tab = 'today'; render(); toast('Restored from backup.'); }
      else alert('Import failed: ' + res.error);
    };
    reader.readAsText(file);
  }

  /* ---- shared header ---- */
  function header(title) {
    var s = S.getSettings();
    var sub = title === 'today' ? (s.displayName ? 'Walk on, ' + esc(s.displayName) : 'Monk Mode') : esc(title);
    return '<header class="app-head"><div class="brand">' +
      '<img class="sigil" src="./icons/icon-192.png" alt="">' +
      '<div><h1>Road to Immortal</h1><small>' + sub + '</small></div></div>' +
      '<button class="icon-btn" data-go="settings" aria-label="Settings">⚙</button></header>';
  }

  /* =================== ROUTER =================== */
  var SCREENS = { today: screenToday, log: screenLog, road: screenRoad, stats: screenStats, study: screenStudy, nutrition: screenNutrition, codex: screenCodex, settings: screenSettings, ascension: screenAscension, photos: screenPhotos, power: screenPower, signals: screenSignals, movement: screenMovement, rota: screenRota, oracle: screenOracle, sanctum: screenSanctum };
  var TABS = [
    { id: 'today', ic: '⚡', label: 'Today' },
    { id: 'log', ic: '📝', label: 'Log' },
    { id: 'nutrition', ic: '🍽', label: 'Food' },
    { id: 'stats', ic: '📊', label: 'Stats' },
    { id: 'codex', ic: '📖', label: 'Codex' }
  ];
  function renderTabs() {
    tabsEl.innerHTML = TABS.map(function (t) {
      var on = state.tab === t.id || (t.id === 'today' && (state.tab === 'road' || state.tab === 'settings' || state.tab === 'ascension' || state.tab === 'photos' || state.tab === 'power' || state.tab === 'signals' || state.tab === 'movement' || state.tab === 'rota' || state.tab === 'oracle' || state.tab === 'sanctum'));
      return '<button data-tab="' + t.id + '" class="' + (on ? 'on' : '') + '"><span class="ic">' + t.ic + '</span>' + t.label + '</button>';
    }).join('');
    tabsEl.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { state.tab = b.getAttribute('data-tab'); window.scrollTo(0, 0); render(); }; });
  }
  function render() {
    if (state.tab !== 'log' && state.tab !== 'nutrition' && state.tab !== 'study') state.viewDate = today();
    (SCREENS[state.tab] || screenToday)();
    renderTabs();
    // global data-go links + relapse
    appEl.querySelectorAll('[data-go]').forEach(function (el) {
      el.onclick = function () { var g = el.getAttribute('data-go'); if (g === 'relapse') openRelapse(); else { state.tab = g; window.scrollTo(0, 0); render(); } };
    });
    // milestone fires on the actual rank-up, whatever tab is active
    try { checkMilestone(E.snapshot(today())); } catch (e) {}
  }

  /* =================== MIDNIGHT ROLLOVER =================== */
  function scheduleMidnight() {
    var now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    setTimeout(function () { state.viewDate = today(); render(); scheduleMidnight(); }, next - now);
  }

  /* =================== SERVICE WORKER =================== */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        console.log('[RTI] service worker registered:', reg.scope);
      }).catch(function (err) { console.warn('[RTI] SW registration failed:', err); });
    });
  }

  /* =================== INIT =================== */
  fab.onclick = openUrge;
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { var ov = document.querySelector('.overlay'); if (ov) { if (ov._cleanup) ov._cleanup(); else ov.remove(); } } });
  if (S.getSettings().reducedMotion) document.body.classList.add('reduce-motion');
  render();
  scheduleMidnight();
  window.RTI = { render: render, state: state, engine: E, store: S };
})();
