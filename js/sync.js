/* ==========================================================================
   MOTION SYNC — pulls the other device's changes, merges them, pushes ours.
   createSyncEngine takes its transport and store as parameters so the whole
   flow runs in Node tests against a fake server.
   ========================================================================== */

(function (root) {
  const SyncCore = (root.Motion && root.Motion.SyncCore) || require('./sync-core.js');
  const Engine = (root.Motion && root.Motion.Engine) || require('./engine.js');

  const PUSH_BATCH = 400; // Firestore allows 500 writes per commit

  // store: { get(), commitRemote(fn) } — commitRemote applies fn to the data, saves and re-renders
  function createSyncEngine(opts) {
    const { transport, store } = opts;
    const now = opts.now || (() => Date.now());
    let running = null;
    let again = false;
    let status = { state: 'idle', last: null, error: null };
    const listeners = [];

    function setStatus(patch) {
      status = Object.assign({}, status, patch);
      listeners.forEach(fn => fn(status));
    }

    async function pullAll(cursor) {
      const records = [];
      let more = true;
      while (more) {
        const page = await transport.pull(cursor);
        records.push(...page.records);
        cursor = page.cursor;
        more = page.more;
      }
      return { records, cursor };
    }

    async function runOnce() {
      setStatus({ state: 'syncing', error: null });

      const pulled = await pullAll(store.get().sync.cursor);
      store.commitRemote(data => {
        const s = SyncCore.ensureSyncState(data);
        let changed = 0;
        if (pulled.records.length) {
          changed = s.fresh
            ? SyncCore.replaceWithRemote(data, pulled.records)
            : SyncCore.applyRemote(data, pulled.records);
          s.fresh = false;
        }
        changed += SyncCore.normalize(data, now());
        Engine.recomputeDerived(data);
        s.cursor = pulled.cursor;
        return changed;
      });

      const dirty = SyncCore.collectDirty(store.get());
      const device = store.get().sync.device_id;
      for (let i = 0; i < dirty.length; i += PUSH_BATCH) {
        const batch = dirty.slice(i, i + PUSH_BATCH).map(r => Object.assign({ device }, r));
        await transport.push(batch);
        store.commitRemote(data => { SyncCore.markPushed(data, batch); return 0; });
      }

      store.commitRemote(data => {
        // A new install stays "fresh" (ready to take the cloud's data wholesale) until there's
        // something to merge with or the user has made changes of their own
        if (pulled.records.length || dirty.length) data.sync.fresh = false;
        data.sync.last_synced = now();
        return 0;
      });
      setStatus({ state: 'synced', last: now(), error: null });
    }

    // Overlapping requests collapse into one follow-up run
    function sync() {
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        try {
          do {
            again = false;
            await runOnce();
          } while (again);
        } catch (err) {
          const offline = !err.status;
          setStatus({ state: offline ? 'offline' : 'error', error: err.message || String(err) });
          throw err;
        } finally {
          running = null;
        }
      })();
      return running;
    }

    return {
      sync,
      status: () => status,
      onStatus: fn => listeners.push(fn)
    };
  }

  root.Motion = root.Motion || {};
  root.Motion.createSyncEngine = createSyncEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = { createSyncEngine };
})(typeof window !== 'undefined' ? window : globalThis);
