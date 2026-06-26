/* =====================================================================
   Road to Immortal — ENGINE (derived values; the core)
   ---------------------------------------------------------------------
   Pure-ish computation over store data + config. Nothing here is stored
   as truth: day, rank, streak, shields and every meter are recomputed
   from startDate + the raw logs each time. The owner cannot fake them.
   ===================================================================== */
(function (global) {
  'use strict';
  var U = global.RTI_UTIL, CFG = global.RTI_CONFIG, S = global.RTI_STORE;

  /* ---------- day / progress / rank ---------- */
  function dayNumber(settings, asOf) {
    return U.daysBetween(settings.startDate, asOf) + 1; // day 1 = startDate
  }
  function progress(settings, asOf) {
    var span = U.daysBetween(settings.startDate, settings.targetDate);
    var elapsed = U.daysBetween(settings.startDate, asOf);
    var pct = span > 0 ? U.clamp(elapsed / span * 100, 0, 100) : 0;
    return {
      span: span,
      elapsed: elapsed,
      pct: U.round(pct, 1),
      daysToImmortal: Math.max(0, U.daysBetween(asOf, settings.targetDate))
    };
  }
  function rankFor(day) {
    var ranks = CFG.RANKS, curIdx = -1;
    for (var i = 0; i < ranks.length; i++) { if (day >= ranks[i].reach) curIdx = i; }
    var current = curIdx >= 0 ? ranks[curIdx] : null;
    var next = curIdx + 1 < ranks.length ? ranks[curIdx + 1] : null;
    return {
      index: curIdx,
      current: current,
      next: next,
      daysToNext: next ? Math.max(0, next.reach - day) : 0,
      pctToNext: next && current ? U.clamp((day - current.reach) / (next.reach - current.reach) * 100, 0, 100)
                                 : (next ? U.clamp(day / next.reach * 100, 0, 100) : 100)
    };
  }

  /* ---------- timeline status per date ---------- */
  function dayStatus(date) {
    var log = S.getLog(date);
    if (log.clean === true) return 'clean';
    if (log.clean === false || S.relapseOnDate(date)) return 'broken';
    return 'unlogged';
  }

  /* ---------- streak + shields (history replay) ---------- */
  function streakAsOf(settings, asOf) {
    var start = settings.startDate;
    // journey not begun yet (future startDate): nothing lived, nothing counted
    if (U.daysBetween(start, asOf) < 0)
      return { current: 0, longest: 0, shields: 0, weekProgress: 0, shieldBurnedToday: false };
    var total = Math.max(0, U.daysBetween(start, asOf));
    var streak = 0, longest = 0, shields = 0, week = 0;
    var maxShields = CFG.shields.maxStored, perWeek = CFG.shields.perPerfectWeekDays;
    var burnedToday = false;
    for (var i = 0; i <= total; i++) {
      var date = U.addDays(start, i);
      var st = dayStatus(date);
      burnedToday = false;
      if (st === 'clean') {
        streak++; week++;
        if (week >= perWeek) { shields = Math.min(maxShields, shields + 1); week = 0; }
        if (streak > longest) longest = streak;
      } else if (st === 'broken') {
        if (shields > 0) { shields--; week = 0; burnedToday = true; /* streak preserved */ }
        else { if (streak > longest) longest = streak; streak = 0; week = 0; }
      } else { // unlogged: neutral — hold streak, but a gap can't count toward a perfect week
        week = 0;
      }
    }
    if (streak > longest) longest = streak;
    return { current: streak, longest: longest, shields: shields, weekProgress: week, shieldBurnedToday: burnedToday };
  }

  /* ---------- nutrition adherence + flags (6C) ---------- */
  var STATUS_WEIGHT = { eaten: 1, partial: 0.5, swapped: 0.5, skipped: 0 };
  function num(x) { x = +x; return isFinite(x) ? x : 0; } // NaN/garbage -> 0
  function getTemplate(id) {
    var t = CFG.nutrition.templates;
    for (var i = 0; i < t.length; i++) if (t[i].id === id) return t[i];
    return null;
  }
  // per-meal kcal/protein with the owner's editable overrides applied
  function effectiveMeal(tpl, key) {
    var m = tpl.meals[key];
    var s = S.getSettings();
    var ov = s.mealOverrides && s.mealOverrides[tpl.id] && s.mealOverrides[tpl.id][key];
    return {
      items: m.items, tags: m.tags, nutsGrams: m.nutsGrams, coconutMl: m.coconutMl,
      kcal: (ov && ov.kcal != null) ? ov.kcal : m.kcal,
      protein: (ov && ov.protein != null) ? ov.protein : m.protein
    };
  }
  function nutritionAdherence(log) {
    var n = log && log.nutrition;
    if (!n || !n.templateId) {
      return { chosen: false, adherence: 0, proteinHit: false, consumedKcal: 0, consumedProtein: 0,
               remainingKcal: null, remainingProtein: null, template: null, dayType: n ? n.dayType : null };
    }
    var tpl = getTemplate(n.templateId);
    if (!tpl) return { chosen: false, adherence: 0, proteinHit: false, template: null };
    var meals = CFG.nutrition.mealOrder, planned = meals.length;
    var weightSum = 0, kcal = 0, protein = 0;
    for (var i = 0; i < meals.length; i++) {
      var key = meals[i].key;
      var status = n.meals && n.meals[key];
      var w = STATUS_WEIGHT[status] || 0;
      var em = effectiveMeal(tpl, key);
      weightSum += w;
      kcal += num(em.kcal) * w;
      protein += num(em.protein) * w;
    }
    var adherence = planned ? weightSum / planned : 0;
    var proteinHit = protein >= tpl.proteinLow;   // hit when consumed reaches the band floor
    return {
      chosen: true, template: tpl, dayType: n.dayType || tpl.dayType,
      adherence: adherence,
      proteinHit: proteinHit,
      consumedKcal: Math.round(kcal),
      consumedProtein: Math.round(protein),
      planKcal: tpl.planKcal, planProtein: tpl.planProtein,
      proteinLow: tpl.proteinLow, proteinHigh: tpl.proteinHigh,
      remainingKcal: tpl.planKcal - Math.round(kcal),
      remainingProtein: tpl.proteinLow - Math.round(protein)
    };
  }
  // active = meals not skipped and actually engaged (eaten/partial/swapped)
  function activeTags(log) {
    var n = log && log.nutrition, set = {};
    if (!n || !n.templateId) return set;
    var tpl = getTemplate(n.templateId);
    if (!tpl) return set;
    var meals = CFG.nutrition.mealOrder;
    for (var i = 0; i < meals.length; i++) {
      var key = meals[i].key, status = n.meals && n.meals[key];
      if (status === 'eaten' || status === 'partial' || status === 'swapped') {
        (tpl.meals[key].tags || []).forEach(function (t) { set[t] = true; });
      }
    }
    return set;
  }
  // returns array of { rule, level: 'amber'|'info', msg }
  function nutritionFlags(log) {
    var out = [], n = log && log.nutrition;
    if (!n || !n.templateId) return out;
    var tpl = getTemplate(n.templateId);
    if (!tpl) return out;
    var dayType = n.dayType || tpl.dayType;
    var tags = activeTags(log);
    var dinnerStatus = n.meals && n.meals.D;
    var dinnerActive = dinnerStatus === 'eaten' || dinnerStatus === 'partial' || dinnerStatus === 'swapped';
    var fattyDinner = (tpl.fattyDinner && dinnerActive) || (dinnerActive && (tags['salmon'] || tags['pork-curry']));
    var hasButter = !!tags['butter'] || !!n.extraButter;
    var hasBanana = !!tags['banana'];
    var hasSalmon = !!tags['salmon'];
    var coconutMl = (n.coconutMl != null) ? n.coconutMl : (tags['coconut'] ? (tpl.meals.D.coconutMl || 100) : 0);
    var hasCoconut = !!tags['coconut'] || coconutMl > 0;
    var nutsGrams = (n.nutsGrams != null) ? n.nutsGrams
                    : (function () { var g = 0, m = CFG.nutrition.mealOrder; for (var i=0;i<m.length;i++){ var k=m[i].key, st=n.meals&&n.meals[k]; if((st==='eaten'||st==='partial'||st==='swapped')&&tpl.meals[k].nutsGrams) g+=tpl.meals[k].nutsGrams; } return g; })();
    var hasRedMeat = !!tags['beef'] || !!tags['pork-curry'];
    var lim = CFG.nutrition.limits;

    // 1. fatty dinner -> shift days only
    if (dayType === 'rest' && fattyDinner)
      out.push({ rule: 1, level: 'amber', msg: 'Fatty dinner on a rest day — the plan keeps pork curry / salmon to shift days.' });
    // 2. never two fatty things in one day
    var fattyCount = (fattyDinner ? 1 : 0) + (hasButter ? 1 : 0) + (hasCoconut ? 1 : 0);
    if (fattyCount >= 2)
      out.push({ rule: 2, level: 'amber', msg: 'Two fatty things in one day — the plan keeps fat to a single source.' });
    // 3. coconut: light, measured, lean fish only, never with salmon
    if (hasCoconut && hasSalmon)
      out.push({ rule: 3, level: 'amber', msg: 'Coconut milk never goes with salmon.' });
    if (coconutMl > lim.coconutMlMax)
      out.push({ rule: 3, level: 'amber', msg: 'Coconut milk over ' + lim.coconutMlMax + 'ml — keep it light and measured.' });
    if (hasCoconut && hasRedMeat)
      out.push({ rule: 3, level: 'amber', msg: 'Coconut milk is for lean fish only.' });
    // 4. butter only on days WITHOUT a fatty dinner (confirmed interpretation)
    if (hasButter && fattyDinner)
      out.push({ rule: 4, level: 'amber', msg: 'Butter only on days without a fatty dinner.' });
    // 5. banana: training only, shift days
    if (hasBanana && dayType === 'rest')
      out.push({ rule: 5, level: 'amber', msg: 'Banana is for training on shift days.' });
    // 6. nuts <= 25 g/day
    if (nutsGrams > lim.nutsGramsMax)
      out.push({ rule: 6, level: 'amber', msg: 'Nuts over ' + lim.nutsGramsMax + 'g — calorie-dense, ease off.' });
    // 7. a slip is offset by the 1hr walk (informational only)
    var slip = false, m = CFG.nutrition.mealOrder;
    for (var i = 0; i < m.length; i++) { var st = n.meals && n.meals[m[i].key]; if (st === 'swapped' || st === 'skipped') slip = true; }
    if (slip || (n.offPlanNotes && n.offPlanNotes.trim()))
      out.push({ rule: 7, level: 'info', msg: 'A 1hr walk (~' + lim.walkOffsetKcal + ' kcal) offsets one slip — not a heavy day.' });
    return out;
  }

  /* ---------- meters over a rolling window ---------- */
  function metersAsOf(settings, asOf) {
    var mc = CFG.meters, win = mc.windowDays;
    var streak = streakAsOf(settings, asOf);
    var targets = settings.dailyTargets || CFG.dailyTargets;

    var chiRaw = 0, vitRaw = 0, wpRaw = 0;
    for (var i = 0; i < win; i++) {
      var date = U.addDays(asOf, -i);
      if (U.daysBetween(settings.startDate, date) < 0) continue; // before journey
      var log = S.getLog(date);
      var clean = log.clean === true ? 1 : 0;
      // CHI window (num() neutralises any NaN/garbage from a corrupt import)
      chiRaw += mc.chi.perBreathingMin * num(log.breathingMin)
              + mc.chi.perMeditationMin * num(log.meditationMin)
              + mc.chi.perCleanDay * clean;
      // VITALITY window
      var adh = nutritionAdherence(log);
      var sleepOk = (log.sleepHrs != null && isFinite(+log.sleepHrs) && +log.sleepHrs >= CFG.sleepGoalHrs);
      var cardioDone = log.cardio && (log.cardio.minutes == null || num(log.cardio.minutes) > 0);
      vitRaw += num(log.steps) / 1000 * mc.vitality.perThousandSteps
              + (log.workout ? mc.vitality.workoutDone : 0)
              + (cardioDone ? mc.vitality.cardioDone : 0)
              + (sleepOk ? mc.vitality.sleep7plus : 0)
              + (adh.chosen && adh.adherence >= 0.8 ? mc.vitality.adherence80plus : 0)
              + (adh.chosen && adh.proteinHit ? mc.vitality.proteinHit : 0);
      // WILLPOWER window
      var urges = S.urgesOnDate(date);
      var allTargets = log.todayTargetsDone && log.todayTargetsDone.length === targets.length
                       && log.todayTargetsDone.every(function (b) { return b === true; });
      wpRaw += mc.willpower.perCleanDay * clean
             + mc.willpower.perUrgeResisted * urges
             + (allTargets ? mc.willpower.allTargetsDone : 0);
    }

    // CHI streak bonus + relapse dampen
    var bonus = U.clamp(1 + streak.current * mc.chi.streakBonusPer, 1, mc.chi.streakBonusCap);
    var relapsesInWindow = S.getRelapses().filter(function (r) {
      var d = U.daysBetween(r.date, asOf); return d >= 0 && d < win;
    }).length;
    var chiRawAdj = chiRaw * bonus * Math.pow(mc.chi.relapseDampen, relapsesInWindow);

    var chi = U.clamp(chiRawAdj / mc.chi.maxPerWindow * 100, 0, 100);
    var vitality = U.clamp(vitRaw / mc.vitality.maxPerWindow * 100, 0, 100);
    var willpower = U.clamp(wpRaw / mc.willpower.maxPerWindow * 100, 0, 100);
    var normStreak = U.clamp(streak.current / mc.presence.streakRefDays * 100, 0, 100);
    var presence = 0.5 * normStreak + 0.5 * chi;

    var w = mc.immortalIndex, wsum = w.chi + w.willpower + w.vitality + w.presence;
    var index = (w.chi * chi + w.willpower * willpower + w.vitality * vitality + w.presence * presence) / wsum;

    return {
      chi: U.round(chi, 0), vitality: U.round(vitality, 0), willpower: U.round(willpower, 0),
      presence: U.round(presence, 0), index: U.round(index, 0),
      streakBonus: U.round(bonus, 2),
      _chiRawAdj: chiRawAdj
    };
  }

  // "+X CHI" burst when logging breathing minutes right now.
  function chiDeltaForBreathing(settings, asOf, addMin) {
    var mc = CFG.meters;
    var streak = streakAsOf(settings, asOf);
    var bonus = U.clamp(1 + streak.current * mc.chi.streakBonusPer, 1, mc.chi.streakBonusCap);
    var relapsesInWindow = S.getRelapses().filter(function (r) {
      var d = U.daysBetween(r.date, asOf); return d >= 0 && d < mc.windowDays;
    }).length;
    var deltaRaw = mc.chi.perBreathingMin * addMin * bonus * Math.pow(mc.chi.relapseDampen, relapsesInWindow);
    return U.round(deltaRaw / mc.chi.maxPerWindow * 100, 1);
  }

  /* ---------- weekly rolling totals ---------- */
  function weeklyTotals(settings, asOf) {
    var win = CFG.meters.windowDays, t = { steps: 0, kcalBurned: 0, meditationMin: 0, breathingMin: 0 };
    for (var i = 0; i < win; i++) {
      var date = U.addDays(asOf, -i);
      if (U.daysBetween(settings.startDate, date) < 0) continue;
      var log = S.getLog(date);
      t.steps += num(log.steps);
      t.kcalBurned += num(log.kcalBurned);
      t.meditationMin += num(log.meditationMin);
      t.breathingMin += num(log.breathingMin);
    }
    return t;
  }

  /* ---------- Energy Bank: lifetime Chi (monotonic) (increment 2) ----------
     dailyChiEarned = the Chi a day GENERATED from its inputs, before any
     relapse dampening: (2*breath + 1*med + 10*clean) * streakBonus(that day).
     totalChiAccumulated never decreases — a relapse dampens today's *level*
     (the meter), it does not erase banked work. Single timeline pass. */
  function chiSeries(settings, asOf) {
    var start = settings.startDate, series = [], total = 0;
    if (U.daysBetween(start, asOf) < 0) return { series: series, total: 0 };
    var span = U.daysBetween(start, asOf), mc = CFG.meters.chi, sh = CFG.shields;
    var streak = 0, shields = 0, week = 0;
    for (var i = 0; i <= span; i++) {
      var date = U.addDays(start, i), st = dayStatus(date);
      if (st === 'clean') { streak++; week++; if (week >= sh.perPerfectWeekDays) { shields = Math.min(sh.maxStored, shields + 1); week = 0; } }
      else if (st === 'broken') { if (shields > 0) { shields--; week = 0; } else { streak = 0; week = 0; } }
      else { week = 0; }
      var log = S.getLog(date), clean = log.clean === true ? 1 : 0;
      var bonus = U.clamp(1 + streak * mc.streakBonusPer, 1, mc.streakBonusCap);
      var earned = (mc.perBreathingMin * num(log.breathingMin) + mc.perMeditationMin * num(log.meditationMin) + mc.perCleanDay * clean) * bonus;
      total += earned; // earned >= 0 always -> monotonic
      series.push({ day: i + 1, date: date, status: st, streak: streak, earned: earned, cumulative: total });
    }
    return { series: series, total: total };
  }
  function totalChiAccumulated(settings, asOf) { return chiSeries(settings, asOf).total; }

  // Per-day Chi (earned + cumulative) joined with each outcome, for the
  // Ascension comparison charts.
  function ascensionData(settings, asOf) {
    var cs = chiSeries(settings, asOf);
    var out = cs.series.map(function (d) {
      var log = S.getLog(d.date), study = log.study;
      var opp = study && study.opportunities, hasOpp = opp != null && opp > 0;
      var clear = (study && study.signalsClear) || 0, amb = (study && study.signalsAmbiguous) || 0;
      var adh = nutritionAdherence(log);
      return {
        day: d.day, date: d.date, chiEarned: d.earned, chiCumulative: d.cumulative, streak: d.streak,
        signalRate: hasOpp ? (clear + amb) / opp : null,
        signalClearRate: hasOpp ? clear / opp : null,
        hasOpp: hasOpp, hasSignal: hasOpp && (clear + amb) > 0,
        confidence: (study && study.confidence) || 0,
        behavedDifferently: !!(study && study.behavedDifferently),
        mood: log.mood != null ? log.mood : null,
        urges: S.urgesOnDate(d.date),
        adherence: adh.chosen ? adh.adherence : null
      };
    });
    return { series: out, total: cs.total };
  }

  // Correlation integrity gate (section 1.3). Locked until day>=minDay AND
  // enough opportunity-days AND enough signal-days. Spearman when unlocked.
  function correlationStatus(settings, asOf, hcOnly) {
    var data = ascensionData(settings, asOf), lock = CFG.ascension.correlationLock;
    var day = dayNumber(settings, asOf);
    var oppDays = data.series.filter(function (d) { return d.hasOpp; }).length;
    var signalDays = data.series.filter(function (d) { return d.hasSignal; }).length;
    var unlocked = day >= lock.minDay && oppDays >= lock.minOppDays && signalDays >= lock.minSignalDays;
    var res = { unlocked: unlocked, day: day, oppDays: oppDays, signalDays: signalDays, thresholds: lock, total: data.total };
    if (unlocked) {
      var used = data.series.filter(function (d) { return d.hasOpp && (!hcOnly || d.confidence >= 4); });
      var rate = used.map(function (d) { return d.signalRate; });
      res.spearmanStreak = U.spearman(rate, used.map(function (d) { return d.streak; }));
      res.spearmanChi = U.spearman(rate, used.map(function (d) { return metersAsOf(settings, d.date).chi; }));
      var sig = used.filter(function (d) { return d.hasSignal; });
      res.behavedShare = sig.length ? Math.round(sig.filter(function (d) { return d.behavedDifferently; }).length / sig.length * 100) : 0;
      res.nUsed = used.length;
    }
    return res;
  }

  /* ---------- full snapshot for the UI ---------- */
  function snapshot(asOf) {
    var settings = S.getSettings();
    asOf = asOf || U.todayISO();
    var day = dayNumber(settings, asOf);
    var prog = progress(settings, asOf);
    var rank = rankFor(day);
    var streak = streakAsOf(settings, asOf);
    var meters = metersAsOf(settings, asOf);
    var weekly = weeklyTotals(settings, asOf);
    return {
      asOf: asOf, settings: settings, day: day, progress: prog, rank: rank,
      streak: streak, meters: meters, weekly: weekly
    };
  }

  global.RTI_ENGINE = {
    dayNumber: dayNumber, progress: progress, rankFor: rankFor, dayStatus: dayStatus,
    streakAsOf: streakAsOf, metersAsOf: metersAsOf, chiDeltaForBreathing: chiDeltaForBreathing,
    weeklyTotals: weeklyTotals, snapshot: snapshot,
    chiSeries: chiSeries, totalChiAccumulated: totalChiAccumulated,
    ascensionData: ascensionData, correlationStatus: correlationStatus,
    nutritionAdherence: nutritionAdherence, nutritionFlags: nutritionFlags,
    activeTags: activeTags, getTemplate: getTemplate, effectiveMeal: effectiveMeal
  };
})(typeof window !== 'undefined' ? window : this);
