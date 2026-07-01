/* =====================================================================
   Road to Immortal — SANCTUM (breath plans, mala math, cosmic clock)
   ---------------------------------------------------------------------
   Pure math + plan helpers for the Sanctum screen: pranayama session
   planning, moon phase, NOAA sunrise/sunset and the Brahma Muhurta
   window. Everything is computed on-device from a date + coordinates —
   no network, no DOM, fully testable in Node. Uses U + CFG only.
   ===================================================================== */
(function (global) {
  'use strict';
  var U = global.RTI_UTIL, CFG = global.RTI_CONFIG;

  var DAY_MS = 86400000;          // one day of milliseconds
  var RAD = Math.PI / 180;        // degrees → radians

  /* ---------- tiny guards ---------- */
  // CFG.sanctum may not exist yet while the config agent works — every
  // reader goes through here so a missing section degrades to null,
  // never a throw.
  function sanctumCfg() {
    return (CFG && CFG.sanctum) ? CFG.sanctum : null;
  }

  // Coerce a coordinate-ish value to a number or null. Rejects
  // null/undefined/'' (settings default is null), NaN and out-of-range
  // magnitudes. Every sun function validates through this.
  function coord(v, max) {
    if (v == null || v === '') return null;
    var n = +v;
    if (isNaN(n) || Math.abs(n) > max) return null;
    return n;
  }

  /* ---------- time formatting ---------- */
  // 'HH:MM' from minutes-after-midnight. Rounds to whole minutes and
  // wraps into 0–1439, so −20 → '23:40' and 1500 → '01:00'.
  function fmtMin(min) {
    if (min == null || isNaN(min)) return null;
    var m = Math.round(min);
    m = ((m % 1440) + 1440) % 1440;              // safe modulo for negatives
    var h = Math.floor(m / 60), mm = m % 60;
    return (h < 10 ? '0' : '') + h + ':' + (mm < 10 ? '0' : '') + mm;
  }

  /* ---------- pranayama patterns ---------- */
  // Look up a breath pattern by id. Null when unknown or CFG.sanctum
  // hasn't landed yet.
  function patternById(id) {
    var sc = sanctumCfg();
    if (!sc || !sc.patterns || id == null) return null;
    for (var i = 0; i < sc.patterns.length; i++) {
      if (sc.patterns[i].id === id) return sc.patterns[i];
    }
    return null;
  }

  // Seconds in one full cycle of a pattern (sum of its phase durations).
  function cycleSeconds(pattern) {
    if (!pattern || !pattern.phases || !pattern.phases.length) return 0;
    var total = 0;
    for (var i = 0; i < pattern.phases.length; i++) {
      total += (+pattern.phases[i].secs || 0);
    }
    return total;
  }

  // Turn "I want ~N minutes of pattern X" into a whole number of cycles.
  // Cycles never round to zero (you always breathe at least once) and
  // `minutes` reports the ACTUAL session length after rounding.
  function sessionPlan(patternId, minutes) {
    var pattern = patternById(patternId);
    if (!pattern) return null;
    var cs = cycleSeconds(pattern);
    if (!cs) return null;                        // malformed pattern: no phases
    var mins = +minutes;
    if (isNaN(mins) || mins <= 0) mins = +pattern.minutes || 5; // fall back to the pattern's default
    var cycles = Math.max(1, Math.round(mins * 60 / cs));
    var totalSec = cycles * cs;
    return {
      pattern: pattern,
      cycles: cycles,
      totalSec: totalSec,
      minutes: Math.max(1, Math.round(totalSec / 60))
    };
  }

  /* ---------- julian helpers (internal) ---------- */
  // Julian Day at LOCAL noon of the given ISO date. U.fromISO pins noon,
  // which keeps the value DST-safe and centres the estimate on the day.
  // Unix epoch 1970-01-01T00:00Z is JD 2440587.5.
  function toJulian(dateISO) {
    var d = U.fromISO(dateISO);
    if (!d || isNaN(d.getTime())) return null;
    return d.getTime() / DAY_MS + 2440587.5;
  }

  // 1-based day-of-year (Jan 1st = 1), via local-noon date math.
  function dayOfYear(dateISO) {
    var d = U.fromISO(dateISO);
    if (!d || isNaN(d.getTime())) return null;
    return U.daysBetween(d.getFullYear() + '-01-01', dateISO) + 1;
  }

  /* ---------- moon phase ---------- */
  // Mean synodic month and the reference new moon of 2000-01-06 18:14 UTC
  // (JD 2451550.26). Local-noon sampling puts us within half a day of the
  // true instant — plenty for naming the phase and % illumination.
  var SYNODIC = 29.530588853;
  var EPOCH_NEW_JD = 2451550.26;

  // Age bands (days) → phase name + emoji, per the eight classical slices.
  var MOON_NAMES = [
    { below: 1.85,  name: 'New',             emoji: '🌑' },
    { below: 5.54,  name: 'Waxing Crescent', emoji: '🌒' },
    { below: 9.23,  name: 'First Quarter',   emoji: '🌓' },
    { below: 12.92, name: 'Waxing Gibbous',  emoji: '🌔' },
    { below: 16.61, name: 'Full',            emoji: '🌕' },
    { below: 20.30, name: 'Waning Gibbous',  emoji: '🌖' },
    { below: 23.99, name: 'Last Quarter',    emoji: '🌗' },
    { below: 27.68, name: 'Waning Crescent', emoji: '🌘' }
  ];

  // Phase of the moon on a date: age within the cycle, illuminated %,
  // and a human name + emoji. Needs no location.
  function moonPhase(dateISO) {
    var jd = toJulian(dateISO);
    if (jd == null) return null;
    var age = (jd - EPOCH_NEW_JD) % SYNODIC;
    if (age < 0) age += SYNODIC;                 // dates before the epoch wrap forward
    // illuminated fraction: 0 at new, 100 at full, cosine in between
    var illum = Math.round(50 * (1 - Math.cos(2 * Math.PI * age / SYNODIC)));
    var name = 'New', emoji = '🌑';              // ≥27.68 wraps back to New
    for (var i = 0; i < MOON_NAMES.length; i++) {
      if (age < MOON_NAMES[i].below) { name = MOON_NAMES[i].name; emoji = MOON_NAMES[i].emoji; break; }
    }
    return { ageDays: U.round(age, 1), illumPct: illum, name: name, emoji: emoji };
  }

  /* ---------- sunrise / sunset (NOAA simplified) ---------- */
  // Standard simplified NOAA algorithm: fractional year → equation of
  // time + solar declination (Fourier series) → hour angle at official
  // zenith 90.833° (refraction + solar disc) → UTC minutes → local
  // wall-clock minutes via the JS timezone offset FOR THAT DATE (so DST
  // is handled by the platform). Accuracy is within a few minutes.
  // Longitude convention: positive EAST. Returns null for bad input.
  function sunTimes(dateISO, lat, lng) {
    lat = coord(lat, 90);
    lng = coord(lng, 180);
    var d = U.fromISO(dateISO);
    if (lat == null || lng == null || !d || isNaN(d.getTime())) return null;

    // fractional year γ (radians); evaluated at hour 12 so the
    // (hour−12)/24 term drops out — daily precision is all we need
    var N = dayOfYear(dateISO);
    var g = 2 * Math.PI / 365 * (N - 1);

    // equation of time, minutes (sundial time minus clock time)
    var eqtime = 229.18 * (0.000075
      + 0.001868 * Math.cos(g)     - 0.032077 * Math.sin(g)
      - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));

    // solar declination, radians
    var decl = 0.006918
      - 0.399912 * Math.cos(g)     + 0.070257 * Math.sin(g)
      - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
      - 0.002697 * Math.cos(3 * g) + 0.00148  * Math.sin(3 * g);

    // hour angle H at the sunrise/sunset zenith
    var latR = lat * RAD, zen = 90.833 * RAD;
    var cosH = Math.cos(zen) / (Math.cos(latR) * Math.cos(decl))
             - Math.tan(latR) * Math.tan(decl);

    // |cos H| > 1 → the sun never crosses the horizon: polar day/night
    if (cosH > 1) {
      return { sunriseMin: null, sunsetMin: null, solarNoonMin: null, sunrise: null, sunset: null, polar: 'night' };
    }
    if (cosH < -1) {
      return { sunriseMin: null, sunsetMin: null, solarNoonMin: null, sunrise: null, sunset: null, polar: 'day' };
    }

    var ha = Math.acos(cosH) / RAD;              // degrees; 1° of hour angle = 4 min
    var riseUTC = 720 - 4 * (lng + ha) - eqtime; // minutes after 00:00 UTC
    var setUTC  = 720 - 4 * (lng - ha) - eqtime;
    var noonUTC = 720 - 4 * lng - eqtime;

    // UTC = local + getTimezoneOffset(), so local = UTC − offset. Taken
    // from the noon-pinned Date so the DST rule of THAT day applies.
    var tz = d.getTimezoneOffset();
    var riseLoc = riseUTC - tz, setLoc = setUTC - tz, noonLoc = noonUTC - tz;

    // The *Min fields are deliberately NOT wrapped mod 1440: that keeps
    // sunrise < solarNoon < sunset true even for exotic timezone ×
    // longitude pairs, and keeps daylight = sunset − sunrise a plain
    // subtraction. fmtMin wraps for display.
    return {
      sunriseMin: Math.round(riseLoc),
      sunsetMin: Math.round(setLoc),
      solarNoonMin: Math.round(noonLoc),
      sunrise: fmtMin(riseLoc),
      sunset: fmtMin(setLoc),
      polar: null
    };
  }

  /* ---------- brahma muhurta ---------- */
  // The creator's hour: the window before sunrise, classically 96 → 48
  // minutes before first light. Offsets come from CFG.sanctum.cosmos but
  // default sanely while that section is still landing. Null when the
  // sun maths can't run (bad coords, polar day/night).
  function brahmaMuhurta(dateISO, lat, lng) {
    var st = sunTimes(dateISO, lat, lng);
    if (!st || st.polar || st.sunriseMin == null) return null;
    var sc = sanctumCfg();
    var startOff = (sc && sc.cosmos && sc.cosmos.brahmaStartMin != null) ? sc.cosmos.brahmaStartMin : 96;
    var endOff   = (sc && sc.cosmos && sc.cosmos.brahmaEndMin   != null) ? sc.cosmos.brahmaEndMin   : 48;
    var s = st.sunriseMin - startOff, e = st.sunriseMin - endOff;
    return { start: fmtMin(s), end: fmtMin(e), startMin: s, endMin: e };
  }

  /* ---------- export ---------- */
  global.RTI_SANCTUM = {
    // breath
    patternById: patternById, cycleSeconds: cycleSeconds, sessionPlan: sessionPlan,
    // cosmos
    moonPhase: moonPhase, sunTimes: sunTimes, brahmaMuhurta: brahmaMuhurta,
    fmtMin: fmtMin
  };
})(typeof window !== 'undefined' ? window : this);
