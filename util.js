/* =====================================================================
   Road to Immortal — UTIL (pure helpers, no state)
   Local-time date math so the day rolls at LOCAL midnight, not UTC.
   ===================================================================== */
(function (global) {
  'use strict';

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Local YYYY-MM-DD for a Date (defaults to now).
  function toISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function todayISO() { return toISO(new Date()); }

  // Parse 'YYYY-MM-DD' to a local Date pinned at noon (DST-safe for diffs).
  function fromISO(iso) {
    if (!iso) return null;
    var p = String(iso).split('-');
    return new Date(+p[0], (+p[1]) - 1, +p[2], 12, 0, 0, 0);
  }

  // Whole calendar days from a -> b (b - a). Same day = 0.
  function daysBetween(isoA, isoB) {
    var a = fromISO(isoA), b = fromISO(isoB);
    if (!a || !b) return 0;
    return Math.round((b - a) / 86400000);
  }

  function addDays(iso, n) {
    var d = fromISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function round(v, dp) {
    var f = Math.pow(10, dp || 0);
    return Math.round(v * f) / f;
  }

  // Pearson correlation of two equal-length numeric arrays. null if undefined.
  function pearson(xs, ys) {
    var n = Math.min(xs.length, ys.length);
    if (n < 3) return null;
    var sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, k = 0;
    for (var i = 0; i < n; i++) {
      var x = xs[i], y = ys[i];
      if (x == null || y == null || isNaN(x) || isNaN(y)) continue;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; k++;
    }
    if (k < 3) return null;
    var cov = sxy - (sx * sy) / k;
    var vx = sxx - (sx * sx) / k;
    var vy = syy - (sy * sy) / k;
    if (vx <= 0 || vy <= 0) return null;
    return cov / Math.sqrt(vx * vy);
  }

  // Average ranks (ties share the mean rank) for an array of numbers.
  function rankAvg(arr) {
    var idx = arr.map(function (v, i) { return { v: v, i: i }; })
      .sort(function (a, b) { return a.v - b.v; });
    var ranks = new Array(arr.length);
    var k = 0;
    while (k < idx.length) {
      var j = k;
      while (j + 1 < idx.length && idx[j + 1].v === idx[k].v) j++;
      var avg = (k + j) / 2 + 1; // 1-based average rank for the tie group
      for (var m = k; m <= j; m++) ranks[idx[m].i] = avg;
      k = j + 1;
    }
    return ranks;
  }

  // Spearman rank correlation of two equal-length numeric arrays (pairs with
  // any null/NaN dropped). null if fewer than 5 valid pairs.
  function spearman(xs, ys) {
    var px = [], py = [], n = Math.min(xs.length, ys.length);
    for (var i = 0; i < n; i++) {
      var x = xs[i], y = ys[i];
      if (x == null || y == null || isNaN(x) || isNaN(y)) continue;
      px.push(x); py.push(y);
    }
    if (px.length < 5) return null;
    return pearson(rankAvg(px), rankAvg(py));
  }

  // Least-squares slope/intercept for a trendline.
  function linreg(xs, ys) {
    var n = Math.min(xs.length, ys.length), k = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (var i = 0; i < n; i++) {
      var x = xs[i], y = ys[i];
      if (x == null || y == null || isNaN(x) || isNaN(y)) continue;
      sx += x; sy += y; sxx += x * x; sxy += x * y; k++;
    }
    if (k < 2) return null;
    var denom = (k * sxx - sx * sx);
    if (denom === 0) return null;
    var slope = (k * sxy - sx * sy) / denom;
    var intercept = (sy - slope * sx) / k;
    return { slope: slope, intercept: intercept };
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  global.RTI_UTIL = {
    toISO: toISO, todayISO: todayISO, fromISO: fromISO, daysBetween: daysBetween,
    addDays: addDays, clamp: clamp, round: round, pearson: pearson, spearman: spearman,
    rankAvg: rankAvg, linreg: linreg, escapeHtml: escapeHtml
  };
})(typeof window !== 'undefined' ? window : this);
