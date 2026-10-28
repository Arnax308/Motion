/* ==========================================================================
   MOTION STORE — loading, saving, migrations and undo.
   ========================================================================== */

(function () {
  const Engine = window.Motion.Engine;
  const LOCAL_KEY = 'motion-data';
  const UNDO_LIMIT = 20;

  const ICON_ALIASES = {
    'check-square': 'square-check',
    studying: 'school',
    study: 'school',
    exercise: 'run'
  };

  const DEFAULT_CATEGORIES = [
    { id: 'dev', name: 'Development', icon: 'code', color: '#8B5CF6', weight: 1.0, active: true },
    { id: 'work', name: 'Work', icon: 'briefcase', color: '#60A5FA', weight: 1.0, active: true },
    { id: 'study', name: 'Study', icon: 'book', color: '#34D399', weight: 1.0, active: true },
    { id: 'exercise', name: 'Exercise', icon: 'run', color: '#F5B544', weight: 1.0, active: true }
  ];

  let data = null;
  let undoStack = [];
  const listeners = [];

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function isObject(x) {
    return !!x && typeof x === 'object' && !Array.isArray(x);
  }

  // Additive-only upgrades so older data.json files keep working
  function migrate(d) {
    d = d || {};
    if (typeof d.total_pp !== 'number') d.total_pp = parseInt(d.total_pp, 10) || 0;
    if (typeof d.streak !== 'number') d.streak = 0;
    if (d.last_completion_date === undefined) d.last_completion_date = null;
    if (!Array.isArray(d.active_tasks)) d.active_tasks = [];
    if (!Array.isArray(d.history)) d.history = [];
    if (!Array.isArray(d.categories)) d.categories = [];
    d.categories = d.categories.filter(c => typeof c === 'string' ? c.trim() : isObject(c) && c.name);
    if (d.categories.length === 0) d.categories = clone(DEFAULT_CATEGORIES);

    // The Python version stored categories as plain strings
    d.categories = d.categories.map((c, i) => typeof c === 'string'
      ? { id: `cat-legacy-${i}`, name: c, icon: 'tag', color: '#8B5CF6', weight: 1.0, active: true }
      : c);

    const known = new Set(window.Motion.ICONS || []);
    d.categories.forEach(c => {
      if (!c.id) c.id = `cat-${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const icon = (c.icon || '').toLowerCase();
      c.icon = known.has(icon) ? icon : (ICON_ALIASES[icon] || 'tag');
      if (!c.color) c.color = '#8B5CF6';
      if (c.weight === undefined) c.weight = 1.0;
      if (c.active === undefined) c.active = true;
    });

    // Repair hand-edited or partially written records rather than letting them break the UI
    d.active_tasks = d.active_tasks.filter(isObject);
    d.active_tasks.forEach(t => {
      if (!t.id) t.id = Engine.newId('task');
      if (!t.title) t.title = 'Untitled task';
      if (!Engine.SEVERITY[t.severity]) t.severity = 'med';
      if (!['none', 'daily', 'weekly'].includes(t.recurring)) t.recurring = 'none';
      if (typeof t.description !== 'string') t.description = '';
      if (!Number.isFinite(parseInt(t.base_pp, 10))) t.base_pp = 100;
      if (isNaN(new Date(t.deadline))) {
        const fallback = Engine.addDays(Engine.startOfDay(new Date()), 1);
        fallback.setHours(18, 0, 0, 0);
        t.deadline = fallback.toISOString();
      }
    });
    d.history = d.history.filter(h => isObject(h) && !isNaN(new Date(h.completion_time)));
    d.history.forEach(h => {
      if (!h.severity) h.severity = 'med';
      if (typeof h.pp_earned !== 'number') h.pp_earned = parseInt(h.pp_earned, 10) || 0;
    });

    if (typeof d.best_streak !== 'number') {
      d.best_streak = Math.max(d.streak || 0, Engine.longestStreakInHistory(d.history));
    }
    return d;
  }

  async function load() {
    let loaded = null;
    let info = { status: 'ok' };
    try {
      if (window.api && window.api.loadData) {
        // Main returns { data, status, ... }; status says whether the file had to be recovered
        info = await window.api.loadData();
        loaded = info ? info.data : null;
      } else {
        // Browser preview: keep data in localStorage, seeded from data.json if served
        const raw = localStorage.getItem(LOCAL_KEY);
        if (raw) loaded = JSON.parse(raw);
        else {
          const res = await fetch('data.json').catch(() => null);
          if (res && res.ok) loaded = await res.json();
        }
      }
    } catch (e) {
      console.warn('Could not load data:', e);
    }
    data = migrate(loaded);
    // Persist migrations and create the file on first run
    await save();
    notifyRecovery(info || {});
    return data;
  }

  function notifyRecovery(info) {
    const UI = window.Motion.UI;
    if (info.status === 'recovered') {
      UI.toast({
        title: 'Restored your data from a backup',
        body: `data.json couldn’t be read, so it was kept as ${fileName(info.corruptPath)}.`,
        icon: 'lifebuoy', tone: 'danger', duration: 12000
      });
    } else if (info.status === 'corrupt') {
      UI.toast({
        title: info.unsafe ? 'Couldn’t read your data, so saving is paused' : 'Couldn’t read your data, so Motion started fresh',
        body: info.unsafe ? info.error : `The unreadable file was kept as ${fileName(info.corruptPath)}.`,
        icon: 'alert-triangle', tone: 'danger', duration: 15000
      });
    }
  }

  function fileName(p) {
    return (p || '').split(/[\\/]/).pop();
  }

  async function save() {
    try {
      if (window.api && window.api.saveData) {
        const res = await window.api.saveData(data);
        if (res && res.success === false) throw new Error(res.error);
      } else {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
      }
    } catch (e) {
      console.error('Could not save data:', e);
      if (window.Motion.UI) window.Motion.UI.toast({ title: 'Couldn’t save your changes', body: String(e.message || e), tone: 'danger', icon: 'alert-triangle' });
    }
  }

  function emit() {
    listeners.forEach(fn => fn(data));
  }

  // Run fn against the data, save and re-render. Undoable mutations can be rolled back.
  function mutate(fn, opts) {
    const snapshot = opts && opts.undoable ? clone(data) : null;
    const result = fn(data);
    if (snapshot && result !== null && result !== false) {
      undoStack.push(snapshot);
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    } else if (!snapshot) {
      // Undoing past a change that can't be undone (like an auto-miss) would silently revert it too
      undoStack = [];
    }
    save();
    emit();
    return result;
  }

  function undo() {
    if (!undoStack.length) return false;
    data = undoStack.pop();
    save();
    emit();
    return true;
  }

  window.Motion.Store = {
    load,
    mutate,
    undo,
    canUndo: () => undoStack.length > 0,
    get: () => data,
    subscribe: fn => listeners.push(fn)
  };
})();
