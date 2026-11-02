/* ==========================================================================
   MOTION PLATFORM — one storage interface for Electron, Android and the
   browser preview.
   ========================================================================== */

(function () {
  const M = window.Motion = window.Motion || {};
  const Cap = window.Capacitor;
  const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const kind = window.api ? 'electron' : isNative ? 'capacitor' : 'browser';
  const Prefs = isNative ? Cap.Plugins.Preferences : null;

  const DATA_KEY = 'motion-data';
  const BACKUP_PREFIX = 'motion-backup-';
  const BACKUP_KEEP = 7;

  async function get(key) {
    if (Prefs) return (await Prefs.get({ key })).value || null;
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  async function set(key, value) {
    if (Prefs) return Prefs.set({ key, value });
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  async function remove(key) {
    if (Prefs) return Prefs.remove({ key });
    try { localStorage.removeItem(key); } catch (e) { /* storage unavailable */ }
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  async function backupKeys() {
    if (!Prefs) return [];
    const { keys } = await Prefs.keys();
    return keys.filter(k => k.startsWith(BACKUP_PREFIX)).sort().reverse();
  }

  // Returns { data, status } like the Electron main process does
  async function loadData() {
    if (kind === 'electron') return window.api.loadData();

    const raw = await get(DATA_KEY);
    if (raw) {
      try {
        return { data: JSON.parse(raw), status: 'ok' };
      } catch (err) {
        await set(`motion-corrupt-${Date.now()}`, raw);
        for (const key of await backupKeys()) {
          try { return { data: JSON.parse(await get(key)), status: 'recovered', backup: key }; } catch (e) { /* try older */ }
        }
        return { data: null, status: 'corrupt', error: err.message };
      }
    }
    if (kind === 'browser') {
      // Browser preview: seed from data.json when it's served next to the page
      const res = await fetch('data.json').catch(() => null);
      if (res && res.ok) return { data: await res.json(), status: 'ok' };
    }
    return { data: null, status: 'missing' };
  }

  async function saveData(data) {
    if (kind === 'electron') return window.api.saveData(data);
    if (Prefs) {
      // Keep a copy of the first save each day on the phone, like data-file.js does on desktop
      const key = BACKUP_PREFIX + today();
      if (!(await get(key))) {
        const current = await get(DATA_KEY);
        if (current) await set(key, current);
        for (const old of (await backupKeys()).slice(BACKUP_KEEP)) await remove(old);
      }
    }
    await set(DATA_KEY, JSON.stringify(data));
    return { success: true };
  }

  M.Platform = { kind, isNative, get, set, remove, loadData, saveData };
})();
