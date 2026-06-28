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

  /* =====================================================================
     INCREMENT 3 — THE ASCENDANT (derived: coach, aura, stages, standing)
     ===================================================================== */

  /* ---------- coach: which phase of the day are we in ---------- */
  function coachPhase(hour) {
    var ph = CFG.coach.phases;
    for (var i = 0; i < ph.length; i++) {
      var p = ph[i];
      if (p.from < p.to) { if (hour >= p.from && hour < p.to) return p; }
      else { if (hour >= p.from || hour < p.to) return p; } // wraps midnight
    }
    return ph[0];
  }
  // the meal to nudge for around `hour` (latest-starting window that contains it)
  function mealNudge(hour) {
    var mw = CFG.coach.mealWindows, order = CFG.nutrition.mealOrder, best = null, bestFrom = -1;
    for (var i = 0; i < order.length; i++) {
      var k = order[i].key, w = mw[k];
      if (w && hour >= w[0] && hour < w[1] && w[0] > bestFrom) { best = k; bestFrom = w[0]; }
    }
    return best;
  }

  /* ---------- daily agenda: what's filled, what's missing, what's timely ----------
     The engine returns SEMANTIC items (kind/ids). The UI maps them to inline
     actions or routes. completion is over the core daily set. */
  function dailyAgenda(settings, asOf, hour) {
    var log = S.getLog(asOf), n = log.nutrition || {};
    var phase = coachPhase(hour), pid = phase.id, curMeal = mealNudge(hour);
    var targets = settings.dailyTargets || CFG.dailyTargets;
    var doneArr = log.todayTargetsDone || [];
    var allTargets = doneArr.length === targets.length && doneArr.length > 0 && doneArr.every(function (b) { return b === true; });
    var moved = num(log.steps) > 0 || !!log.workout || (log.cardio && (log.cardio.minutes == null || num(log.cardio.minutes) > 0));
    var hasType = !!n.dayType, hasPlan = !!n.templateId;
    var mealLabel = {}; CFG.nutrition.mealOrder.forEach(function (mo) { mealLabel[mo.key] = mo.label; });

    var items = [];
    function push(id, kind, label, done, opts) {
      opts = opts || {};
      items.push({ id: id, kind: kind, label: label, done: !!done, timely: !!opts.timely, blocked: !!opts.blocked, mealKey: opts.mealKey || null });
    }
    push('daytype', 'daytype', 'Shift day or rest day?', hasType, { timely: pid === 'morning' });
    push('plan', 'plan', 'Choose today’s meal plan', hasPlan, { timely: pid === 'morning', blocked: !hasType });
    CFG.nutrition.mealOrder.forEach(function (mo) {
      var k = mo.key, got = n.meals && n.meals[k] != null;
      push('meal-' + k, 'meal', 'Log ' + mealLabel[k].toLowerCase(), got, { timely: k === curMeal, blocked: !hasPlan, mealKey: k });
    });
    push('clean', 'clean', 'Did you hold the line today?', log.clean !== null, { timely: pid === 'evening' || pid === 'night' });
    push('breath', 'breath', 'Energy / testicle breathing', num(log.breathingMin) > 0, { timely: pid === 'morning' || pid === 'afternoon' });
    push('med', 'med', 'Meditate', num(log.meditationMin) > 0, { timely: pid === 'afternoon' || pid === 'evening' });
    push('move', 'move', 'Move — steps / cardio', moved, { timely: pid === 'midday' || pid === 'afternoon' });
    push('mood', 'mood', 'Log today’s mood', log.mood != null, { timely: pid === 'evening' });
    push('targets', 'targets', 'Finish today’s targets', allTargets, { timely: pid === 'evening' });

    var total = items.length, done = items.filter(function (it) { return it.done; }).length;
    var pending = items.filter(function (it) { return !it.done && !it.blocked; });
    var prio = { clean: 0, daytype: 1, plan: 2, meal: 3, move: 5, breath: 6, med: 7, mood: 8, targets: 9 };
    pending.sort(function (a, b) {
      var at = a.timely ? 0 : 1, bt = b.timely ? 0 : 1;
      if (at !== bt) return at - bt;
      return (prio[a.kind] == null ? 4 : prio[a.kind]) - (prio[b.kind] == null ? 4 : prio[b.kind]);
    });
    return {
      phase: pid, greet: phase.greet, line: phase.line, curMeal: curMeal,
      items: items, doneCount: done, totalCount: total,
      completionPct: total ? Math.round(done / total * 100) : 0,
      primary: pending[0] || null, pendingCount: pending.length
    };
  }

  /* ---------- aura: Immortal Power + Magnetism (both 0-100, self-referential) ---------- */
  function auraScores(settings, asOf) {
    var m = metersAsOf(settings, asOf);
    var streak = streakAsOf(settings, asOf);
    var bank = totalChiAccumulated(settings, asOf);
    var a = CFG.aura;
    var normStreak = U.clamp(streak.current / a.powerStreakRefDays * 100, 0, 100);
    var normBank = U.clamp(bank / a.chiBankRef * 100, 0, 100);
    var pw = a.powerWeights, mw = a.magnetWeights;
    var power = pw.streak * normStreak + pw.index * m.index + pw.bank * normBank;
    var magnetism = mw.presence * m.presence + mw.streak * normStreak + mw.chi * m.chi + mw.willpower * m.willpower;
    return {
      power: U.round(U.clamp(power, 0, 100), 0),
      magnetism: U.round(U.clamp(magnetism, 0, 100), 0),
      energyBanked: Math.round(bank),
      normStreak: U.round(normStreak, 0), normBank: U.round(normBank, 0),
      meters: m, streak: streak
    };
  }

  /* ---------- stage ladder (keyed by current clean streak) ---------- */
  function stageFor(streak) {
    var st = CFG.stages, idx = 0;
    for (var i = 0; i < st.length; i++) if (streak >= st[i].reach) idx = i;
    var cur = st[idx], next = idx + 1 < st.length ? st[idx + 1] : null;
    var progressPct = next ? U.clamp((streak - cur.reach) / (next.reach - cur.reach) * 100, 0, 100) : 100;
    return { index: idx, current: cur, next: next, progressPct: U.round(progressPct, 0), daysToNext: next ? Math.max(0, next.reach - streak) : 0 };
  }

  /* ---------- Daily Trial (rotating challenge; own tally, never touches meters) ----------
     Deterministic per-day pick (same seeding as app.js dailyPick) keyed on the
     passed date so it can be asserted for any day. Auto trials are detected from
     the day's log; manual trials read log.trial.done only when the stored id
     matches the day's trial (guards a stale completion across midnight). */
  function trialIndexFor(asOf) {
    var n = CFG.trials.length, seed = U.daysBetween('2020-01-01', asOf);
    return ((seed % n) + n) % n;
  }
  function trialMet(trial, log, settings) {        // pure; reads only
    switch (trial.metric) {
      case 'steps':         return num(log.steps) >= trial.need;
      case 'breathingMin':  return num(log.breathingMin) >= trial.need;
      case 'meditationMin': return num(log.meditationMin) >= trial.need;
      case 'cardioMin':     return !!(log.cardio && num(log.cardio.minutes) >= trial.need);
      case 'sleepHrs':      return (log.sleepHrs != null && isFinite(+log.sleepHrs) && +log.sleepHrs >= trial.need);
      case 'proteinHit':    return !!nutritionAdherence(log).proteinHit;
      case 'allTargets':    var t = settings.dailyTargets || CFG.dailyTargets, d = log.todayTargetsDone || [];
                            return d.length === t.length && d.length > 0 && d.every(function (b) { return b === true; });
      default: return false;
    }
  }
  function trialDoneFor(trial, log, settings) {
    return trial.auto ? trialMet(trial, log, settings)
                      : !!(log.trial && log.trial.id === trial.id && log.trial.done);
  }
  function dailyTrial(settings, asOf) {
    var trial = CFG.trials[trialIndexFor(asOf)], log = S.getLog(asOf);
    return { trial: trial, done: trialDoneFor(trial, log, settings), auto: !!trial.auto };
  }
  function trialStanding(settings, asOf) {
    var start = settings.startDate;
    if (U.daysBetween(start, asOf) < 0) return { won: 0, streak: 0 };
    var span = U.daysBetween(start, asOf), won = 0, streak = 0;
    for (var i = 0; i <= span; i++) {
      var date = U.addDays(start, i), trial = CFG.trials[trialIndexFor(date)];
      if (trialDoneFor(trial, S.getLog(date), settings)) { won++; streak++; }
      else { streak = 0; }
    }
    return { won: won, streak: streak };
  }

  /* ---------- Movement: steps → distance → weight-aware calories (pure) ---------- */
  function strideMeters(heightCm) {
    var h = (heightCm != null && +heightCm > 0) ? +heightCm : CFG.movement.defaultHeightCm;
    return h * CFG.movement.strideFactor / 100;
  }
  function distanceKm(steps, heightCm) { return num(steps) * strideMeters(heightCm) / 1000; }
  function metForCadence(cadence) {
    var b = CFG.movement.metByCadence;
    for (var i = 0; i < b.length; i++) { if (cadence < b[i].upTo) return b[i].met; }
    return b[b.length - 1].met;
  }
  function caloriesForSteps(steps, weightKg, heightCm) {            // distance-based (no time)
    var w = (weightKg != null && +weightKg > 0) ? +weightKg : CFG.movement.defaultWeightKg;
    return distanceKm(steps, heightCm) * w * CFG.movement.kcalPerKgKm;
  }
  function caloriesForSession(steps, minutes, weightKg, heightCm) { // cadence→MET when timed
    var w = (weightKg != null && +weightKg > 0) ? +weightKg : CFG.movement.defaultWeightKg;
    if (minutes && +minutes > 0) {
      var met = metForCadence(num(steps) / +minutes);
      return met * 3.5 * w / 200 * +minutes;       // kcal = MET·3.5·kg/200 per minute
    }
    return caloriesForSteps(steps, weightKg, heightCm);
  }
  function movementSummary(settings, asOf) {
    var log = S.getLog(asOf), steps = num(log.steps), goal = CFG.movement.stepGoal;
    return {
      steps: steps, distanceKm: U.round(distanceKm(steps, settings.heightCm), 2),
      kcal: Math.round(caloriesForSteps(steps, settings.currentWeightKg, settings.heightCm)),
      goal: goal, pct: U.clamp(steps / goal * 100, 0, 100)
    };
  }
  // Pure, stateful step detector for the live-walk accelerometer feed. push()
  // takes an acceleration magnitude + timestamp(ms) and returns true on a step.
  function createStepDetector(opts) {
    var sc = CFG.movement.sensor; opts = opts || {};
    var thr = opts.threshold != null ? opts.threshold : sc.threshold;
    var reArm = thr * (opts.reArmFactor != null ? opts.reArmFactor : sc.reArmFactor);
    var minMs = opts.minStepMs != null ? opts.minStepMs : sc.minStepMs;
    var alpha = opts.smoothing != null ? opts.smoothing : sc.smoothing;
    var smoothed = null, count = 0, lastT = -1e9, armed = true;
    return {
      push: function (mag, tMs) {
        smoothed = (smoothed == null) ? mag : alpha * smoothed + (1 - alpha) * mag;
        if (armed && smoothed > thr && (tMs - lastT) >= minMs) { count++; lastT = tMs; armed = false; return true; }
        if (smoothed < reArm) armed = true;
        return false;
      },
      count: function () { return count; }
    };
  }

  /* ---------- Shareable progress card: pure data (every value is derived) ---------- */
  function shareCardData(settings, asOf) {
    var day = dayNumber(settings, asOf), rank = rankFor(day);
    var streak = streakAsOf(settings, asOf), aura = auraScores(settings, asOf);
    var stage = stageFor(streak.current);
    return {
      day: day, rank: rank.current ? rank.current.name : '—',
      cleanStreak: streak.current, power: aura.power, stage: stage.current.name,
      index: aura.meters.index, displayName: (settings.displayName || '').trim()
    };
  }

  /* ---------- overall standing / performance summary ---------- */
  function performanceSummary(settings, asOf) {
    var day = dayNumber(settings, asOf);
    var elapsed = Math.max(0, U.daysBetween(settings.startDate, asOf));
    var clean = 0, broken = 0, answered = 0, adhSum = 0, adhN = 0;
    for (var i = 0; i <= elapsed; i++) {
      var date = U.addDays(settings.startDate, i);
      if (U.daysBetween(settings.startDate, date) < 0) continue;
      var st = dayStatus(date);
      if (st === 'clean') { clean++; answered++; }
      else if (st === 'broken') { broken++; answered++; }
      var a = nutritionAdherence(S.getLog(date)); if (a.chosen) { adhSum += a.adherence; adhN++; }
    }
    var streak = streakAsOf(settings, asOf), cur = metersAsOf(settings, asOf);
    function avgIndex(off) {
      var s = 0, k = 0;
      for (var j = 0; j < 7; j++) {
        var d = U.addDays(asOf, -(off + j));
        if (U.daysBetween(settings.startDate, d) < 0) continue;
        s += metersAsOf(settings, d).index; k++;
      }
      return k ? s / k : null;
    }
    var a7 = avgIndex(0), a14 = avgIndex(7);
    var trend = (a7 == null || a14 == null) ? 0 : (a7 > a14 + 1 ? 1 : (a7 < a14 - 1 ? -1 : 0));
    return {
      day: day, elapsed: elapsed, cleanDays: clean, brokenDays: broken, answeredDays: answered,
      cleanRatePct: answered ? Math.round(clean / answered * 100) : null,
      currentStreak: streak.current, longestStreak: streak.longest, shields: streak.shields,
      adherencePct: adhN ? Math.round(adhSum / adhN * 100) : null,
      index: cur.index, avgIndex7: a7 == null ? null : Math.round(a7), indexTrend: trend,
      totalChi: Math.round(totalChiAccumulated(settings, asOf)), relapses: S.getRelapses().length
    };
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
    activeTags: activeTags, getTemplate: getTemplate, effectiveMeal: effectiveMeal,
    coachPhase: coachPhase, dailyAgenda: dailyAgenda, auraScores: auraScores,
    stageFor: stageFor, performanceSummary: performanceSummary,
    trialIndexFor: trialIndexFor, dailyTrial: dailyTrial, trialStanding: trialStanding,
    shareCardData: shareCardData,
    strideMeters: strideMeters, distanceKm: distanceKm, metForCadence: metForCadence,
    caloriesForSteps: caloriesForSteps, caloriesForSession: caloriesForSession,
    movementSummary: movementSummary, createStepDetector: createStepDetector
  };
})(typeof window !== 'undefined' ? window : this);
