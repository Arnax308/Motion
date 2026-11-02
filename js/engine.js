/* ==========================================================================
   MOTION ENGINE — points, levels, streaks, task lifecycle.
   Pure functions over the data object; no DOM access, so it runs in Node too.
   ========================================================================== */

(function (root) {
  const DAY_MS = 24 * 3600 * 1000;
  const LEVEL_SIZE = 300;
  const AUTO_MISS_HOURS = 72;

  const SEVERITY = {
    low: { mult: 0.5, label: 'Low', short: 'LOW' },
    med: { mult: 1.0, label: 'Medium', short: 'MED' },
    high: { mult: 2.0, label: 'High', short: 'HIGH' },
    life_changing: { mult: 5.0, label: 'Life changing', short: 'LIFE' }
  };
  const SEVERITY_ORDER = ['low', 'med', 'high', 'life_changing'];

  const TITLE_BANDS = [
    { from: 0, title: 'Casual Rookie' },
    { from: 3, title: 'Disciplined Doer' },
    { from: 6, title: 'Momentum Builder' },
    { from: 10, title: 'Versatile Grinder' },
    { from: 15, title: 'Relentless' },
    { from: 20, title: 'Life Prodigy' }
  ];

  // DATES (always local time, never UTC)
  function dateKey(d) {
    d = new Date(d);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function keyToDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function daysBetweenKeys(a, b) {
    return Math.round((keyToDate(b) - keyToDate(a)) / DAY_MS);
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  // Monday-based start of week
  function startOfWeek(d) {
    const x = startOfDay(d);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }

  // CATEGORIES
  function findCategory(data, name) {
    const n = (name || '').toLowerCase();
    return data.categories.find(c => c.name.toLowerCase() === n) || null;
  }

  function categoryWeight(data, name) {
    const cat = findCategory(data, name);
    return cat ? parseFloat(cat.weight || 1.0) : 1.0;
  }

  function severityOf(key) {
    return SEVERITY[key] || SEVERITY.med;
  }

  // POINTS
  // Mirrors the original completeTask rules exactly; returns each step for display.
  function ppBreakdown(data, task, at) {
    at = at ? new Date(at) : new Date();
    const deadline = new Date(task.deadline);
    const base = parseInt(task.base_pp, 10) || 50;
    const steps = [{ label: 'Base', value: String(base) }];

    let timing, earned;
    if (at < new Date(deadline.getTime() - 3600 * 1000)) {
      timing = 'early';
      earned = base * 2;
      steps.push({ label: 'Done 1h+ early', value: '×2' });
    } else if (at <= deadline) {
      timing = 'ontime';
      earned = base;
      steps.push({ label: 'Done on time', value: '×1' });
    } else {
      timing = 'late';
      earned = Math.max(1, Math.floor(base / 2));
      steps.push({ label: 'Done late', value: '×½' });
    }

    if (task.rescheduled) {
      earned = Math.max(1, Math.floor(earned / 2));
      steps.push({ label: 'Rescheduled', value: '×½' });
    }

    const sev = severityOf(task.severity);
    const weight = categoryWeight(data, task.category);
    steps.push({ label: `Severity: ${sev.label}`, value: `×${sev.mult}` });
    steps.push({ label: `${task.category || 'Uncategorized'} weight`, value: `×${weight}` });

    const total = Math.round(earned * sev.mult * weight);
    return { total, timing, rescheduled: !!task.rescheduled, steps };
  }

  // The best case: completed well before the deadline
  function maxPp(data, task) {
    const early = new Date(new Date(task.deadline).getTime() - 2 * 3600 * 1000);
    return ppBreakdown(data, task, early).total;
  }

  function missPenalty(task) {
    return Math.round(10 * severityOf(task.severity).mult);
  }

  // LEVELS
  function levelFor(pp) {
    if (!pp || pp <= 0) return 0;
    return Math.floor(pp / LEVEL_SIZE) + 1;
  }

  function titleFor(level) {
    let title = TITLE_BANDS[0].title;
    TITLE_BANDS.forEach(b => { if (level >= b.from) title = b.title; });
    return title;
  }

  function levelProgress(pp) {
    pp = Math.max(0, pp || 0);
    const level = levelFor(pp);
    const start = Math.max(0, level - 1) * LEVEL_SIZE;
    const next = Math.max(1, level) * LEVEL_SIZE;
    const nextBand = TITLE_BANDS.find(b => b.from > level) || null;
    return {
      level,
      title: titleFor(level),
      pp,
      start,
      next,
      toNext: next - pp,
      ratio: Math.min(1, (pp - start) / (next - start)),
      nextTitle: nextBand ? nextBand.title : null,
      nextTitleLevel: nextBand ? nextBand.from : null
    };
  }

  // STREAKS
  function effectiveStreak(data, now) {
    if (!data.last_completion_date) return 0;
    const diff = daysBetweenKeys(data.last_completion_date, dateKey(now || new Date()));
    return diff <= 1 ? data.streak : 0;
  }

  function completionDays(history) {
    return [...new Set(history.filter(h => h.status === 'completed').map(h => dateKey(h.completion_time)))].sort();
  }

  function longestStreakInHistory(history) {
    let best = 0, run = 0, prev = null;
    completionDays(history).forEach(k => {
      run = prev && daysBetweenKeys(prev, k) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = k;
    });
    return best;
  }

  // History in the order it happened; ids break ties so every device replays identically
  function historyInOrder(history) {
    return history.slice().sort((a, b) =>
      (new Date(a.completion_time) - new Date(b.completion_time)) || String(a.id).localeCompare(String(b.id)));
  }

  function replayPp(history, start) {
    let total = start || 0;
    historyInOrder(history).forEach(h => { total = Math.max(0, total + (h.pp_earned || 0)); });
    return total;
  }

  // PP, streak and best streak are derived from history (plus a baseline from before history
  // was kept), so two devices that hold the same history always show the same numbers.
  function recomputeDerived(data) {
    data.total_pp = replayPp(data.history, data.baseline_pp || 0);
    const days = completionDays(data.history);
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (i < days.length - 1 && daysBetweenKeys(days[i], days[i + 1]) !== 1) break;
      streak++;
    }
    data.streak = streak;
    data.last_completion_date = days.length ? days[days.length - 1] : null;
    data.best_streak = Math.max(data.baseline_best_streak || 0, longestStreakInHistory(data.history));
    return data;
  }

  // Picks the starting PP that reproduces a stored total, for files from before PP was derived
  function baselineFor(history, storedTotal) {
    let baseline = storedTotal - history.reduce((s, h) => s + (h.pp_earned || 0), 0);
    for (let i = 0; i < 3; i++) {
      const diff = storedTotal - replayPp(history, baseline);
      if (diff === 0) break;
      baseline += diff;
    }
    return baseline;
  }

  // TASK LIFECYCLE (all mutate data in place)
  // The counter keeps ids unique when many are created in the same millisecond
  let idSeq = 0;
  function newId(prefix) {
    idSeq = (idSeq + 1) % 100000;
    return `${prefix}-${Date.now()}-${idSeq}${Math.floor(Math.random() * 1000)}`;
  }

  // Ids are deterministic, so a record may already exist (e.g. merged from the other device)
  function putHistory(data, entry) {
    const i = data.history.findIndex(h => h.id === entry.id);
    if (i === -1) data.history.push(entry);
    else data.history[i] = entry;
  }

  function takeTask(data, taskId) {
    const idx = data.active_tasks.findIndex(t => t.id === taskId);
    return idx === -1 ? null : data.active_tasks.splice(idx, 1)[0];
  }

  // Schedules the next copy of a repeating task. If occurrences already went by unattended
  // (the app was closed, or the task was resolved late), the next copy jumps to the first
  // upcoming date and the skipped ones cost floor(ignored / 2) misses in total. A missed
  // task's own miss counts toward that total, so 7 ignored days cost 3 misses, not 7.
  function respawnRecurring(data, task, now, wasMissed, status) {
    const none = { next: null, catchUp: 0, catchUpLoss: 0 };
    if (!task.recurring || task.recurring === 'none') return none;
    now = now ? new Date(now) : new Date();
    const step = task.recurring === 'weekly' ? 7 : 1;

    // Calendar days (not 24h blocks) so the clock time survives DST changes
    let deadline = addDays(new Date(task.deadline), step);
    const skipped = [];
    while (deadline < now) {
      skipped.push(deadline);
      deadline = addDays(deadline, step);
    }

    const extra = wasMissed
      ? Math.max(1, Math.floor((skipped.length + 1) / 2)) - 1
      : Math.floor(skipped.length / 2);
    // origin ties these records to how the task was resolved, so sync can drop them if another
    // device resolved the same task differently
    const origin = `${task.id}:${wasMissed ? 'missed' : status || 'completed'}`;
    let catchUpLoss = 0;
    skipped.slice(skipped.length - extra).forEach(d => {
      const loss = missPenalty(task);
      catchUpLoss += loss;
      const entry = historyEntry(Object.assign({}, task, { deadline: d.toISOString() }), 'missed', -loss, now,
        `hist-${task.id}-skip-${dateKey(d)}`);
      entry.catch_up = true;
      entry.origin = origin;
      putHistory(data, entry);
    });

    // Same series and date gives the same id on every device
    const series = task.series_id || task.id;
    const next = {
      id: `${series}@${dateKey(deadline)}`,
      series_id: series,
      origin,
      title: task.title,
      description: task.description || '',
      category: task.category,
      severity: task.severity,
      base_pp: task.base_pp,
      deadline: deadline.toISOString(),
      rescheduled: false,
      recurring: task.recurring
    };
    if (!data.active_tasks.some(t => t.id === next.id)) data.active_tasks.push(next);
    return { next, catchUp: extra, catchUpLoss };
  }

  // A task is resolved once, so its resolution id is fixed: the same event on two devices merges
  function historyEntry(task, status, pp, at, id) {
    return {
      id: id || `hist-${task.id}`,
      task_id: task.id,
      title: task.title,
      category: task.category,
      severity: task.severity || 'med',
      deadline: task.deadline,
      completion_time: at.toISOString(),
      pp_earned: pp,
      base_pp: task.base_pp,
      status
    };
  }

  function addTask(data, fields) {
    const task = {
      id: newId('task'),
      title: fields.title,
      description: fields.description || '',
      category: fields.category,
      severity: fields.severity || 'med',
      base_pp: parseInt(fields.base_pp, 10) || 100,
      deadline: new Date(fields.deadline).toISOString(),
      rescheduled: false,
      recurring: fields.recurring || 'none'
    };
    data.active_tasks.push(task);
    return task;
  }

  function completeTask(data, taskId, now) {
    now = now ? new Date(now) : new Date();
    const task = takeTask(data, taskId);
    if (!task) return null;
    const breakdown = ppBreakdown(data, task, now);
    const levelBefore = levelFor(data.total_pp);
    putHistory(data, historyEntry(task, 'completed', breakdown.total, now));
    const r = respawnRecurring(data, task, now, false, 'completed');
    recomputeDerived(data);
    return {
      task, earned: breakdown.total, breakdown, respawned: r.next, catchUp: r.catchUp, catchUpLoss: r.catchUpLoss,
      levelBefore, levelAfter: levelFor(data.total_pp)
    };
  }

  function missTask(data, taskId, now) {
    now = now ? new Date(now) : new Date();
    const task = takeTask(data, taskId);
    if (!task) return null;
    const loss = missPenalty(task);
    putHistory(data, historyEntry(task, 'missed', -loss, now));
    const r = respawnRecurring(data, task, now, true);
    recomputeDerived(data);
    return { task, loss, respawned: r.next, catchUp: r.catchUp, catchUpLoss: r.catchUpLoss };
  }

  function deferTask(data, taskId, now) {
    now = now ? new Date(now) : new Date();
    const task = takeTask(data, taskId);
    if (!task) return null;
    putHistory(data, historyEntry(task, 'deferred', 0, now));
    const r = respawnRecurring(data, task, now, false, 'deferred');
    recomputeDerived(data);
    return { task, respawned: r.next, catchUp: r.catchUp, catchUpLoss: r.catchUpLoss };
  }

  function deleteTask(data, taskId) {
    return takeTask(data, taskId);
  }

  function rescheduleTask(data, taskId, deadline, reason) {
    const task = data.active_tasks.find(t => t.id === taskId);
    if (!task) return null;
    task.deadline = new Date(deadline).toISOString();
    task.rescheduled = true;
    task.rescheduled_reason = reason || null;
    return task;
  }

  function autoMissOverdue(data, now) {
    now = now ? new Date(now) : new Date();
    const due = data.active_tasks.filter(t => now > new Date(new Date(t.deadline).getTime() + AUTO_MISS_HOURS * 3600 * 1000));
    return due.map(t => missTask(data, t.id, now)).filter(Boolean);
  }

  function autoMissAt(task) {
    return new Date(new Date(task.deadline).getTime() + AUTO_MISS_HOURS * 3600 * 1000);
  }

  // GROUPING
  function bucketFor(deadline, now) {
    now = now || new Date();
    deadline = new Date(deadline);
    if (deadline < now) return 'overdue';
    const today = startOfDay(now);
    const diff = Math.round((startOfDay(deadline) - today) / DAY_MS);
    if (diff <= 0) return 'today';
    if (diff === 1) return 'tomorrow';
    if (diff < 7) return 'week';
    return 'later';
  }

  // STATS
  function dailyAggregate(history) {
    const days = {};
    history.forEach(h => {
      const k = dateKey(h.completion_time);
      const d = days[k] || (days[k] = { pp: 0, earned: 0, completed: 0, missed: 0, deferred: 0 });
      d.pp += h.pp_earned || 0;
      if (h.status === 'completed') { d.completed++; d.earned += h.pp_earned || 0; }
      else if (h.status === 'missed') d.missed++;
      else if (h.status === 'deferred') d.deferred++;
    });
    return days;
  }

  function periodStats(history, from, to) {
    const items = history.filter(h => {
      const t = new Date(h.completion_time);
      return t >= from && t < to;
    });
    const completed = items.filter(h => h.status === 'completed');
    const missed = items.filter(h => h.status === 'missed').length;
    const deferred = items.filter(h => h.status === 'deferred').length;
    const earned = completed.reduce((s, h) => s + (h.pp_earned || 0), 0);
    const rate = completed.length + missed > 0 ? completed.length / (completed.length + missed) : null;

    const byDay = dailyAggregate(items);
    let bestDay = null;
    Object.keys(byDay).forEach(k => {
      if (byDay[k].earned > 0 && (!bestDay || byDay[k].earned > bestDay.earned)) bestDay = { key: k, earned: byDay[k].earned };
    });

    return { earned, completed: completed.length, missed, deferred, rate, bestDay, count: items.length };
  }

  function monthStats(history, year, month) {
    return periodStats(history, new Date(year, month, 1), new Date(year, month + 1, 1));
  }

  const Engine = {
    SEVERITY, SEVERITY_ORDER, TITLE_BANDS, LEVEL_SIZE, AUTO_MISS_HOURS,
    dateKey, keyToDate, daysBetweenKeys, startOfDay, startOfWeek, addDays,
    findCategory, categoryWeight, severityOf,
    ppBreakdown, maxPp, missPenalty,
    levelFor, titleFor, levelProgress,
    effectiveStreak, longestStreakInHistory, recomputeDerived, baselineFor, historyInOrder,
    newId, addTask, completeTask, missTask, deferTask, deleteTask, rescheduleTask,
    respawnRecurring, autoMissOverdue, autoMissAt,
    bucketFor, dailyAggregate, periodStats, monthStats
  };

  root.Motion = root.Motion || {};
  root.Motion.Engine = Engine;
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
