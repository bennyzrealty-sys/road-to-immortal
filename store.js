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
    rota:     'rti_rota_v1'     // { shifts: {date: 'CODE'}, codeMap: {CODE: kindId}, role }
  };
  var SCHEMA = 1;

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  /* ---------------- Settings ---------------- */
  function defaultSettings() {
    return {
      startDate: CFG.defaultStartDate,
      targetDate: CFG.defaultTargetDate,
      displayName: '',
      heightCm: null,
      currentWeightKg: null,
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
      kcalBurned: 0,
      fatPct: null,
      sleepHrs: null,
      workout: null,          // { type, notes } or null
      cardio: null,           // { type, minutes, notes } or null
      nutrition: null,        // section 6C object (see below)
      urgeIntensity: null,    // 1-5
      mood: null,             // 1-5
      todayTargetsDone: [],   // booleans matching settings.dailyTargets
      notes: '',
      study: null,            // section 6 object
      trial: null             // { id, done } once a manual daily-trial is attempted (id guards stale days)
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
      rota: getRota()
    };
  }
  // returns { ok, error } — overwrites all local data on success.
  function importBundle(obj) {
    if (!obj || obj.app !== 'road-to-immortal') return { ok: false, error: 'Not a Road to Immortal backup file.' };
    if (typeof obj.settings !== 'object' || typeof obj.logs !== 'object') return { ok: false, error: 'Backup is missing core data.' };
    write(K.settings, obj.settings);
    write(K.logs, obj.logs);
    write(K.relapses, Array.isArray(obj.relapses) ? obj.relapses : []);
    write(K.urges, Array.isArray(obj.urges) ? obj.urges : []);
    write(K.meta, obj.meta && typeof obj.meta === 'object' ? obj.meta : getMeta());
    // rota is optional so older backups (pre-increment-4) never fail to import
    write(K.rota, obj.rota && typeof obj.rota === 'object' ? obj.rota : defaultRota());
    return { ok: true };
  }

  function wipeAll() {
    for (var k in K) localStorage.removeItem(K[k]);
  }

  global.RTI_STORE = {
    SCHEMA: SCHEMA,
    getSettings: getSettings, setSettings: setSettings, defaultSettings: defaultSettings,
    blankLog: blankLog, getLog: getLog, getLogs: getLogs, saveLog: saveLog,
    patchLog: patchLog, logsArray: logsArray, backfillClean: backfillClean,
    getRelapses: getRelapses, addRelapse: addRelapse, relapseOnDate: relapseOnDate,
    getUrges: getUrges, bankUrge: bankUrge, urgesOnDate: urgesOnDate,
    getMeta: getMeta, setMeta: setMeta,
    defaultRota: defaultRota, getRota: getRota, setRota: setRota,
    exportBundle: exportBundle, importBundle: importBundle, wipeAll: wipeAll
  };
})(typeof window !== 'undefined' ? window : this);
