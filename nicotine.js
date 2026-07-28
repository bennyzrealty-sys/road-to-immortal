/* =====================================================================
   Road to Immortal — THE UNCHAINING (increment 15)
   ---------------------------------------------------------------------
   Pure derivations for the nicotine run-out: days free, the patch
   step-down schedule, craving stats, money saved, the mood overlay.

   Doctrine unchanged: nothing stored here — every value recomputes from
   the store on read. Cravings live in their own ledger (rti_cravings_v1)
   and NEVER touch the streak / Chi / Willpower economy.
   ===================================================================== */
(function (global) {
  'use strict';
  var U = global.RTI_UTIL, CFG = global.RTI_CONFIG, S = global.RTI_STORE;

  function state() {
    var n = S.getNicotine();
    n.patchPlan = n.patchPlan || CFG.nicotine.patchPlan;
    n.product = n.product || CFG.nicotine.productDefault;
    return n;
  }
  function daysSinceQuit(asOf) {
    var n = state();
    if (!n.enabled || !n.quitDateISO) return null;
    var d = U.daysBetween(n.quitDateISO, asOf || U.todayISO());
    return d < 0 ? null : d;
  }

  /* ---------- the patch schedule, expanded to real dates ---------- */
  // { steps: [{mg, startISO, endISO}], current, next, nextStepDownISO, patchOffISO, done }
  function schedule(asOf) {
    var n = state();
    if (!n.enabled || !n.patchStartISO) return null;
    asOf = asOf || U.todayISO();
    var steps = [], cursor = n.patchStartISO;
    for (var i = 0; i < n.patchPlan.length; i++) {
      var p = n.patchPlan[i];
      var end = U.addDays(cursor, p.days - 1);
      steps.push({ mg: p.mg, days: p.days, startISO: cursor, endISO: end });
      cursor = U.addDays(end, 1);
    }
    var patchOffISO = cursor, current = null, next = null;
    for (var j = 0; j < steps.length; j++) {
      if (asOf >= steps[j].startISO && asOf <= steps[j].endISO) { current = steps[j]; next = steps[j + 1] || null; break; }
    }
    var done = asOf >= patchOffISO;
    return {
      steps: steps, current: current, next: next,
      nextStepDownISO: current && next ? next.startISO : (current ? patchOffISO : null),
      patchOffISO: patchOffISO, done: done
    };
  }
  function isStepDownDay(asOf) {
    var sc = schedule(asOf);
    if (!sc) return null;
    asOf = asOf || U.todayISO();
    for (var i = 1; i < sc.steps.length; i++) if (sc.steps[i].startISO === asOf) return sc.steps[i];
    if (sc.patchOffISO === asOf) return { mg: 0, startISO: asOf };
    return null;
  }

  /* ---------- withdrawal timeline stage (same scan as E.stageFor) ---------- */
  function timelineStage(asOf) {
    var d = daysSinceQuit(asOf);
    if (d == null) return null;
    var tl = CFG.nicotine.timeline, idx = 0;
    for (var i = 0; i < tl.length; i++) if (d >= tl[i].reach) idx = i;
    return { index: idx, current: tl[idx], next: tl[idx + 1] || null, day: d };
  }

  /* ---------- cravings ---------- */
  function cravingStats(asOf) {
    var list = S.getCravings(), byHour = new Array(24).fill(0), ridden = 0, last7 = 0;
    asOf = asOf || U.todayISO();
    list.forEach(function (c) {
      byHour[new Date(c.ts).getHours()]++;
      if (c.rode !== false) ridden++;
      if (U.daysBetween(c.date, asOf) < 7 && U.daysBetween(c.date, asOf) >= 0) last7++;
    });
    return { total: list.length, ridden: ridden, byHour: byHour, last7: last7 };
  }

  /* ---------- money + mood ---------- */
  function moneySaved(asOf) {
    var n = state(), d = daysSinceQuit(asOf);
    if (n.costPerDay == null || d == null) return null; // never invent a price
    return U.round(n.costPerDay * d, 2);
  }
  // [{x: daysSinceQuit, mood}] for the dual chart — only logged moods
  function moodOverlay(asOf) {
    var n = state();
    if (!n.enabled || !n.quitDateISO) return [];
    var out = [];
    S.logsArray().forEach(function (lg) {
      if (lg.mood == null) return;
      var d = U.daysBetween(n.quitDateISO, lg.date);
      if (d >= 0 && (!asOf || lg.date <= asOf)) out.push({ x: d, mood: lg.mood });
    });
    return out;
  }

  /* ---------- the campaign template (installed in increment 16) ---------- */
  function goalTemplate() {
    var n = state(), sc = schedule();
    if (!n.enabled || !n.quitDateISO || !sc) return null;
    var ms = [{ title: 'Week one held — the peak survived', targetISO: U.addDays(n.quitDateISO, 7) }];
    for (var i = 1; i < sc.steps.length; i++)
      ms.push({ title: 'Step down to ' + sc.steps[i].mg + 'mg', targetISO: sc.steps[i].startISO });
    ms.push({ title: 'Patch off — running free', targetISO: sc.patchOffISO });
    ms.push({ title: 'Day 90 — receptors home', targetISO: U.addDays(n.quitDateISO, 90) });
    return {
      id: 'unchaining', title: 'The Unchaining',
      why: 'Fifteen years of pouches end here. The taper is a schedule, not a struggle.',
      createdISO: n.quitDateISO, horizon: U.addDays(n.quitDateISO, 90),
      milestones: ms,
      tasks: [ { title: 'Patch on + zero pouches', cadence: 'daily' } ]
    };
  }

  global.RTI_NICOTINE = {
    state: state, daysSinceQuit: daysSinceQuit,
    schedule: schedule, isStepDownDay: isStepDownDay, timelineStage: timelineStage,
    cravingStats: cravingStats, moneySaved: moneySaved, moodOverlay: moodOverlay,
    goalTemplate: goalTemplate
  };
})(typeof window !== 'undefined' ? window : this);
