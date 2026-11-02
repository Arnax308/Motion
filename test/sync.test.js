const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const Core = require('../js/sync-core.js');
const { createSyncEngine } = require('../js/sync.js');

// In-memory stand-in for Firestore: every push gets one server timestamp, pulls come back
// in (timestamp, key) order after the cursor, a few records per page.
function fakeServer(pageSize) {
  const docs = new Map();
  let clock = 0;
  let online = true;
  return {
    docs,
    setOnline(v) { online = v; },
    transport: {
      async push(records) {
        if (!online) throw new Error('offline');
        clock++;
        records.forEach(r => docs.set(r.key, { ...r, synced_at: clock }));
      },
      async pull(cursor) {
        if (!online) throw new Error('offline');
        const sorted = [...docs.values()].sort((a, b) => a.synced_at - b.synced_at || a.key.localeCompare(b.key));
        const after = cursor ? sorted.filter(d => d.synced_at > cursor.t || (d.synced_at === cursor.t && d.key > cursor.name)) : sorted;
        const page = after.slice(0, pageSize);
        const last = page[page.length - 1];
        return {
          records: page.map(d => ({ key: d.key, json: d.json, updated_at: d.updated_at, deleted: d.deleted })),
          cursor: last ? { t: last.synced_at, name: last.key } : cursor,
          more: page.length === pageSize
        };
      }
    }
  };
}

// A device: its own data, a store-like wrapper and a sync engine sharing the server
function makeDevice(server, initial, opts) {
  let data = JSON.parse(JSON.stringify(initial || {
    total_pp: 0, baseline_pp: 0, baseline_best_streak: 0, categories: [], active_tasks: [], history: []
  }));
  Core.ensureSyncState(data);
  if (opts && opts.fresh) data.sync.fresh = true;
  else Core.adoptExisting(data);
  E.recomputeDerived(data);
  let clock = (opts && opts.clock) || 1000;

  const store = {
    get: () => data,
    commitRemote: fn => fn(data)
  };
  const device = {
    get data() { return data; },
    tick(ms) { clock += ms || 1; return clock; },
    // Same steps as Store.mutate
    change(fn) {
      const before = Core.recordMap(data);
      const result = fn(data);
      Core.trackChanges(data, before, device.tick());
      E.recomputeDerived(data);
      return result;
    },
    engine: createSyncEngine({ transport: server.transport, store, now: () => clock }),
    sync() { return device.engine.sync(); },
    tasks: () => data.active_tasks.map(t => t.id).sort(),
    historyIds: () => data.history.map(h => h.id).sort()
  };
  return device;
}

const DUE = new Date(2026, 9, 28, 18).toISOString();
const task = (id, extra) => Object.assign({ id, title: id, category: 'Work', severity: 'med', base_pp: 100, deadline: DUE, recurring: 'none' }, extra);
const cat = { id: 'cat-work', name: 'Work', icon: 'briefcase', color: '#60A5FA', weight: 1, active: true };

async function syncBoth(a, b) {
  await a.sync();
  await b.sync();
  await a.sync();
}

function assertConverged(a, b) {
  assert.deepEqual(a.tasks(), b.tasks());
  assert.deepEqual(a.historyIds(), b.historyIds());
  assert.equal(a.data.total_pp, b.data.total_pp);
  assert.equal(a.data.best_streak, b.data.best_streak);
}

test('a fresh phone takes the laptop data, including baselines, instead of its starter categories', async () => {
  const server = fakeServer(3);
  const laptop = makeDevice(server, {
    total_pp: 960, baseline_pp: 900, baseline_best_streak: 4, categories: [cat],
    active_tasks: [task('t1'), task('t2')],
    history: [{ id: 'h1', status: 'completed', pp_earned: 60, completion_time: new Date(2026, 9, 1).toISOString() }]
  });
  const phone = makeDevice(server, {
    total_pp: 0, baseline_pp: 0, baseline_best_streak: 0, active_tasks: [], history: [],
    categories: [{ id: 'dev', name: 'Development' }, { id: 'study', name: 'Study' }]
  }, { fresh: true });

  await laptop.sync();
  await phone.sync();
  assert.deepEqual(phone.tasks(), ['t1', 't2']);
  assert.deepEqual(phone.data.categories.map(c => c.id), ['cat-work']);
  assert.equal(phone.data.total_pp, 960);
  assert.equal(phone.data.best_streak, 4);
  assert.equal(phone.data.sync.dirty.length, 0);
});

test('edits made offline on both devices merge and converge', async () => {
  const server = fakeServer(2);
  const laptop = makeDevice(server, { total_pp: 0, baseline_pp: 0, categories: [cat], active_tasks: [task('a'), task('b'), task('c')], history: [] });
  const phone = makeDevice(server, null, { fresh: true });
  await syncBoth(laptop, phone);

  server.setOnline(false);
  laptop.change(d => E.addTask(d, { title: 'laptop task', category: 'Work', deadline: DUE }));
  laptop.change(d => E.completeTask(d, 'a', new Date(2026, 9, 28, 10)));
  phone.change(d => E.addTask(d, { title: 'phone task', category: 'Work', deadline: DUE }));
  phone.change(d => E.deleteTask(d, 'b'));
  phone.change(d => { d.active_tasks.find(t => t.id === 'c').title = 'renamed on phone'; });
  await assert.rejects(laptop.sync());
  server.setOnline(true);

  await syncBoth(laptop, phone);
  assertConverged(laptop, phone);
  assert.equal(laptop.data.active_tasks.length, 3); // c, laptop task, phone task
  assert.equal(laptop.data.active_tasks.find(t => t.id === 'c').title, 'renamed on phone');
  assert.equal(phone.data.total_pp, 200);
});

test('the newer edit to the same task wins', async () => {
  const server = fakeServer(5);
  const laptop = makeDevice(server, { total_pp: 0, baseline_pp: 0, categories: [cat], active_tasks: [task('a')], history: [] }, { clock: 1000 });
  const phone = makeDevice(server, null, { fresh: true, clock: 5000 });
  await syncBoth(laptop, phone);
  laptop.change(d => { d.active_tasks[0].title = 'older'; });
  phone.change(d => { d.active_tasks[0].title = 'newer'; });
  await syncBoth(laptop, phone);
  assert.equal(laptop.data.active_tasks[0].title, 'newer');
  assert.equal(phone.data.active_tasks[0].title, 'newer');
});

test('a phone completion beats a laptop auto-miss of the same task, whatever the timing', async () => {
  const server = fakeServer(4);
  const laptop = makeDevice(server, { total_pp: 0, baseline_pp: 0, categories: [cat], active_tasks: [task('run', { recurring: 'daily' })], history: [] }, { clock: 1000 });
  const phone = makeDevice(server, null, { fresh: true, clock: 1000 });
  await syncBoth(laptop, phone);

  // Phone completes on time; laptop was offline and auto-misses it days later (newer timestamp)
  phone.change(d => E.completeTask(d, 'run', new Date(2026, 9, 28, 15)));
  laptop.tick(10000);
  laptop.change(d => E.autoMissOverdue(d, new Date(2026, 10, 2, 12)));
  assert.ok(laptop.data.history.some(h => h.catch_up));

  await syncBoth(laptop, phone);
  assertConverged(laptop, phone);
  const resolution = laptop.data.history.find(h => h.id === 'hist-run');
  assert.equal(resolution.status, 'completed');
  assert.equal(laptop.data.history.filter(h => h.catch_up).length, 0); // laptop's skip-misses dropped
  assert.deepEqual(laptop.tasks(), ['run@2026-10-29']); // only the phone's next copy survives
  assert.equal(laptop.data.total_pp, 200);
});

test('completing the same task on both devices gives one history entry and one next copy', async () => {
  const server = fakeServer(3);
  const laptop = makeDevice(server, { total_pp: 0, baseline_pp: 0, categories: [cat], active_tasks: [task('gym', { recurring: 'weekly' })], history: [] });
  const phone = makeDevice(server, null, { fresh: true });
  await syncBoth(laptop, phone);
  laptop.change(d => E.completeTask(d, 'gym', new Date(2026, 9, 28, 12)));
  phone.change(d => E.completeTask(d, 'gym', new Date(2026, 9, 28, 13)));
  await syncBoth(laptop, phone);
  assertConverged(laptop, phone);
  assert.deepEqual(laptop.historyIds(), ['hist-gym']);
  assert.deepEqual(laptop.tasks(), ['gym@2026-11-04']);
});

test('undo on one device reaches the other', async () => {
  const server = fakeServer(3);
  const laptop = makeDevice(server, { total_pp: 0, baseline_pp: 0, categories: [cat], active_tasks: [task('a', { recurring: 'daily' })], history: [] });
  const phone = makeDevice(server, null, { fresh: true });
  await syncBoth(laptop, phone);

  const snapshot = JSON.parse(JSON.stringify(laptop.data));
  laptop.change(d => E.completeTask(d, 'a', new Date(2026, 9, 28, 12)));
  await syncBoth(laptop, phone);
  assert.deepEqual(phone.tasks(), ['a@2026-10-29']);

  // Same steps as Store.undo: restore records, keep sync bookkeeping, record the change
  laptop.change(d => {
    d.active_tasks = snapshot.active_tasks;
    d.history = snapshot.history;
  });
  await syncBoth(laptop, phone);
  assertConverged(laptop, phone);
  assert.deepEqual(phone.tasks(), ['a']);
  assert.equal(phone.data.history.length, 0);
  assert.equal(phone.data.total_pp, 0);
});

test('deleting a task while the other device edits it: the later action wins', async () => {
  const server = fakeServer(3);
  const laptop = makeDevice(server, { total_pp: 0, baseline_pp: 0, categories: [cat], active_tasks: [task('a')], history: [] }, { clock: 1000 });
  const phone = makeDevice(server, null, { fresh: true, clock: 1000 });
  await syncBoth(laptop, phone);
  phone.change(d => E.deleteTask(d, 'a'));
  laptop.tick(500);
  laptop.change(d => { d.active_tasks[0].title = 'edited later'; });
  await syncBoth(laptop, phone);
  assertConverged(laptop, phone);
  assert.deepEqual(phone.tasks(), ['a']);
});

test('large uploads are batched and pages split mid-batch lose nothing', async () => {
  const server = fakeServer(7);
  const many = Array.from({ length: 1234 }, (_, i) => ({
    id: `h${String(i).padStart(4, '0')}`, status: 'completed', pp_earned: 1, completion_time: new Date(2026, 0, 1, 0, i).toISOString()
  }));
  const pushes = [];
  const realPush = server.transport.push;
  server.transport.push = async records => { pushes.push(records.length); return realPush(records); };
  const laptop = makeDevice(server, { total_pp: 1234, baseline_pp: 0, categories: [cat], active_tasks: [], history: many });
  const phone = makeDevice(server, null, { fresh: true });
  await laptop.sync();
  assert.ok(pushes.every(n => n <= 400));
  await phone.sync();
  assert.equal(phone.data.history.length, 1234);
  assert.equal(phone.data.total_pp, 1234);
});

test('syncing again with nothing new changes nothing and pushes nothing', async () => {
  const server = fakeServer(5);
  const laptop = makeDevice(server, { total_pp: 0, baseline_pp: 0, categories: [cat], active_tasks: [task('a')], history: [] });
  await laptop.sync();
  let pushed = 0;
  const realPush = server.transport.push;
  server.transport.push = async r => { pushed += r.length; return realPush(r); };
  const before = JSON.stringify(laptop.data.active_tasks);
  await laptop.sync();
  await laptop.sync();
  assert.equal(pushed, 0);
  assert.equal(JSON.stringify(laptop.data.active_tasks), before);
  assert.equal(laptop.engine.status().state, 'synced');
});
