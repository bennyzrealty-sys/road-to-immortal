/* =====================================================================
   Road to Immortal — THE VESSEL (increment 13)
   ---------------------------------------------------------------------
   Pure derivations for the body ledger: weight series, smoothed trend,
   loss rate vs the healthy band, progress-to-goal, and a body-fat
   estimate CALIBRATED to the owner's one real machine reading.

   Same doctrine as engine.js: nothing here is stored — every number is
   recomputed from settings + logs on every read. The calibration offset
   is derived per read from the stored baseline, so editing height, sex,
   birth year or the baseline self-heals the whole curve.
   ===================================================================== */
(function (global) {
  'use strict';
  var U = global.RTI_UTIL, CFG = global.RTI_CONFIG, S = global.RTI_STORE;

  /* ---------- resolved anthropometrics (settings > CFG defaults) ---------- */
  function resolved(settings) {
    var s = settings || S.getSettings(), b = CFG.body;
    return {
      heightCm: s.heightCm != null ? s.heightCm : b.defaultHeightCm,
      sex: s.sex || b.defaultSex,
      birthYear: s.birthYear != null ? s.birthYear : b.defaultBirthYear,
      goalWeightKg: s.goalWeightKg != null ? s.goalWeightKg : b.defaultGoalWeightKg,
      baseline: s.baseline || b.baseline
    };
  }
  function ageAt(settings, iso) {
    var r = resolved(settings);
    if (!r.birthYear || !iso) return null;
    return +String(iso).slice(0, 4) - r.birthYear; // year-precision is enough for Deurenberg
  }

  /* ---------- weight series ---------- */
  // [{date, kg, src}] ascending. Baseline scan first, then every logged
  // weigh-in; if the owner never logged one, fall back to the Settings
  // scalar pinned to asOf (flagged so the UI can nag for a real weigh-in).
  function weightSeries(settings, asOf) {
    var s = settings || S.getSettings(), r = resolved(s), out = [];
    if (r.baseline && r.baseline.weightKg != null)
      out.push({ date: r.baseline.dateISO, kg: +r.baseline.weightKg, src: 'baseline' });
    S.logsArray().forEach(function (lg) {
      if (lg.weightKg != null && !isNaN(lg.weightKg) && (!asOf || lg.date <= asOf))
        out.push({ date: lg.date, kg: +lg.weightKg, src: 'log' });
    });
    if (out.length < 2 && s.currentWeightKg != null)
      out.push({ date: asOf || U.todayISO(), kg: +s.currentWeightKg, src: 'settings' });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }
  function smoothedSeries(settings, asOf) {
    var series = weightSeries(settings, asOf);
    var sm = U.ewma(series.map(function (p) { return p.kg; }), CFG.body.smoothing.alpha);
    return series.map(function (p, i) { return { date: p.date, kg: p.kg, smooth: U.round(sm[i], 2), src: p.src }; });
  }
  // "Current" is the LAST REAL WEIGH-IN — what the scale actually said.
  // The smoothed series exists for the rate and the chart; using it here
  // would make progress lag days behind the owner's own morning number.
  function currentKg(settings, asOf) {
    var w = weightSeries(settings, asOf);
    return w.length ? w[w.length - 1].kg : null;
  }

  /* ---------- loss rate (kg/week, negative = losing) ---------- */
  function rateKgPerWeek(settings, asOf) {
    var sm = smoothedSeries(settings, asOf), rw = CFG.body.rateWindows;
    asOf = asOf || U.todayISO();
    function fit(windowDays) {
      var pts = sm.filter(function (p) { return U.daysBetween(p.date, asOf) <= windowDays; });
      if (pts.length < rw.minPoints) return null;
      var lr = U.linreg(pts.map(function (p) { return U.daysBetween(sm[0].date, p.date); }),
                        pts.map(function (p) { return p.smooth; }));
      return lr ? lr.slope * 7 : null;
    }
    var r = fit(rw.primaryDays);
    if (r == null) r = fit(rw.fallbackDays);
    if (r == null && sm.length >= 2) { // last resort: whole-span average
      var span = U.daysBetween(sm[0].date, sm[sm.length - 1].date);
      if (span > 0) r = (sm[sm.length - 1].kg - sm[0].kg) / span * 7;
    }
    return r == null ? null : U.round(r, 3);
  }
  // slower | on-pace | faster vs the healthy 0.5–1.0 %BW/week band
  function rateVerdict(settings, asOf) {
    var rate = rateKgPerWeek(settings, asOf), cur = currentKg(settings, asOf);
    if (rate == null || cur == null || cur <= 0) return null;
    var pctPerWeek = U.round(-rate / cur * 100, 2), hb = CFG.body.healthyRate;
    var band = pctPerWeek < hb.loPctPerWeek ? 'slower' : pctPerWeek > hb.hiPctPerWeek ? 'faster' : 'on-pace';
    return { rateKgPerWeek: rate, pctPerWeek: pctPerWeek, band: band, lo: hb.loPctPerWeek, hi: hb.hiPctPerWeek };
  }

  /* ---------- progress + ETA ---------- */
  function progressPct(settings, asOf) {
    var r = resolved(settings), cur = currentKg(settings, asOf);
    if (cur == null || !r.baseline || r.baseline.weightKg == null || r.goalWeightKg == null) return null;
    var total = r.baseline.weightKg - r.goalWeightKg;
    if (total <= 0) return null;
    return U.round(U.clamp((r.baseline.weightKg - cur) / total * 100, 0, 100), 1);
  }
  function etaToGoal(settings, asOf) {
    var r = resolved(settings), cur = currentKg(settings, asOf), rate = rateKgPerWeek(settings, asOf);
    if (cur == null || rate == null || rate >= 0 || r.goalWeightKg == null) return null;
    if (cur <= r.goalWeightKg) return { dateISO: asOf || U.todayISO(), weeks: 0 };
    var weeks = (cur - r.goalWeightKg) / -rate;
    return { dateISO: U.addDays(asOf || U.todayISO(), Math.round(weeks * 7)), weeks: U.round(weeks, 1) };
  }

  /* ---------- body-fat estimate (Deurenberg + baseline calibration) ---------- */
  function bmi(kg, heightCm) {
    if (kg == null || !heightCm) return null;
    var m = heightCm / 100;
    return U.round(kg / (m * m), 2);
  }
  function deurenbergPct(bmiV, age, sex) {
    if (bmiV == null || age == null) return null;
    var d = CFG.body.deurenberg;
    return U.round(d.bmiW * bmiV + d.ageW * age - (sex === 'male' ? d.maleOffset : 0) - d.base, 2);
  }
  // machine reading − formula at the baseline date; 0 when no baseline
  function fatOffset(settings) {
    var r = resolved(settings);
    if (!r.baseline || r.baseline.fatPct == null || r.baseline.weightKg == null) return 0;
    var f = deurenbergPct(bmi(r.baseline.weightKg, r.heightCm), ageAt(settings, r.baseline.dateISO), r.sex);
    return f == null ? 0 : U.round(r.baseline.fatPct - f, 2);
  }
  function fatPctEstimate(settings, asOf) {
    var r = resolved(settings), cur = currentKg(settings, asOf);
    asOf = asOf || U.todayISO();
    var f = deurenbergPct(bmi(cur, r.heightCm), ageAt(settings, asOf), r.sex);
    if (f == null) return null;
    var pct = U.round(f + fatOffset(settings), 1);
    return {
      fatPct: pct,
      fatMassKg: U.round(cur * pct / 100, 1),
      leanMassKg: U.round(cur * (1 - pct / 100), 1),
      calibrated: fatOffset(settings) !== 0,
      baselineDate: r.baseline ? r.baseline.dateISO : null
    };
  }
  // did the loss come from fat, or is lean mass leaking too?
  function leanCheck(settings, asOf) {
    var r = resolved(settings), est = fatPctEstimate(settings, asOf), cur = currentKg(settings, asOf);
    if (!est || cur == null || !r.baseline || r.baseline.fatPct == null) return null;
    var leanBase = r.baseline.weightKg * (1 - r.baseline.fatPct / 100);
    var totalLoss = r.baseline.weightKg - cur;
    if (totalLoss <= 0) return null;
    var leanDelta = U.round(leanBase - est.leanMassKg, 1); // + = lean lost
    var share = U.round(U.clamp(leanDelta / totalLoss, 0, 1), 2);
    return { leanDeltaKg: leanDelta, shareOfLoss: share, warn: share > CFG.body.leanLossWarnShare };
  }

  /* ---------- the physique gate (the reference photos, made computable) ----------
     Honest model: the photos are a body-fat state. Hold lean mass constant,
     ask when fat mass falls to the target share at the current measured rate.
     targetWeight = lean / (1 − targetFat%). Recomputed from live logs on
     every read — each new weigh-in moves the predicted date. */
  function physiqueEta(settings, asOf) {
    var p = CFG.body.physique, est = fatPctEstimate(settings, asOf);
    var cur = currentKg(settings, asOf), rate = rateKgPerWeek(settings, asOf);
    if (!p || !est || cur == null) return null;
    var targetKg = U.round(est.leanMassKg / (1 - p.targetFatPct / 100), 1);
    if (est.fatPct <= p.targetFatPct) return { reached: true, targetFatPct: p.targetFatPct, targetKg: targetKg, label: p.label };
    var out = { reached: false, targetFatPct: p.targetFatPct, targetKg: targetKg, label: p.label,
                kgToGo: U.round(cur - targetKg, 1), dateISO: null, weeks: null };
    if (rate != null && rate < 0) {
      var weeks = (cur - targetKg) / -rate;
      out.weeks = U.round(weeks, 1);
      out.dateISO = U.addDays(asOf || U.todayISO(), Math.round(weeks * 7));
    }
    return out;
  }

  /* ---------- one throw-safe object for the screens ---------- */
  function summary(settings, asOf) {
    try {
      var s = settings || S.getSettings(), r = resolved(s);
      var cur = currentKg(s, asOf);
      return {
        resolved: r,
        series: smoothedSeries(s, asOf),
        currentKg: cur == null ? null : U.round(cur, 2),
        lastRaw: (function (w) { return w.length ? w[w.length - 1] : null; })(weightSeries(s, asOf)),
        kgDown: cur != null && r.baseline ? U.round(r.baseline.weightKg - cur, 2) : null,
        kgToGo: cur != null && r.goalWeightKg != null ? U.round(Math.max(0, cur - r.goalWeightKg), 2) : null,
        progressPct: progressPct(s, asOf),
        bmi: bmi(cur, r.heightCm),
        rate: rateVerdict(s, asOf),
        eta: etaToGoal(s, asOf),
        fat: fatPctEstimate(s, asOf),
        lean: leanCheck(s, asOf),
        physique: physiqueEta(s, asOf)
      };
    } catch (e) {
      return { resolved: null, series: [], currentKg: null, lastRaw: null, kgDown: null, kgToGo: null,
               progressPct: null, bmi: null, rate: null, eta: null, fat: null, lean: null, physique: null, error: String(e && e.message || e) };
    }
  }

  global.RTI_BODY = {
    resolved: resolved, ageAt: ageAt,
    weightSeries: weightSeries, smoothedSeries: smoothedSeries, currentKg: currentKg,
    rateKgPerWeek: rateKgPerWeek, rateVerdict: rateVerdict,
    progressPct: progressPct, etaToGoal: etaToGoal,
    bmi: bmi, deurenbergPct: deurenbergPct, fatOffset: fatOffset,
    fatPctEstimate: fatPctEstimate, leanCheck: leanCheck, physiqueEta: physiqueEta, summary: summary
  };
})(typeof window !== 'undefined' ? window : this);
