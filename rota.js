/* =====================================================================
   Road to Immortal — ROTA (shift work: parse, map, query, apply)
   ---------------------------------------------------------------------
   Shift workers live and die by the rota, so the app has to read one
   from whatever the owner can actually get hold of: a CSV export from
   the e-roster, an .ics calendar file, or free text typed straight off
   the paper sheet on the staff-room wall. Everything in here is pure
   parsing + queries over that data:

     • normalizeDate — the heart. UK day-first ('06/07/2026'), dots and
       dashes, month names ('6 Jul 2026', 'July 6th 2026'), optional
       weekday prefixes ('Mon 6 Jul 2026'), ordinals, 2-digit years
       (=> 20xx) and day/month-only forms with a context year.
       Impossible dates are rejected by a round-trip through Date.
     • parseCSV / parseICS / parseText / parse — every parser returns
       the SAME { entries, codes, warnings } shape so the import UI has
       one code path. parse() auto-detects the format.
     • guessKind / kindFor / kindById — map raw rota codes ('N', 'LD',
       'Night shift') onto the CFG.rota.kinds vocabulary, first via the
       owner's own codeMap, then role presets, then keyword guesses.
     • parsePattern / expandPattern — '4D 4OFF' style repeating
       patterns rolled out over any number of days.
     • applyEntries / shiftOn / nextOfKind / upcoming / monthCounts /
       clearRange / setShift — the stored rota (S.getRota / S.setRota).
     • applyDayTypes — the honest bridge to nutrition: suggests a
       shift/rest day-type for each rota day but NEVER overwrites a day
       the owner has already answered, and preserves every other
       nutrition field it finds.

   Pure logic — no DOM, no network, nothing leaves the device. Every
   function is defensive: bad input yields null / empty, never a throw.
   ===================================================================== */
(function (global) {
  'use strict';
  var U = global.RTI_UTIL, CFG = global.RTI_CONFIG, S = global.RTI_STORE;

  /* -------------------------------------------------------------
     Guards. CFG.rota and S.getRota/S.setRota may be absent (older
     cached bundles, partial loads) — everything degrades politely.
     ------------------------------------------------------------- */
  function rotaCfg() { return (CFG && CFG.rota) ? CFG.rota : null; }

  function safeGetRota() {
    try {
      if (S && typeof S.getRota === 'function') {
        var r = S.getRota();
        if (r && typeof r === 'object') return r;
      }
    } catch (e) { /* fall through to a blank rota */ }
    return { shifts: {}, codeMap: {}, role: null };
  }

  function safeSetRota(patch) {
    try {
      if (S && typeof S.setRota === 'function') return S.setRota(patch);
    } catch (e) { /* storage failure — treated as a no-op */ }
    return null;
  }

  function has(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

  /* =============================================================
     CODES
     ============================================================= */
  // Trimmed, uppercased, inner whitespace collapsed. '' / null -> null.
  function normCode(s) {
    if (s == null) return null;
    var c = String(s).replace(/\s+/g, ' ').trim().toUpperCase();
    return c ? c : null;
  }

  /* =============================================================
     DATES — the heart of import. UK day-first everywhere.
     ============================================================= */
  var MONTHS = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
    apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
    aug: 8, august: 8, sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
  };
  var WEEKDAYS = {
    mon: 1, monday: 1, tue: 1, tues: 1, tuesday: 1, wed: 1, weds: 1,
    wednesday: 1, thu: 1, thur: 1, thurs: 1, thursday: 1, fri: 1,
    friday: 1, sat: 1, saturday: 1, sun: 1, sunday: 1
  };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // Strict validation: build a real Date and demand it round-trips.
  // Kills 31/02, month 13, day 0 and every other impossible date.
  function validDate(y, mo, d) {
    if (!isFinite(y) || !isFinite(mo) || !isFinite(d)) return null;
    if (y < 1000 || y > 9999 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var dt = new Date(y, mo - 1, d, 12, 0, 0, 0); // noon-pinned like U.fromISO
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return y + '-' + pad2(mo) + '-' + pad2(d);
  }

  // Accept a context year as number or string; 2-digit context => 20xx.
  function toYear(y) {
    y = +y;
    if (!isFinite(y)) return null;
    if (y >= 1000 && y <= 9999) return Math.floor(y);
    if (y >= 0 && y <= 99) return 2000 + Math.floor(y);
    return null;
  }

  function currentYear() { return +U.todayISO().slice(0, 4); }

  // Month-name forms: '6 Jul 2026', 'July 6th, 2026', 'Sat 6 Sept 26',
  // and '6 Jul' when a context year is supplied. STRICT: any token that
  // is not a weekday, month, day or year makes the whole thing fail —
  // that is what lets parseText slide windows over a line safely.
  function parseWordyDate(s, ctxYear) {
    var toks = String(s).replace(/,/g, ' ').split(/\s+/);
    var month = null, year = null, small = [], i, t, low, m;
    for (i = 0; i < toks.length; i++) {
      t = toks[i];
      if (!t) continue;
      low = t.toLowerCase().replace(/\.$/, ''); // 'Jul.' -> 'jul'
      if (!low) continue;
      if (has(WEEKDAYS, low)) continue;         // weekday prefix — ignored
      if (has(MONTHS, low)) {
        if (month !== null) return null;        // two months — nonsense
        month = MONTHS[low];
        continue;
      }
      m = low.match(/^(\d{4})$/);
      if (m) {
        if (year !== null) return null;
        year = +m[1];
        continue;
      }
      m = low.match(/^(\d{1,2})(st|nd|rd|th)?$/); // '6' or '6th'
      if (m) { small.push(+m[1]); continue; }
      return null;                               // unknown token — not a date
    }
    if (month === null || small.length === 0 || small.length > 2) return null;
    var day = small[0];
    if (small.length === 2) {
      if (year !== null) return null;            // day + 2 more numbers — ambiguous
      year = 2000 + small[1];                     // 'D Mon YY' — 2-digit year => 20xx
    }
    if (year === null) {
      year = toYear(ctxYear);
      if (!year) return null;                     // no year and no context — refuse
    }
    return validDate(year, month, day);
  }

  // normalizeDate(s, ctxYear) -> 'YYYY-MM-DD' or null.
  function normalizeDate(s, ctxYear) {
    if (s == null) return null;
    s = String(s).trim();
    if (!s) return null;
    // optional weekday prefix on ANY form: 'Mon 06/07/2026', 'Tue, 6 Jul'
    var wd = s.match(/^([A-Za-z]+)[\s,]+(.+)$/);
    if (wd && has(WEEKDAYS, wd[1].toLowerCase().replace(/\.$/, ''))) s = wd[2].trim();
    var m;
    // ISO YYYY-MM-DD — the app's native form
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return validDate(+m[1], +m[2], +m[3]);
    // UK day-first numeric: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (same
    // separator both times); 2-digit year => 20xx
    m = s.match(/^(\d{1,2})([\/.\-])(\d{1,2})\2(\d{4}|\d{2})$/);
    if (m) {
      var y = m[4].length === 2 ? 2000 + (+m[4]) : +m[4];
      return validDate(y, +m[3], +m[1]);
    }
    // DD/MM with no year — only meaningful with a context year
    m = s.match(/^(\d{1,2})([\/.\-])(\d{1,2})$/);
    if (m) {
      var cy = toYear(ctxYear);
      return cy ? validDate(cy, +m[3], +m[1]) : null;
    }
    // month-name forms
    return parseWordyDate(s, ctxYear);
  }

  /* =============================================================
     PARSERS — every one returns { entries, codes, warnings }.
     entries: [{ date:'YYYY-MM-DD', code, note }]; codes: unique,
     first-seen order; warnings: human strings (max 5 kept).
     ============================================================= */
  function emptyResult() { return { entries: [], codes: [], warnings: [] }; }
  function warn(res, msg) { if (res.warnings.length < 5) res.warnings.push(msg); }
  function addEntry(res, seen, date, code, note) {
    res.entries.push({ date: date, code: code, note: note || '' });
    if (!has(seen, code)) { seen[code] = true; res.codes.push(code); }
  }
  function snippet(s) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return s.length > 40 ? s.slice(0, 37) + '...' : s;
  }

  /* ---------------- CSV ---------------- */
  // Delimiter with the most columns on the given line wins.
  function bestDelim(line) {
    var delims = ['\t', ';', ','], best = ',', bestN = 1, i, n;
    for (i = 0; i < delims.length; i++) {
      n = String(line).split(delims[i]).length;
      if (n > bestN) { bestN = n; best = delims[i]; }
    }
    return { delim: best, cells: bestN };
  }
  function splitCells(line, delim) {
    var raw = String(line).split(delim), out = [], i;
    for (i = 0; i < raw.length; i++) out.push(raw[i].trim()); // keep positions for grids
    return out;
  }
  // A header row talks about dates without containing any: 'Date,Shift'.
  // A row with a real parseable date in it is DATA (maybe a grid dates row).
  function isHeaderRow(cells, ctxY) {
    var wordy = false, i, c, low;
    for (i = 0; i < cells.length; i++) {
      c = cells[i];
      if (!c) continue;
      if (normalizeDate(c, ctxY)) return false;
      low = c.toLowerCase();
      if (low.indexOf('date') !== -1 || low.indexOf('shift') !== -1 || low.indexOf('duty') !== -1) wordy = true;
    }
    return wordy;
  }

  // Two shapes: (a) rows of `date, code[, note]`; (b) a grid where a
  // dates row sits directly above a codes row. (a) is tried first; a
  // row only counts when its first non-empty cell is a date and the
  // next non-empty cell yields a code that is NOT itself a date (two
  // dates side by side means we are looking at a grid dates row).
  function parseCSV(text) {
    var blank = emptyResult();
    if (text == null) return blank;
    var rawLines = String(text).split('\n'), lines = [], i;
    for (i = 0; i < rawLines.length; i++) {
      var l = rawLines[i].replace(/\r+$/, '');
      if (l.replace(/\s+/g, '') !== '') lines.push(l);
    }
    if (!lines.length) return blank;
    var delim = bestDelim(lines[0]).delim;
    var ctxY = currentYear();
    var rows = [], r;
    for (r = 0; r < lines.length; r++) rows.push(splitCells(lines[r], delim));
    var startRow = isHeaderRow(rows[0], ctxY) ? 1 : 0;

    /* shape (a): one entry per row */
    var resA = emptyResult(), seenA = {}, a, c;
    for (a = startRow; a < rows.length; a++) {
      var cells = rows[a], di = -1;
      for (c = 0; c < cells.length; c++) if (cells[c] !== '') { di = c; break; }
      if (di === -1) continue; // nothing but delimiters — ignore silently
      var date = normalizeDate(cells[di], ctxY);
      if (!date) { warn(resA, 'Row ' + (a + 1) + ': no date in "' + snippet(lines[a]) + '"'); continue; }
      var next = -1;
      for (c = di + 1; c < cells.length; c++) if (cells[c] !== '') { next = c; break; }
      if (next === -1) { warn(resA, 'Row ' + (a + 1) + ': a date but no shift code'); continue; }
      if (normalizeDate(cells[next], ctxY)) continue; // grid dates row — shape (b) handles it
      var code = normCode(cells[next]);
      if (!code) { warn(resA, 'Row ' + (a + 1) + ': a date but no shift code'); continue; }
      var noteBits = [];
      for (c = next + 1; c < cells.length; c++) if (cells[c] !== '') noteBits.push(cells[c]);
      addEntry(resA, seenA, date, code, noteBits.join(' '));
    }
    if (resA.entries.length) return resA;

    /* shape (b): pair each dates row with the codes row beneath it */
    var resB = emptyResult(), seenB = {}, g, col;
    for (g = startRow; g + 1 < rows.length; g += 2) {
      var drow = rows[g], crow = rows[g + 1];
      var w = Math.max(drow.length, crow.length);
      for (col = 0; col < w; col++) {
        var gd = normalizeDate(drow[col] == null ? '' : drow[col], ctxY);
        var gc = normCode(crow[col] == null ? '' : crow[col]);
        if (gd && gc) addEntry(resB, seenB, gd, gc, '');
      }
    }
    return resB.entries.length ? resB : resA; // resA carries the useful warnings
  }

  /* ---------------- ICS ---------------- */
  function icsDate(value) {
    // 'VALUE=DATE:20260706' or '20260706T073000Z' — the date part only
    var m = String(value).trim().match(/^(\d{4})(\d{2})(\d{2})/);
    return m ? validDate(+m[1], +m[2], +m[3]) : null;
  }
  function icsText(value) {
    // undo RFC 5545 escaping in SUMMARY text
    return String(value)
      .replace(/\\n/gi, ' ')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\')
      .trim();
  }
  function parseICS(text) {
    var res = emptyResult(), seen = {};
    if (text == null) return res;
    // unfold first: a line break followed by a space/tab continues the
    // previous line (RFC 5545 §3.1), then split into real lines
    var lines = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    var inEvent = false, start = null, end = null, allDay = false, summary = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line) continue;
      var up = line.toUpperCase();
      if (up === 'BEGIN:VEVENT') {
        inEvent = true; start = null; end = null; allDay = false; summary = null;
        continue;
      }
      if (up === 'END:VEVENT') {
        if (inEvent) {
          if (!start) {
            warn(res, 'Skipped an event with no readable date' + (summary ? ' ("' + snippet(summary) + '")' : ''));
          } else if (summary == null || !String(summary).trim()) {
            warn(res, 'Skipped an event on ' + start + ' with no title');
          } else {
            // short summary = a rota code -> uppercase; longer text is
            // kept as-is so guessKind can keyword-scan it later
            var code = String(summary).trim();
            if (code.length <= 4) code = code.toUpperCase();
            var span = 1;
            if (allDay && end) {
              var d = U.daysBetween(start, end); // DTEND is EXCLUSIVE per RFC 5545
              if (d > 1) span = d;
            }
            if (span > 366) span = 366; // a year-long "shift" is a data error
            for (var k = 0; k < span; k++) addEntry(res, seen, U.addDays(start, k), code, '');
          }
        }
        inEvent = false;
        continue;
      }
      if (!inEvent) continue;
      var ci = line.indexOf(':');
      if (ci === -1) continue;
      var name = line.slice(0, ci).split(';')[0].toUpperCase(); // drop ;VALUE=DATE etc.
      var value = line.slice(ci + 1);
      if (name === 'DTSTART') {
        start = icsDate(value);
        allDay = value.indexOf('T') === -1; // date-only value = all-day event
      } else if (name === 'DTEND') {
        end = icsDate(value);
      } else if (name === 'SUMMARY') {
        summary = icsText(value);
      }
    }
    return res;
  }

  /* ---------------- free text ---------------- */
  // Strip separator noise off the edges of a candidate/tail string.
  function stripEdges(s) {
    return String(s)
      .replace(/^[\s:;,.|·–—-]+/, '')
      .replace(/[\s:;,.|·–—-]+$/, '');
  }
  // Drop words that are ONLY separators ('-', '—', ':') from a tail.
  function cleanTail(s) {
    var words = String(s).split(/\s+/), keep = [], i;
    for (i = 0; i < words.length; i++) {
      if (!words[i]) continue;
      if (/^[:;,.|·–—-]+$/.test(words[i])) continue;
      keep.push(words[i]);
    }
    return stripEdges(keep.join(' '));
  }

  // Line-oriented: slide word windows (widest first, up to 4 words)
  // across the line until one normalizes to a date; whatever words are
  // left, minus separators, become the code. Handles '06/07/2026 N',
  // 'Mon 6 Jul — Night shift', '2026-07-06: LD'.
  function parseText(text) {
    var res = emptyResult(), seen = {};
    if (text == null) return res;
    var lines = String(text).split('\n');
    var ctxY = currentYear(); // year-less lines assume the current year
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li].replace(/\r+$/, '');
      if (line.replace(/\s+/g, '') === '') continue;
      var raw = line.split(/\s+/), words = [], w;
      for (w = 0; w < raw.length; w++) if (raw[w]) words.push(raw[w]);
      var found = null;
      for (var i = 0; i < words.length && !found; i++) {
        var maxL = Math.min(4, words.length - i);
        for (var L = maxL; L >= 1; L--) {
          var cand = stripEdges(words.slice(i, i + L).join(' '));
          var d = cand ? normalizeDate(cand, ctxY) : null;
          if (d) { found = { date: d, from: i, to: i + L }; break; }
        }
      }
      if (!found) {
        warn(res, 'Line ' + (li + 1) + ': no date found in "' + snippet(line) + '"');
        continue;
      }
      var tail = [];
      for (w = 0; w < words.length; w++) {
        if (w >= found.from && w < found.to) continue; // the date words
        tail.push(words[w]);
      }
      var code = cleanTail(tail.join(' '));
      if (!code) {
        warn(res, 'Line ' + (li + 1) + ': a date but no shift code in "' + snippet(line) + '"');
        continue;
      }
      addEntry(res, seen, found.date, code, '');
    }
    return res;
  }

  /* ---------------- auto-detect ---------------- */
  // ICS if it declares itself; CSV if the first non-empty line has ≥2
  // cells AND at least half the lines carry the same delimiter (that is
  // what "consistent" means here); otherwise free text. If a CSV-shaped
  // paste parses to nothing, free text gets one honest try before we
  // hand back the CSV warnings.
  function parse(text) {
    var res;
    if (text == null) { res = emptyResult(); res.format = 'text'; return res; }
    var str = String(text);
    if (str.indexOf('BEGIN:VCALENDAR') !== -1) {
      res = parseICS(str);
      res.format = 'ics';
      return res;
    }
    var lines = str.split('\n'), nonEmpty = [], i;
    for (i = 0; i < lines.length; i++) if (lines[i].replace(/\s+/g, '') !== '') nonEmpty.push(lines[i]);
    if (nonEmpty.length) {
      var bd = bestDelim(nonEmpty[0]);
      if (bd.cells >= 2) {
        var withDelim = 0;
        for (i = 0; i < nonEmpty.length; i++) if (nonEmpty[i].indexOf(bd.delim) !== -1) withDelim++;
        if (withDelim * 2 >= nonEmpty.length) {
          res = parseCSV(str);
          if (res.entries.length) { res.format = 'csv'; return res; }
          var txt = parseText(str);
          if (txt.entries.length) { txt.format = 'text'; return txt; }
          res.format = 'csv';
          return res;
        }
      }
    }
    res = parseText(str);
    res.format = 'text';
    return res;
  }

  /* =============================================================
     CODE → KIND mapping
     ============================================================= */
  // Best guess with no user mapping: exact code in ANY role preset map
  // (first preset wins), then keyword substring scan in CFG order.
  function guessKind(code) {
    var cfg = rotaCfg();
    if (!cfg) return null;
    var c = normCode(code);
    if (!c) return null;
    var presets = cfg.rolePresets || [], i;
    for (i = 0; i < presets.length; i++) {
      var map = presets[i] && presets[i].map;
      if (map && has(map, c)) return map[c];
    }
    var lower = c.toLowerCase();
    var kws = cfg.keywordKinds || [];
    for (i = 0; i < kws.length; i++) {
      if (kws[i] && kws[i].kw && lower.indexOf(kws[i].kw) !== -1) return kws[i].kind;
    }
    return null;
  }

  // The owner's own mapping first, then the guess. rota is optional.
  function kindFor(code, rota) {
    var c = normCode(code);
    if (!c) return null;
    if (!rota || typeof rota !== 'object') rota = safeGetRota();
    if (rota.codeMap && rota.codeMap[c]) return rota.codeMap[c];
    return guessKind(c);
  }

  function kindById(id) {
    var cfg = rotaCfg();
    if (!cfg || !id) return null;
    var kinds = cfg.kinds || [];
    for (var i = 0; i < kinds.length; i++) if (kinds[i] && kinds[i].id === id) return kinds[i];
    return null;
  }

  /* =============================================================
     PATTERNS — '4D 4OFF' and friends
     ============================================================= */
  // Tokens split on spaces/commas. '3N', 'N3', '3xN' and 'Nx3' all mean
  // N three times (repeat capped at 31); a bare token appears once.
  function parsePattern(str) {
    var out = [];
    if (str == null) return out;
    var toks = String(str).split(/[\s,]+/);
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (!t) continue;
      var code = t, count = 1, m;
      m = t.match(/^(\d+)[xX](.+)$/);            // 3xN
      if (m) { count = +m[1]; code = m[2]; }
      else {
        m = t.match(/^(.+?)[xX](\d+)$/);         // Nx3
        if (m) { code = m[1]; count = +m[2]; }
        else {
          m = t.match(/^(\d+)(\D.*)$/);          // 3N
          if (m) { count = +m[1]; code = m[2]; }
          else {
            m = t.match(/^(\D.*?)(\d+)$/);       // N3
            if (m) { code = m[1]; count = +m[2]; }
          }
        }
      }
      var c = normCode(code);
      if (!c) continue;
      if (!isFinite(count) || count < 1) count = 1;
      if (count > 31) count = 31;
      for (var r = 0; r < count; r++) out.push(c);
    }
    return out;
  }

  // Cycle codesArr from the anchor date for `days` days.
  function expandPattern(anchorISO, codesArr, days) {
    var out = [];
    var anchor = normalizeDate(anchorISO);
    if (!anchor || !Array.isArray(codesArr) || !codesArr.length) return out;
    var n = +days;
    if (!isFinite(n) || n < 1) return out;
    if (n > 3660) n = 3660; // ten years of rota is a typo, not a plan
    var clean = [];
    for (var i = 0; i < codesArr.length; i++) {
      var c = normCode(codesArr[i]);
      if (c) clean.push(c);
    }
    if (!clean.length) return out;
    for (var d = 0; d < n; d++) {
      out.push({ date: U.addDays(anchor, d), code: clean[d % clean.length], note: '' });
    }
    return out;
  }

  /* =============================================================
     THE STORED ROTA — writes go through S.getRota / S.setRota
     ============================================================= */
  // Merge parsed entries (and any code→kind mapping the owner chose)
  // into the stored rota. Codes are uppercased on the way in.
  function applyEntries(entries, mapPatch) {
    var rota = safeGetRota(), k;
    var shifts = {}, codeMap = {};
    for (k in (rota.shifts || {})) shifts[k] = rota.shifts[k];
    for (k in (rota.codeMap || {})) codeMap[k] = rota.codeMap[k];
    var added = 0, first = null, last = null;
    var list = Array.isArray(entries) ? entries : [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e) continue;
      var date = normalizeDate(e.date);
      var code = normCode(e.code);
      if (!date || !code) continue;
      shifts[date] = code;
      added++;
      if (first === null || date < first) first = date;
      if (last === null || date > last) last = date;
    }
    if (mapPatch && typeof mapPatch === 'object') {
      for (k in mapPatch) {
        var key = normCode(k);
        if (key && mapPatch[k]) codeMap[key] = String(mapPatch[k]);
      }
    }
    safeSetRota({ shifts: shifts, codeMap: codeMap });
    return { added: added, days: [first, last] };
  }

  // What is on the rota for one date? null when nothing is.
  function shiftOn(dateISO, rota) {
    var date = normalizeDate(dateISO);
    if (!date) return null;
    if (!rota || typeof rota !== 'object') rota = safeGetRota();
    var code = rota.shifts ? rota.shifts[date] : null;
    if (!code) return null;
    var kid = kindFor(code, rota);
    return { code: code, kindId: kid || null, kind: kid ? kindById(kid) : null };
  }

  // First future day (fromISO+1 onward) whose shift maps to kindId.
  function nextOfKind(kindId, fromISO, horizonDays) {
    var from = normalizeDate(fromISO);
    if (!from || !kindId) return null;
    var horizon = +horizonDays;
    if (!isFinite(horizon) || horizon < 1) horizon = 60;
    if (horizon > 3660) horizon = 3660;
    var rota = safeGetRota();
    for (var i = 1; i <= horizon; i++) {
      var date = U.addDays(from, i);
      var s = shiftOn(date, rota);
      if (s && s.kindId === kindId) return { date: date, code: s.code, inDays: i };
    }
    return null;
  }

  // The next `days` days (after fromISO) that HAVE a rota entry —
  // unmapped codes come back with kindId/kind null so the UI can nag.
  function upcoming(fromISO, days) {
    var out = [];
    var from = normalizeDate(fromISO);
    if (!from) return out;
    var n = +days;
    if (!isFinite(n) || n < 1) n = 14;
    if (n > 3660) n = 3660;
    var rota = safeGetRota();
    for (var i = 1; i <= n; i++) {
      var date = U.addDays(from, i);
      var s = shiftOn(date, rota);
      if (s) out.push({ date: date, code: s.code, kindId: s.kindId, kind: s.kind });
    }
    return out;
  }

  // Tally one month ('YYYY-MM') of rota entries by kind.
  function monthCounts(yyyymm) {
    var out = { total: 0, byKind: {}, unmapped: 0 };
    var m = String(yyyymm == null ? '' : yyyymm).match(/^(\d{4})-(\d{1,2})$/);
    if (!m) return out;
    var prefix = m[1] + '-' + pad2(+m[2]) + '-';
    var rota = safeGetRota(), shifts = rota.shifts || {};
    for (var d in shifts) {
      if (d.indexOf(prefix) !== 0) continue;
      out.total++;
      var kid = kindFor(shifts[d], rota);
      if (kid) out.byKind[kid] = (out.byKind[kid] || 0) + 1;
      else out.unmapped++;
    }
    return out;
  }

  // The honest bridge to nutrition day-types. For every date in the
  // range that has a rota shift with a KNOWN kind: if the owner has
  // already answered that day's dayType it is sacred — skip it; else
  // suggest the kind's dayType, preserving every other nutrition field.
  function applyDayTypes(fromISO, toISO) {
    var out = { set: 0, skipped: 0 };
    var from = normalizeDate(fromISO), to = normalizeDate(toISO);
    if (!from || !to) return out;
    var span = U.daysBetween(from, to);
    if (span < 0) return out;
    if (span > 3660) span = 3660;
    if (!S || typeof S.getLog !== 'function' || typeof S.patchLog !== 'function') return out;
    var rota = safeGetRota();
    for (var i = 0; i <= span; i++) {
      var date = U.addDays(from, i);
      var s = shiftOn(date, rota);
      if (!s || !s.kind || !s.kind.dayType) continue; // no rota / unmapped — nothing to say
      var log = S.getLog(date);
      if (log.nutrition && log.nutrition.dayType) { out.skipped++; continue; } // NEVER overwrite
      S.patchLog(date, {
        nutrition: Object.assign({}, log.nutrition || {}, { dayType: s.kind.dayType })
      });
      out.set++;
    }
    return out;
  }

  // Remove every stored shift in [fromISO..toISO]. Returns count removed.
  function clearRange(fromISO, toISO) {
    var from = normalizeDate(fromISO), to = normalizeDate(toISO);
    if (!from || !to || U.daysBetween(from, to) < 0) return 0;
    var rota = safeGetRota(), shifts = {}, removed = 0;
    for (var d in (rota.shifts || {})) {
      if (d >= from && d <= to) { removed++; continue; } // ISO strings sort naturally
      shifts[d] = rota.shifts[d];
    }
    if (removed) safeSetRota({ shifts: shifts });
    return removed;
  }

  // Single-day set (uppercased) or clear (null / '' removes).
  function setShift(dateISO, codeOrNull) {
    var date = normalizeDate(dateISO);
    if (!date) return null;
    var rota = safeGetRota(), shifts = {};
    for (var d in (rota.shifts || {})) shifts[d] = rota.shifts[d];
    var code = normCode(codeOrNull);
    if (code) shifts[date] = code;
    else delete shifts[date];
    safeSetRota({ shifts: shifts });
    return code;
  }

  global.RTI_ROTA = {
    normCode: normCode, normalizeDate: normalizeDate,
    parseCSV: parseCSV, parseICS: parseICS, parseText: parseText, parse: parse,
    guessKind: guessKind, kindFor: kindFor, kindById: kindById,
    parsePattern: parsePattern, expandPattern: expandPattern,
    applyEntries: applyEntries, shiftOn: shiftOn, nextOfKind: nextOfKind,
    upcoming: upcoming, monthCounts: monthCounts, applyDayTypes: applyDayTypes,
    clearRange: clearRange, setShift: setShift
  };
})(typeof window !== 'undefined' ? window : this);
