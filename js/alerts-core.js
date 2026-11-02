/* ==========================================================================
   MOTION ALERTS CORE — works out which phone alerts to schedule.
   Pure: no plugins or DOM, so Node tests, the app and the Android background
   runner share it. (No toLocale* calls: the runner has no Intl.)
   ========================================================================== */

(function (root) {
  const Engine = (root.Motion && root.Motion.Engine) || (typeof require === 'function' ? require('./engine.js') : null);

  const DEFAULT_PREFS = { leadMinutes: 60, atDeadline: true, morning: '08:00', streak: '20:00' };
  const HORIZON_DAYS = 14; // Android caps pending alarms, so only the next two weeks are scheduled
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function withDefaults(prefs) {
    return Object.assign({}, DEFAULT_PREFS, prefs || {});
  }

  // Android notification ids are 32-bit ints; the same key always gives the same id
  function alertId(key) {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 1) || 1;
  }

  function fmtTime(d) {
    const h = d.getHours();
    const m = d.getMinutes();
    return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
  }

  function fmtLead(mins) {
    if (mins % 60 === 0) return mins === 60 ? '1 hour' : `${mins / 60} hours`;
    return `${mins} minutes`;
  }

  function fmtPp(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // The next time of day "HH:MM" at or after `from`, `offsetDays` days later
  function timeOnDay(hhmm, from, offsetDays) {
    const [h, m] = hhmm.split(':').map(Number);
    const d = Engine.addDays(Engine.startOfDay(from), offsetDays);
    d.setHours(h, m, 0, 0);
    return d;
  }

  function dueOn(data, day) {
    const key = Engine.dateKey(day);
    return data.active_tasks
      .filter(t => Engine.dateKey(t.deadline) === key)
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  }

  function morningAlert(data, at) {
    const tasks = dueOn(data, at);
    const overdue = data.active_tasks.filter(t => new Date(t.deadline) < at).length;
    let body;
    if (tasks.length) {
      const pp = tasks.reduce((s, t) => s + Engine.maxPp(data, t), 0);
      body = `${tasks.length} task${tasks.length === 1 ? '' : 's'} due today, up to +${fmtPp(pp)} PP. First up: ${tasks[0].title} at ${fmtTime(new Date(tasks[0].deadline))}.`;
    } else {
      body = 'Nothing due today. Add a task and finish it early for double PP.';
    }
    if (overdue) body += ` ${overdue} overdue.`;
    return { key: `morning:${Engine.dateKey(at)}`, kind: 'morning', at, title: 'Good morning — here’s your day', body };
  }

  function streakAlert(data, at, streakIfToday) {
    const body = streakIfToday > 0
      ? `Your ${streakIfToday}-day streak ends tonight. Finish one task to keep it.`
      : 'You haven’t finished anything today. One task starts a new streak.';
    return { key: `streak:${Engine.dateKey(at)}`, kind: 'streak', at, title: 'Streak at risk', body };
  }

  // Returns [{ id, key, kind, at, title, body }] sorted by time, all in the future
  function buildSchedule(data, prefs, now) {
    prefs = withDefaults(prefs);
    now = now ? new Date(now) : new Date();
    const horizon = Engine.addDays(now, HORIZON_DAYS);
    const out = [];

    data.active_tasks.forEach(task => {
      const due = new Date(task.deadline);
      if (due <= now || due > horizon) return;
      if (prefs.leadMinutes > 0) {
        const at = new Date(due.getTime() - prefs.leadMinutes * 60000);
        if (at > now) {
          const pp = Engine.ppBreakdown(data, task, at).total;
          out.push({
            key: `lead:${task.id}`, kind: 'lead', at,
            title: `Due in ${fmtLead(prefs.leadMinutes)}: ${task.title}`,
            body: `Finish it now for +${fmtPp(pp)} PP. Due at ${fmtTime(due)}.`
          });
        }
      }
      if (prefs.atDeadline) {
        const pp = Engine.ppBreakdown(data, task, due).total;
        out.push({
          key: `due:${task.id}`, kind: 'due', at: due,
          title: `Due now: ${task.title}`,
          body: `Finish it now for +${fmtPp(pp)} PP. After this it’s halved.`
        });
      }
    });

    // Daily alerts for today (if still ahead) and tomorrow; they're rebuilt on every sync
    const todayKey = Engine.dateKey(now);
    const doneToday = data.last_completion_date === todayKey;
    for (let offset = 0; offset <= 1; offset++) {
      if (prefs.morning) {
        const at = timeOnDay(prefs.morning, now, offset);
        if (at > now) out.push(morningAlert(data, at));
      }
      if (prefs.streak) {
        const at = timeOnDay(prefs.streak, now, offset);
        if (at <= now) continue;
        if (offset === 0 && doneToday) continue; // already safe today
        // Tomorrow's reminder assumes today goes as the data says now; it's rebuilt before then
        const streak = offset === 0 ? Engine.effectiveStreak(data, now) : (doneToday ? data.streak : 0);
        out.push(streakAlert(data, at, streak));
      }
    }

    out.forEach(a => { a.id = alertId(a.key); });
    return out.sort((a, b) => a.at - b.at);
  }

  const AlertsCore = { DEFAULT_PREFS, withDefaults, alertId, buildSchedule, fmtTime };

  root.Motion = root.Motion || {};
  root.Motion.AlertsCore = AlertsCore;
  if (typeof module !== 'undefined' && module.exports) module.exports = AlertsCore;
})(typeof window !== 'undefined' ? window : globalThis);
