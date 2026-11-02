/* ==========================================================================
   MOTION BACKGROUND RUNNER — runs on Android every ~15 minutes, even when the
   app is closed. It keeps a read-only copy of your data, pulls changes made on
   the laptop and schedules alerts for tasks the app hasn't scheduled yet.

   scripts/build-web.js prepends engine.js, sync-core.js, firestore.js and
   alerts-core.js to this file. There is no DOM, window or Intl here.
   ========================================================================== */

/* global CapacitorKV, CapacitorNotifications */

function kvGet(key) {
  const r = CapacitorKV.get(key);
  return r && r.value != null ? r.value : null;
}

function kvJson(key) {
  try { return JSON.parse(kvGet(key) || 'null'); } catch (e) { return null; }
}

// The app hands over its data, sync config, alert preferences and what it already scheduled
addEventListener('seed', (resolve, reject, args) => {
  try {
    CapacitorKV.set('config', JSON.stringify(args.config || null));
    CapacitorKV.set('prefs', JSON.stringify(args.prefs || null));
    CapacitorKV.set('data', args.data || 'null');
    CapacitorKV.set('scheduled', JSON.stringify(args.scheduled || []));
    resolve();
  } catch (err) {
    reject(err);
  }
});

addEventListener('motionSync', async (resolve, reject) => {
  try {
    const config = kvJson('config');
    const data = kvJson('data');
    if (!data) return resolve();
    const { Engine, SyncCore, AlertsCore, createFirestoreTransport } = globalThis.Motion;

    if (config && config.apiKey && config.syncKey) {
      const transport = createFirestoreTransport(config, {
        get: async k => kvGet(k),
        set: async (k, v) => CapacitorKV.set(k, v)
      });
      SyncCore.ensureSyncState(data);
      let cursor = data.sync.cursor;
      const records = [];
      let more = true;
      while (more) {
        const page = await transport.pull(cursor);
        records.push(...page.records);
        cursor = page.cursor;
        more = page.more;
      }
      if (records.length) {
        SyncCore.applyRemote(data, records);
        SyncCore.normalize(data, Date.now());
        Engine.recomputeDerived(data);
        data.sync.cursor = cursor;
        CapacitorKV.set('data', JSON.stringify(data));
      }
    }

    // Only add alerts the app hasn't already scheduled; the app replaces them all when it opens
    const scheduled = new Set(kvJson('scheduled') || []);
    const fresh = AlertsCore.buildSchedule(data, kvJson('prefs'), new Date()).filter(a => !scheduled.has(a.id));
    if (fresh.length) {
      CapacitorNotifications.schedule(fresh.map(a => ({ id: a.id, title: a.title, body: a.body, scheduleAt: a.at })));
      fresh.forEach(a => scheduled.add(a.id));
      CapacitorKV.set('scheduled', JSON.stringify([...scheduled]));
    }
    resolve();
  } catch (err) {
    reject(err);
  }
});
