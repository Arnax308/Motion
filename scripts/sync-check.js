// Live check of sync against your Firebase project: two simulated devices share a throwaway
// sync key (never your real one), make offline changes, sync, and must end up identical.
// Usage: node scripts/sync-check.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const E = require('../js/engine.js');
const Core = require('../js/sync-core.js');
const { createSyncEngine } = require('../js/sync.js');
const { createFirestoreTransport } = require('../js/firestore.js');

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'sync-config.js'), 'utf8'), sandbox);
const real = sandbox.window.MotionSyncConfig;
if (!real || !real.apiKey) {
  console.error('js/sync-config.js has no Firebase config yet.');
  process.exit(1);
}
const config = { apiKey: real.apiKey, projectId: real.projectId, syncKey: `check-${crypto.randomBytes(16).toString('hex')}` };

function device(initial, fresh) {
  const data = E.recomputeDerived(Object.assign({ baseline_pp: 0, baseline_best_streak: 0, categories: [], active_tasks: [], history: [] }, initial));
  Core.ensureSyncState(data);
  if (fresh) data.sync.fresh = true;
  else Core.adoptExisting(data);
  const kv = new Map();
  const transport = createFirestoreTransport(config, { get: async k => kv.get(k) || null, set: async (k, v) => kv.set(k, v) });
  const engine = createSyncEngine({ transport, store: { get: () => data, commitRemote: fn => fn(data) } });
  return {
    data,
    sync: () => engine.sync(),
    change(fn) {
      const before = Core.recordMap(data);
      fn(data);
      Core.trackChanges(data, before);
      E.recomputeDerived(data);
    }
  };
}

(async () => {
  const due = new Date(Date.now() + 5 * 3600 * 1000);
  const laptop = device({
    categories: [{ id: 'cat-work', name: 'Work', icon: 'briefcase', color: '#60A5FA', weight: 1, active: true }],
    active_tasks: [
      { id: 'a', title: 'Task A', category: 'Work', severity: 'med', base_pp: 100, deadline: due.toISOString(), recurring: 'none' },
      { id: 'b', title: 'Task B', category: 'Work', severity: 'high', base_pp: 100, deadline: due.toISOString(), recurring: 'daily' }
    ]
  });
  const phone = device({}, true);

  console.log(`Using throwaway space ${config.syncKey}`);
  await laptop.sync();
  await phone.sync();
  console.log(`Phone received ${phone.data.active_tasks.length} tasks`);

  phone.change(d => E.completeTask(d, 'b'));
  laptop.change(d => { d.active_tasks.find(t => t.id === 'a').title = 'Task A (edited on laptop)'; });
  await phone.sync();
  await laptop.sync();
  await phone.sync();

  const view = d => JSON.stringify({ tasks: d.active_tasks.map(t => [t.id, t.title]).sort(), history: d.history.map(h => h.id).sort(), pp: d.total_pp });
  if (view(laptop.data) !== view(phone.data)) {
    console.error('Devices did not converge:\n', view(laptop.data), '\n', view(phone.data));
    process.exit(1);
  }
  console.log(`Both devices agree: ${view(laptop.data)}`);
  console.log('Sync works.');
})().catch(err => {
  console.error('Sync check failed:', err.message || err);
  process.exit(1);
});
