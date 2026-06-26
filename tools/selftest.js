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
['config.js', 'util.js', 'store.js', 'engine.js', 'photos.js'].forEach(function (f) {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(root, f), 'utf8'));
});

var S = global.RTI_STORE, E = global.RTI_ENGINE, U = global.RTI_UTIL, P = global.RTI_PHOTO;
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

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
