/* =====================================================================
   Road to Immortal — ORACLE (increment 4: on-device NLU + composed replies)
   ---------------------------------------------------------------------
   The Oracle reads ONLY the owner's own ledger. Nothing here talks to a
   network, a speech API or the DOM — app.js owns the microphone, the
   voice and the screen. This file is pure text-in / structured-out:

     interpret(text)      -> { intent, n, confidence }
     respond(text, ctx)   -> { text, say, actions, goto }
     whisper(ctx)         -> one deterministic daily line (no intro emoji)

   `ctx` is assembled by app.js from the engine (snapshot, riskForecast,
   weeklyProphecy, rankETA, survivalOutlook, nutritionAdherence) plus the
   rota (shiftOn / upcoming) and the sky (moonPhase / sunTimes). EVERY
   field may be missing — each branch degrades to graceful prose and,
   where it helps, points at the screen that fills the gap.

   Voice rules (section 9): mystical but honest, grounded in the numbers,
   association not fate, never a promise about outcomes or other people.
   ===================================================================== */
(function (global) {
  'use strict';
  var U = global.RTI_UTIL, CFG = global.RTI_CONFIG, S = global.RTI_STORE, E = global.RTI_ENGINE;

  /* ---------- built-in fallbacks (CFG.oracle may not be shipped yet) ----------
     The config agent adds CFG.oracle in the same increment; until it lands
     (and forever after, as a belt-and-braces guard) these strings keep the
     Oracle speaking. ocList() prefers config, falls back here. */
  var FALLBACK = {
    greetings: [
      'Ask, and the record answers. Nothing is hidden from your own ledger.',
      'The Oracle reads only what you have written. Speak.'
    ],
    unknown: [
      'That is beyond this ledger. Ask about your streak, your risk, your food, your rota — or say "help".',
      'The record is silent on that. Say "help" to see what I can read and do.'
    ]
  };
  function oc() { return (CFG && CFG.oracle) ? CFG.oracle : {}; }
  function ocList(key) {
    var o = oc();
    return (o[key] && o[key].length) ? o[key] : (FALLBACK[key] || []);
  }

  /* ---------- tiny formatting helpers ---------- */
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // 12345 -> '12,345' (whole numbers only; decimals pass through untouched)
  function fmtNum(n) {
    if (n == null || !isFinite(+n)) return '0';
    var s = String(Math.round(+n) === +n ? Math.round(+n) : +n);
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  // pluralise: pl(1,'day') -> '1 day'; pl(3,'day') -> '3 days'
  function pl(n, word) { return fmtNum(n) + ' ' + word + (+n === 1 ? '' : 's'); }
  // 'YYYY-MM-DD' -> 'Mon 6 Jul' (falls back to the raw string on garbage)
  function fmtDate(iso) {
    try {
      var d = U.fromISO(iso);
      if (!d || isNaN(d.getTime())) return String(iso || '');
      return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()];
    } catch (e) { return String(iso || ''); }
  }
  // deterministic daily index (same seeding idiom as app.js dailyPick /
  // engine trialIndexFor) — NaN-safe so a corrupt asOf can never crash it
  function dailyIndex(asOf, len) {
    if (!len) return 0;
    var seed = 0;
    try { seed = U.daysBetween('2020-01-01', asOf || U.todayISO()); } catch (e) { seed = 0; }
    if (!isFinite(seed)) seed = 0;
    return ((seed % len) + len) % len;
  }
  // the day/hour anchors, defensively pulled from wherever ctx carries them
  function ctxAsOf(ctx) {
    return (ctx && ctx.asOf) || (ctx && ctx.snap && ctx.snap.asOf) || U.todayISO();
  }
  function bandWord(band) {
    return band === 'high' ? 'High' : (band === 'elevated' ? 'Elevated' : 'Low');
  }

  /* =====================================================================
     1) INTERPRET — keyword/regex scoring over normalised text
     ===================================================================== */

  // lowercase, drop apostrophes ("what's" -> "whats"), squash all other
  // punctuation to spaces but KEEP digits, commas and decimal points so
  // '12,000' and '7.5' survive for number extraction.
  function normalize(text) {
    var t = String(text == null ? '' : text).toLowerCase();
    t = t.replace(/[’']/g, '');            // apostrophes vanish
    t = t.replace(/[^a-z0-9.,\s]/g, ' ');       // everything else exotic -> space
    t = t.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    return t;
  }

  // First number in the text. Digits win (commas stripped, 'k'/'thousand'
  // multipliers honoured); word-forms cover the spoken shortcuts.
  function extractNumber(t) {
    var s = t.replace(/(\d),(?=\d)/g, '$1');    // '12,000' -> '12000'
    var m = s.match(/(\d+(?:\.\d+)?)\s*k\b/);   // '12k' -> 12000
    if (m) return parseFloat(m[1]) * 1000;
    m = s.match(/(\d+(?:\.\d+)?)\s*thousand/);  // '10 thousand' -> 10000
    if (m) return parseFloat(m[1]) * 1000;
    m = s.match(/(\d+(?:\.\d+)?)/);             // plain first number
    if (m) return parseFloat(m[1]);
    if (/half\s+an?\s+hour|half\s*hour/.test(t)) return 30;   // 'half an hour'
    if (/\ban?\s+hour\b|\bone\s+hour\b/.test(t)) return 60;   // 'an hour'
    if (/\bten\s+thousand\b/.test(t)) return 10000;           // 'ten thousand'
    if (/\ba\s+thousand\b|\bone\s+thousand\b/.test(t)) return 1000;
    return null;
  }

  /* Intent table. Each rule is [regex, weight]; an intent's score is the
     sum of every rule that matches. Highest score wins; array ORDER breaks
     ties (most specific / most urgent first). `numBonus` intents (the log
     family) get +1 when a number was found, so 'meditated 20 min' beats
     any generic reading — their unit vocab has to be present at all for
     them to score, which is what keeps '20 min' from becoming steps. */
  var INTENTS = [
    { id: 'urge', rules: [
        [/urge right now/, 4], [/about to (relapse|slip|fall|break)/, 4],
        [/\bhelp me\b/, 3], [/struggl/, 3], [/tempt/, 3], [/craving/, 3],
        [/losing (it|control)/, 3], [/\burge\b/, 2], [/cant hold/, 3]
      ] },
    { id: 'markClean', rules: [
        [/mark (today )?(as )?clean/, 4], [/held the line/, 4], [/\bi held\b/, 4],
        [/clean today/, 4], [/stayed clean/, 4], [/today was clean/, 4], [/\bim clean\b/, 3]
      ] },
    { id: 'logSteps', numBonus: true, rules: [
        [/\bsteps?\b/, 3], [/\bwalked\b/, 3]
      ] },
    { id: 'logMeditation', numBonus: true, rules: [
        [/meditat/, 4]
      ] },
    { id: 'logBreathing', numBonus: true, rules: [
        [/pranayama/, 4], [/breath/, 3]
      ] },
    { id: 'logSleep', numBonus: true, rules: [
        [/\bslept\b/, 4], [/hours of sleep/, 4], [/\bsleep\b/, 3]
      ] },
    { id: 'logMood', numBonus: true, rules: [
        [/\bmood\b/, 3], [/feeling \d/, 4], [/\bfeel(ing)?\b/, 1]
      ] },
    { id: 'nextshift', rules: [
        [/next shift/, 4], [/next night/, 4], [/next early/, 4], [/next late/, 4],
        [/next long/, 4], [/next on\s?call/, 4], [/when do i work/, 4],
        [/when am i working/, 4], [/rota tomorrow/, 4], [/working tomorrow/, 4],
        [/shift tomorrow/, 4]
      ] },
    { id: 'rota', rules: [
        [/shift today/, 4], [/working today/, 4], [/todays shift/, 4],
        [/\brota\b/, 3], [/\bschedule\b/, 3], [/am i working/, 3], [/\bshift\b/, 1]
      ] },
    { id: 'prophecy', rules: [
        [/\bprophecy\b/, 4], [/report of the week/, 4], [/week forecast/, 4],
        [/forecast (for )?(the )?week/, 4], [/this week/, 3], [/\bweekly\b/, 3],
        [/past week/, 2], [/last 7 days/, 3]
      ] },
    { id: 'risk', rules: [
        [/will i (fall|slip|relapse)/, 4], [/tonight safe|safe tonight/, 4],
        [/urge forecast/, 4], [/\brisk\b/, 3], [/\bdanger\b/, 3],
        [/\brelapse\b/, 2], [/\bforecast\b/, 1], [/\btonight\b/, 1]
      ] },
    { id: 'streak', rules: [
        [/\bstreak\b/, 3], [/clean days/, 3], [/days clean/, 3], [/how long have i/, 3]
      ] },
    { id: 'status', rules: [
        [/how am i doing/, 4], [/where am i/, 3], [/\bstatus\b/, 3],
        [/\bsummary\b/, 3], [/\breport\b/, 2], [/hows it going/, 2]
      ] },
    { id: 'nutrition', rules: [
        [/whats left/, 3], [/left today/, 3], [/\beat(en)?\b/, 3], [/\bfood\b/, 3],
        [/\bmeal/, 3], [/calorie/, 3], [/\bkcal\b/, 3], [/protein/, 3],
        [/hungry/, 3], [/\bdiet\b/, 2]
      ] },
    { id: 'rank', rules: [
        [/when do i reach/, 4], [/next rank/, 4], [/immortal when/, 4],
        [/when .*immortal/, 3], [/\brank\b/, 3], [/\beta\b/, 3], [/promotion/, 2],
        [/how long until/, 2]
      ] },
    { id: 'power', rules: [
        [/magnetism/, 4], [/\bpower\b/, 3], [/\baura\b/, 3], [/\bcharge/, 2]
      ] },
    { id: 'moon', rules: [
        [/brahma/, 4], [/\bmoon\b/, 3], [/\bcosmic\b/, 3], [/sunrise/, 3],
        [/sunset/, 3], [/\blunar\b/, 3]
      ] },
    { id: 'wisdom', rules: [
        [/\bwisdom\b/, 3], [/\bquote\b/, 3], [/teach me/, 3], [/\bcodex\b/, 3],
        [/\bspeak\b/, 2], [/say something/, 2]
      ] },
    { id: 'help', rules: [
        [/what can you do/, 4], [/what can i ask/, 4], [/\bhelp\b/, 2], [/how do i use/, 2]
      ] }
  ];

  function interpret(text) {
    var t = normalize(text);
    var n = null;
    try { n = extractNumber(t); } catch (e) { n = null; }
    if (!t) return { intent: 'unknown', n: null, confidence: 0 };
    var best = null, bestScore = 0;
    for (var i = 0; i < INTENTS.length; i++) {
      var def = INTENTS[i], score = 0;
      for (var j = 0; j < def.rules.length; j++) {
        if (def.rules[j][0].test(t)) score += def.rules[j][1];
      }
      if (score > 0 && def.numBonus && n != null) score += 1; // unit vocab + number
      if (score > bestScore) { bestScore = score; best = def.id; } // '>' keeps array-order tiebreak
    }
    if (!best) return { intent: 'unknown', n: n, confidence: 0 };
    return { intent: best, n: n, confidence: U.clamp(U.round(bestScore / 5, 2), 0, 1) };
  }

  /* =====================================================================
     2) RESPOND — composed prose grounded in ctx, plus proposed actions.
     The Oracle proposes, the owner confirms: log intents return ONE action
     chip; nothing is written until the app executes it on tap.
     ===================================================================== */

  // shared 'ask for the number' response for the log family
  function askNumber(what, say) {
    return { text: what, say: say || what, actions: [], goto: null };
  }
  // one-action confirm proposal for a log write
  function proposal(text, say, label, act, payload) {
    return { text: text, say: say, actions: [{ label: label, act: act, payload: payload }], goto: null };
  }
  function gotoAction(label, screen) { return { label: label, act: 'goto', payload: screen }; }

  /* ---- status ---- */
  function rStatus(ctx) {
    var snap = ctx.snap;
    if (!snap) {
      return { text: 'The ledger holds no snapshot to read yet. Open Today, write one honest line, and ask me again.',
               say: 'The ledger is empty. Log a day first.',
               actions: [gotoAction('Open Today', 'today')], goto: 'today' };
    }
    var day = snap.day != null ? snap.day : null;
    var rankName = (snap.rank && snap.rank.current) ? snap.rank.current.name : 'the road';
    var cur = snap.streak ? snap.streak.current : 0;
    var shields = snap.streak ? snap.streak.shields : 0;
    var idx = snap.meters ? snap.meters.index : null;
    var text = (day != null ? 'Day ' + day + ' — ' + rankName + '.' : rankName + '.');
    text += ' The streak stands at ' + pl(cur, 'clean day') +
            (shields ? ', ' + pl(shields, 'shield') + ' in reserve.' : '.');
    if (idx != null) text += ' Charge reads ' + idx + '%.';
    if (snap.rank && snap.rank.next)
      text += ' ' + pl(snap.rank.daysToNext, 'day') + ' of held line to ' + snap.rank.next.name + '.';
    if (ctx.risk && ctx.risk.score != null)
      text += ' Tonight’s forecast: ' + bandWord(ctx.risk.band) + ' — ' + ctx.risk.score + ' of 100.';
    var say = (day != null ? 'Day ' + day + '. ' : '') + 'Streak ' + cur +
              (idx != null ? '. Charge ' + idx + ' percent.' : '.');
    return { text: text, say: say, actions: [], goto: null };
  }

  /* ---- streak ---- */
  function rStreak(ctx) {
    var snap = ctx.snap;
    if (!snap || !snap.streak) {
      return { text: 'No streak is written yet. The first clean day starts the count — mark tonight honestly and the line begins.',
               say: 'No streak yet. The first clean day starts it.',
               actions: [gotoAction('Open Today', 'today')], goto: 'today' };
    }
    var st = snap.streak;
    var text = 'The line holds at ' + pl(st.current, 'clean day') + '. Longest ever carved: ' + st.longest + '.';
    if (st.shields) text += ' ' + pl(st.shields, 'shield') + ' stand ready to take a blow for it.';
    var o = ctx.outlook;
    if (o && o.past > 0 && st.current > 0) {
      text += o.madeItBeyond === 0
        ? ' None of your ' + pl(o.past, 'past streak') + ' reached this far — this is new territory.'
        : ' Of ' + pl(o.past, 'past streak') + ', only ' + o.madeItBeyond + ' lived beyond this point' +
          (o.sharePct != null ? ' (' + o.sharePct + '%)' : '') + '. Association, not fate — but the odds are being rewritten by you.';
    }
    return { text: text, say: 'The streak stands at ' + st.current + ' clean days.', actions: [], goto: null };
  }

  /* ---- risk ---- */
  function rRisk(ctx) {
    var r = ctx.risk;
    if (!r || r.score == null) {
      return { text: 'The forecast has not been cast — it reads from your own logs: sleep, mood, urges, the hour. Keep the ledger honest and the Sight will name the wind.',
               say: 'No forecast yet. It reads from your logs.',
               actions: [gotoAction('Open the Sight', 'oracle')], goto: null };
    }
    // sort factors by |delta|; pressures (delta>0) first in the telling
    var factors = (r.factors || []).slice().sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });
    var press = [], guard = [];
    for (var i = 0; i < factors.length; i++) {
      if (factors[i].delta > 0 && press.length < 3) press.push(factors[i].label);
      if (factors[i].delta < 0 && guard.length < 2) guard.push(factors[i].label);
    }
    var text = bandWord(r.band) + ' — ' + r.score + ' of 100.';
    if (press.length) text += ' ' + press.join('; ') + '.';
    if (guard.length) text += ' In your favour: ' + guard.join('; ').toLowerCase() + '.';
    text += ' Association, not fate — the numbers name the wind; you hold the wheel.';
    var actions = [];
    if (r.band !== 'low') {
      actions.push({ label: '4·7·8 breath', act: 'breathwork', payload: 'relax478' });
      actions.push({ label: 'Ride it out (90s)', act: 'urge', payload: null });
    }
    return { text: text, say: 'Risk reads ' + bandWord(r.band).toLowerCase() + ', ' + r.score + ' of one hundred.',
             actions: actions, goto: null };
  }

  /* ---- prophecy (the week ending asOf) ---- */
  function rProphecy(ctx) {
    var p = ctx.prophecy;
    if (!p || p.answered == null) {
      return { text: 'A prophecy needs a written week. Log the days as they pass and ask again when seven stand behind you.',
               say: 'The prophecy needs a written week first.',
               actions: [gotoAction('Open Today', 'today')], goto: 'today' };
    }
    var text = 'The week ending ' + fmtDate(p.to) + ': ' + (p.cleanDays || 0) + ' of ' +
               pl(p.answered || 0, 'answered day') + ' clean';
    if (p.adherencePct != null) text += ', plan adherence ' + p.adherencePct + '%';
    if (p.avgSleep != null) text += ', sleep averaging ' + p.avgSleep + 'h';
    if (p.avgMood != null) text += ', mood ' + p.avgMood + ' of 5';
    text += '.';
    if (p.urges) text += ' ' + pl(p.urges, 'urge') + ' banked and outlasted.';
    if (p.chiEarned != null) text += ' The week earned ' + fmtNum(p.chiEarned) + ' Chi.';
    if (p.bestDate) text += ' Its finest day: ' + fmtDate(p.bestDate) + '.';
    if (p.trialsWon) text += ' ' + pl(p.trialsWon, 'trial') + ' won.';
    return { text: text,
             say: 'This week: ' + (p.cleanDays || 0) + ' of ' + (p.answered || 0) + ' answered days clean.',
             actions: [], goto: null };
  }

  /* ---- nutrition: remaining kcal/protein, or the locked/unplanned states ---- */
  function rNutrition(ctx) {
    var nut = ctx.nut;
    if (!nut || !nut.chosen) {
      var hasType = nut && nut.dayType;
      var text = hasType
        ? 'The day is marked ' + (nut.dayType === 'shift' ? 'a shift day' : 'a rest day') +
          ', but no plan is chosen yet. Pick one and I will keep the running count of what remains.'
        : 'Today’s plate is unwritten — shift day or rest day? Set the day type, choose a plan, then ask me what is left.';
      return { text: text, say: 'No meal plan is chosen yet for today.',
               actions: [gotoAction('Open Nutrition', 'nutrition')], goto: 'nutrition' };
    }
    var text = nut.template ? 'The plan is ' + nut.template.name + '.' : 'The plan is set.';
    if (nut.remainingKcal != null) {
      text += nut.remainingKcal > 0
        ? ' ' + fmtNum(nut.remainingKcal) + ' kcal remain of ' + fmtNum(nut.planKcal) + '.'
        : ' The day’s calories are fully accounted for — ' + fmtNum(nut.consumedKcal) + ' of ' + fmtNum(nut.planKcal) + ' taken.';
    }
    if (nut.remainingProtein != null) {
      text += nut.remainingProtein > 0
        ? ' ' + fmtNum(nut.remainingProtein) + 'g protein to the band floor (' + fmtNum(nut.proteinLow) + 'g).'
        : ' The protein band is reached — ' + fmtNum(nut.consumedProtein) + 'g down.';
    }
    text += ' Adherence tracks the plan you wrote; the Oracle never invents targets.';
    var say = nut.remainingKcal != null && nut.remainingKcal > 0
      ? fmtNum(nut.remainingKcal) + ' kilocalories remain today.'
      : 'The day’s plan is fully logged.';
    return { text: text, say: say, actions: [gotoAction('Open the plan', 'nutrition')], goto: null };
  }

  /* ---- nextshift / rota: read from ctx.rotaToday + ctx.upcoming ---- */
  function noRota() {
    return { text: 'The rota is not written yet. Teach me your shifts — paste, import or tap them in — and I will watch the days for you.',
             say: 'The rota is empty. Add your shifts first.',
             actions: [gotoAction('Open the Rota', 'rota')], goto: 'rota' };
  }
  function shiftTimes(kind) {
    return (kind && kind.start && kind.end) ? ', ' + kind.start + '–' + kind.end : '';
  }
  function rNextShift(ctx, text0) {
    var up = ctx.upcoming;
    if (!up || !up.length) return noRota();
    var asOf = ctxAsOf(ctx);
    var t = normalize(text0);
    // a specific kind asked for? ('next night' / 'next early' ...)
    var want = null;
    if (/night/.test(t)) want = 'night';
    else if (/early/.test(t)) want = 'early';
    else if (/late/.test(t)) want = 'late';
    else if (/long/.test(t)) want = 'long';
    else if (/on\s?call/.test(t)) want = 'oncall';
    // 'rota tomorrow' — answer for that exact date instead
    if (/tomorrow/.test(t) && !want) {
      var tom = U.addDays(asOf, 1), hit = null;
      for (var i = 0; i < up.length; i++) if (up[i].date === tom) { hit = up[i]; break; }
      if (!hit) return { text: 'Tomorrow carries no written rota entry. If that is wrong, the Rota screen will take it.',
                         say: 'Nothing is written for tomorrow.',
                         actions: [gotoAction('Open the Rota', 'rota')], goto: null };
      var kb = hit.kind;
      return { text: 'Tomorrow reads ' + (kb ? kb.label : hit.code) + ' (' + hit.code + ')' + shiftTimes(kb) + '.',
               say: 'Tomorrow: ' + (kb ? kb.label : hit.code) + '.', actions: [], goto: null };
    }
    // otherwise: first upcoming entry of the wanted kind, or first WORK shift
    var found = null;
    for (var j = 0; j < up.length; j++) {
      var e = up[j];
      if (want ? e.kindId === want : (e.kind && e.kind.work)) { found = e; break; }
    }
    if (!found) {
      var label = want ? want : 'working';
      return { text: 'No ' + label + ' shift stands in the next written days — rest, by the record. If the rota has moved on, write the new page.',
               say: 'No ' + label + ' shift in the written rota.',
               actions: [gotoAction('Open the Rota', 'rota')], goto: null };
    }
    var inDays = U.daysBetween(asOf, found.date);
    var when = inDays <= 0 ? 'today' : (inDays === 1 ? 'tomorrow' : 'in ' + pl(inDays, 'day'));
    var k = found.kind;
    var text = 'Next ' + (k ? k.label.toLowerCase() : 'shift') + ': ' + fmtDate(found.date) +
               ' (' + found.code + ')' + shiftTimes(k) + ' — ' + when + '.';
    return { text: text, say: 'Next ' + (k ? k.label : 'shift') + ' is ' + when + '.', actions: [], goto: null };
  }
  function rRota(ctx) {
    var today = ctx.rotaToday;
    if (!today) {
      // no entry today; if the rota has coming days, say so instead of "empty"
      if (ctx.upcoming && ctx.upcoming.length)
        return { text: 'Today carries no rota entry — unrostered, by the record. The next written day is ' +
                        fmtDate(ctx.upcoming[0].date) + ' (' + ctx.upcoming[0].code + ').',
                 say: 'No rota entry today.', actions: [gotoAction('Open the Rota', 'rota')], goto: null };
      return noRota();
    }
    var k = today.kind;
    if (!k) {
      return { text: 'Today’s rota code is ' + today.code + ', but I do not yet know what it means. Map it once on the Rota screen and I will read it forever.',
               say: 'Today’s code ' + today.code + ' is unmapped.',
               actions: [gotoAction('Open the Rota', 'rota')], goto: 'rota' };
    }
    var text = 'Today reads ' + k.label + ' (' + today.code + ')' + shiftTimes(k) + '.';
    text += k.dayType === 'shift'
      ? ' It suggests a shift-day plan — fuel for the long hours.'
      : ' It suggests a rest-day plan — recovery is also training.';
    return { text: text, say: 'Today is ' + k.label + '.',
             actions: [gotoAction('Open Nutrition', 'nutrition')], goto: null };
  }

  /* ---- the log family: propose, never write ---- */
  function rLogSteps(n) {
    if (n == null || n <= 0) return askNumber('How many steps shall I set down? Give me a number and the word steps.', 'How many steps?');
    n = Math.round(n);
    return proposal(fmtNum(n) + ' steps, then. Nothing is written until you confirm — tap, and it goes to the ledger.',
                    'Confirm to log ' + fmtNum(n) + ' steps.',
                    'Log ' + fmtNum(n) + ' steps', 'steps', n);
  }
  function rLogMeditation(n) {
    if (n == null || n <= 0) return askNumber('How many minutes of stillness? Give me a number.', 'How many minutes of meditation?');
    n = Math.round(n);
    return proposal(pl(n, 'minute') + ' of stillness. Confirm it and the record takes the sit.',
                    'Confirm to log ' + n + ' minutes of meditation.',
                    'Log ' + n + ' min meditation', 'med', n);
  }
  function rLogBreathing(n) {
    if (n == null || n <= 0) return askNumber('How many minutes of breathwork? Give me a number.', 'How many minutes of breathing?');
    n = Math.round(n);
    return proposal(pl(n, 'minute') + ' of breath — the Chi engine. Confirm and it is banked.',
                    'Confirm to log ' + n + ' minutes of breathing.',
                    'Log ' + n + ' min breathing', 'breath', n);
  }
  function rLogSleep(n) {
    if (n == null || n <= 0) return askNumber('How many hours did you sleep? Give me a number.', 'How many hours of sleep?');
    if (n > 24) n = U.round(n / 60, 1);          // '90 minutes' / 'slept 480' -> hours
    if (n > 24) return askNumber('Sleep is logged in hours — give me a number up to 24.', 'Give sleep in hours.');
    return proposal(n + 'h of sleep. Confirm it — the deep well feeds every other number.',
                    'Confirm to log ' + n + ' hours of sleep.',
                    'Log ' + n + 'h sleep', 'sleep', n);
  }
  function rLogMood(n) {
    if (n == null || Math.round(n) < 1 || Math.round(n) > 5)
      return askNumber('Mood runs 1 to 5 — one is the pit, five is the summit. Give me the number.', 'Mood runs one to five.');
    n = Math.round(n);
    return proposal('Mood ' + n + ' of 5, noted as spoken. Confirm and it is written.',
                    'Confirm to log mood ' + n + ' of five.',
                    'Log mood ' + n + '/5', 'mood', n);
  }
  function rMarkClean(ctx) {
    var snap = ctx.snap, tail = '';
    if (snap && snap.streak) tail = ' The line moves to ' + pl(snap.streak.current + 1, 'day') + '.';
    return proposal('Held the line — that is the only entry that matters. Confirm it and the day is taken.' + tail,
                    'Confirm to mark today clean.',
                    'Mark today clean', 'clean', true);
  }

  /* ---- urge: the crisis branch. Steady, grounded, two immediate outs. ---- */
  function rUrge(ctx) {
    var lines = ['Stand up. One slow breath. The wave is loudest right before it breaks — outlast it 90 seconds and it passes. It always passes.'];
    var snap = ctx.snap;
    if (snap && snap.streak && snap.streak.current > 0) {
      var rk = (snap.rank && snap.rank.current) ? ' at ' + snap.rank.current.name : '';
      lines.push('You hold ' + pl(snap.streak.current, 'clean day') + rk + '. One hour does not get to spend them.');
    }
    lines.push('You have beaten this exact moment before. Move the body, change the room, breathe the 4·7·8.');
    return {
      text: lines.join(' '),
      say: 'Breathe. Ninety seconds. The wave passes — it always passes.',
      actions: [
        { label: 'Ride it out (90s)', act: 'urge', payload: null },
        { label: '4·7·8 breath', act: 'breathwork', payload: 'relax478' }
      ],
      goto: null
    };
  }

  /* ---- wisdom: a codex line, live-stat placeholders filled when possible ---- */
  function fillQuote(q, snap) {
    if (!snap) return q;
    var rank = snap.rank || {};
    var map = {
      '{day}': snap.day != null ? snap.day : '—',
      '{streak}': snap.streak ? snap.streak.current : '—',
      '{rank}': rank.current ? rank.current.name : 'the walker',
      '{next}': rank.next ? rank.next.name : 'the summit',
      '{toNext}': rank.next ? pl(rank.daysToNext, 'day') : 'the last stretch',
      '{index}': snap.meters ? snap.meters.index : '—'
    };
    for (var k in map) if (map.hasOwnProperty(k)) q = q.split(k).join(String(map[k]));
    return q;
  }
  function rWisdom(ctx) {
    var pool = (CFG.quotes && CFG.quotes.daily && CFG.quotes.daily.length) ? CFG.quotes.daily
             : ['Stillness is not weakness; it is the bow drawn before the arrow.'];
    var snap = ctx.snap;
    if (!snap) { // no live stats -> only placeholder-free lines are safe
      var flat = [];
      for (var i = 0; i < pool.length; i++) if (pool[i].indexOf('{') < 0) flat.push(pool[i]);
      if (flat.length) pool = flat;
    }
    var q = fillQuote(pool[dailyIndex(ctxAsOf(ctx), pool.length)], snap);
    return { text: q, say: q, actions: [], goto: null };
  }

  /* ---- rank: ETA projections, honest footnote ---- */
  function rRank(ctx) {
    var eta = ctx.eta;
    if (eta && eta.projections && eta.projections.length) {
      var p = eta.projections[0];
      var pace = eta.cleanRate != null ? Math.round(eta.cleanRate * 100) + '% of answered days clean' : 'your current pace';
      var text = 'At ' + pace + ', ' + p.name + ' falls near ' + fmtDate(p.etaISO) + ' — ' + pl(p.daysAway, 'day') + ' out.';
      var rest = [];
      for (var i = 1; i < eta.projections.length && i < 4; i++)
        rest.push(eta.projections[i].name + ' ' + fmtDate(eta.projections[i].etaISO));
      if (rest.length) text += ' Beyond it: ' + rest.join(' · ') + '.';
      text += ' A projection, not a promise — the pace is yours to change.';
      return { text: text, say: p.name + ' is about ' + p.daysAway + ' days out at your pace.', actions: [], goto: null };
    }
    var snap = ctx.snap;
    if (snap && snap.rank && snap.rank.next) {
      return { text: 'You stand at ' + (snap.rank.current ? snap.rank.current.name : 'the road') + '. ' +
                     pl(snap.rank.daysToNext, 'day') + ' of held line to ' + snap.rank.next.name + '.',
               say: snap.rank.daysToNext + ' days to ' + snap.rank.next.name + '.', actions: [], goto: null };
    }
    return { text: 'The ladder needs a written history to project from. Log the days and I will date the ranks.',
             say: 'No projection yet. Log more days.', actions: [gotoAction('Open Today', 'today')], goto: 'today' };
  }

  /* ---- power: aura scores, self-referential by design ---- */
  function rPower(ctx) {
    var a = null;
    try {
      var settings = ctx.settings || (ctx.snap && ctx.snap.settings) || (S && S.getSettings());
      if (E && E.auraScores && settings) a = E.auraScores(settings, ctxAsOf(ctx));
    } catch (e) { a = null; }
    if (a) {
      return { text: 'Immortal Power reads ' + a.power + '%; Magnetism ' + a.magnetism +
                     '%. The bank holds ' + fmtNum(a.energyBanked) + ' Chi — banked work never unbanks. ' +
                     'Both are your own charge, read from your own ledger — never a promise about anyone else.',
               say: 'Power ' + a.power + ' percent. Magnetism ' + a.magnetism + ' percent.',
               actions: [gotoAction('Open Power', 'power')], goto: null };
    }
    var snap = ctx.snap;
    if (snap && snap.meters) {
      return { text: 'The meters read: charge ' + snap.meters.index + '%, presence ' + snap.meters.presence +
                     '%. The fuller aura reading lives on the Power screen.',
               say: 'Charge ' + snap.meters.index + ' percent.', actions: [gotoAction('Open Power', 'power')], goto: null };
    }
    return { text: 'The charge cannot be read from an empty ledger. Breathe, log, hold the line — then ask again.',
             say: 'Nothing to read yet. Log a day first.', actions: [gotoAction('Open Today', 'today')], goto: 'today' };
  }

  /* ---- moon / cosmos: moon from ctx, sun + Brahma Muhurta when located ---- */
  function fmtHM(min) {
    min = Math.round(min);
    min = ((min % 1440) + 1440) % 1440;
    var h = Math.floor(min / 60), m = min % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function rMoon(ctx) {
    var moon = ctx.moon, asOf = ctxAsOf(ctx);
    var SAN = global.RTI_SANCTUM;
    if (!moon && SAN && SAN.moonPhase) { try { moon = SAN.moonPhase(asOf); } catch (e) { moon = null; } }
    var parts = [], say = '';
    if (moon && moon.name) {
      parts.push((moon.emoji ? moon.emoji + ' ' : '') + moon.name + ' — ' +
                 (moon.illumPct != null ? moon.illumPct + '% lit.' : 'the sky keeps its count.'));
      say = moon.name + (moon.illumPct != null ? ', ' + moon.illumPct + ' percent lit.' : '.');
    }
    var sun = ctx.sun;
    if (sun && sun.polar) {
      parts.push('At your latitude the sun does not ' + (sun.polar === 'day' ? 'set' : 'rise') + ' today — polar ' + sun.polar + '.');
    } else if (sun && sun.sunrise && sun.sunset) {
      parts.push('Sunrise ' + sun.sunrise + ', sunset ' + sun.sunset + '.');
      // Brahma Muhurta: prefer a precomputed ctx.brahma, else derive from
      // sunrise minutes with the config offsets, else ask the Sanctum.
      var br = ctx.brahma || null;
      if (!br && sun.sunriseMin != null && CFG.sanctum && CFG.sanctum.cosmos) {
        br = { start: fmtHM(sun.sunriseMin - CFG.sanctum.cosmos.brahmaStartMin),
               end: fmtHM(sun.sunriseMin - CFG.sanctum.cosmos.brahmaEndMin) };
      }
      if (!br && SAN && SAN.brahmaMuhurta && ctx.settings &&
          ctx.settings.latitude != null && ctx.settings.longitude != null) {
        try { br = SAN.brahmaMuhurta(asOf, ctx.settings.latitude, ctx.settings.longitude); } catch (e) { br = null; }
      }
      if (br && br.start && br.end)
        parts.push('The Brahma Muhurta — the creator’s hour — opens ' + br.start + ' and closes ' + br.end + '. The old texts kept it for practice; the maths is computed on this device.');
    } else {
      parts.push('Set your sacred location in Settings and I will read sunrise, sunset and the Brahma Muhurta for your sky — computed here, sent nowhere.');
    }
    if (!parts.length) {
      return { text: 'The sky is not computed yet. The Sanctum carries the cosmic clock.',
               say: 'The sky is not computed yet.', actions: [gotoAction('Open the Sanctum', 'sanctum')], goto: 'sanctum' };
    }
    var actions = [];
    if (!(sun && (sun.sunrise || sun.polar))) actions.push(gotoAction('Set location', 'settings'));
    if (!say) say = 'The sky report is on screen.';
    return { text: parts.join(' '), say: say, actions: actions, goto: null };
  }

  /* ---- help: what the Oracle reads and what it can write ---- */
  function rHelp() {
    var text =
      'I read only your own ledger — nothing leaves this device. Ask me:\n' +
      '· "status" · "streak" · "risk tonight" · "weekly prophecy"\n' +
      '· "what’s left to eat" — remaining kcal and protein\n' +
      '· "rota today" · "next shift" · "next night"\n' +
      '· "when do I reach the next rank" · "power" · "moon" · "wisdom"\n' +
      'I can also take dictation for the record — "12,000 steps", "meditated 20 minutes", ' +
      '"slept 7 hours", "mood 4", "mark today clean" — you confirm, then it is written. ' +
      'And if the wave hits, say "urge" and I will stand with you.';
    return { text: text,
             say: 'Ask about your streak, risk, food or rota — or give me numbers to log.',
             actions: [], goto: null };
  }

  /* ---- unknown ---- */
  function rUnknown(ctx) {
    var pool = ocList('unknown');
    var line = pool.length ? pool[dailyIndex(ctxAsOf(ctx), pool.length)] : FALLBACK.unknown[0];
    return { text: line, say: 'Ask about your streak, risk, food or rota — or say help.', actions: [], goto: null };
  }

  function respond(text, ctx) {
    ctx = ctx || {};
    var it, out = null;
    try { it = interpret(text); } catch (e0) { it = { intent: 'unknown', n: null, confidence: 0 }; }
    try {
      switch (it.intent) {
        case 'status':        out = rStatus(ctx); break;
        case 'streak':        out = rStreak(ctx); break;
        case 'risk':          out = rRisk(ctx); break;
        case 'prophecy':      out = rProphecy(ctx); break;
        case 'nutrition':     out = rNutrition(ctx); break;
        case 'nextshift':     out = rNextShift(ctx, text); break;
        case 'rota':          out = rRota(ctx); break;
        case 'logSteps':      out = rLogSteps(it.n); break;
        case 'logMeditation': out = rLogMeditation(it.n); break;
        case 'logBreathing':  out = rLogBreathing(it.n); break;
        case 'logSleep':      out = rLogSleep(it.n); break;
        case 'logMood':       out = rLogMood(it.n); break;
        case 'markClean':     out = rMarkClean(ctx); break;
        case 'urge':          out = rUrge(ctx); break;
        case 'wisdom':        out = rWisdom(ctx); break;
        case 'rank':          out = rRank(ctx); break;
        case 'power':         out = rPower(ctx); break;
        case 'moon':          out = rMoon(ctx); break;
        case 'help':          out = rHelp(); break;
        default:              out = rUnknown(ctx);
      }
    } catch (e1) { out = null; } // any branch failure degrades to the unknown line
    if (!out || !out.text) { try { out = rUnknown(ctx); } catch (e2) { out = { text: FALLBACK.unknown[0] }; } }
    return {
      text: out.text,
      say: out.say || out.text,
      actions: out.actions || [],
      goto: out.goto || null
    };
  }

  /* =====================================================================
     3) WHISPER — one data-grounded line for the Today screen, rotated
     deterministically by date (same day -> same whisper). The app prefixes
     CFG.oracle.whisperIntro; this returns bare text, always non-empty.
     ===================================================================== */
  function whisper(ctx) {
    ctx = ctx || {};
    var asOf = ctxAsOf(ctx);
    var cands = [];

    // risk: name the loudest pressure early (only when there IS pressure)
    try {
      var r = ctx.risk;
      if (r && r.score != null && r.factors && r.factors.length) {
        var top = null;
        for (var i = 0; i < r.factors.length; i++) {
          var f = r.factors[i];
          if (f.delta > 0 && (!top || f.delta > top.delta)) top = f;
        }
        if (top && r.band !== 'low')
          cands.push('Tonight’s forecast reads ' + r.score + ' — ' + String(top.label).toLowerCase() + '. Name the wind early and it loses the ambush.');
      }
    } catch (e1) {}

    // prophecy: the week's finest day is a map, not a trophy
    try {
      var p = ctx.prophecy;
      if (p && p.bestDate)
        cands.push('The week’s finest day was ' + fmtDate(p.bestDate) + ' — ' + (p.cleanDays || 0) + ' of 7 held. Study what built it, then repeat it.');
    } catch (e2) {}

    // survival outlook: the streak measured against its own history
    try {
      var o = ctx.outlook, stc = ctx.snap && ctx.snap.streak ? ctx.snap.streak.current : null;
      if (o && o.past > 0 && stc != null && stc > 0) {
        cands.push(o.madeItBeyond === 0
          ? 'None of your ' + pl(o.past, 'past streak') + ' reached day ' + stc + '. You walk new ground — walk it carefully.'
          : 'Only ' + o.madeItBeyond + ' of ' + pl(o.past, 'past streak') + ' lived past day ' + stc + '. Association, not fate — and today you are the association.');
      }
    } catch (e3) {}

    // rota: the next working day, so the plan is set before it arrives
    try {
      var up = ctx.upcoming;
      if (up && up.length) {
        var w = null;
        for (var j = 0; j < up.length; j++) { if (up[j].kind && up[j].kind.work) { w = up[j]; break; } }
        if (w) {
          var inD = U.daysBetween(asOf, w.date);
          var when = inD <= 0 ? 'today' : (inD === 1 ? 'tomorrow' : 'in ' + pl(inD, 'day'));
          cands.push('Next ' + w.kind.label.toLowerCase() + ' is ' + when + ' (' + fmtDate(w.date) + '). Set the day plan before the day sets you.');
        }
      }
    } catch (e4) {}

    // moon: the sky keeps its rhythm; keep yours
    try {
      var mo = ctx.moon;
      if (mo && mo.name)
        cands.push(mo.name + ' tonight' + (mo.illumPct != null ? ' — ' + mo.illumPct + '% lit' : '') + '. The sky keeps its rhythm without being asked. Keep yours.');
    } catch (e5) {}

    // fallback: always at least one line, even on an empty ctx
    try {
      var snap = ctx.snap;
      if (snap && snap.day != null) {
        var stc2 = snap.streak ? snap.streak.current : 0;
        cands.push('Day ' + snap.day + (stc2 > 0 ? ', a ' + stc2 + '-day line' : '') + '. Guard the evening and the whole day is won.');
      }
    } catch (e6) {}
    if (!cands.length) cands.push('The ledger waits for one true line. Write it, and the record answers.');

    return cands[dailyIndex(asOf, cands.length)];
  }

  global.RTI_ORACLE = { interpret: interpret, respond: respond, whisper: whisper };
})(typeof window !== 'undefined' ? window : this);
