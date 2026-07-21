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
  var U = global.RTI_UTIL, S = global.RTI_STORE;

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
                              targetISO: fields.targetISO || null, doneISO: null });
      break;
    }
    save(gs);
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
    // ETA only once at least one milestone has actually fallen — no fantasy dates
    var eta = null;
    if (msDone > 0 && msDone < msTotal) {
      var elapsed = Math.max(1, U.daysBetween(goal.createdISO || asOf, asOf));
      var rate = msDone / elapsed;                    // milestones per day, lived
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
    addTask: addTask, toggleTask: toggleTask, removeTask: removeTask,
    expectedPerWeek: expectedPerWeek, cadenceLabel: cadenceLabel,
    doneOn: doneOn, doneCountInWindow: doneCountInWindow,
    dueToday: dueToday, dueTasks: dueTasks,
    adherence14: adherence14, progress: progress,
    nextMilestone: nextMilestone, overdueMilestones: overdueMilestones,
    upcomingMilestones: upcomingMilestones
  };
})(typeof window !== 'undefined' ? window : this);
