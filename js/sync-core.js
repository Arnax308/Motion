/* ==========================================================================
   MOTION SYNC CORE — record-level change tracking and merging.
   Pure functions over the data object (no network, no DOM) so they run in
   Node tests, the app and the Android background runner alike.

   Every task, history entry and category is a record keyed "task:<id>",
   "hist:<id>" or "cat:<id>", plus one "meta:baseline" record. Each record has
   an updated_at time; the newest version wins, and deletions leave tombstones.
   ========================================================================== */

(function (root) {
  const Engine = (root.Motion && root.Motion.Engine) || (typeof require === 'function' ? require('./engine.js') : null);

  const COLLECTIONS = { task: 'active_tasks', hist: 'history', cat: 'categories' };
  const META_KEY = 'meta:baseline';
  // Completing a task beats deferring it, which beats missing it, whatever the timestamps say:
  // a phone completion shouldn't be overridden by a laptop that auto-missed it while offline
  const RESOLUTION_RANK = { completed: 3, deferred: 2, missed: 1 };

  function randomId() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function ensureSyncState(data) {
    if (!data.sync || typeof data.sync !== 'object') data.sync = {};
    const s = data.sync;
    if (!s.updated || typeof s.updated !== 'object') s.updated = {};
    if (!s.tombstones || typeof s.tombstones !== 'object') s.tombstones = {};
    if (!Array.isArray(s.dirty)) s.dirty = [];
    if (s.cursor === undefined) s.cursor = null;
    if (!s.device_id) s.device_id = randomId();
    if (s.last_synced === undefined) s.last_synced = null;
    return s;
  }

  function metaValue(data) {
    return { baseline_pp: data.baseline_pp || 0, baseline_best_streak: data.baseline_best_streak || 0 };
  }

  // key -> JSON string of every syncable record
  function recordMap(data) {
    const map = new Map();
    Object.keys(COLLECTIONS).forEach(type => {
      (data[COLLECTIONS[type]] || []).forEach(r => { if (r && r.id) map.set(`${type}:${r.id}`, JSON.stringify(r)); });
    });
    map.set(META_KEY, JSON.stringify(metaValue(data)));
    return map;
  }

  function markDirty(s, key) {
    if (!s.dirty.includes(key)) s.dirty.push(key);
  }

  // Compares records before and after a local change and stamps what changed
  function trackChanges(data, before, now) {
    const s = ensureSyncState(data);
    const ts = typeof now === 'number' ? now : Date.now();
    const after = recordMap(data);
    let changed = 0;
    after.forEach((json, key) => {
      if (before.get(key) === json) return;
      s.updated[key] = Math.max(ts, (s.tombstones[key] || 0) + 1, (s.updated[key] || 0) + 1);
      delete s.tombstones[key];
      markDirty(s, key);
      changed++;
    });
    before.forEach((json, key) => {
      if (after.has(key)) return;
      s.tombstones[key] = Math.max(ts, (s.updated[key] || 0) + 1);
      delete s.updated[key];
      markDirty(s, key);
      changed++;
    });
    return changed;
  }

  // A device that already had data marks everything for upload once, with an ancient
  // timestamp so any real edit made elsewhere wins
  function adoptExisting(data) {
    const s = ensureSyncState(data);
    recordMap(data).forEach((json, key) => {
      if (s.updated[key] === undefined && s.tombstones[key] === undefined) {
        s.updated[key] = 1;
        markDirty(s, key);
      }
    });
  }

  function findRecord(data, key) {
    const [type, ...rest] = key.split(':');
    const id = rest.join(':');
    const list = data[COLLECTIONS[type]];
    if (!list) return { list: null, index: -1, id };
    return { list, index: list.findIndex(r => r && r.id === id), id };
  }

  function putRecord(data, key, value) {
    if (key === META_KEY) {
      data.baseline_pp = value.baseline_pp || 0;
      data.baseline_best_streak = value.baseline_best_streak || 0;
      return;
    }
    const { list, index } = findRecord(data, key);
    if (!list) return;
    if (index === -1) list.push(value);
    else list[index] = value;
  }

  function removeRecord(data, key) {
    if (key === META_KEY) return;
    const { list, index } = findRecord(data, key);
    if (list && index !== -1) list.splice(index, 1);
  }

  function isResolution(entry) {
    return entry && entry.task_id && !entry.catch_up && RESOLUTION_RANK[entry.status];
  }

  // records: [{ key, json, updated_at, deleted }] from the server
  function applyRemote(data, records) {
    const s = ensureSyncState(data);
    let applied = 0;
    records.forEach(r => {
      const key = r.key;
      const localTs = Math.max(s.updated[key] || 0, s.tombstones[key] || 0);
      const remoteValue = r.deleted ? null : JSON.parse(r.json);

      // Resolution priority overrides timestamps when both sides resolved the same task
      if (key.startsWith('hist:') && !r.deleted && s.updated[key] !== undefined) {
        const { list, index } = findRecord(data, key);
        const local = list && index !== -1 ? list[index] : null;
        if (isResolution(local) && isResolution(remoteValue) && local.status !== remoteValue.status) {
          if (RESOLUTION_RANK[local.status] > RESOLUTION_RANK[remoteValue.status]) {
            // Keep ours and make sure it wins on the other device too
            s.updated[key] = Math.max(s.updated[key], r.updated_at + 1);
            markDirty(s, key);
            return;
          }
          list[index] = remoteValue;
          s.updated[key] = r.updated_at;
          s.dirty = s.dirty.filter(k => k !== key);
          applied++;
          return;
        }
      }

      if (r.updated_at <= localTs) return; // ours is as new or newer (and gets pushed if dirty)

      if (r.deleted) {
        removeRecord(data, key);
        s.tombstones[key] = r.updated_at;
        delete s.updated[key];
      } else {
        putRecord(data, key, remoteValue);
        s.updated[key] = r.updated_at;
        delete s.tombstones[key];
      }
      s.dirty = s.dirty.filter(k => k !== key);
      applied++;
    });
    return applied;
  }

  // After a merge, drop whatever contradicts how each task was finally resolved:
  // a task resolved on the other device, or the respawn and skipped-repeat misses that came
  // from a resolution that lost. Every device reaches the same result from the same records.
  function normalize(data, now) {
    const before = recordMap(data);
    const resolved = new Map();
    data.history.forEach(h => { if (isResolution(h)) resolved.set(h.task_id, h.status); });

    data.active_tasks = data.active_tasks.filter(t => !resolved.has(t.id));
    const activeIds = new Set(data.active_tasks.map(t => t.id));

    const contradicted = record => {
      if (!record.origin) return false;
      const sep = record.origin.lastIndexOf(':');
      const taskId = record.origin.slice(0, sep);
      const status = record.origin.slice(sep + 1);
      if (resolved.has(taskId)) return resolved.get(taskId) !== status;
      return activeIds.has(taskId); // the resolution was undone and the task is back
    };
    data.active_tasks = data.active_tasks.filter(t => !contradicted(t));
    data.history = data.history.filter(h => !contradicted(h));

    // Two devices can only both hold one live copy per repeating series
    const seenSeries = new Map();
    data.active_tasks.slice().sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).forEach(t => {
      if (!t.series_id) return;
      if (seenSeries.has(t.series_id)) data.active_tasks = data.active_tasks.filter(x => x.id !== t.id);
      else seenSeries.set(t.series_id, t.id);
    });

    return trackChanges(data, before, now);
  }

  function collectDirty(data) {
    const s = ensureSyncState(data);
    return s.dirty.map(key => {
      if (s.tombstones[key] !== undefined) return { key, json: '', updated_at: s.tombstones[key], deleted: true };
      const json = recordMap(data).get(key);
      if (json === undefined) return null;
      return { key, json, updated_at: s.updated[key] || 1, deleted: false };
    }).filter(Boolean);
  }

  // Clears dirty flags for records that didn't change again while the push was in flight
  function markPushed(data, pushed) {
    const s = ensureSyncState(data);
    pushed.forEach(p => {
      const current = p.deleted ? s.tombstones[p.key] : s.updated[p.key];
      if (current === p.updated_at) s.dirty = s.dirty.filter(k => k !== p.key);
    });
  }

  // A brand-new install takes the cloud's data instead of merging its starter categories in.
  // Anything the user already changed on this device (dirty records) is kept.
  function replaceWithRemote(data, records) {
    const s = ensureSyncState(data);
    const keep = new Set(s.dirty);
    Object.keys(COLLECTIONS).forEach(type => {
      data[COLLECTIONS[type]] = data[COLLECTIONS[type]].filter(r => keep.has(`${type}:${r.id}`));
    });
    Object.keys(s.updated).forEach(k => { if (!keep.has(k)) delete s.updated[k]; });
    Object.keys(s.tombstones).forEach(k => { if (!keep.has(k)) delete s.tombstones[k]; });
    return applyRemote(data, records);
  }

  const SyncCore = {
    META_KEY, ensureSyncState, recordMap, trackChanges, adoptExisting,
    applyRemote, normalize, collectDirty, markPushed, replaceWithRemote
  };

  root.Motion = root.Motion || {};
  root.Motion.SyncCore = SyncCore;
  if (typeof module !== 'undefined' && module.exports) module.exports = SyncCore;
})(typeof window !== 'undefined' ? window : globalThis);
