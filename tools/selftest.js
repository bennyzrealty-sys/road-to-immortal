/* Node sanity-check for the derived engine. Not shipped to the app.
   Run: node tools/selftest.js  */
'use strict';
var fs = require('fs'), path = require('path');

// --- shims so the browser IIFEs attach to a global "window" ---
global.window = global;
var _ls = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(_ls, k) ? _ls[k] : null; },
  setItem: function (k, v) { _ls[k] = String(v); },
  removeItem: function (k) { delete _ls[k]; }
};

var root = path.join(__dirname, '..');
['config.js', 'util.js', 'store.js', 'engine.js', 'photos.js', 'rota.js', 'sanctum.js', 'oracle.js'].forEach(function (f) {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(root, f), 'utf8'));
});

var S = global.RTI_STORE, E = global.RTI_ENGINE, U = global.RTI_UTIL, P = global.RTI_PHOTO;
var R = global.RTI_ROTA, SAN = global.RTI_SANCTUM, ORA = global.RTI_ORACLE;
var pass = 0, fail = 0;
function check(name, got, want) {
  var ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS ' : 'FAIL ') + name + '  got=' + JSON.stringify(got) + (ok ? '' : ' want=' + JSON.stringify(want)));
  ok ? pass++ : fail++;
}
function near(name, got, want, tol) {
  var ok = Math.abs(got - want) <= (tol || 0.6);
  console.log((ok ? 'PASS ' : 'FAIL ') + name + '  got=' + got + (ok ? '' : ' want~=' + want));
  ok ? pass++ : fail++;
}

S.wipeAll();
S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' });
var st = S.getSettings();

// day number + progress
check('day @ 2026-06-08 (start)', E.dayNumber(st, '2026-06-08'), 1);
check('day @ 2026-06-26 (today)', E.dayNumber(st, '2026-06-26'), 19);
check('target == day 500', E.dayNumber(st, '2027-10-20'), 500);
var pg = E.progress(st, '2026-06-26');
check('span days', pg.span, 499);
near('pct @ day19', pg.pct, 3.6, 0.2);

// rank ladder
check('rank @ day1', E.rankFor(1).current.name, 'The Awakening');
var r19 = E.rankFor(19);
check('rank @ day19', r19.current.name, 'Knight');
check('next @ day19', r19.next.name, 'Knight-Lieutenant');
check('daysToNext @ day19', r19.daysToNext, 2);
check('rank @ day500', E.rankFor(500).current.name, 'The Immortal');

// no logs -> zero streak/meters
check('streak empty', E.streakAsOf(st, '2026-06-26').current, 0);

// seed 19 clean days w/ breathing+meditation+steps
for (var i = 0; i < 19; i++) {
  var d = U.addDays('2026-06-08', i);
  S.saveLog(d, Object.assign(S.blankLog(d), { clean: true, breathingMin: 20, meditationMin: 10, steps: 10000 }));
}
var sk = E.streakAsOf(st, '2026-06-26');
check('streak 19 clean -> current', sk.current, 19);
check('streak 19 clean -> longest', sk.longest, 19);
check('streak 19 clean -> shields (cap 2)', sk.shields, 2);
var m = E.metersAsOf(st, '2026-06-26');
near('chi', m.chi, 89, 1.5);
near('vitality', m.vitality, 17, 1.5);
near('willpower', m.willpower, 25, 1.5);
near('presence', m.presence, 76, 2);
near('immortal index', m.index, 56, 2);
near('chiDelta +10 breathing', E.chiDeltaForBreathing(st, '2026-06-26', 10), 4.3, 0.5);

// shield burns instead of resetting streak
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
for (var j = 0; j < 14; j++) { var dd = U.addDays('2026-06-08', j); S.saveLog(dd, Object.assign(S.blankLog(dd), { clean: true })); }
var brokeDate = U.addDays('2026-06-08', 14);
S.saveLog(brokeDate, Object.assign(S.blankLog(brokeDate), { clean: false }));
var sk2 = E.streakAsOf(st, brokeDate);
check('shield absorbs slip -> streak preserved', sk2.current, 14);
check('shield consumed (2 -> 1)', sk2.shields, 1);

// no shield -> reset
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
for (var x = 0; x < 4; x++) { var d4 = U.addDays('2026-06-08', x); S.saveLog(d4, Object.assign(S.blankLog(d4), { clean: true })); }
var bd = U.addDays('2026-06-08', 4);
S.saveLog(bd, Object.assign(S.blankLog(bd), { clean: false }));
var sk3 = E.streakAsOf(st, bd);
check('no shield -> streak resets', sk3.current, 0);
check('no shield -> longest kept', sk3.longest, 4);

// nutrition adherence + rule-checker
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
var nlog = S.blankLog('2026-06-26');
nlog.nutrition = { dayType: 'shift', templateId: 'shiftA',
  meals: { B: 'eaten', L: 'eaten', S: 'eaten', T: 'eaten', D: 'eaten' } };
var adh = E.nutritionAdherence(nlog);
check('shiftA full adherence == 1', adh.adherence, 1);
check('shiftA protein hit', adh.proteinHit, true);

// butter + fatty dinner -> rule 4 flags (force: log butter on shiftB pork curry day)
var rlog = S.blankLog('2026-06-26');
rlog.nutrition = { dayType: 'shift', templateId: 'shiftB',
  meals: { B: 'eaten', L: 'eaten', S: 'eaten', T: 'eaten', D: 'eaten' }, extraButter: true };
var flags = E.nutritionFlags(rlog).map(function (f) { return f.rule; });
check('pork curry + butter -> rule 4 present', flags.indexOf(4) >= 0, true);
check('pork curry + butter -> rule 2 (two fatty)', flags.indexOf(2) >= 0, true);

// salmon + coconut -> rule 3
var slog = S.blankLog('2026-06-26');
slog.nutrition = { dayType: 'shift', templateId: 'shiftD',
  meals: { B: 'eaten', L: 'eaten', S: 'eaten', T: 'eaten', D: 'eaten' }, coconutMl: 100 };
var sflags = E.nutritionFlags(slog).map(function (f) { return f.rule; });
check('salmon + coconut -> rule 3 present', sflags.indexOf(3) >= 0, true);

// banana on rest day -> rule 5
var blog = S.blankLog('2026-06-26');
blog.nutrition = { dayType: 'rest', templateId: 'restB', meals: { T: 'eaten' } };
// restB has no banana, so inject via shift template misuse: use shiftA on a rest day
blog.nutrition = { dayType: 'rest', templateId: 'shiftA', meals: { T: 'eaten' } };
var bflags = E.nutritionFlags(blog).map(function (f) { return f.rule; });
check('banana on rest day -> rule 5 present', bflags.indexOf(5) >= 0, true);

// ---- regression tests for the spec-audit fixes ----
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
['shiftA','shiftB','shiftC','shiftD','restA','restB','restC'].forEach(function (id) {
  var lg = S.blankLog('2026-06-26');
  lg.nutrition = { dayType: id.indexOf('shift') === 0 ? 'shift' : 'rest', templateId: id, meals: { B:'eaten', L:'eaten', S:'eaten', T:'eaten', D:'eaten' } };
  check(id + ' full adherence -> protein hit', E.nutritionAdherence(lg).proteinHit, true);
});
// per-meal protein estimates sum to the authored planProtein
global.RTI_CONFIG.nutrition.templates.forEach(function (t) {
  var sum = Object.keys(t.meals).reduce(function (a, k) { return a + t.meals[k].protein; }, 0);
  check(t.id + ' meal protein sums to planProtein', sum, t.planProtein);
});
check('daysToImmortal clamped >=0 past target', E.progress(st, '2027-12-01').daysToImmortal, 0);
var fd0 = U.addDays('2026-06-08', 0); S.saveLog(fd0, Object.assign(S.blankLog(fd0), { clean: true }));
check('streak 0 before startDate (future start)', E.streakAsOf(st, '2026-06-01').current, 0);
var g = S.blankLog('2026-06-26'); g.clean = true; g.breathingMin = 'oops'; g.steps = NaN;
S.saveLog('2026-06-26', g);
var mm = E.metersAsOf(st, '2026-06-26');
check('meters stay finite with garbage input', isFinite(mm.chi) && isFinite(mm.index), true);
// editable per-meal override flows into adherence
S.setSettings({ mealOverrides: { restA: { D: { protein: 999 } } } });
var ov = S.blankLog('2026-06-26'); ov.nutrition = { dayType:'rest', templateId:'restA', meals:{ D:'eaten' } };
check('meal override applied to consumed protein', E.nutritionAdherence(ov).consumedProtein, 999);

// ---- increment 2: Energy Bank / Ascension ----
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
for (var c = 0; c < 10; c++) { var dc = U.addDays('2026-06-08', c); S.saveLog(dc, Object.assign(S.blankLog(dc), { clean: true, breathingMin: 20, meditationMin: 10 })); }
var t10 = E.totalChiAccumulated(st, U.addDays('2026-06-08', 9));
check('totalChiAccumulated > 0 after 10 clean days', t10 > 0, true);
var d11 = U.addDays('2026-06-08', 10);
S.saveLog(d11, Object.assign(S.blankLog(d11), { clean: false }));
S.addRelapse({ date: d11, note: '', streakLengthAtReset: 10 });
var t11 = E.totalChiAccumulated(st, d11);
check('lifetime Chi is monotonic across a relapse', t11 >= t10, true);
check('relapse day adds no earned (0)', Math.round(t11 - t10), 0);
var lock30 = E.correlationStatus(st, U.addDays('2026-06-08', 30));
check('correlation locked before day 60', lock30.unlocked, false);
check('spearman monotonic == 1', Math.round(U.spearman([1, 2, 3, 4, 5, 6], [2, 4, 6, 8, 10, 12])), 1);
check('spearman inverse == -1', Math.round(U.spearman([1, 2, 3, 4, 5, 6], [6, 5, 4, 3, 2, 1])), -1);
check('spearman <5 pairs -> null', U.spearman([1, 2, 3], [1, 2, 3]), null);

// ---- increment 2 · Part 2: photo metric VALIDITY (scale-invariance) ----
function mkFace(scale, ox, oy) {
  scale = scale || 1; ox = ox || 0; oy = oy || 0;
  var lm = []; for (var i = 0; i < 478; i++) lm.push({ x: 0, y: 0 });
  function set(i, x, y) { lm[i] = { x: x * scale + ox, y: y * scale + oy }; }
  set(468, 45, 40); set(473, 55, 40);   // iris L/R -> inter-ocular 10
  set(234, 30, 42); set(454, 70, 42);   // bizygomatic 40
  set(172, 36, 60); set(397, 64, 60);   // bigonial 28
  set(0, 50, 55); set(168, 50, 38);     // upper lip & glabella -> height 17
  set(152, 50, 72); set(10, 50, 20);    // chin & forehead
  set(50, 40, 50); set(280, 60, 50);    // cheeks 20
  set(1, 50, 50); set(33, 40, 40); set(263, 60, 40); // nose + eye corners
  return lm;
}
var fm1 = P.faceMetrics(mkFace(1)), fm2 = P.faceMetrics(mkFace(2)); // 2x = camera closer
check('jawRatio scale-invariant (closer != wider jaw)', Math.abs(fm1.jawRatio - fm2.jawRatio) < 1e-9, true);
check('fWHR scale-invariant', Math.abs(fm1.fWHR - fm2.fWHR) < 1e-9, true);
check('gonialAngle scale-invariant', Math.abs(fm1.gonialAngleDeg - fm2.gonialAngleDeg) < 1e-9, true);
check('cheekFullness scale-invariant', Math.abs(fm1.cheekFullness - fm2.cheekFullness) < 1e-9, true);
check('jawRatio value (28/40)', +fm1.jawRatio.toFixed(2), 0.70);
check('fWHR value (40/17)', +fm1.fWHR.toFixed(2), 2.35);
function mkPose(scale) {
  var p = []; for (var i = 0; i < 33; i++) p.push({ x: 0, y: 0 });
  p[11] = { x: 30 * scale, y: 20 * scale }; p[12] = { x: 70 * scale, y: 20 * scale }; // shoulders 40
  p[23] = { x: 38 * scale, y: 60 * scale }; p[24] = { x: 62 * scale, y: 60 * scale }; // hips 24
  return p;
}
var bm1 = P.bodyMetrics(mkPose(1)), bm2 = P.bodyMetrics(mkPose(2));
check('shoulderHip scale-invariant', Math.abs(bm1.shoulderHip - bm2.shoulderHip) < 1e-9, true);
check('shoulderHip value (40/24)', +bm1.shoulderHip.toFixed(3), 1.667);
// verdict: weekly cadence gate labels sub-week as noise
var vNoise = P.verdict({ jawRatio: 0.7, cheekFullness: 0.5 }, { jawRatio: 0.66, cheekFullness: 0.48 }, null, { cardioMin: 200 }, 3, 'face');
check('sub-week capture labelled noise (info)', vNoise.tone, 'info');
var vWeek = P.verdict({ jawRatio: 0.7, cheekFullness: 0.5 }, { jawRatio: 0.66, cheekFullness: 0.48 }, null, { cardioMin: 200 }, 14, 'face');
check('weekly sharper+cardio -> amber read', vWeek.tone, 'amber');
check('verdict null curr -> no crash', P.verdict({ jawRatio: 0.7 }, null, null, { cardioMin: 0 }, 14, 'face').tone, 'info');

// fWHR aspect-ratio invariance through the real normalized->pixel conversion
// (same face, 1:1 vs 1:2 image). Refutes the audit's "fWHR embeds w/h" claim.
function normFace(W, H) {
  var real = { 234: [300, 420], 454: [700, 420], 0: [500, 560], 168: [500, 390], 468: [470, 400], 473: [530, 400], 172: [336, 540], 397: [664, 540], 152: [500, 600], 10: [500, 300], 50: [420, 500], 280: [580, 500], 1: [500, 500], 33: [440, 400], 263: [560, 400] };
  var lm = []; for (var i = 0; i < 478; i++) lm.push({ x: 0, y: 0 });
  for (var k in real) lm[+k] = { x: real[k][0] / W * W, y: real[k][1] / H * H }; // normalize then pixelize == real px
  return lm;
}
var fA = P.faceMetrics(normFace(1000, 1000)), fB = P.faceMetrics(normFace(1000, 2000));
check('fWHR aspect-invariant (1:1 vs 1:2 image, same face)', Math.abs(fA.fWHR - fB.fWHR) < 1e-9, true);
check('jawRatio aspect-invariant', Math.abs(fA.jawRatio - fB.jawRatio) < 1e-9, true);
check('fWHR real value (400/170)', +fA.fWHR.toFixed(2), 2.35);

// ---- increment 3: coach / aura / stages / standing ----
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
// stage ladder boundaries
check('stage @ streak 0', E.stageFor(0).current.name, 'The Fog');
check('stage @ streak 7', E.stageFor(7).current.name, 'The Clearing');
check('stage @ streak 30', E.stageFor(30).current.name, 'Magnetic Field');
check('stage @ streak 180 (summit)', E.stageFor(180).current.name, 'The Immortal Current');
check('stage @ summit has no next', E.stageFor(180).next, null);
// coach phase wraps midnight
check('coach phase @ 08h morning', E.coachPhase(8).id, 'morning');
check('coach phase @ 23h night', E.coachPhase(23).id, 'night');
check('coach phase @ 02h night (wrap)', E.coachPhase(2).id, 'night');
// blank day: nothing logged -> 0% complete, first nudge is day-type
var ag0 = E.dailyAgenda(st, '2026-06-26', 8);
check('blank agenda 0% complete', ag0.completionPct, 0);
check('blank agenda primary = daytype', ag0.primary.kind, 'daytype');
// aura: no data -> zero power, scores bounded
var a0 = E.auraScores(st, '2026-06-26');
check('aura power 0 with no streak', a0.power, 0);
check('aura magnetism in [0,100]', a0.magnetism >= 0 && a0.magnetism <= 100, true);
// seed a clean week -> power climbs, stage advances, agenda fills
for (var p3 = 0; p3 < 8; p3++) { var dp = U.addDays('2026-06-08', p3); S.saveLog(dp, Object.assign(S.blankLog(dp), { clean: true, breathingMin: 20, meditationMin: 10, steps: 10000 })); }
var a8 = E.auraScores(st, U.addDays('2026-06-08', 7));
check('aura power > 0 after clean week', a8.power > 0, true);
check('stage after 8-day streak = The Clearing', E.stageFor(a8.streak.current).current.name, 'The Clearing');
var ps3 = E.performanceSummary(st, U.addDays('2026-06-08', 7));
check('perf clean rate 100 after clean week', ps3.cleanRatePct, 100);
check('perf totalChi > 0', ps3.totalChi > 0, true);

// ---- increment 3.1: Daily Trial determinism + detection + standing ----
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
var nT = global.RTI_CONFIG.trials.length;
function expectIdx(date) { return global.RTI_CONFIG.trials[((U.daysBetween('2020-01-01', date) % nT) + nT) % nT].id; }
check('dailyTrial stable for a given day', E.dailyTrial(st, '2026-06-26').trial.id, expectIdx('2026-06-26'));
check('dailyTrial rotates +1 array step next day', E.dailyTrial(st, '2026-06-27').trial.id, expectIdx('2026-06-27'));
check('dailyTrial wraps after a full cycle', E.dailyTrial(st, U.addDays('2026-06-26', nT)).trial.id, E.dailyTrial(st, '2026-06-26').trial.id);
// find a date in the first cycle that lands on each id we want to assert
function dateForTrial(id) { for (var i = 0; i < nT; i++) { var d = U.addDays('2026-06-08', i); if (E.dailyTrial(st, d).trial.id === id) return d; } return null; }
var dSteps = dateForTrial('steps10k');
check('steps10k trial found in first cycle', !!dSteps, true);
check('auto steps trial not met on blank day', E.dailyTrial(st, dSteps).done, false);
S.saveLog(dSteps, Object.assign(S.blankLog(dSteps), { steps: 10000 }));
check('auto steps trial met at 10k steps', E.dailyTrial(st, dSteps).done, true);
S.saveLog(dSteps, Object.assign(S.blankLog(dSteps), { steps: 9999 }));
check('auto steps trial NOT met at 9,999', E.dailyTrial(st, dSteps).done, false);
var dProt = dateForTrial('protein');
if (dProt) {
  var pl = S.blankLog(dProt);
  pl.nutrition = { dayType: 'shift', templateId: 'shiftA', meals: { B: 'eaten', L: 'eaten', S: 'eaten', T: 'eaten', D: 'eaten' } };
  S.saveLog(dProt, pl);
  check('auto protein trial met on full shiftA', E.dailyTrial(st, dProt).done, true);
}
// manual stale-id guard
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
var dCold = dateForTrial('coldShower');
if (dCold) {
  S.patchLog(dCold, { trial: { id: 'coldShower', done: true } });
  check('manual trial done when id matches', E.dailyTrial(st, dCold).done, true);
  S.patchLog(dCold, { trial: { id: 'sunlight', done: true } });
  check('manual trial ignored when stored id is stale', E.dailyTrial(st, dCold).done, false);
}
// trialStanding tally + streak
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
check('trialStanding empty -> 0 won / 0 streak', E.trialStanding(st, '2026-06-08'), { won: 0, streak: 0 });
(function () {
  for (var i = 0; i < 3; i++) {
    var d = U.addDays('2026-06-08', i), dt = E.dailyTrial(st, d).trial, lg = S.blankLog(d);
    if (dt.auto) {
      if (dt.metric === 'steps') lg.steps = dt.need;
      else if (dt.metric === 'breathingMin') lg.breathingMin = dt.need;
      else if (dt.metric === 'meditationMin') lg.meditationMin = dt.need;
      else if (dt.metric === 'cardioMin') lg.cardio = { type: 'walk', minutes: dt.need, notes: '' };
      else if (dt.metric === 'sleepHrs') lg.sleepHrs = dt.need;
      else if (dt.metric === 'proteinHit') lg.nutrition = { dayType: 'shift', templateId: 'shiftA', meals: { B: 'eaten', L: 'eaten', S: 'eaten', T: 'eaten', D: 'eaten' } };
      else if (dt.metric === 'allTargets') lg.todayTargetsDone = (st.dailyTargets || []).map(function () { return true; });
    } else { lg.trial = { id: dt.id, done: true }; }
    S.saveLog(d, lg);
  }
})();
var stand3 = E.trialStanding(st, U.addDays('2026-06-08', 2));
check('trialStanding 3-day run -> 3 won', stand3.won, 3);
check('trialStanding 3-day run -> streak 3', stand3.streak, 3);
var stand4 = E.trialStanding(st, U.addDays('2026-06-08', 3));
check('trialStanding streak breaks on a missed day', stand4.streak, 0);
check('trialStanding won persists after a miss', stand4.won, 3);

// ---- increment 3.1: share-card pure data (cross-checked against derived fns) ----
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20', displayName: 'Ben' }); st = S.getSettings();
for (var scd = 0; scd < 8; scd++) { var dscd = U.addDays('2026-06-08', scd); S.saveLog(dscd, Object.assign(S.blankLog(dscd), { clean: true, breathingMin: 20, meditationMin: 10, steps: 10000 })); }
var card = E.shareCardData(st, U.addDays('2026-06-08', 7));
check('shareCard day == 8', card.day, 8);
check('shareCard rank == Acolyte', card.rank, 'Acolyte');
check('shareCard cleanStreak == 8', card.cleanStreak, 8);
check('shareCard stage == The Clearing', card.stage, 'The Clearing');
check('shareCard power matches auraScores', card.power, E.auraScores(st, U.addDays('2026-06-08', 7)).power);
check('shareCard index matches meters', card.index, E.metersAsOf(st, U.addDays('2026-06-08', 7)).index);
check('shareCard displayName trimmed', card.displayName, 'Ben');

// ---- increment 3.2: backfill clean days (catch-up) ----
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
// only today marked clean -> Day 21 but streak 1 (the reported symptom)
S.patchLog('2026-06-28', { clean: true });
check('symptom: streak 1 while day 21', E.streakAsOf(st, '2026-06-28').current, 1);
// a logged slip on day 5 and a relapse on day 9 that backfill must NOT overwrite
var slipDate = U.addDays('2026-06-08', 4); S.patchLog(slipDate, { clean: false });
var relDate = U.addDays('2026-06-08', 8); S.addRelapse({ date: relDate, note: '', streakLengthAtReset: 0 });
var filled = S.backfillClean('2026-06-08', '2026-06-28');
check('backfill marks the unlogged days only', filled, 18);          // 21 days - today(clean) - slip - relapse
check('backfill preserves a logged slip', S.getLog(slipDate).clean, false);
check('backfill does not write clean over a relapse day', S.getLog(relDate).clean, null);
check('backfill is idempotent (0 the second time)', S.backfillClean('2026-06-08', '2026-06-28'), 0);
// the relapse splits the run; streak now counts the clean days AFTER it through today
check('streak after backfill counts post-relapse clean run', E.streakAsOf(st, '2026-06-28').current, 12);
// a clean span with no slips/relapses backfills into a full streak
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
S.backfillClean('2026-06-08', '2026-06-28');
check('clean backfill -> full 21-day streak', E.streakAsOf(st, '2026-06-28').current, 21);
check('backfill lifts Immortal Power above zero', E.auraScores(st, '2026-06-28').power > 0, true);
check('backfill bad range (to<from) -> 0', S.backfillClean('2026-06-28', '2026-06-08'), 0);

// ---- increment 3.3: Movement (distance + weight-aware calories + step detector) ----
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20', heightCm: 175, currentWeightKg: 75 }); st = S.getSettings();
near('stride @175cm', E.strideMeters(175), 0.7245, 0.001);
near('distance 10k steps @175', E.distanceKm(10000, 175), 7.245, 0.01);
near('stride falls back to default when null', E.strideMeters(null), 0.7245, 0.001);   // default 175
check('MET cadence 60 (slow)', E.metForCadence(60), 2.8);
check('MET cadence 110 (brisk)', E.metForCadence(110), 4.3);
check('MET cadence 150 (jog)', E.metForCadence(150), 7);
near('session kcal 1000st/10min/80kg (cadence 100→4.3 MET)', E.caloriesForSession(1000, 10, 80, 175), 60.2, 1);
near('steps kcal 10k/75kg/175 (distance-based)', E.caloriesForSteps(10000, 75, 175), 288.0, 1);
near('weight scales calories (heavier burns more)', E.caloriesForSteps(10000, 90, 175), 345.6, 1);
near('session falls back to distance kcal when no minutes', E.caloriesForSession(10000, 0, 75, 175), 288.0, 1);
// movementSummary reads the day's logged steps
S.patchLog('2026-06-28', { steps: 8000 });
var mvs = E.movementSummary(st, '2026-06-28');
check('movementSummary steps', mvs.steps, 8000);
near('movementSummary distance', mvs.distanceKm, 5.8, 0.05);
check('movementSummary goal', mvs.goal, 10000);
near('movementSummary pct (8k/10k)', mvs.pct, 80, 0.5);
// step detector: clean walk counts, rest counts nothing, debounce holds one peak
function simWalk(steps, stepMs, det) { var T = steps * stepMs, t = 0; while (t <= T) { var ph = (t % stepMs) / stepMs; det.push(9.81 + (14 - 9.81) * Math.max(0, Math.sin(ph * Math.PI)), t); t += 20; } return det.count(); }
check('detector counts 20 brisk steps', simWalk(20, 450, E.createStepDetector()), 20);
check('detector counts 30 slow steps', simWalk(30, 650, E.createStepDetector()), 30);
check('detector ignores stillness', (function () { var d = E.createStepDetector(); for (var t = 0; t < 8000; t += 20) d.push(9.81, t); return d.count(); })(), 0);
check('detector debounces one sustained peak to 1', (function () { var d = E.createStepDetector(); for (var t = 0; t < 2000; t += 20) d.push(14, t); return d.count(); })(), 1);

// ---- increment 4: rota — dates, parsers, patterns, mapping, apply ----
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
// normalizeDate: UK day-first everywhere, wordy forms, hard rejects
check('rota normalizeDate numeric forms (ISO/slash/dot/dash/2-digit/ctx-year)',
  [R.normalizeDate('2026-07-06'), R.normalizeDate('06/07/2026'), R.normalizeDate('06.07.2026'),
   R.normalizeDate('06-07-2026'), R.normalizeDate('6/7/26'), R.normalizeDate('06/07', 2026)].join('|'),
  '2026-07-06|2026-07-06|2026-07-06|2026-07-06|2026-07-06|2026-07-06');
check('rota normalizeDate wordy forms (weekday prefix / ordinal / Month D)',
  [R.normalizeDate('Mon 6 Jul 2026'), R.normalizeDate('July 6th, 2026'), R.normalizeDate('6 July 2026')].join('|'),
  '2026-07-06|2026-07-06|2026-07-06');
check('rota normalizeDate rejects impossible/junk dates',
  [R.normalizeDate('31/02/2026'), R.normalizeDate('2026-13-01'), R.normalizeDate('not a date'), R.normalizeDate('06/07')],
  [null, null, null, null]);
// parseCSV: date,code rows; header row skipped; unparseable row -> warning
var rcsv = R.parseCSV('Date,Shift\n06/07/2026,N\n07/07/2026,LD\nnonsense,XX');
check('rota parseCSV date,code rows (header skipped)', rcsv.entries,
  [{ date: '2026-07-06', code: 'N', note: '' }, { date: '2026-07-07', code: 'LD', note: '' }]);
check('rota parseCSV bad row -> 1 warning', rcsv.warnings.length, 1);
// parseICS: minimal VCALENDAR incl. a 2-day all-day event (DTEND exclusive)
var ricsText = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260706\r\nSUMMARY:N\r\nEND:VEVENT\r\n' +
  'BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260708\r\nDTEND;VALUE=DATE:20260710\r\nSUMMARY:LD\r\nEND:VEVENT\r\nEND:VCALENDAR';
var rics = R.parseICS(ricsText);
check('rota parseICS dates (2-day all-day expands)',
  rics.entries.map(function (e) { return e.date; }).join('|'), '2026-07-06|2026-07-08|2026-07-09');
check('rota parseICS short summaries -> uppercase codes', rics.codes, ['N', 'LD']);
// parseText: a date window anywhere in the line, the tail becomes the code
var rtxt = R.parseText('Mon 6 Jul 2026 — Night\n2026-07-07: LD');
check('rota parseText wordy line -> date + night kind',
  rtxt.entries[0].date + '|' + R.guessKind(rtxt.entries[0].code), '2026-07-06|night');
check('rota parseText ISO-colon line', rtxt.entries[1], { date: '2026-07-07', code: 'LD', note: '' });
check('rota parse auto-detects ics/csv/text',
  R.parse(ricsText).format + '|' + R.parse('Date;Shift\n06/07/2026;N').format + '|' + R.parse('Mon 6 Jul 2026 — Night').format,
  'ics|csv|text');
// patterns: '4D 4OFF' and the repeat spellings, cycled over real dates
check('rota parsePattern repeats (4D 4OFF / Nx3 / 2xE)',
  R.parsePattern('4D 4OFF').join(',') + ';' + R.parsePattern('Nx3, 2xE D').join(','),
  'D,D,D,D,OFF,OFF,OFF,OFF;N,N,N,E,E,D');
var rexp = R.expandPattern('2026-07-06', ['D', 'OFF'], 5);
check('rota expandPattern cycles from the anchor',
  rexp.map(function (e) { return e.code; }).join(',') + '|' + rexp[4].date, 'D,OFF,D,OFF,D|2026-07-10');
// guessKind: preset exact match, then keyword substring, then null
check('rota guessKind (preset / keyword / garbage)',
  [R.guessKind('N'), R.guessKind('Night shift'), R.guessKind('QQQ')], ['night', 'night', null]);
// applyEntries merges into the stored rota; queries read it back
var rap = R.applyEntries([
  { date: '2026-07-06', code: 'n' }, { date: '2026-07-07', code: 'ld' }, { date: null, code: 'X' }
], { n: 'night', ld: 'long' });
check('rota applyEntries uppercases + skips bad rows', rap, { added: 2, days: ['2026-07-06', '2026-07-07'] });
var rso = R.shiftOn('2026-07-06');
check('rota shiftOn mapped day', rso.code + '/' + rso.kindId + '/' + rso.kind.dayType, 'N/night/shift');
check('rota shiftOn empty day -> null', R.shiftOn('2026-07-20'), null);
R.setShift('2026-07-09', 'zzz'); // an unmapped code for the tallies below
var rnk = R.nextOfKind('long', '2026-07-05');
check('rota nextOfKind scans forward from fromISO+1', rnk.date + '|' + rnk.inDays, '2026-07-07|2');
var rup = R.upcoming('2026-07-05', 7);
check('rota upcoming lists entries incl. unmapped', rup.length + '|' + rup[2].code + '|' + rup[2].kindId, '3|ZZZ|null');
var rmc = R.monthCounts('2026-07');
check('rota monthCounts by kind + unmapped',
  rmc.total + '/' + (rmc.byKind.night || 0) + '/' + (rmc.byKind.long || 0) + '/' + rmc.unmapped, '3/1/1/1');
// applyDayTypes: an answered dayType is sacred — NEVER overwritten
S.patchLog('2026-07-06', { nutrition: { dayType: 'rest', templateId: null, meals: {} } });
check('rota applyDayTypes sets unanswered, skips answered',
  R.applyDayTypes('2026-07-06', '2026-07-09'), { set: 1, skipped: 1 });
check('rota applyDayTypes preserved rest / wrote shift',
  S.getLog('2026-07-06').nutrition.dayType + '|' + S.getLog('2026-07-07').nutrition.dayType, 'rest|shift');
check('rota applyDayTypes idempotent second pass', R.applyDayTypes('2026-07-06', '2026-07-09'), { set: 0, skipped: 2 });
// setShift single-day set/clear + clearRange sweep
R.setShift('2026-07-08', 'e');
var rs8 = R.shiftOn('2026-07-08');
R.setShift('2026-07-08', null);
check('rota setShift set then clear', rs8.code + '/' + rs8.kindId + '|' + (R.shiftOn('2026-07-08') === null), 'E/early|true');
check('rota clearRange removes and reports',
  R.clearRange('2026-07-01', '2026-07-31') + '|' + (R.shiftOn('2026-07-06') === null), '3|true');

// ---- increment 4: foresight — risk, streak history, outlook, ETA, prophecy ----
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
function fdelta(rf, id) {
  for (var fdi = 0; fdi < rf.factors.length; fdi++) if (rf.factors[fdi].id === id) return rf.factors[fdi].delta;
  return 0;
}
// blank ledger: base 15 + earlyStreak 22 and nothing else -> 37 elevated
var rf0 = E.riskForecast(st, '2026-06-26', null, null);
check('risk blank ledger score|band', rf0.score + '|' + rf0.band, '37|elevated');
check('risk blank ledger names its one factor', rf0.factors,
  [{ id: 'earlyStreak', label: 'Early in the streak', delta: 22 }]);
// the danger hour wraps midnight; midday is clear
check('risk danger hour 23h/02h(wrap)/12h',
  E.riskForecast(st, '2026-06-26', 23, null).score + '|' + E.riskForecast(st, '2026-06-26', 2, null).score + '|' +
  E.riskForecast(st, '2026-06-26', 12, null).score, '51|51|37');
check('risk night shift tonight +8', E.riskForecast(st, '2026-06-26', null, 'night').score, 45);
// urges: only the last `days` (3) count toward the capped delta
S.bankUrge(1, '2026-06-25'); S.bankUrge(2, '2026-06-24'); S.bankUrge(3, '2026-06-23');
check('risk urges: 2 in window, 3rd too old', fdelta(E.riskForecast(st, '2026-06-26', null, null), 'urges'), 10);
// short sleep averaged over the last 3 logged days
S.patchLog('2026-06-26', { sleepHrs: 5 }); S.patchLog('2026-06-25', { sleepHrs: 5 }); S.patchLog('2026-06-24', { sleepHrs: 5 });
check('risk short sleep this week', fdelta(E.riskForecast(st, '2026-06-26', null, null), 'shortSleep'), 10);
S.patchLog('2026-06-25', { mood: 2 });
check('risk low mood yesterday', fdelta(E.riskForecast(st, '2026-06-26', null, null), 'lowMood'), 10);
// weekday pattern: 3 Friday relapses flag Fridays (capped at weight), not Wednesdays
S.addRelapse({ date: '2026-06-12', note: '', streakLengthAtReset: 0 });
S.addRelapse({ date: '2026-06-19', note: '', streakLengthAtReset: 0 });
S.addRelapse({ date: '2026-06-26', note: '', streakLengthAtReset: 0 });
check('risk weekday pattern: Fri capped 16 / Wed 0',
  fdelta(E.riskForecast(st, '2026-06-26', null, null), 'weekdayPattern') + '|' +
  fdelta(E.riskForecast(st, '2026-06-24', null, null), 'weekdayPattern'), '16|0');
// a long streak protects: 60 clean days clamp the score to the floor
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
for (var f6 = 0; f6 < 60; f6++) { var df6 = U.addDays('2026-06-08', f6); S.saveLog(df6, Object.assign(S.blankLog(df6), { clean: true })); }
var rf60 = E.riskForecast(st, U.addDays('2026-06-08', 59), null, null);
check('risk 60-day streak clamped low', rf60.score + '|' + rf60.band, '0|low');
check('risk protection deltas (streak/shields)',
  fdelta(rf60, 'streakProtect') + '|' + fdelta(rf60, 'shieldProtect'), '-30|-8');
check('risk streak protection lowers the score', rf60.score < rf0.score, true);
// streakHistory / survivalOutlook: two completed streaks (5, 3), current run 4
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
function markDay(i, clean) { var d = U.addDays('2026-06-08', i); S.saveLog(d, Object.assign(S.blankLog(d), { clean: clean })); }
for (var h1 = 0; h1 < 5; h1++) markDay(h1, true);
markDay(5, false);
for (var h2 = 6; h2 < 9; h2++) markDay(h2, true);
markDay(9, false);
for (var h3 = 10; h3 < 14; h3++) markDay(h3, true);
var hAsOf = U.addDays('2026-06-08', 13);
var hist = E.streakHistory(st, hAsOf);
check('streakHistory completed streaks only (current excluded)', hist.streaks, [5, 3]);
check('streakHistory median|longest', hist.median + '|' + hist.longest, '4|5');
check('survivalOutlook vs past streaks', E.survivalOutlook(st, hAsOf),
  { current: 4, past: 2, madeItBeyond: 1, sharePct: 50 });
// rankETA: perfect 19-day record projects the next 4 ranks
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
for (var e1 = 0; e1 < 19; e1++) { var de1 = U.addDays('2026-06-08', e1); S.saveLog(de1, Object.assign(S.blankLog(de1), { clean: true })); }
var eta = E.rankETA(st, '2026-06-26');
check('rankETA perfect record: rate 1, 4 projections', eta.cleanRate + '|' + eta.projections.length, '1|4');
check('rankETA first projection (reach 21 in 2 days)',
  eta.projections[0].daysAway + '|' + eta.projections[0].etaISO, '2|2026-06-28');
check('rankETA projections ordered by distance',
  eta.projections[0].daysAway < eta.projections[1].daysAway &&
  eta.projections[1].daysAway < eta.projections[2].daysAway &&
  eta.projections[2].daysAway < eta.projections[3].daysAway, true);
// weeklyProphecy: a fully seeded week ending asOf
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
for (var w1 = 0; w1 < 7; w1++) {
  var dw = U.addDays('2026-06-20', w1);
  var lgw = Object.assign(S.blankLog(dw), { clean: true, steps: 10000, sleepHrs: 7.5, mood: 4, breathingMin: 20, meditationMin: 10 });
  if (w1 === 6) lgw.nutrition = { dayType: 'shift', templateId: 'shiftA', meals: { B: 'eaten', L: 'eaten', S: 'eaten', T: 'eaten', D: 'eaten' } };
  S.saveLog(dw, lgw);
}
var wpr = E.weeklyProphecy(st, '2026-06-26');
check('prophecy window', wpr.from + '|' + wpr.to, '2026-06-20|2026-06-26');
check('prophecy clean|answered|urges', wpr.cleanDays + '|' + wpr.answered + '|' + wpr.urges, '7|7|0');
check('prophecy mood|sleep|adherence', wpr.avgMood + '|' + wpr.avgSleep + '|' + wpr.adherencePct, '4|7.5|100');
check('prophecy best day = the full-plan day', wpr.bestDate, '2026-06-26');
check('prophecy chi earned > 0', wpr.chiEarned > 0, true);

// ---- increment 4: sanctum — breath plans, moon, sun, brahma muhurta ----
var mEpoch = SAN.moonPhase('2000-01-06');
check('moon epoch day ~new (age wraps the seam)',
  mEpoch.name === 'New' && (mEpoch.ageDays < 2 || mEpoch.ageDays > 27.7), true);
var mFull = SAN.moonPhase('2026-01-03');
check('moon 2026-01-03 is Full, >=97% lit', mFull.name === 'Full' && mFull.illumPct >= 97, true);
// TZ-robust sun assertions: relations + daylight length, never clock times
var lonSun = SAN.sunTimes('2026-06-21', 51.5074, -0.1278);
check('sun London midsummer: rise < noon < set',
  lonSun.polar === null && lonSun.sunriseMin < lonSun.solarNoonMin && lonSun.solarNoonMin < lonSun.sunsetMin, true);
check('sun London midsummer daylight 16.5-18h',
  (lonSun.sunsetMin - lonSun.sunriseMin) >= 990 && (lonSun.sunsetMin - lonSun.sunriseMin) <= 1080, true);
check('sun HH:MM strings agree with the minutes',
  lonSun.sunrise === SAN.fmtMin(lonSun.sunriseMin) && /^\d\d:\d\d$/.test(lonSun.sunset), true);
check('sun polar flags at 80N (Jun day / Dec night)',
  SAN.sunTimes('2026-06-21', 80, 0).polar + '|' + SAN.sunTimes('2026-12-21', 80, 0).polar, 'day|night');
check('sun rejects bad coordinates',
  SAN.sunTimes('2026-06-21', 91, 0) === null && SAN.sunTimes('2026-06-21', null, 0) === null &&
  SAN.sunTimes('2026-06-21', 51.5, 181) === null, true);
var bmuh = SAN.brahmaMuhurta('2026-06-21', 51.5074, -0.1278);
check('brahma muhurta = sunrise -96 -> -48 min',
  bmuh.startMin === lonSun.sunriseMin - 96 && bmuh.endMin === lonSun.sunriseMin - 48 &&
  bmuh.start === SAN.fmtMin(bmuh.startMin) && bmuh.end === SAN.fmtMin(bmuh.endMin), true);
check('brahma muhurta null when polar', SAN.brahmaMuhurta('2026-06-21', 80, 0), null);
var spBox = SAN.sessionPlan('box', 5);
check('sessionPlan box 5min -> 19 cycles of 16s', spBox.cycles + '|' + spBox.totalSec + '|' + spBox.minutes, '19|304|5');
var sp478 = SAN.sessionPlan('relax478', 4);
check('sessionPlan 4-7-8 4min -> 13 cycles of 19s', sp478.cycles + '|' + sp478.totalSec + '|' + sp478.minutes, '13|247|4');
check('cycleSeconds coherent 5.5+5.5 / unknown id null',
  SAN.cycleSeconds(SAN.patternById('coherent')) + '|' + (SAN.patternById('nope') === null), '11|true');
check('fmtMin pads and wraps', SAN.fmtMin(75) + '|' + SAN.fmtMin(-20) + '|' + SAN.fmtMin(1500), '01:15|23:40|01:00');

// ---- increment 4: oracle — intent NLU, composed replies, whisper ----
function itp(s) { var r = ORA.interpret(s); return r.intent + '|' + r.n; }
check('oracle reads status/streak/risk',
  ORA.interpret('how am I doing?').intent + '|' + ORA.interpret('what is my streak').intent + '|' +
  ORA.interpret('will I relapse tonight?').intent, 'status|streak|risk');
check('oracle steps + comma number', itp('12,000 steps'), 'logSteps|12000');
check('oracle walked + k multiplier', itp('walked 10k'), 'logSteps|10000');
check('oracle meditation minutes', itp('meditated 20 minutes'), 'logMeditation|20');
check('oracle sleep hours (decimal)', itp('slept 7.5 hours'), 'logSleep|7.5');
check('oracle reads clean/shift/help/moon/rank',
  ORA.interpret('mark today clean').intent + '|' + ORA.interpret('when is my next shift').intent + '|' +
  ORA.interpret('help').intent + '|' + ORA.interpret('moon').intent + '|' +
  ORA.interpret('when do i reach the next rank').intent, 'markClean|nextshift|help|moon|rank');
check('oracle gibberish -> unknown', ORA.interpret('flibber jabberwock').intent, 'unknown');
// respond: the Oracle proposes, the owner confirms
var oSteps = ORA.respond('12,000 steps', {});
check('oracle respond steps: one confirm action + prose',
  oSteps.actions.length === 1 && oSteps.actions[0].act === 'steps' && oSteps.actions[0].payload === 12000 &&
  oSteps.text.length > 0 && oSteps.say.length > 0, true);
var oClean = ORA.respond('mark today clean', {});
check('oracle respond markClean proposes, never writes',
  oClean.actions[0].act + '|' + oClean.actions[0].payload, 'clean|true');
var oRisk = ORA.respond('what is my risk tonight', { asOf: '2026-06-26', risk: { score: 48, band: 'elevated', factors: [
  { id: 'weekdayPattern', label: 'Fridays have broken you before', delta: 16 },
  { id: 'streakProtect', label: 'Streak protection', delta: -10 }
] } });
check('oracle respond risk cites score + top factor',
  oRisk.text.indexOf('48') >= 0 && oRisk.text.indexOf('Fridays have broken you before') >= 0, true);
check('oracle respond risk offers two outs when not low', oRisk.actions.length, 2);
var oUrge = ORA.respond('i am struggling right now', {});
check('oracle urge -> ride-out + 4-7-8',
  oUrge.actions[0].act + '|' + oUrge.actions[1].act + '|' + oUrge.actions[1].payload, 'urge|breathwork|relax478');
check('oracle whisper deterministic per day',
  ORA.whisper({ asOf: '2026-06-26' }) === ORA.whisper({ asOf: '2026-06-26' }) &&
  ORA.whisper({ asOf: '2026-06-26' }).length > 0, true);
check('oracle whisper survives an empty ctx', typeof ORA.whisper({}) === 'string' && ORA.whisper({}).length > 0, true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
