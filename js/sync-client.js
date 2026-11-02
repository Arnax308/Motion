/* ==========================================================================
   MOTION SYNC CLIENT — connects the sync engine to this app: when to sync,
   and status for the UI. Does nothing when js/sync-config.js has no config.
   ========================================================================== */

(function () {
  const M = window.Motion;
  const { Store, Platform } = M;
  const config = window.MotionSyncConfig;
  // ?nosync in the URL keeps browser test sessions away from the real sync space
  const disabledByUrl = /[?&]nosync\b/.test(window.location.search);
  const enabled = !disabledByUrl && !!(config && config.apiKey && config.projectId && config.syncKey);

  const AFTER_CHANGE_MS = 2000;
  const INTERVAL_MS = 60 * 1000;

  let engine = null;
  let debounce = null;
  const listeners = [];

  function status() {
    if (!enabled) return { state: 'off', last: null, error: null };
    // The UI asks for status before start() has created the engine
    const s = engine ? engine.status() : { state: 'idle', last: null, error: null };
    return Object.assign({}, s, { last: s.last || (Store.get() && Store.get().sync.last_synced) || null });
  }

  function emitStatus() {
    listeners.forEach(fn => fn(status()));
  }

  // Never throws: failures show up in status() and the next trigger retries
  function syncNow() {
    if (!enabled) return Promise.resolve(false);
    clearTimeout(debounce);
    return engine.sync().then(() => true, err => {
      console.warn('Sync failed:', err.message || err);
      return false;
    });
  }

  function syncSoon(ms) {
    if (!enabled) return;
    clearTimeout(debounce);
    debounce = setTimeout(syncNow, ms);
  }

  // The first sync gets a head start before the auto-miss runs, so the laptop doesn't
  // auto-miss a task the phone already finished. It keeps running in the background after the timeout.
  function start(timeoutMs) {
    if (!enabled) return Promise.resolve(false);
    // Electron sends requests through the main process (see main.js); elsewhere plain fetch works
    const viaMain = window.api && window.api.netFetch
      ? (url, init) => window.api.netFetch(url, init).then(r => ({ ok: r.ok, status: r.status, text: async () => r.text }))
      : null;
    const transport = M.createFirestoreTransport(config, { get: Platform.get, set: Platform.set }, viaMain);
    engine = M.createSyncEngine({ transport, store: Store });
    engine.onStatus(emitStatus);

    Store.onLocalChange(() => syncSoon(AFTER_CHANGE_MS));
    setInterval(syncNow, INTERVAL_MS);
    window.addEventListener('online', () => syncSoon(500));
    window.addEventListener('focus', () => syncSoon(500));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncSoon(500); });

    const first = syncNow();
    return Promise.race([first, new Promise(res => setTimeout(() => res(false), timeoutMs))]);
  }

  function ago(ts) {
    if (!ts) return 'never';
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    return M.UI.fmtDay(ts);
  }

  // { tone, label } for a sync status, shared by both UIs
  function describe(s) {
    if (s.state === 'off') return { tone: 'muted', label: 'Sync not set up' };
    if (s.state === 'syncing') return { tone: 'accent', label: 'Syncing…' };
    if (s.state === 'offline') return { tone: 'warn', label: `Offline · last synced ${ago(s.last)}` };
    if (s.state === 'error') return { tone: 'danger', label: 'Sync problem' };
    if (s.last) return { tone: 'ok', label: `Synced ${ago(s.last)}` };
    return { tone: 'muted', label: 'Waiting to sync' };
  }

  M.Sync = { enabled, start, syncNow, syncSoon, status, describe, ago, onStatus: fn => listeners.push(fn) };
})();
