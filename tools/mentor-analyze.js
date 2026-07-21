/* =====================================================================
   Road to Immortal — MENTOR ANALYZER (increment 8, dev/agent-side tool)
   ---------------------------------------------------------------------
   Deterministic metrics over a backup.json export — the layer the Mentor
   agent REASONS on top of. No personal data lives in this file; it only
   computes. Reuses the real engine the same way tools/selftest.js does,
   so every number matches what the app itself would show.

   CLI:    node tools/mentor-analyze.js path/to/backup.json [asOfISO]
   Module: require('./mentor-analyze').analyze(bundle, asOfISO)
   ===================================================================== */
'use strict';

function bootstrapModules() {
  if (global.RTI_ENGINE) return; // already loaded (e.g. by selftest)
  var fs = require('fs'), path = require('path');
  global.window = global;
  var _ls = {};
  global.localStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(_ls, k) ? _ls[k] : null; },
    setItem: function (k, v) { _ls[k] = String(v); },
    removeItem: function (k) { delete _ls[k]; }
  };
  var root = path.join(__dirname, '..');
  ['config.js', 'util.js', 'store.js', 'engine.js', 'rota.js', 'goals.js'].forEach(function (f) {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(root, f), 'utf8'));
  });
}

function analyze(bundle, asOf) {
  bootstrapModules();
  var S = global.RTI_STORE, E = global.RTI_ENGINE, U = global.RTI_UTIL;
  var G = global.RTI_GOALS, CFG = global.RTI_CONFIG;

  S.wipeAll();
  var imp = S.importBundle(bundle);
  if (!imp.ok) return { error: imp.error };
  var st = S.getSettings();
  asOf = asOf || U.todayISO();

  var snap = E.snapshot(asOf);
  var day = snap.day;

  /* ---- the record: clean / broken / unlogged over the whole journey ---- */
  var clean = 0, broken = 0, unlogged = 0;
  for (var i = 0; i < day; i++) {
    var stt = E.dayStatus(U.addDays(st.startDate, i));
    if (stt === 'clean') clean++;
    else if (stt === 'broken') broken++;
    else unlogged++;
  }
  var answered = clean + broken;

  /* ---- urge pressure by hour (the REAL danger window, from lived data) ---- */
  var byHour = [], h;
  for (h = 0; h < 24; h++) byHour.push(0);
  S.getUrges().forEach(function (u) {
    try { var hh = new Date(u.ts).getHours(); if (hh >= 0 && hh < 24) byHour[hh]++; } catch (e) {}
  });
  var hours = [];
  for (h = 0; h < 24; h++) if (byHour[h] > 0) hours.push({ hour: h, urges: byHour[h] });
  hours.sort(function (a, b) { return b.urges - a.urges; });

  /* ---- helpers over the daily logs ---- */
  function avgOver(fromBack, toBack, pick) {
    var sum = 0, n = 0;
    for (var k = fromBack; k <= toBack; k++) {
      var v = pick(S.getLog(U.addDays(asOf, -k)));
      if (v != null && isFinite(+v)) { sum += +v; n++; }
    }
    return n ? Math.round(sum / n * 100) / 100 : null;
  }
  function trendOf(pick) {
    var recent = avgOver(0, 6, pick), before = avgOver(7, 13, pick);
    var dir = (recent == null || before == null) ? 'unknown'
            : recent > before * 1.05 ? 'up' : recent < before * 0.95 ? 'down' : 'flat';
    return { last7: recent, prev7: before, direction: dir };
  }

  /* ---- nutrition over answered days with a chosen plan ---- */
  var adhSum = 0, adhN = 0, proteinHits = 0;
  for (var d2 = 0; d2 < day; d2++) {
    var a = E.nutritionAdherence(S.getLog(U.addDays(st.startDate, d2)));
    if (a.chosen) { adhSum += a.adherence; adhN++; if (a.proteinHit) proteinHits++; }
  }

  /* ---- meter calibration over the last 14 days (README says: tune
         maxPerWindow so a strong day reads near full) ---- */
  var cal = { chi: { pegged: 0, starved: 0 }, vitality: { pegged: 0, starved: 0 }, willpower: { pegged: 0, starved: 0 } };
  for (var d3 = 0; d3 < 14; d3++) {
    var date3 = U.addDays(asOf, -d3);
    if (U.daysBetween(st.startDate, date3) < 0) break;
    var mm = E.metersAsOf(st, date3);
    ['chi', 'vitality', 'willpower'].forEach(function (key) {
      if (mm[key] >= 95) cal[key].pegged++;
      if (mm[key] <= 15) cal[key].starved++;
    });
  }
  var calNotes = [];
  ['chi', 'vitality', 'willpower'].forEach(function (key) {
    if (cal[key].pegged >= 10) calNotes.push(key + ' is pegged ≥95 on ' + cal[key].pegged + '/14 days — raise config.meters.' + key + '.maxPerWindow so the bar can still speak.');
    if (cal[key].starved >= 10) calNotes.push(key + ' reads ≤15 on ' + cal[key].starved + '/14 days — either the habit is missing or config.meters.' + key + '.maxPerWindow is set too high.');
  });

  /* ---- ambitions ---- */
  var goals = [];
  try {
    G.list().forEach(function (g) {
      if (g.archived) return;
      var p = G.progress(g, asOf);
      goals.push({ title: g.title, horizon: g.horizon, combinedPct: p.combined,
                   milestones: p.msDone + '/' + p.msTotal, adherence14: p.adherence,
                   etaISO: p.eta ? p.eta.iso : null,
                   next: (function () { var n = G.nextMilestone(g); return n ? n.title : null; })(),
                   overdue: G.overdueMilestones(asOf).filter(function (o) { return o.goal.id === g.id; }).length });
    });
  } catch (e) {}

  /* ---- foresight ---- */
  var risk = null, prophecy = null, outlook = null;
  try { risk = E.riskForecast(st, asOf, 22, null); } catch (e) {}
  try { prophecy = E.weeklyProphecy(st, asOf); } catch (e) {}
  try { outlook = E.survivalOutlook(st, asOf); } catch (e) {}

  return {
    tool: 'rti-mentor-analyze', schema: 1,
    asOf: asOf, day: day, rank: snap.rank.current ? snap.rank.current.name : null,
    record: {
      clean: clean, broken: broken, unlogged: unlogged, answered: answered,
      cleanRatePct: answered ? Math.round(clean / answered * 100) : null,
      streak: snap.streak.current, longest: snap.streak.longest, shields: snap.streak.shields,
      relapses: S.getRelapses().length, urgesBanked: S.getUrges().length
    },
    dangerHours: hours.slice(0, 3),
    trends: {
      mood: trendOf(function (l) { return l.mood; }),
      sleepHrs: trendOf(function (l) { return l.sleepHrs; }),
      steps: trendOf(function (l) { return l.steps > 0 ? l.steps : null; }),
      breathingMin: trendOf(function (l) { return l.breathingMin > 0 ? l.breathingMin : null; })
    },
    nutrition: {
      daysPlanned: adhN,
      meanAdherencePct: adhN ? Math.round(adhSum / adhN * 100) : null,
      proteinHitRatePct: adhN ? Math.round(proteinHits / adhN * 100) : null
    },
    meters: { today: snap.meters, calibration: cal, calibrationNotes: calNotes },
    goals: goals,
    foresight: { tonight: risk, week: prophecy, outlook: outlook }
  };
}

if (require.main === module) {
  var fs2 = require('fs');
  var file = process.argv[2];
  if (!file) { console.error('Usage: node tools/mentor-analyze.js path/to/backup.json [asOfISO]'); process.exit(2); }
  var bundle;
  try { bundle = JSON.parse(fs2.readFileSync(file, 'utf8')); }
  catch (e) { console.error('Cannot read/parse ' + file + ': ' + e.message); process.exit(2); }
  var out = analyze(bundle, process.argv[3] || null);
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.error ? 1 : 0);
}
module.exports = { analyze: analyze };
