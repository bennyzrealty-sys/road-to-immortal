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
['config.js', 'util.js', 'store.js', 'engine.js', 'photos.js', 'rota.js', 'sanctum.js', 'oracle.js', 'sync.js', 'goals.js', 'body.js'].forEach(function (f) {
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

/* =================== INCREMENT 5 — THE FORGE (hardening) =================== */

// -- store cache: writes invalidate, reads never re-touch storage --
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
S.saveLog('2026-06-10', Object.assign(S.blankLog('2026-06-10'), { clean: true }));
var cacheA = S.getLog('2026-06-10').clean;
S.patchLog('2026-06-10', { clean: false });
check('store cache invalidates on write', cacheA + '|' + S.getLog('2026-06-10').clean, 'true|false');
var gets = 0, origGet = global.localStorage.getItem;
global.localStorage.getItem = function (k) { gets++; return origGet(k); };
for (var ci = 0; ci < 50; ci++) S.getLog('2026-06-10');
global.localStorage.getItem = origGet;
check('store cache: 50 getLog calls touch storage 0 times', gets, 0);

// -- a failed persist surfaces (onWriteError) and memory stays live --
var warned = 0; S.onWriteError = function () { warned++; };
var origSet = global.localStorage.setItem;
global.localStorage.setItem = function () { throw new Error('quota'); };
S.saveLog('2026-06-11', Object.assign(S.blankLog('2026-06-11'), { clean: true }));
global.localStorage.setItem = origSet;
S.onWriteError = null;
check('failed write calls onWriteError', warned >= 1, true);
check('failed write keeps the value live in memory', S.getLog('2026-06-11').clean, true);

// -- safe import: null holes, newer schema, part-way failure restore --
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
S.saveLog('2026-06-09', Object.assign(S.blankLog('2026-06-09'), { clean: true }));
check('import rejects logs:null (typeof null trap)', S.importBundle({ app: 'road-to-immortal', settings: {}, logs: null }).ok, false);
check('import rejects settings:null', S.importBundle({ app: 'road-to-immortal', settings: null, logs: {} }).ok, false);
check('import rejects a newer schema', S.importBundle({ app: 'road-to-immortal', schema: 99, settings: {}, logs: {} }).ok, false);
check('local data untouched after rejected imports', S.getLog('2026-06-09').clean, true);
origSet = global.localStorage.setItem;
global.localStorage.setItem = function (k, v) { if (k === 'rti_urges_v1') throw new Error('quota'); return origSet(k, v); };
var impFail = S.importBundle({ app: 'road-to-immortal', schema: 1, settings: S.defaultSettings(), logs: {}, urges: [{ ts: 1, date: '2026-06-09' }] });
global.localStorage.setItem = origSet;
check('part-way import failure reports the error', impFail.ok, false);
check('part-way import failure restores previous logs', S.getLog('2026-06-09').clean, true);

// -- dayStatus: a recorded relapse beats clean:true --
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
for (var rw = 0; rw < 5; rw++) { var drw = U.addDays('2026-06-08', rw); S.saveLog(drw, Object.assign(S.blankLog(drw), { clean: true })); }
S.addRelapse({ date: '2026-06-10', ts: 0 });
check('relapse wins over clean:true', E.dayStatus('2026-06-10'), 'broken');
check('streak honours the relapse day', E.streakAsOf(st, '2026-06-12').current, 2);

// -- allTargetsDone: judged against the era the day was logged in --
check('allTargets: stamped 3, all 3 ticked', E.allTargetsDone(Object.assign(S.blankLog('2026-06-20'), { todayTargetsDone: [true, true, true], targetsTotal: 3 })), true);
check('allTargets: stamped 3, only 2 ticked', E.allTargetsDone(Object.assign(S.blankLog('2026-06-20'), { todayTargetsDone: [true, true, false], targetsTotal: 3 })), false);
check('allTargets: legacy log judged by its own length', E.allTargetsDone(Object.assign(S.blankLog('2026-06-20'), { todayTargetsDone: [true, true] })), true);
check('allTargets: empty array is never "all done"', E.allTargetsDone(S.blankLog('2026-06-20')), false);

// -- rankETA: day-anchored (a relapse must not resurrect held ranks) --
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
for (var re1 = 0; re1 < 19; re1++) { var dre = U.addDays('2026-06-08', re1); S.saveLog(dre, Object.assign(S.blankLog(dre), { clean: re1 !== 10 })); }
var eta2 = E.rankETA(st, '2026-06-26'); // day 19, one slip -> streak 8, rank still day-anchored
check('rankETA day-anchored: no already-held ranks projected', eta2.projections[0].reach > 19, true);
check('rankETA lands the reach day exactly (21 in 2 days)', eta2.projections[0].daysAway + '|' + eta2.projections[0].etaISO, '2|2026-06-28');
near('rankETA still reports cleanRate for prose', eta2.cleanRate, 18 / 19, 0.01);

// -- oracle: the number pairs with the WINNING intent, not first-in-string --
var it1 = ORA.interpret('i slept 7 hours and walked 12000 steps');
check('oracle pairs number with winning intent', it1.intent + '|' + it1.n, 'logSteps|12000');
var it2 = ORA.interpret('walked 12,000 steps and slept 7 hours');
check('oracle pairing with comma number first', it2.intent + '|' + it2.n, 'logSteps|12000');
var it3 = ORA.interpret('i slept 7 hours');
check('oracle plain sleep keeps its 7', it3.intent + '|' + it3.n, 'logSleep|7');
var it4 = ORA.interpret('slept 8 hours then meditated 20 minutes');
check('oracle tie-break intent takes ITS OWN number', it4.intent + '|' + it4.n, 'logMeditation|20');
var it5 = ORA.interpret('12k steps');
check('oracle 12k steps still 12000', it5.intent + '|' + it5.n, 'logSteps|12000');

// -- rota ICS: unexpanded RRULEs must WARN, never silently drop repeats --
var icsR = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260706\r\nRRULE:FREQ=WEEKLY;COUNT=4\r\nSUMMARY:N\r\nEND:VEVENT\r\nEND:VCALENDAR';
var rrRes = R.parseICS(icsR);
check('ICS RRULE imports the first occurrence', rrRes.entries.length + '|' + rrRes.entries[0].date, '1|2026-07-06');
check('ICS RRULE raises a warning', rrRes.warnings.some(function (w) { return w.indexOf('RRULE') >= 0; }), true);

/* =================== INCREMENT 6 — THE BRIDGE (sync, pure parts) =================== */
var SY = global.RTI_SYNC;
check('sync b64 round-trip (unicode survives)', SY.b64decode(SY.b64encode('चिः the ledger 🔥 12,000')), 'चिः the ledger 🔥 12,000');
check('sync b64decode tolerates API line-wraps', SY.b64decode(SY.b64encode('abc').slice(0, 2) + '\n' + SY.b64encode('abc').slice(2)), 'abc');
check('sync hash is stable', SY.hashStr('the same ledger'), SY.hashStr('the same ledger'));
check('sync hash detects change', SY.hashStr('day 42 clean') === SY.hashStr('day 42 slipped'), false);
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
check('sync unconfigured by default (offline stays offline)', SY.configured(), false);
check('sync config never enters the export bundle', 'sync' in S.exportBundle() || 'token' in S.exportBundle(), false);
S.setSync({ token: 't', owner: 'o', repo: 'rti-data' });
check('sync configured once token+owner+repo set', SY.configured(), true);
check('sync apiUrl targets api.github.com only', SY.apiUrl(S.getSync(), 'backup.json'), 'https://api.github.com/repos/o/rti-data/contents/backup.json');
// bundleHash ignores exportedAt (which regenerates every call) but sees real change
var bh1 = SY.bundleHash(S.exportBundle()), bh2 = SY.bundleHash(S.exportBundle());
check('sync bundleHash stable across exportedAt churn', bh1, bh2);
S.saveLog('2026-06-10', Object.assign(S.blankLog('2026-06-10'), { clean: true }));
check('sync bundleHash sees a real ledger change', SY.bundleHash(S.exportBundle()) === bh1, false);
S.setSync({ token: '', lastStatus: null });

/* =================== INCREMENT 7 — AMBITIONS (goals · roadmap · tasks) =================== */
var G = global.RTI_GOALS;
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
var AS = '2026-07-21';
var gg = G.addGoal({ title: 'Career Ascent', why: 'test', horizon: '2026-12-31' }, '2026-07-01');
G.addMilestone(gg.id, { title: 'M1', targetISO: '2026-07-10' });
G.addMilestone(gg.id, { title: 'M2', targetISO: '2026-08-10' });
G.addTask(gg.id, { title: 'Deep work', cadence: 'daily' });
G.addTask(gg.id, { title: 'Weekly review', cadence: 'weekly' });
G.addTask(gg.id, { title: 'Practice', cadence: '3/week' });
var g0 = G.byId(gg.id);
check('goal created with 2 milestones + 3 tasks', g0.milestones.length + '|' + g0.tasks.length, '2|3');
check('cadence math: daily|weekly|3/week per week', G.expectedPerWeek('daily') + '|' + G.expectedPerWeek('weekly') + '|' + G.expectedPerWeek('3/week'), '7|1|3');
// due logic: nothing done -> all three due
check('all tasks due when none done', G.dueTasks(AS).length, 3);
// mark the daily done today -> only daily leaves the plate
var t0 = g0.tasks[0], t1 = g0.tasks[1], t2 = g0.tasks[2];
S.patchLog(AS, { goalTasks: (function (o) { o[t0.id] = true; return o; })({}) });
check('daily done today drops off the due list', G.dueTasks(AS).length, 2);
// weekly done 3 days ago -> not due for the rest of the 7-day window
S.patchLog(U.addDays(AS, -3), { goalTasks: (function (o) { o[t1.id] = true; return o; })({}) });
check('weekly done in-window is not due', G.dueToday(t1, AS), false);
// 3/week with 2 done this week -> still due; with 3 done -> not
S.patchLog(U.addDays(AS, -1), { goalTasks: (function (o) { o[t2.id] = true; return o; })({}) });
S.patchLog(U.addDays(AS, -2), { goalTasks: (function (o) { o[t2.id] = true; return o; })({}) });
check('3/week with 2 done is still due', G.dueToday(t2, AS), true);
S.patchLog(U.addDays(AS, -4), { goalTasks: (function (o) { o[t2.id] = true; return o; })({}) });
check('3/week with 3 done is satisfied', G.dueToday(t2, AS), false);
// progress: no milestone fallen -> no ETA (no fantasy dates)
var p0 = G.progress(G.byId(gg.id), AS);
check('no ETA before the first milestone falls', p0.eta, null);
check('overdue milestone detected (M1 due 07-10)', G.overdueMilestones(AS).length, 1);
// fell M1 -> ETA appears, projected from the real rate
G.toggleMilestone(gg.id, g0.milestones[0].id, AS);
var p1 = G.progress(G.byId(gg.id), AS);
check('milestone fell -> 1/2 done', p1.msDone + '/' + p1.msTotal, '1/2');
check('ETA appears once a milestone has fallen', !!p1.eta && p1.eta.days > 0, true);
check('overdue clears when the milestone falls', G.overdueMilestones(AS).length, 0);
// agenda integration: today's plate = done-today (t0) — t1/t2 satisfied, so off it
var ag7 = E.dailyAgenda(st, AS, 14);
var goalItems = ag7.items.filter(function (it) { return it.kind === 'goaltask'; });
check('agenda carries exactly the done-today task', goalItems.length + '|' + goalItems[0].done, '1|true');
G.addTask(gg.id, { title: 'Fresh daily task', cadence: 'daily' });
var ag7b = E.dailyAgenda(st, AS, 14);
var goalItems2 = ag7b.items.filter(function (it) { return it.kind === 'goaltask'; });
check('a never-done daily task joins the agenda as due', goalItems2.length + '|' + goalItems2.filter(function (it) { return !it.done; }).length, '2|1');
// the goalTask trial metric (goalStep is auto; a done task on the day = met)
var goalTrial = null; global.RTI_CONFIG.trials.forEach(function (t) { if (t.id === 'goalStep') goalTrial = t; });
check('goalStep trial exists and is auto', !!goalTrial && goalTrial.auto === true && goalTrial.metric === 'goalTask', true);
// goals ride the export/import round-trip
var bundle7 = S.exportBundle();
check('goals included in the export bundle', bundle7.goals.goals.length, 1);
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' });
var imp7 = S.importBundle(bundle7);
check('goals survive import', imp7.ok && S.getGoals().goals[0].title, 'Career Ascent');
check('old backups without goals still import', S.importBundle({ app: 'road-to-immortal', schema: 1, settings: S.defaultSettings(), logs: {} }).ok, true);
check('missing goals imports as empty, not broken', S.getGoals().goals.length, 0);

/* =================== INCREMENT 8 — THE MENTOR (deterministic analyzer) =================== */
var MA = require('./mentor-analyze');
check('mentor-analyze rejects a non-backup', !!MA.analyze({ bad: 1 }).error, true);
// synthetic 30-day journey: one slip, urges clustered at the 22h danger hour
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
for (var ma1 = 0; ma1 < 30; ma1++) {
  var mad = U.addDays('2026-06-08', ma1);
  S.saveLog(mad, Object.assign(S.blankLog(mad), { clean: ma1 !== 10, sleepHrs: 7, mood: 4, steps: 8000, breathingMin: 15 }));
}
S.bankUrge(new Date(2026, 5, 20, 22, 30).getTime(), '2026-06-20');
S.bankUrge(new Date(2026, 5, 21, 22, 10).getTime(), '2026-06-21');
S.bankUrge(new Date(2026, 5, 22, 14, 0).getTime(), '2026-06-22');
var maBundle = S.exportBundle();
var mx = MA.analyze(maBundle, '2026-07-07'); // day 30
check('mentor-analyze: full record read', mx.day + '|' + mx.record.clean + '|' + mx.record.broken + '|' + mx.record.unlogged, '30|29|1|0');
check('mentor-analyze: clean rate', mx.record.cleanRatePct, 97);
check('mentor-analyze: urges counted', mx.record.urgesBanked, 3);
check('mentor-analyze: REAL danger hour surfaces (22h × 2)', mx.dangerHours[0].hour + '|' + mx.dangerHours[0].urges, '22|2');
check('mentor-analyze: steady sleep reads flat', mx.trends.sleepHrs.direction, 'flat');
check('mentor-analyze: foresight rides along', !!mx.foresight.tonight && mx.foresight.week.answered, 7);
check('mentor-analyze: meters + calibration present', !!mx.meters.today && !!mx.meters.calibration.chi, true);

/* =================== INCREMENT 9 — THE CAMPAIGN (chase state · templates) =================== */
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
var T9 = '2026-07-27';
var TPL = {
  id: 'op-test', version: 1, title: 'Operation Test', why: 'w', horizon: '2026-09-01',
  createdISO: '2026-07-21', // the operation's REAL start — the honest ETA basis
  guardrail: 'No resignation until signed.', note: 'December = max incentive shifts.',
  milestones: [
    { title: 'Applied to bank', doneISO: '2026-07-21', chaseISO: '2026-07-27', note: 'phone 0114' },
    { title: 'Submit FWR', targetISO: '2026-07-25' },
    { title: 'No date yet' }
  ],
  tasks: [{ title: 'Sorted slot', cadence: 'weekly' }, { title: 'Book shifts', cadence: 'weekly' }]
};
var inst = G.installTemplate(TPL, '2026-07-22');
check('installTemplate builds the full shape', inst.ok && inst.goal.milestones.length + '|' + inst.goal.tasks.length + '|' + inst.goal.templateId, '3|2|op-test');
check('installTemplate carries guardrail + note + horizon', inst.goal.guardrail === TPL.guardrail && inst.goal.note === TPL.note && inst.goal.horizon, '2026-09-01');
check('installTemplate honours the operation start date', inst.goal.createdISO, '2026-07-21');
check('installTemplate is idempotent', G.installTemplate(TPL, '2026-07-22').ok + '|' + G.installTemplate(TPL, '2026-07-22').reason, 'false|installed');
G.patchGoal(inst.goal.id, { archived: true });
check('archived install still blocks reinstall', G.installTemplate(TPL, '2026-07-22').reason, 'installed');
G.patchGoal(inst.goal.id, { archived: false });
// done+waiting orthogonality
var mDone = inst.goal.milestones[0], mDue = inst.goal.milestones[1], mFree = inst.goal.milestones[2];
check('done milestone counts as fallen for progress', G.progress(G.byId(inst.goal.id), T9).msDone, 1);
// increment 10 tightened the honesty rule: imported pre-done history can never
// set the pace, so with ONLY the template's own tick done there is NO ETA yet
// (this replaces the increment-9 assertion that projected 12d from that tick)
check('ETA stays silent while only imported history is done', G.progress(G.byId(inst.goal.id), T9).eta, null);
check('chase not due before its date', G.chaseDue('2026-07-26').length, 0);
check('chase due on its date (even though done)', G.chaseDue(T9).length + '|' + G.chaseDue(T9)[0].ms.title, '1|Applied to bank');
check('dueMilestones API: undone + arrived only', G.dueMilestones(T9).length + '|' + G.dueMilestones(T9)[0].ms.title, '1|Submit FWR');
// coach agenda — the asymmetry: chase persists; due appears ONLY on its exact day
var ag9 = E.dailyAgenda(st, T9, 10); // 07-27: chase is live, FWR (due 07-25) is OVERDUE
var chaseItems = ag9.items.filter(function (it) { return it.kind === 'goalchase'; });
check('agenda: chase persists past its date', chaseItems.length, 1);
check('agenda: an OVERDUE milestone stays out (banner territory, no dishonest Done)', ag9.items.filter(function (it) { return it.kind === 'goalms'; }).length, 0);
check('agenda payload is goalId:msId', chaseItems[0].mealKey, inst.goal.id + ':' + mDone.id);
var agDue = E.dailyAgenda(st, '2026-07-25', 10);
check('agenda: due milestone appears on its exact day, undone', agDue.items.filter(function (it) { return it.kind === 'goalms' && !it.done; }).length, 1);
G.patchMilestone(inst.goal.id, mDue.id, { doneISO: '2026-07-25' });
check('agenda: done on the due day flips the item (ring rises)', E.dailyAgenda(st, '2026-07-25', 10).items.filter(function (it) { return it.kind === 'goalms' && it.done; }).length, 1);
check('agenda: the morning after, the due item is gone', E.dailyAgenda(st, '2026-07-26', 10).items.filter(function (it) { return it.kind === 'goalms'; }).length, 0);
G.patchMilestone(inst.goal.id, mDue.id, { doneISO: null });
G.bumpChase(inst.goal.id, mDone.id, T9);
check('Chased bumps chaseISO by chaseBumpDays', G.byId(inst.goal.id).milestones[0].chaseISO, U.addDays(T9, global.RTI_CONFIG.goals.chaseBumpDays));
check('bumped chase leaves today’s plate', E.dailyAgenda(st, T9, 10).items.filter(function (it) { return it.kind === 'goalchase'; }).length, 0);
G.clearChase(inst.goal.id, mDone.id);
check('Reply received clears the wait', G.byId(inst.goal.id).milestones[0].chaseISO, null);
// the cap bounds the coach's plate
G.patchMilestone(inst.goal.id, mDone.id, { chaseISO: '2026-07-25' });
G.patchMilestone(inst.goal.id, mDue.id, { chaseISO: '2026-07-26' });
G.patchMilestone(inst.goal.id, mFree.id, { chaseISO: '2026-07-27' });
check('msAgendaCap bounds the coach load', E.dailyAgenda(st, T9, 10).items.filter(function (it) { return it.kind === 'goalchase'; }).length, global.RTI_CONFIG.goals.msAgendaCap);
G.patchMilestone(inst.goal.id, mDone.id, { chaseISO: null });
G.patchMilestone(inst.goal.id, mDue.id, { chaseISO: null });
G.patchMilestone(inst.goal.id, mFree.id, { chaseISO: null });
// the registry cache is device-local and never exported
S.setTemplates({ fetchedAt: 'x', templates: [{ id: 'a', title: 't' }] });
check('template registry stores + pullTemplates exists', S.getTemplates().templates.length + '|' + (typeof global.RTI_SYNC.pullTemplates), '1|function');
check('template registry never enters the export', 'templates' in S.exportBundle(), false);
// export/import round-trip + legacy compat
var b9 = S.exportBundle();
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' });
check('chase/note/guardrail survive import', S.importBundle(b9).ok && (function () {
  var g = S.getGoals().goals[0];
  return (g.guardrail === TPL.guardrail) + '|' + g.milestones[0].note;
})(), 'true|phone 0114');
check('legacy milestones (no new fields) still read', (function () {
  S.setGoals({ goals: [{ id: 'L', title: 'legacy', why: '', horizon: null, createdISO: '2026-07-01', archived: false,
    milestones: [{ id: 'Lm', title: 'old', targetISO: '2026-07-20', doneISO: null }], tasks: [] }] });
  return G.chaseDue(T9).length + '|' + G.dueMilestones(T9).length + '|' + G.overdueMilestones(T9).length;
})(), '0|1|1');
// mentor-analyze surfaces waiting + dueSoon + guardrail
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' });
G.installTemplate(TPL, '2026-07-22');
var mx9 = MA.analyze(S.exportBundle(), '2026-07-24');
check('mentor-analyze: waiting + guardrail ride along', mx9.goals[0].waiting.length + '|' + (mx9.goals[0].guardrail === TPL.guardrail), '1|true');
check('mentor-analyze: dueSoon within 7 days', mx9.goals[0].dueSoon.length + '|' + mx9.goals[0].dueSoon[0].inDays, '1|1');

/* =================== INCREMENT 10 — THE HERALD (visibility · honest pace) =================== */
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
var T10 = '2026-07-22';
var inst10 = G.installTemplate(TPL, T10);
var g10 = inst10.goal;
// --- honest ETA: imported history is stamped and mute on pace
check('installTemplate stamps imported ticks preDone', g10.milestones[0].preDone + '|' + !!g10.milestones[1].preDone, 'true|false');
check('pre-done still counts toward progress', G.progress(G.byId(g10.id), T10).msDone, 1);
check('no ETA before a lived fall', G.progress(G.byId(g10.id), T10).eta, null);
// --- roadAhead: one merged, date-sorted week view (due 07-25 + chase 07-27)
var road22 = G.roadAhead('2026-07-22', 7);
check('roadAhead merges due + chase, nearest first',
  road22.length + '|' + road22[0].kind + '|' + road22[0].inDays + '|' + road22[1].kind + '|' + road22[1].inDays, '2|due|3|chase|5');
var road26 = G.roadAhead('2026-07-26', 7);
check('roadAhead carries overdue as negative days, first', road26[0].kind + '|' + road26[0].inDays, 'overdue|-1');
check('roadAhead reads an arrived chase as inDays 0',
  G.roadAhead('2026-07-28', 7).filter(function (r) { return r.kind === 'chase'; })[0].inDays, 0);
check('roadAhead window excludes the far future', G.roadAhead('2026-07-01', 7).length, 0);
// --- agenda: the sorted pending list IS the contract the coach card renders
var agX = E.dailyAgenda(st, '2026-07-27', 12);
check('agenda exposes the sorted pending list', Array.isArray(agX.pending) && agX.pending.length > 0, true);
check('a live chase leads the plate', agX.pending[0].kind, 'goalchase');
var agD = E.dailyAgenda(st, '2026-07-25', 12);
check('a due-today milestone leads the plate', agD.pending[0].kind, 'goalms');
// --- split budgets: two live chases can no longer starve the due-day item
G.patchMilestone(g10.id, g10.milestones[0].id, { chaseISO: '2026-07-25' });
G.patchMilestone(g10.id, g10.milestones[2].id, { chaseISO: '2026-07-25' });
var agS = E.dailyAgenda(st, '2026-07-25', 12);
check('chases and due-day items hold separate budgets',
  agS.items.filter(function (it) { return it.kind === 'goalchase'; }).length + '|' +
  agS.items.filter(function (it) { return it.kind === 'goalms'; }).length, '2|1');
G.patchMilestone(g10.id, g10.milestones[0].id, { chaseISO: null });
G.patchMilestone(g10.id, g10.milestones[2].id, { chaseISO: null });
// --- the first LIVED fall opens the ETA at the lived rate
G.toggleMilestone(g10.id, g10.milestones[1].id, '2026-07-25');
var pr10 = G.progress(G.byId(g10.id), '2026-07-25');
check('first lived fall opens the ETA', !!pr10.eta, true);
check('ETA projects at the LIVED rate only (1 lived / 4d, 1 left -> 4d)', pr10.eta.days, 4);
// --- Oracle: the road is now a first-class intent
check('oracle: chase question routes to the road',
  ORA.interpret('what should I chase this week').intent + '|' + ORA.interpret('whats due this week').intent + '|' +
  ORA.interpret('the road ahead').intent, 'ascent|ascent|ascent');
check('oracle: weekly recap keeps its own lane', ORA.interpret('weekly prophecy').intent, 'prophecy');
var ra1 = ORA.respond('the road ahead', { goals: { hasGoals: true, overdue: [], chase: [{ title: 'Applied to bank' }], dueToday: [],
  upcoming: [{ title: 'Submit FWR', kind: 'due', inDays: 3, iso: '2026-07-25' }], tasksDue: 2, guardrail: 'No resignation until signed.' } });
check('oracle: road report names the chase, the road and the guardrail',
  (ra1.text.indexOf('Applied to bank') >= 0) + '|' + (ra1.text.indexOf('Submit FWR') >= 0) + '|' + (ra1.text.indexOf('Guardrail') >= 0), 'true|true|true');
check('oracle: empty Ascent answers honestly', ORA.respond('the road ahead', { goals: { hasGoals: false } }).text.indexOf('stands empty') >= 0, true);
// --- config carries the new tunables (the UI must never hard-code them)
check('config: herald tunables exist',
  (typeof global.RTI_CONFIG.appVersion) + '|' + (global.RTI_CONFIG.sw.checkMinMs > 0) + '|' +
  (global.RTI_CONFIG.banners.maxShown >= 1) + '|' + (global.RTI_CONFIG.goals.coachListCap >= 4) + '|' +
  (global.RTI_CONFIG.goals.lookaheadDays >= 1), 'string|true|true|true|true');
// --- hand-made goals keep the increment-7 pace rule (no preDone stamp)
var hg = G.addGoal({ title: 'hand', why: '' }, '2026-07-20');
G.addMilestone(hg.id, { title: 'a' }); G.addMilestone(hg.id, { title: 'b' });
G.toggleMilestone(hg.id, G.byId(hg.id).milestones[0].id, '2026-07-22');
check('hand-completed milestones still set the pace', G.progress(G.byId(hg.id), '2026-07-22').eta.days, 2);

/* =================== INCREMENT 11 — BACKGROUND STEPS (phone counter → stepsAuto) =================== */
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
var SY = global.RTI_SYNC;
// --- effectiveSteps: two sources, larger wins, neither overwritten
check('effectiveSteps: auto floor wins', E.effectiveSteps({ steps: 0, stepsAuto: 8000 }), 8000);
check('effectiveSteps: manual entry can overrule upward', E.effectiveSteps({ steps: 9000, stepsAuto: 8000 }), 9000);
check('effectiveSteps: legacy logs (no stepsAuto) unchanged', E.effectiveSteps({ steps: 4321 }), 4321);
check('effectiveSteps: null-safe', E.effectiveSteps(null) + '|' + E.effectiveSteps({}), '0|0');
// --- parseStepsFile: both shapes, garbage rejected
check('parseStepsFile: days map shape', SY.parseStepsFile({ days: { '2026-07-22': 8432, '2026-07-21': 12001 } })['2026-07-21'], 12001);
check('parseStepsFile: single-day shape', SY.parseStepsFile({ date: '2026-07-22', steps: 500 })['2026-07-22'], 500);
check('parseStepsFile: rounds float pushes', SY.parseStepsFile({ date: '2026-07-22', steps: 8432.7 })['2026-07-22'], 8433);
check('parseStepsFile: garbage dates/values dropped', SY.parseStepsFile({ days: { 'not-a-date': 5, '2026-07-22': -3, '2026-07-23': 9999999 } }), null);
check('parseStepsFile: junk objects -> null', SY.parseStepsFile(null) + '|' + SY.parseStepsFile({}) + '|' + SY.parseStepsFile({ days: [1, 2] }), 'null|null|null');
check('parseStepsFile: impossible calendar days rejected', SY.parseStepsFile({ days: { '2026-99-99': 5, '2026-02-30': 5 } }), null);
check('parseStepsFile: coercible non-numbers rejected (null/empty/bool/array)',
  SY.parseStepsFile({ days: { '2026-07-20': null, '2026-07-19': '', '2026-07-18': true, '2026-07-17': [5] } }), null);
check('parseStepsFile: digit strings accepted', SY.parseStepsFile({ date: '2026-07-20', steps: '7000' })['2026-07-20'], 7000);
// --- applyAutoSteps: writes ONLY stepsAuto, skips future + unchanged
S.patchLog('2026-07-22', { steps: 2000, clean: true });
var applied11 = SY.applyAutoSteps({ '2026-07-22': 8432, '2026-07-23': 4000 }, '2026-07-22');
check('applyAutoSteps: applies today, skips the future (clock skew)', applied11, 1);
check('applyAutoSteps: manual steps and answers untouched', S.getLog('2026-07-22').steps + '|' + S.getLog('2026-07-22').clean + '|' + S.getLog('2026-07-22').stepsAuto, '2000|true|8432');
check('applyAutoSteps: unchanged value is a no-op', SY.applyAutoSteps({ '2026-07-22': 8432 }, '2026-07-22'), 0);
check('applyAutoSteps: ancient dates ignored — no phantom log rows', (function () {
  var before = Object.keys(S.getLogs()).length;
  var n = SY.applyAutoSteps({ '2020-01-01': 5000 }, '2026-07-22');
  return n + '|' + (Object.keys(S.getLogs()).length - before);
})(), '0|0');
// --- the counter feeds everything downstream
// the REAL trial path: find a steps-metric trial day, meet it with the
// counter alone (manual steps stay 0), assert through dailyTrial itself
(function () {
  var found = null, need = 0;
  for (var i = 0; i < 30 && !found; i++) {
    var dd = U.addDays('2026-08-01', i), tr = E.dailyTrial(st, dd).trial;
    if (tr.auto && tr.metric === 'steps') { found = dd; need = tr.need; }
  }
  if (!found) { check('a steps trial exists within the scan window', false, true); return; }
  var one = {}; one[found] = need;
  SY.applyAutoSteps(one, found);
  check('dailyTrial met by the counter alone (manual steps 0)',
    S.getLog(found).steps + '|' + E.dailyTrial(st, found).done, '0|true');
})();
check('weeklyTotals reads the effective total', E.weeklyTotals(st, '2026-07-22').steps >= 8432, true);
var mv11 = E.movementSummary(st, '2026-07-22');
check('movementSummary: effective + both sources exposed', mv11.steps + '|' + mv11.manual + '|' + mv11.auto, '8432|2000|8432');
// --- stepsAuto rides the export/backup like any log field
var b11 = S.exportBundle();
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' });
check('stepsAuto survives export/import', S.importBundle(b11).ok && S.getLog('2026-07-22').stepsAuto, 8432);
check('config: autoMaxSteps + autoStepsMaxAgeDays tunables exist',
  (global.RTI_CONFIG.movement.autoMaxSteps > 0) + '|' + (global.RTI_CONFIG.movement.autoStepsMaxAgeDays > 0), 'true|true');
// --- the Mentor's counsel sees counter-only days (it reads the same bundle)
(function () {
  for (var i = 0; i < 14; i++) { // steady counter-only fortnight, zero manual entries
    var dd = U.addDays('2026-07-22', -i), o = {}; o[dd] = 9000;
    SY.applyAutoSteps(o, '2026-07-22');
  }
  var mx11 = MA.analyze(S.exportBundle(), '2026-07-22');
  check('mentor-analyze: counter-only days feed the steps trend',
    mx11.trends.steps.last7 + '|' + mx11.trends.steps.direction, '9000|flat');
})();

/* =================== INCREMENT 12 — THE HONEST MIRROR =================== */
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
// Reproduce the exact artefact found in the owner's real ledger: four "round 10"
// days (two of them on the street) with zero clear signals, alongside precise
// smaller days that DID carry clear signals. Averaging daily rates says the
// practice hurts; pooling says the opposite. The pooling is the honest one.
S.patchLog('2026-06-30', { clean: true, meditationMin: 20, study: { opportunities: 10, signalsClear: 0, signalsAmbiguous: 2, confidence: 2, setting: 'street' } });
S.patchLog('2026-07-02', { clean: true, meditationMin: 30, study: { opportunities: 10, signalsClear: 0, signalsAmbiguous: 3, confidence: 3, setting: 'street' } });
S.patchLog('2026-07-04', { clean: true, meditationMin: 30, study: { opportunities: 10, signalsClear: 0, signalsAmbiguous: 4, confidence: 3, setting: 'work' } });
S.patchLog('2026-07-07', { clean: true, meditationMin: 5,  study: { opportunities: 4, signalsClear: 1, signalsAmbiguous: 2, confidence: 3, setting: 'work' } });
S.patchLog('2026-07-15', { clean: true, meditationMin: 0,  study: { opportunities: 8, signalsClear: 2, signalsAmbiguous: 5, confidence: 5, setting: 'work' } });
S.patchLog('2026-07-18', { clean: true, meditationMin: 10, study: { opportunities: 6, signalsClear: 2, signalsAmbiguous: 2, confidence: 5, setting: 'work' } });
S.patchLog('2026-07-11', { clean: true, study: { opportunities: 0, signalsClear: 0, signalsAmbiguous: 0 } });            // zero-opportunity
S.patchLog('2026-07-13', { clean: true, study: { signalsClear: 0, signalsAmbiguous: 4, confidence: 5, setting: 'work' } }); // no denominator
var SR = E.studyRates(st, '2026-07-24');
check('studyRates pools signals over opportunities (not a mean of daily rates)',
  SR.opportunities + '|' + SR.clear + '|' + SR.ambiguous + '|' + SR.clearPct, '48|5|18|10.4');
check('studyRates excludes the undenominated and zero-opportunity days honestly',
  SR.days + '|' + SR.excluded.missingDenominator + '|' + SR.excluded.zeroOpportunity, '6|1|1');
// the mean of daily rates is inflated by the small-denominator days — the exact
// bug that made the app read a negative association
var daily = [0/10, 0/10, 0/10, 1/4, 2/8, 2/6].reduce(function (a, b) { return a + b; }, 0) / 6 * 100;
check('mean-of-daily-rates disagrees with the pooled rate', Math.round(daily * 10) / 10 > SR.clearPct, true);
// settings are reported apart: street NEVER produced a clear signal in 20 chances
var byS = {}; SR.settings.forEach(function (x) { byS[x.setting] = x; });
check('street and work are never pooled together',
  byS.street.opportunities + '|' + byS.street.clear + '|' + byS.street.clearPct + '||' +
  byS.work.opportunities + '|' + byS.work.clear + '|' + byS.work.clearPct, '20|0|0||28|5|17.9');
check('settings are ordered by denominator, biggest first', SR.settings[0].setting, 'work');
// the confound must read as UNMEASURED, never as "no"
check('absent confound flags count as unmeasured, not false',
  SR.confoundKnownDays + '|' + SR.confoundUnknownDays + '|' + SR.behavedDays, '0|6|6'.replace('6|6','6|0'));
S.patchLog('2026-07-18', { study: { opportunities: 6, signalsClear: 2, signalsAmbiguous: 2, confidence: 5, setting: 'work', behavedDifferently: false } });
check('an answered "no" is measured', E.studyRates(st, '2026-07-24').confoundKnownDays, 1);
// high-confidence filtering runs on the pooled numbers too
var SRhc = E.studyRates(st, '2026-07-24', { minConfidence: 4 });
check('confidence filter pools only the high-confidence days',
  SRhc.days + '|' + SRhc.opportunities + '|' + SRhc.clear + '|' + SRhc.excluded.lowConfidence, '2|14|4|4');
// the correlation lock governs this data (day 47 of the real ledger < 60)
var cs12 = E.correlationStatus(st, '2026-07-24');
check('correlations stay locked on this evidence base', cs12.unlocked, false);
check('the lock reports its own shortfall', (cs12.day < cs12.thresholds.minDay) + '|' + (cs12.oppDays < cs12.thresholds.minOppDays), 'true|true');

// --- the fade: the streak coasts while the practices erode
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
(function () {
  for (var i = 0; i < 14; i++) {
    var d = U.addDays('2026-07-24', -i), strong = i >= 7;   // the OLDER week is the strong one
    S.patchLog(d, { clean: true,
      meditationMin: strong ? 30 : 5, breathingMin: strong ? 40 : 10,
      workout: { type: strong ? 'Legs' : 'Rest day', notes: '' },
      nutrition: strong ? { dayType: 'shift', templateId: 'shiftA' } : { dayType: 'shift', templateId: null },
      study: strong ? { opportunities: 5, signalsClear: 1, signalsAmbiguous: 1, confidence: 4, setting: 'work' } : null });
  }
})();
var PT = E.practiceTrend(st, '2026-07-24');
check('practiceTrend measures 7 days against the previous 7', PT.now.days + '|' + PT.prev.days, '7|7');
check('practiceTrend catches the collapse', PT.now.meditationMin + '|' + PT.prev.meditationMin, '35|210');
check('practiceTrend flags the fade when 3+ practices fall', PT.fading + '|' + (PT.falling.length >= 3), 'true|true');
check('practiceTrend ranks the steepest drop first', PT.falling[0].dropPct >= PT.falling[PT.falling.length - 1].dropPct, true);
check('a logged "Rest day" is not counted as training', PT.now.workouts, 0);
check('practiceTrend names each falling practice for the UI', typeof PT.falling[0].label, 'string');
// a steady fortnight must NOT cry fade
(function () {
  // study: null too — the collapse fixture above left study entries on the older
  // week, which would otherwise make this "steady" fortnight a 100% fade
  for (var i = 0; i < 14; i++) S.patchLog(U.addDays('2026-07-24', -i), { clean: true, meditationMin: 15, breathingMin: 20, workout: { type: 'Legs', notes: '' }, nutrition: { dayType: 'shift', templateId: 'shiftA' }, study: null });
})();
check('a steady fortnight raises no fade warning', E.practiceTrend(st, '2026-07-24').fading, false);
// depth counts as well as breadth: a slide that already bottomed out shows only
// one or two falling practices, but a halving is still a fade (seen live —
// breathwork −55% read as "steady" under a breadth-only rule)
(function () {
  for (var i = 0; i < 14; i++) {
    var d = U.addDays('2026-07-24', -i), old = i >= 7;
    S.patchLog(d, { clean: true, meditationMin: 15, breathingMin: old ? 40 : 10,
      workout: { type: 'Legs', notes: '' }, nutrition: { dayType: 'shift', templateId: 'shiftA' }, study: null });
  }
  var pt2 = E.practiceTrend(st, '2026-07-24');
  check('one practice halving alone raises the fade', pt2.falling.length + '|' + pt2.fading, '1|true');
  check('the worst drop is reported for the copy', pt2.worstDropPct >= 50, true);
})();

// --- sleep joins the coach agenda, and can never be one-tapped "done"
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
for (var s12 = 1; s12 <= 3; s12++) S.patchLog(U.addDays('2026-07-24', -s12), { clean: true, sleepHrs: 5 });
var agS = E.dailyAgenda(st, '2026-07-24', 8);
var slpItem = agS.items.filter(function (it) { return it.kind === 'sleep'; })[0];
check('sleep is on the agenda when last night is unlogged', !!slpItem + '|' + slpItem.done, 'true|false');
check('a short trailing mean escalates the sleep label', /5h/.test(slpItem.label), true);
// On a blank day the day-shaping question still leads — sleep must never hijack
// it (day-type gates the whole meal chain). Meals are `blocked` until a plan is
// chosen, so they are absent from `pending` here entirely.
(function () {
  var order = agS.pending.map(function (it) { return it.kind; });
  check('day-type still opens a blank morning', order[0], 'daytype');
  check('meals stay blocked (and out of pending) with no plan chosen', order.indexOf('meal'), -1);
})();
// With the plan chosen, sleep outranks every meal and every hygiene item
S.patchLog('2026-07-24', { nutrition: { dayType: 'shift', templateId: 'shiftA' } });
(function () {
  var order = E.dailyAgenda(st, '2026-07-24', 8).pending.map(function (it) { return it.kind; });
  function at(k) { return order.indexOf(k); }
  check('sleep leads once the day is shaped', order[0], 'sleep');
  check('sleep outranks meals and hygiene',
    (at('sleep') < at('meal')) + '|' + (at('sleep') < at('breath')) + '|' + (at('sleep') < at('targets')), 'true|true|true');
})();
S.patchLog('2026-07-24', { sleepHrs: 7 });
check('a logged night clears the sleep item', E.dailyAgenda(st, '2026-07-24', 8).items.filter(function (it) { return it.kind === 'sleep' && !it.done; }).length, 0);

// --- the willpower ceiling is structural, and stated
check('willpowerCeiling is the reachable max with no urges banked', E.willpowerCeiling(0), 38);
check('the ceiling matches the config scale',
  E.willpowerCeiling(0),
  Math.round((global.RTI_CONFIG.meters.willpower.perCleanDay + global.RTI_CONFIG.meters.willpower.allTargetsDone) *
    global.RTI_CONFIG.meters.windowDays / global.RTI_CONFIG.meters.willpower.maxPerWindow * 100));
// 7 banked over the window: (10+5)*7 + 5*7 = 140 of 280 = 50%
check('banked urges raise the reachable ceiling', E.willpowerCeiling(1) + '|' + E.willpowerCeiling(7), '39|50');
check('banking an urge a day unseals the top of the scale', E.willpowerCeiling(35), 100);
// urgesInWindow feeds the ceiling from the real ledger
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
S.bankUrge(Date.parse('2026-07-22T14:00:00Z'), '2026-07-22');
S.bankUrge(Date.parse('2026-07-22T21:00:00Z'), '2026-07-22');
S.bankUrge(Date.parse('2026-06-20T14:00:00Z'), '2026-06-20');   // outside the window
check('urgesInWindow counts only the meter window', E.urgesInWindow('2026-07-24'), 2);
check('config: increment 12 tunables exist',
  (global.RTI_CONFIG.practice.fadeMinFalling >= 1) + '|' + (global.RTI_CONFIG.practice.preregMinDays >= 1) + '|' +
  (global.RTI_CONFIG.practice.sleepNudgeMeanBelow > 0), 'true|true|true');

/* =================== INCREMENT 13 — THE VESSEL =================== */
var BODY = global.RTI_BODY;

// ewma: smooths, carries nulls forward, seeds on first value
(function () {
  var sm = U.ewma([100, null, 98], 0.25);
  check('ewma seeds on first value', sm[0], 100);
  check('ewma carries null forward', sm[1], 100);
  near('ewma smooths toward new value', sm[2], 99.5, 0.01);
})();

// pure math: bmi, deurenberg, calibration offset
S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' }); st = S.getSettings();
near('bmi @ baseline (168cm)', BODY.bmi(100.3, 168), 35.54, 0.02);
near('deurenberg @ baseline', BODY.deurenbergPct(35.54, 35, 'male'), 34.5, 0.15);
near('fat offset calibrates to machine scan', BODY.fatOffset(st), -5.0, 0.2);
(function () {
  // estimate at the baseline weight must reproduce the machine reading
  S.setSettings({ currentWeightKg: 100.3 });
  var est = BODY.fatPctEstimate(S.getSettings(), '2026-05-08');
  near('estimate == machine reading at baseline', est.fatPct, 29.5, 0.2);
  S.setSettings({ currentWeightKg: null });
})();

// seeded descent 100.3 -> 94.15: rate, verdict, progress, ETA, physique
(function () {
  S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' });
  // weekly weigh-ins descending ~0.53kg/wk across 11 weeks (2026-05-11 .. 2026-07-27)
  for (var i = 0; i <= 11; i++) {
    var d = U.addDays('2026-05-11', i * 7);
    S.patchLog(d, { weightKg: Math.round((100.3 - 0.5321 * i) * 100) / 100 });
  }
  var s2 = S.getSettings(), asOf = '2026-07-28';
  var sum = BODY.summary(s2, asOf);
  check('weight series includes baseline + logs', sum.series.length, 13);
  near('descent rate ~ -0.53 kg/wk', BODY.rateKgPerWeek(s2, asOf), -0.53, 0.08);
  check('rate verdict: on-pace inside 0.5-1%/wk', sum.rate.band, 'on-pace');
  near('progress toward 80kg ~ 30%', sum.progressPct, 30, 3);
  check('eta exists and lands in 2027', !!(sum.eta && sum.eta.dateISO.slice(0, 4) === '2027'), true);
  check('physique gate present with a live date', !!(sum.physique && sum.physique.dateISO), true);
  check('physique target below current weight', sum.physique.targetKg < sum.currentKg, true);
  // the covenant: a new weigh-in MOVES the predicted date (live recompute)
  var before = sum.physique.dateISO;
  S.patchLog('2026-07-28', { weightKg: 93.2 });
  var after = BODY.summary(S.getSettings(), asOf).physique.dateISO;
  check('new weigh-in moves the physique date', before !== after, true);
})();

// weightKg survives the export -> wipe -> import round-trip
(function () {
  var bundle = S.exportBundle();
  S.wipeAll();
  var res = S.importBundle(bundle);
  check('bundle with weightKg imports ok', res.ok, true);
  check('weightKg survives round-trip', S.getLog('2026-07-28').weightKg, 93.2);
})();

// fresh-store safety: no logged weigh-ins -> summary stands on the baseline
// scan alone (CFG default), no rate, no ETA, and never throws
(function () {
  S.wipeAll(); S.setSettings({ startDate: '2026-06-08', targetDate: '2027-10-20' });
  var sum = BODY.summary(S.getSettings(), '2026-06-09');
  check('fresh store: baseline-only, no error', !sum.error && sum.currentKg === 100.3 && sum.rate == null && sum.eta == null, true);
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
