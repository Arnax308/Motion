/* ==========================================================================
   MOTION STORE — loading, saving, migrations, undo and sync bookkeeping.
   ========================================================================== */

(function () {
  const { Engine, SyncCore, Platform } = window.Motion;
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
  const changeListeners = [];

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

    // PP and streaks are derived from history; baselines keep numbers from before that
    if (typeof d.baseline_pp !== 'number') d.baseline_pp = Engine.baselineFor(d.history, d.total_pp);
    if (typeof d.baseline_best_streak !== 'number') d.baseline_best_streak = d.best_streak;
    Engine.recomputeDerived(d);
    return d;
  }

  async function load() {
    let loaded = null;
    let info = { status: 'ok' };
    try {
      // { data, status, ... }; status says whether the data had to be recovered
      info = await Platform.loadData();
      loaded = info ? info.data : null;
    } catch (e) {
      console.warn('Could not load data:', e);
    }
    const hadSyncState = !!(loaded && loaded.sync);
    data = migrate(loaded);
    SyncCore.ensureSyncState(data);
    if (!loaded) data.sync.fresh = true; // a new install takes the cloud's data on first sync
    else if (!hadSyncState) SyncCore.adoptExisting(data); // existing data gets uploaded once
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
        body: info.corruptPath ? `data.json couldn’t be read, so it was kept as ${fileName(info.corruptPath)}.` : 'Your saved data couldn’t be read; a copy was kept.',
        icon: 'lifebuoy', tone: 'danger', duration: 12000
      });
    } else if (info.status === 'corrupt') {
      UI.toast({
        title: info.unsafe ? 'Couldn’t read your data, so saving is paused' : 'Couldn’t read your data, so Motion started fresh',
        body: info.unsafe ? info.error : info.corruptPath ? `The unreadable file was kept as ${fileName(info.corruptPath)}.` : 'A copy of the unreadable data was kept.',
        icon: 'alert-triangle', tone: 'danger', duration: 15000
      });
    }
  }

  function fileName(p) {
    return (p || '').split(/[\\/]/).pop();
  }

  async function save() {
    try {
      const res = await Platform.saveData(data);
      if (res && res.success === false) throw new Error(res.error);
    } catch (e) {
      console.error('Could not save data:', e);
      if (window.Motion.UI) window.Motion.UI.toast({ title: 'Couldn’t save your changes', body: String(e.message || e), tone: 'danger', icon: 'alert-triangle' });
    }
  }

  function emit() {
    listeners.forEach(fn => fn(data));
  }

  function localChanged() {
    changeListeners.forEach(fn => fn(data));
  }

  // Run fn against the data, record what changed for sync, save and re-render.
  // Undoable mutations can be rolled back.
  function mutate(fn, opts) {
    const before = SyncCore.recordMap(data);
    const snapshot = opts && opts.undoable ? clone(data) : null;
    const result = fn(data);
    SyncCore.trackChanges(data, before);
    Engine.recomputeDerived(data);
    if (snapshot && result !== null && result !== false) {
      undoStack.push(snapshot);
      if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    } else if (!snapshot) {
      // Undoing past a change that can't be undone (like an auto-miss) would silently revert it too
      undoStack = [];
    }
    save();
    emit();
    localChanged();
    return result;
  }

  // Undo restores the old records but keeps current sync bookkeeping, so the rollback
  // is recorded as a new change and reaches the other device
  function undo() {
    if (!undoStack.length) return false;
    const before = SyncCore.recordMap(data);
    const syncState = data.sync;
    data = undoStack.pop();
    data.sync = syncState;
    SyncCore.trackChanges(data, before);
    Engine.recomputeDerived(data);
    save();
    emit();
    localChanged();
    return true;
  }

  // Applies merged changes from the other device. fn returns how many records changed.
  function commitRemote(fn) {
    const changed = fn(data);
    if (changed > 0) {
      undoStack = []; // undo snapshots predate the merge and would revert it
      emit();
    }
    save();
    return changed;
  }

  window.Motion.Store = {
    load,
    mutate,
    undo,
    canUndo: () => undoStack.length > 0,
    commitRemote,
    get: () => data,
    subscribe: fn => listeners.push(fn),
    onLocalChange: fn => changeListeners.push(fn)
  };
})();
