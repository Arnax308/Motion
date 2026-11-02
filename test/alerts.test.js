const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const A = require('../js/alerts-core.js');

const NOW = new Date(2026, 10, 2, 9, 0); // Mon 2 Nov, 9:00 AM

function makeData(tasks, history) {
  const d = { baseline_pp: 0, baseline_best_streak: 0, categories: [{ name: 'Work', weight: 1 }], active_tasks: tasks || [], history: history || [] };
  return E.recomputeDerived(d);
}

const task = (id, due, extra) => Object.assign({ id, title: id, category: 'Work', severity: 'med', base_pp: 100, deadline: due.toISOString(), recurring: 'none' }, extra);
const at = (day, h, m) => new Date(2026, 10, day, h, m || 0);
const kinds = list => list.map(a => `${a.kind}@${a.at.getDate()}/${a.at.getHours()}:${String(a.at.getMinutes()).padStart(2, '0')}`);

test('lead and at-deadline alerts for upcoming tasks, none for overdue ones', () => {
  const data = makeData([task('report', at(2, 17)), task('late', at(1, 17)), task('soon', at(2, 9, 30))]);
  const list = A.buildSchedule(data, { morning: '', streak: '' }, NOW);
  assert.deepEqual(kinds(list), ['due@2/9:30', 'lead@2/16:00', 'due@2/17:00']);
  const lead = list.find(a => a.kind === 'lead');
  assert.equal(lead.title, 'Due in 1 hour: report');
  assert.match(lead.body, /\+100 PP/); // an hour before is no longer "1h+ early"
  assert.match(list.at(-1).body, /\+100 PP/);
});

test('lead time and the at-deadline switch follow the preferences', () => {
  const data = makeData([task('report', at(2, 17))]);
  const list = A.buildSchedule(data, { leadMinutes: 120, atDeadline: false, morning: '', streak: '' }, NOW);
  assert.deepEqual(kinds(list), ['lead@2/15:00']);
  assert.equal(list[0].title, 'Due in 2 hours: report');
  assert.match(list[0].body, /\+200 PP/); // still early: double PP
  assert.deepEqual(A.buildSchedule(data, { leadMinutes: 0, atDeadline: false, morning: '', streak: '' }, NOW), []);
});

test('tasks more than two weeks out are left for later', () => {
  const data = makeData([task('far', at(30, 12))]);
  assert.equal(A.buildSchedule(data, { morning: '', streak: '' }, NOW).length, 0);
});

test('morning summary lists today’s tasks and PP', () => {
  const data = makeData([task('b', at(3, 18)), task('a', at(3, 11, 30), { severity: 'high' })]);
  const list = A.buildSchedule(data, { leadMinutes: 0, atDeadline: false, morning: '08:00', streak: '' }, NOW);
  // 8 AM today has passed, so only tomorrow's summary is scheduled
  assert.deepEqual(kinds(list), ['morning@3/8:00']);
  assert.equal(list[0].body, '2 tasks due today, up to +600 PP. First up: a at 11:30 AM.');
});

test('streak reminder only when nothing is done today', () => {
  const doneYesterday = [{ id: 'h1', status: 'completed', pp_earned: 10, completion_time: at(1, 12).toISOString() }];
  const at6pm = new Date(2026, 10, 2, 18);

  let list = A.buildSchedule(makeData([], doneYesterday), { leadMinutes: 0, morning: '', streak: '20:00' }, at6pm);
  assert.deepEqual(kinds(list), ['streak@2/20:00', 'streak@3/20:00']);
  assert.equal(list[0].body, 'Your 1-day streak ends tonight. Finish one task to keep it.');

  const doneToday = doneYesterday.concat({ id: 'h2', status: 'completed', pp_earned: 10, completion_time: at(2, 10).toISOString() });
  list = A.buildSchedule(makeData([], doneToday), { leadMinutes: 0, morning: '', streak: '20:00' }, at6pm);
  assert.deepEqual(kinds(list), ['streak@3/20:00']);
  assert.match(list[0].body, /2-day streak/);
});

test('ids are stable 31-bit numbers', () => {
  const data = makeData([task('report', at(2, 17))]);
  const a = A.buildSchedule(data, {}, NOW);
  const b = A.buildSchedule(data, {}, NOW);
  assert.deepEqual(a.map(x => x.id), b.map(x => x.id));
  assert.ok(a.every(x => Number.isInteger(x.id) && x.id > 0 && x.id < 2 ** 31));
  assert.equal(new Set(a.map(x => x.id)).size, a.length);
});
