/* =====================================================================
   Road to Immortal — GOALS (increment 7: Ambitions)
   ---------------------------------------------------------------------
   Career/life ambitions with milestones (the roadmap) and recurring
   tasks (the daily grind). Same honesty rules as everything else:

   - Progress is DERIVED — milestones done + real task adherence — never
     a hand-entered percentage.
   - The ETA projects from the rate you actually complete milestones at;
     until the first milestone falls there is NO projection (no fantasy).
   - Task completions live in the day's log (log.goalTasks) so they ride
     the existing export/sync/backup path and feed the coach ring.

   Storage: rti_goals_v1 via RTI_STORE (included in the export bundle).
   ===================================================================== */
(function (global) {
  'use strict';
  var U = global.RTI_UTIL, S = global.RTI_STORE, CFG = global.RTI_CONFIG;

  var idSeq = 0;
  function newId(prefix) {
    idSeq++;
    return prefix + '-' + Date.now().toString(36) + '-' + idSeq;
  }

  /* ---------- storage ---------- */
  function list() { return S.getGoals().goals; }
  function save(goals) { S.setGoals({ goals: goals }); return goals; }
  function byId(id) {
    var gs = list();
    for (var i = 0; i < gs.length; i++) if (gs[i].id === id) return gs[i];
    return null;
  }
  function active() {
    return list().filter(function (g) { return !g.archived; });
  }

  /* ---------- CRUD (each mutation re-saves the whole list) ---------- */
  function addGoal(fields, asOf) {
    var gs = list();
    var g = {
      id: newId('g'), title: String(fields.title || 'Unnamed ambition'),
      why: String(fields.why || ''), horizon: fields.horizon || null,
      createdISO: asOf || U.todayISO(), archived: false,
      milestones: [], tasks: []
    };
    gs.push(g); save(gs);
    return g;
  }
  function patchGoal(id, patch) {
    var gs = list();
    for (var i = 0; i < gs.length; i++) if (gs[i].id === id) { for (var k in patch) gs[i][k] = patch[k]; break; }
    save(gs);
  }
  function removeGoal(id) {
    save(list().filter(function (g) { return g.id !== id; }));
  }
  function addMilestone(goalId, fields) {
    var gs = list();
    for (var i = 0; i < gs.length; i++) if (gs[i].id === goalId) {
      gs[i].milestones.push({ id: newId('m'), title: String(fields.title || 'Milestone'),
                              targetISO: fields.targetISO || null,
                              doneISO: fields.doneISO || null,
                              // waiting-on-external: chase on/after this date.
                              // ORTHOGONAL to doneISO — an action can be done
                              // while its reply is still awaited (increment 9).
                              chaseISO: fields.chaseISO || null,
                              // true only for template history imported already
                              // done (increment 10) — excluded from the ETA rate
                              preDone: !!fields.preDone,
                              note: fields.note ? String(fields.note) : null });
      break;
    }
    save(gs);
  }
  function patchMilestone(goalId, msId, patch) {
    var gs = list();
    for (var i = 0; i < gs.length; i++) if (gs[i].id === goalId) {
      var ms = gs[i].milestones;
      for (var j = 0; j < ms.length; j++) if (ms[j].id === msId) {
        for (var k in patch) ms[j][k] = patch[k];
        break;
      }
      break;
    }
    save(gs);
  }
  // "Chased ✓" — push the chase-by date out so the coach re-asks later,
  // and today's plate clears itself
  function bumpChase(goalId, msId, asOf) {
    var days = (CFG.goals && CFG.goals.chaseBumpDays) || 3;
    patchMilestone(goalId, msId, { chaseISO: U.addDays(asOf || U.todayISO(), days) });
  }
  // "Reply received" — the wait is over
  function clearChase(goalId, msId) {
    patchMilestone(goalId, msId, { chaseISO: null });
  }
  function toggleMilestone(goalId, msId, asOf) {
    var gs = list();
    for (var i = 0; i < gs.length; i++) if (gs[i].id === goalId) {
      var ms = gs[i].milestones;
      for (var j = 0; j < ms.length; j++) if (ms[j].id === msId) {
        ms[j].doneISO = ms[j].doneISO ? null : (asOf || U.todayISO());
        break;
      }
      break;
    }
    save(gs);
  }
  function removeMilestone(goalId, msId) {
    var gs = list();
    for (var i = 0; i < gs.length; i++) if (gs[i].id === goalId) {
      gs[i].milestones = gs[i].milestones.filter(function (m) { return m.id !== msId; });
      break;
    }
    save(gs);
  }
  function addTask(goalId, fields) {
    var gs = list();
    for (var i = 0; i < gs.length; i++) if (gs[i].id === goalId) {
      gs[i].tasks.push({ id: newId('t'), title: String(fields.title || 'Task'),
                         cadence: fields.cadence || 'daily', active: true });
      break;
    }
    save(gs);
  }
  function toggleTask(goalId, taskId) {
    var gs = list();
    for (var i = 0; i < gs.length; i++) if (gs[i].id === goalId) {
      var ts = gs[i].tasks;
      for (var j = 0; j < ts.length; j++) if (ts[j].id === taskId) { ts[j].active = !ts[j].active; break; }
      break;
    }
    save(gs);
  }
  function removeTask(goalId, taskId) {
    var gs = list();
    for (var i = 0; i < gs.length; i++) if (gs[i].id === goalId) {
      gs[i].tasks = gs[i].tasks.filter(function (t) { return t.id !== taskId; });
      break;
    }
    save(gs);
  }

  /* ---------- cadence + due logic (pure over the ledger) ---------- */
  // 'daily' -> 7/week · 'weekly' -> 1/week · '3/week' -> 3/week
  function expectedPerWeek(cadence) {
    if (cadence === 'daily') return 7;
    if (cadence === 'weekly') return 1;
    var m = /^(\d+)\s*\/\s*week$/.exec(String(cadence || ''));
    if (m) return Math.max(1, Math.min(7, +m[1]));
    return 0;
  }
  function cadenceLabel(cadence) {
    if (cadence === 'daily') return 'every day';
    if (cadence === 'weekly') return 'once a week';
    var n = expectedPerWeek(cadence);
    return n ? n + '× a week' : String(cadence || '');
  }
  function doneOn(taskId, date) {
    var log = S.getLog(date);
    return !!(log.goalTasks && log.goalTasks[taskId]);
  }
  // completions of a task in the `days` days ENDING asOf (inclusive)
  function doneCountInWindow(taskId, asOf, days) {
    var n = 0;
    for (var i = 0; i < days; i++) if (doneOn(taskId, U.addDays(asOf, -i))) n++;
    return n;
  }
  function dueToday(task, asOf) {
    if (!task.active) return false;
    if (doneOn(task.id, asOf)) return false;    // already done today
    var per = expectedPerWeek(task.cadence);
    if (per >= 7) return true;                   // daily
    return doneCountInWindow(task.id, asOf, 7) < per;
  }
  // every due task across active goals: [{ goal, task }]
  function dueTasks(asOf) {
    var out = [], gs = active();
    for (var i = 0; i < gs.length; i++) {
      for (var j = 0; j < gs[i].tasks.length; j++) {
        if (dueToday(gs[i].tasks[j], asOf)) out.push({ goal: gs[i], task: gs[i].tasks[j] });
      }
    }
    return out;
  }

  /* ---------- derived progress ---------- */
  // adherence over the last 14 days: done ÷ expected (null when no active tasks)
  function adherence14(goal, asOf) {
    var expected = 0, done = 0;
    for (var i = 0; i < goal.tasks.length; i++) {
      var t = goal.tasks[i];
      if (!t.active) continue;
      expected += expectedPerWeek(t.cadence) * 2;
      done += doneCountInWindow(t.id, asOf, 14);
    }
    if (!expected) return null;
    return Math.min(100, Math.round(done / expected * 100));
  }
  function progress(goal, asOf) {
    var ms = goal.milestones, msTotal = ms.length, msDone = 0;
    for (var i = 0; i < msTotal; i++) if (ms[i].doneISO) msDone++;
    var msPct = msTotal ? Math.round(msDone / msTotal * 100) : null;
    var adh = adherence14(goal, asOf);
    // combined: the roadmap leads (70%), the daily grind keeps it honest (30%)
    var combined = msPct == null ? (adh == null ? 0 : adh)
                 : (adh == null ? msPct : Math.round(0.7 * msPct + 0.3 * adh));
    // ETA only once at least one milestone has actually fallen — no fantasy
    // dates. "Fallen" means LIVED here: a template's pre-done history arrives
    // stamped preDone (see installTemplate) and carries no pace information —
    // two imported ticks over a one-day-old goal once projected "all nine by
    // Friday" (increment 10 fix). Pre-done milestones still count toward
    // msPct/remaining; they just cannot set the pace.
    var eta = null, msLived = 0;
    for (var li = 0; li < msTotal; li++) {
      if (ms[li].doneISO && !ms[li].preDone) msLived++;
    }
    if (msLived > 0 && msDone < msTotal) {
      var elapsed = Math.max(1, U.daysBetween(goal.createdISO || asOf, asOf));
      var rate = msLived / elapsed;                   // milestones per day, lived
      var days = Math.ceil((msTotal - msDone) / rate);
      if (days > 3650) days = 3650;
      eta = { days: days, iso: U.addDays(asOf, days) };
    }
    return { msTotal: msTotal, msDone: msDone, msPct: msPct, adherence: adh, combined: combined, eta: eta };
  }
  function nextMilestone(goal) {
    var open = goal.milestones.filter(function (m) { return !m.doneISO; });
    open.sort(function (a, b) {
      var at = a.targetISO || '9999-12-31', bt = b.targetISO || '9999-12-31';
      return at < bt ? -1 : at > bt ? 1 : 0;
    });
    return open[0] || null;
  }
  function overdueMilestones(asOf) {
    var out = [], gs = active();
    for (var i = 0; i < gs.length; i++) {
      for (var j = 0; j < gs[i].milestones.length; j++) {
        var m = gs[i].milestones[j];
        if (m.targetISO && !m.doneISO && m.targetISO < asOf) out.push({ goal: gs[i], ms: m });
      }
    }
    return out;
  }
  // milestones whose chase-by date has arrived — done or not (waiting is
  // orthogonal: "applied ✓, no reply yet" is exactly the case this serves)
  function chaseDue(asOf) {
    var out = [], gs = active();
    for (var i = 0; i < gs.length; i++) {
      for (var j = 0; j < gs[i].milestones.length; j++) {
        var m = gs[i].milestones[j];
        if (m.chaseISO && m.chaseISO <= asOf) out.push({ goal: gs[i], ms: m });
      }
    }
    out.sort(function (a, b) { return a.ms.chaseISO < b.ms.chaseISO ? -1 : 1; });
    return out;
  }
  // undone milestones whose due date has arrived (the coach's version of the
  // overdue banner — includes the due day itself)
  function dueMilestones(asOf) {
    var out = [], gs = active();
    for (var i = 0; i < gs.length; i++) {
      for (var j = 0; j < gs[i].milestones.length; j++) {
        var m = gs[i].milestones[j];
        if (m.targetISO && !m.doneISO && m.targetISO <= asOf) out.push({ goal: gs[i], ms: m });
      }
    }
    out.sort(function (a, b) { return a.ms.targetISO < b.ms.targetISO ? -1 : 1; });
    return out;
  }

  /* ---------- template install (increment 9 — one tap, idempotent) ----------
     Templates arrive from the PRIVATE registry (sync pullTemplates); installing
     builds the ambition through the same validated write path as hand-created
     goals. templateId stamps the goal so a second tap can never duplicate it —
     archived installs still count as installed (restore, don't reinstall). */
  function installTemplate(tpl, asOf) {
    if (!tpl || !tpl.id || !tpl.title) return { ok: false, reason: 'bad-template' };
    var gs = list();
    for (var i = 0; i < gs.length; i++) {
      if (gs[i].templateId === tpl.id) return { ok: false, reason: 'installed', goal: gs[i] };
    }
    // createdISO = the operation's REAL start (from the template), not install
    // day — otherwise pre-done milestones divided by one elapsed day project a
    // fantasy ETA, breaking the app's own honesty rule
    var g = addGoal({ title: tpl.title, why: tpl.why || '', horizon: tpl.horizon || null },
                    tpl.createdISO || asOf);
    var ms = tpl.milestones || [];
    for (var j = 0; j < ms.length; j++) {
      addMilestone(g.id, { title: ms[j].title, targetISO: ms[j].targetISO || null,
                           doneISO: ms[j].doneISO || null, chaseISO: ms[j].chaseISO || null,
                           note: ms[j].note || null,
                           // imported-as-done ≠ lived: pre-done history must
                           // never feed the ETA rate (see progress)
                           preDone: !!ms[j].doneISO });
    }
    var ts = tpl.tasks || [];
    for (var k = 0; k < ts.length; k++) {
      // template omission means weekly (campaign rhythms), unlike hand-added
      // tasks where addTask defaults daily
      addTask(g.id, { title: ts[k].title, cadence: ts[k].cadence || 'weekly' });
    }
    patchGoal(g.id, { templateId: tpl.id, templateVersion: tpl.version || 1,
                      guardrail: tpl.guardrail || null, note: tpl.note || null });
    return { ok: true, goal: byId(g.id) };
  }
  /* ---------- the road ahead (increment 10) ----------
     ONE merged, date-sorted view of everything deadline-shaped within the
     window: overdue milestones (negative inDays), chases already due (inDays
     0), chases coming up, and undone due dates coming up. Pure read — the UI
     renders these as NAVIGATION to The Ascent, never as one-tap "Done"s
     (an overdue item must never invite a dishonest tap). */
  function roadAhead(asOf, withinDays) {
    var out = [], gs = active();
    for (var i = 0; i < gs.length; i++) {
      for (var j = 0; j < gs[i].milestones.length; j++) {
        var m = gs[i].milestones[j], d;
        if (m.targetISO && !m.doneISO) {
          d = U.daysBetween(asOf, m.targetISO);
          if (d < 0) out.push({ kind: 'overdue', goal: gs[i], ms: m, inDays: d });
          else if (d <= withinDays) out.push({ kind: 'due', goal: gs[i], ms: m, inDays: d });
        }
        if (m.chaseISO) { // waiting is orthogonal to done — chase rides regardless
          d = U.daysBetween(asOf, m.chaseISO);
          if (d <= 0) out.push({ kind: 'chase', goal: gs[i], ms: m, inDays: 0 });
          else if (d <= withinDays) out.push({ kind: 'chase', goal: gs[i], ms: m, inDays: d });
        }
      }
    }
    out.sort(function (a, b) { return a.inDays - b.inDays; });
    return out;
  }
  function upcomingMilestones(asOf, withinDays) {
    var out = [], gs = active();
    for (var i = 0; i < gs.length; i++) {
      for (var j = 0; j < gs[i].milestones.length; j++) {
        var m = gs[i].milestones[j];
        if (!m.targetISO || m.doneISO) continue;
        var d = U.daysBetween(asOf, m.targetISO);
        if (d >= 0 && d <= withinDays) out.push({ goal: gs[i], ms: m, inDays: d });
      }
    }
    out.sort(function (a, b) { return a.inDays - b.inDays; });
    return out;
  }

  global.RTI_GOALS = {
    list: list, active: active, byId: byId,
    addGoal: addGoal, patchGoal: patchGoal, removeGoal: removeGoal,
    addMilestone: addMilestone, toggleMilestone: toggleMilestone, removeMilestone: removeMilestone,
    patchMilestone: patchMilestone, bumpChase: bumpChase, clearChase: clearChase,
    chaseDue: chaseDue, dueMilestones: dueMilestones, roadAhead: roadAhead,
    installTemplate: installTemplate,
    addTask: addTask, toggleTask: toggleTask, removeTask: removeTask,
    expectedPerWeek: expectedPerWeek, cadenceLabel: cadenceLabel,
    doneOn: doneOn, doneCountInWindow: doneCountInWindow,
    dueToday: dueToday, dueTasks: dueTasks,
    adherence14: adherence14, progress: progress,
    nextMilestone: nextMilestone, overdueMilestones: overdueMilestones,
    upcomingMilestones: upcomingMilestones
  };
})(typeof window !== 'undefined' ? window : this);
