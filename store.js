/* =====================================================================
   Road to Immortal — STORE (local-only persistence)
   ---------------------------------------------------------------------
   All data stays on the device. localStorage holds settings, daily logs,
   relapse events and urge-resisted timestamps. Nothing is ever sent
   anywhere. Daily logs for ~500 days are tiny, so localStorage is used
   instead of IndexedDB for simplicity (well under quota).

   SINGLE SOURCE OF TRUTH: the owner only edits startDate/targetDate and
   raw daily logs. Day number, rank, streak, % and every meter are
   DERIVED in engine.js and never written here.
   ===================================================================== */
(function (global) {
  'use strict';
  var U = global.RTI_UTIL, CFG = global.RTI_CONFIG;

  var K = {
    settings: 'rti_settings_v1',
    logs:     'rti_logs_v1',
    relapses: 'rti_relapses_v1',
    urges:    'rti_urges_v1',   // [{ ts: epochMs, date: 'YYYY-MM-DD' }]
    meta:     'rti_meta_v1',    // { lastSeenRankIndex, lastExportISO, prereg, ... }
    rota:     'rti_rota_v1',    // { shifts: {date: 'CODE'}, codeMap: {CODE: kindId}, role }
    sync:     'rti_sync_v1',    // cloud-sync config (incl. token) — DEVICE-LOCAL,
                                //   deliberately NOT part of the export bundle
    mentor:   'rti_mentor_v1',  // last pulled mentor/insights.json (device-local)
    goals:    'rti_goals_v1',   // { goals: [...] } — ambitions/milestones/tasks (increment 7)
    templates:'rti_templates_v1',// pulled PRIVATE template registry (device-local,
                                //   never in the export — content stays out of git)
    nicotine: 'rti_nicotine_v1',// { enabled, quitDateISO, patchStartISO, ... } (increment 15)
    cravings: 'rti_cravings_v1' // [{ ts, date, rode }] — nicotine cravings. SEPARATE
                                //   from urges ON PURPOSE: cravings must never touch
                                //   the streak / Chi / Willpower economy
  };
  var SCHEMA = 1;

  /* In-memory cache of the parsed blobs. The engine replays history by
     calling getLog()/relapseOnDate() per day; without this every call
     re-parsed the ENTIRE logs object — O(day²) per replay, a real wall by
     day 500. Every write goes through write(), which keeps the cache the
     single live copy, so cache and storage can never drift. */
  var MEM = {};

  function read(key, fallback) {
    if (Object.prototype.hasOwnProperty.call(MEM, key)) return MEM[key];
    try {
      var raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      var val = JSON.parse(raw);
      MEM[key] = val;
      return val;
    } catch (e) { return fallback; }
  }
  function write(key, val) {
    MEM[key] = val; // memory stays current even if the disk write fails below
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) {
      // quota / private-mode failure: the app must SAY so, not swallow it —
      // app.js installs onWriteError to surface a warning to the owner.
      try { if (api.onWriteError) api.onWriteError(key, e); } catch (e2) {}
      return false;
    }
  }

  /* ---------------- Settings ---------------- */
  function defaultSettings() {
    return {
      startDate: CFG.defaultStartDate,
      targetDate: CFG.defaultTargetDate,
      displayName: '',
      heightCm: null,
      currentWeightKg: null,
      sex: null,             // 'male' | 'female' | null — body-fat estimate only
      birthYear: null,       // age is derived per read, never stored
      goalWeightKg: null,    // phase goal for The Vessel; CFG.body default applies when null
      baseline: null,        // { dateISO, weightKg, fatPct } — the owner's machine scan,
                             //   written ONLY on explicit save in Settings
      dailyTargets: CFG.dailyTargets.slice(),
      lastNutritionTemplate: null,
      mealOverrides: {},     // { templateId: { mealKey: { kcal, protein } } } — owner edits
      reducedMotion: false,  // user toggle; OS preference also respected
      latitude: null,        // sacred location — used ONLY on this device for
      longitude: null,       //   sunrise & Brahma Muhurta; never sent anywhere
      oracleVoice: false     // speak Oracle replies aloud (speechSynthesis)
    };
  }
  function getSettings() {
    var s = read(K.settings, null);
    if (!s) { s = defaultSettings(); write(K.settings, s); }
    // merge any newly-added default keys
    var d = defaultSettings(), out = {};
    for (var k in d) out[k] = (s[k] === undefined ? d[k] : s[k]);
    return out;
  }
  function setSettings(patch) {
    var s = getSettings();
    for (var k in patch) s[k] = patch[k];
    write(K.settings, s);
    return s;
  }

  /* ---------------- Daily logs ---------------- */
  function blankLog(date) {
    return {
      date: date,
      clean: null,            // null = not answered yet; true/false once set
      meditationMin: 0,
      breathingMin: 0,
      steps: 0,
      stepsAuto: null,        // phone hardware counter total for the day —
                              //   written ONLY by sync pullSteps (increment 11),
                              //   never by hand; engine reads max(steps, stepsAuto)
      kcalBurned: 0,
      fatPct: null,
      weightKg: null,         // morning weigh-in; null = not weighed (never 0)
      sleepHrs: null,
      workout: null,          // { type, notes } or null
      cardio: null,           // { type, minutes, notes } or null
      nutrition: null,        // section 6C object (see below)
      urgeIntensity: null,    // 1-5
      mood: null,             // 1-5
      todayTargetsDone: [],   // booleans matching settings.dailyTargets
      targetsTotal: null,     // how many targets EXISTED when this day was logged
                              //   (stamped on save; lets the owner edit the list
                              //   later without retro-corrupting old days)
      notes: '',
      study: null,            // section 6 object
      trial: null,            // { id, done } once a manual daily-trial is attempted (id guards stale days)
      goalTasks: null         // { taskId: true } — ambition tasks done this day (increment 7)
    };
  }
  function getLogs() { return read(K.logs, {}); }
  function getLog(date) {
    var logs = getLogs();
    return logs[date] ? logs[date] : blankLog(date);
  }
  function saveLog(date, log) {
    var logs = getLogs();
    log.date = date;
    logs[date] = log;
    write(K.logs, logs);
    return log;
  }
  function patchLog(date, patch) {
    var log = getLog(date);
    for (var k in patch) log[k] = patch[k];
    return saveLog(date, log);
  }
  // Backfill: mark every UNLOGGED day in [fromISO..toISO] as clean. Honest by
  // construction — it never overwrites a day already answered (clean true/false)
  // or any relapse day. For recording a streak you lived before logging daily.
  // Returns the number of days newly marked clean.
  function backfillClean(fromISO, toISO) {
    if (!fromISO || !toISO || U.daysBetween(fromISO, toISO) < 0) return 0;
    var span = U.daysBetween(fromISO, toISO), count = 0;
    for (var i = 0; i <= span; i++) {
      var date = U.addDays(fromISO, i), log = getLog(date);
      if (log.clean == null && !relapseOnDate(date)) { patchLog(date, { clean: true }); count++; }
    }
    return count;
  }

  // logs sorted ascending by date, only those with any data
  function logsArray() {
    var logs = getLogs(), arr = [];
    for (var d in logs) arr.push(logs[d]);
    arr.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return arr;
  }

  /* ---------------- Relapse events ---------------- */
  function getRelapses() { return read(K.relapses, []); }
  function addRelapse(ev) {
    var list = getRelapses();
    list.push(ev);
    write(K.relapses, list);
    return list;
  }
  function relapseOnDate(date) {
    return getRelapses().some(function (r) { return r.date === date; });
  }

  /* ---------------- Urge-resisted events ---------------- */
  function getUrges() { return read(K.urges, []); }
  function bankUrge(tsMs, dateISO) {
    var list = getUrges();
    list.push({ ts: tsMs, date: dateISO });
    write(K.urges, list);
    return list;
  }
  function urgesOnDate(date) {
    return getUrges().filter(function (u) { return u.date === date; }).length;
  }

  /* ---------------- Rota (increment 4 — shift calendar) ---------------- */
  // shifts:  { 'YYYY-MM-DD': 'CODE' } — raw rota codes, stored uppercase
  // codeMap: { 'CODE': 'kindId' }    — what each code means (CFG.rota.kinds)
  // role:    preset id (CFG.rota.rolePresets) or null
  function defaultRota() {
    return { shifts: {}, codeMap: {}, role: null };
  }
  function getRota() {
    var r = read(K.rota, null);
    if (!r) { r = defaultRota(); write(K.rota, r); }
    // merge any newly-added default keys (same idiom as getSettings)
    var d = defaultRota(), out = {};
    for (var k in d) out[k] = (r[k] === undefined ? d[k] : r[k]);
    return out;
  }
  function setRota(patch) {
    var r = getRota();
    for (var k in patch) r[k] = patch[k];
    write(K.rota, r);
    return r;
  }

  /* ---------------- Sync config (increment 6 — device-local) ---------------- */
  function defaultSync() {
    return {
      token: '',            // fine-grained PAT, Contents RW on the ONE data repo
      owner: '',            // GitHub username
      repo: 'rti-data',     // the PRIVATE data repo
      branch: 'main',
      auto: true,           // push on open/hide/online when the ledger changed
      lastSyncISO: null, lastStatus: null,
      lastStepsISO: null,   // when the phone counter's steps.json last changed a log
      lastRemoteSha: null,  // sha of backup.json as LAST WRITTEN BY THIS DEVICE
      lastPushedHash: null, // bundle hash at last push (change detection)
      remoteForeign: false  // cloud copy differs from what we wrote — owner decides
    };
  }
  function getSync() {
    var r = read(K.sync, null);
    if (!r) { r = defaultSync(); write(K.sync, r); }
    var d = defaultSync(), out = {};
    for (var k in d) out[k] = (r[k] === undefined ? d[k] : r[k]);
    return out;
  }
  function setSync(patch) {
    var r = getSync();
    for (var k in patch) r[k] = patch[k];
    write(K.sync, r);
    return r;
  }

  /* ---------------- Mentor counsel (pulled from the cloud, read-only) ---------------- */
  function getMentor() { return read(K.mentor, null); }
  function setMentor(obj) { write(K.mentor, obj); return obj; }

  /* ---------------- Template registry (increment 9 — pulled, device-local) ---------------- */
  function getTemplates() { return read(K.templates, null); }
  function setTemplates(obj) { write(K.templates, obj); return obj; }

  /* ---------------- Goals (increment 7 — ambitions, IN the export bundle) ---------------- */
  function defaultGoals() { return { goals: [] }; }
  function getGoals() {
    var g = read(K.goals, null);
    if (!g || !Array.isArray(g.goals)) { g = defaultGoals(); write(K.goals, g); }
    return g;
  }
  function setGoals(obj) {
    write(K.goals, obj && Array.isArray(obj.goals) ? obj : defaultGoals());
    return getGoals();
  }

  /* ---------------- Nicotine (increment 15 — The Unchaining) ---------------- */
  function defaultNicotine() {
    return {
      enabled: false,
      quitDateISO: null,          // last pouch day + 1 / patch day 1
      patchStartISO: null,        // usually == quitDateISO
      product: '',                // e.g. 'Velo nicotine pouches (3-dot)'
      usesPerDayBaseline: null,   // pouches/day before quitting — owner enters
      costPerDay: null,           // owner enters; moneySaved stays null until then
      patchPlan: null             // [{mg, days}] — null -> CFG.nicotine.patchPlan
    };
  }
  function getNicotine() {
    var r = read(K.nicotine, null);
    if (!r) { r = defaultNicotine(); write(K.nicotine, r); }
    var d = defaultNicotine(), out = {};
    for (var k in d) out[k] = (r[k] === undefined ? d[k] : r[k]);
    return out;
  }
  function setNicotine(patch) {
    var r = getNicotine();
    for (var k in patch) r[k] = patch[k];
    write(K.nicotine, r);
    return r;
  }
  function getCravings() { return read(K.cravings, []); }
  function bankCraving(tsMs, dateISO, rode) {
    var list = getCravings();
    list.push({ ts: tsMs, date: dateISO, rode: rode !== false });
    write(K.cravings, list);
    return list;
  }

  /* ---------------- Meta (app bookkeeping, not "truth") ---------------- */
  function getMeta() {
    return read(K.meta, { lastSeenRankIndex: -1, lastExportISO: null, prereg: '', preregLocked: false });
  }
  function setMeta(patch) {
    var m = getMeta();
    for (var k in patch) m[k] = patch[k];
    write(K.meta, m);
    return m;
  }

  /* ---------------- Export / Import (section 11) ---------------- */
  function exportBundle() {
    return {
      app: 'road-to-immortal',
      schema: SCHEMA,
      exportedAt: new Date().toISOString(),
      settings: getSettings(),
      logs: getLogs(),
      relapses: getRelapses(),
      urges: getUrges(),
      meta: getMeta(),
      rota: getRota(),
      goals: getGoals(),
      nicotine: getNicotine(),
      cravings: getCravings()
    };
  }
  // a real, non-null, non-array object (typeof null === 'object' is the trap)
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  // returns { ok, error } — overwrites all local data on success. The current
  // state is snapshotted first and restored if any write fails part-way, so a
  // bad or oversized backup can never leave a half-replaced store.
  function importBundle(obj) {
    if (!obj || obj.app !== 'road-to-immortal') return { ok: false, error: 'Not a Road to Immortal backup file.' };
    if (!isObj(obj.settings) || !isObj(obj.logs)) return { ok: false, error: 'Backup is missing core data.' };
    if (obj.schema != null && +obj.schema > SCHEMA)
      return { ok: false, error: 'This backup is from a newer version of the app (schema ' + obj.schema + '). Update the app first, then import.' };
    var prev = exportBundle();
    try { localStorage.setItem('rti_pre_import_backup', JSON.stringify(prev)); } catch (e) {}
    var ok = write(K.settings, obj.settings);
    ok = write(K.logs, obj.logs) && ok;
    ok = write(K.relapses, Array.isArray(obj.relapses) ? obj.relapses : []) && ok;
    ok = write(K.urges, Array.isArray(obj.urges) ? obj.urges : []) && ok;
    ok = write(K.meta, isObj(obj.meta) ? obj.meta : prev.meta) && ok;
    // rota / goals / nicotine / cravings are optional so older backups never fail to import
    ok = write(K.rota, isObj(obj.rota) ? obj.rota : defaultRota()) && ok;
    ok = write(K.goals, isObj(obj.goals) && Array.isArray(obj.goals.goals) ? obj.goals : defaultGoals()) && ok;
    ok = write(K.nicotine, isObj(obj.nicotine) ? obj.nicotine : defaultNicotine()) && ok;
    ok = write(K.cravings, Array.isArray(obj.cravings) ? obj.cravings : []) && ok;
    if (!ok) {
      write(K.settings, prev.settings); write(K.logs, prev.logs);
      write(K.relapses, prev.relapses); write(K.urges, prev.urges);
      write(K.meta, prev.meta); write(K.rota, prev.rota); write(K.goals, prev.goals);
      write(K.nicotine, prev.nicotine); write(K.cravings, prev.cravings);
      return { ok: false, error: 'Import failed part-way (storage full?). Your previous data was restored.' };
    }
    return { ok: true };
  }

  function wipeAll() {
    for (var k in K) localStorage.removeItem(K[k]);
    MEM = {};
  }

  var api = {
    SCHEMA: SCHEMA,
    onWriteError: null, // app.js sets this; called (key, err) when a persist fails
    getSettings: getSettings, setSettings: setSettings, defaultSettings: defaultSettings,
    blankLog: blankLog, getLog: getLog, getLogs: getLogs, saveLog: saveLog,
    patchLog: patchLog, logsArray: logsArray, backfillClean: backfillClean,
    getRelapses: getRelapses, addRelapse: addRelapse, relapseOnDate: relapseOnDate,
    getUrges: getUrges, bankUrge: bankUrge, urgesOnDate: urgesOnDate,
    getMeta: getMeta, setMeta: setMeta,
    defaultRota: defaultRota, getRota: getRota, setRota: setRota,
    defaultSync: defaultSync, getSync: getSync, setSync: setSync,
    getMentor: getMentor, setMentor: setMentor,
    getTemplates: getTemplates, setTemplates: setTemplates,
    defaultGoals: defaultGoals, getGoals: getGoals, setGoals: setGoals,
    defaultNicotine: defaultNicotine, getNicotine: getNicotine, setNicotine: setNicotine,
    getCravings: getCravings, bankCraving: bankCraving,
    exportBundle: exportBundle, importBundle: importBundle, wipeAll: wipeAll
  };
  global.RTI_STORE = api;
})(typeof window !== 'undefined' ? window : this);
