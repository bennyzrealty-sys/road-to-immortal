/* =====================================================================
   Road to Immortal — APP (UI, routing, interactions)
   Vanilla JS. Reads derived values from engine; writes only raw logs.
   ===================================================================== */
(function () {
  'use strict';
  var U = window.RTI_UTIL, CFG = window.RTI_CONFIG, S = window.RTI_STORE, E = window.RTI_ENGINE;
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

    var html = '<div class="screen">' +
      header('today') + backupBanner +
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
      '<button class="btn ghost full" data-go="ascension" style="margin-top:10px">🌌 Ascension — Energy Bank</button>' +
    '</div>';
    appEl.innerHTML = ''; appEl.appendChild(h(html)); animateBars(appEl);

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
    var setArr = mode === 'recovery' ? CFG.quotes.recovery : mode === 'danger' ? CFG.quotes.dangerWindow : CFG.quotes.daily;
    var quote = mode === 'daily' ? fill(dailyPick(setArr), snap) : dailyPick(setArr);
    var principles = CFG.quotes.codex.map(function (p) { return '<div class="principle"><h4>' + esc(p.title) + '</h4><p>' + esc(p.body) + '</p></div>'; }).join('');
    var html = '<div class="screen">' + header('Codex') +
      '<div class="card"><div class="seg" style="justify-content:center;margin-bottom:10px">' +
        '<button data-cx="daily" class="' + (mode === 'daily' ? 'on' : '') + '">Daily</button>' +
        '<button data-cx="recovery" class="' + (mode === 'recovery' ? 'on' : '') + '">Recovery</button>' +
        '<button data-cx="danger" class="' + (mode === 'danger' ? 'on' : '') + '">Danger hour</button></div>' +
        '<div class="codex-quote">' + esc(quote) + '</div></div>' +
      '<div class="card"><h3>Presence &amp; self-mastery</h3><div class="tiny faint" style="margin:-4px 0 8px">Becoming magnetic through self-mastery — never tactics on people.</div>' + principles + '</div>' +
    '</div>';
    appEl.innerHTML = ''; appEl.appendChild(h(html));
    appEl.querySelectorAll('[data-cx]').forEach(function (b) { b.onclick = function () { state._codexMode = b.getAttribute('data-cx'); render(); }; });
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
      '<div class="card"><h3>Body context (optional, fat% only)</h3>' +
        '<label class="field"><span>Height (cm)</span><input type="number" id="set-h" value="' + (s.heightCm != null ? s.heightCm : '') + '"></label>' +
        '<label class="field"><span>Current weight (kg)</span><input type="number" id="set-w" value="' + (s.currentWeightKg != null ? s.currentWeightKg : '') + '"></label>' +
      '</div>' +
      '<div class="card"><h3>Motion</h3><div class="check' + (s.reducedMotion ? ' on' : '') + '" id="set-rm"><span class="box">' + (s.reducedMotion ? '✓' : '') + '</span><span class="txt">Reduce animations (save battery)</span></div></div>' +
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
    appEl.querySelector('#set-h').addEventListener('change', function (e) { S.setSettings({ heightCm: e.target.value === '' ? null : +e.target.value }); });
    appEl.querySelector('#set-w').addEventListener('change', function (e) { S.setSettings({ currentWeightKg: e.target.value === '' ? null : +e.target.value }); });
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
  var SCREENS = { today: screenToday, log: screenLog, road: screenRoad, stats: screenStats, study: screenStudy, nutrition: screenNutrition, codex: screenCodex, settings: screenSettings, ascension: screenAscension };
  var TABS = [
    { id: 'today', ic: '⚡', label: 'Today' },
    { id: 'log', ic: '📝', label: 'Log' },
    { id: 'nutrition', ic: '🍽', label: 'Food' },
    { id: 'stats', ic: '📊', label: 'Stats' },
    { id: 'codex', ic: '📖', label: 'Codex' }
  ];
  function renderTabs() {
    tabsEl.innerHTML = TABS.map(function (t) {
      var on = state.tab === t.id || (t.id === 'today' && (state.tab === 'road' || state.tab === 'settings' || state.tab === 'ascension' || state.tab === 'photos'));
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
