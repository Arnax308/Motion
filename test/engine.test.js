const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');

const DEADLINE = new Date(2026, 9, 28, 18, 0);

function makeData(overrides) {
  return Object.assign({
    total_pp: 1000, streak: 0, best_streak: 0, last_completion_date: null,
    categories: [{ name: 'Work', weight: 1.5 }], active_tasks: [], history: []
  }, overrides);
}

function makeTask(overrides) {
  return Object.assign({
    id: 'a', title: 'Task', category: 'Work', severity: 'high', base_pp: 100,
    deadline: DEADLINE.toISOString(), recurring: 'none'
  }, overrides);
}

const at = (d, h, m) => new Date(2026, 9, d, h, m || 0);

test('PP: timing, rescheduling, severity and category weight', () => {
  const data = makeData();
  assert.equal(E.ppBreakdown(data, makeTask(), at(28, 16)).total, 600); // 100 ×2 early ×2 high ×1.5
  assert.equal(E.ppBreakdown(data, makeTask(), at(28, 17, 30)).total, 300); // on time
  assert.equal(E.ppBreakdown(data, makeTask(), at(28, 19)).total, 150); // late ×½
  assert.equal(E.ppBreakdown(data, makeTask({ rescheduled: true }), at(28, 10)).total, 300);
  assert.equal(E.ppBreakdown(data, makeTask({ category: 'Gone', severity: 'low' }), at(28, 10)).total, 100);
  assert.equal(E.missPenalty(makeTask({ severity: 'life_changing' })), 50);
});

test('levels and level-based titles', () => {
  assert.equal(E.levelFor(0), 0);
  assert.equal(E.levelFor(299), 1);
  assert.equal(E.levelFor(300), 2);
  assert.equal(E.titleFor(2), 'Casual Rookie');
  assert.equal(E.titleFor(3), 'Disciplined Doer');
  assert.equal(E.titleFor(25), 'Life Prodigy');
  const lp = E.levelProgress(870);
  assert.equal(lp.level, 3);
  assert.equal(lp.toNext, 30);
  assert.equal(lp.nextTitle, 'Momentum Builder');
});

test('streaks use local dates', () => {
  const d = makeData();
  E.recordCompletionDay(d, at(27, 0, 30));
  assert.equal(d.last_completion_date, '2026-10-27');
  E.recordCompletionDay(d, at(28, 1));
  assert.equal(d.streak, 2);
  E.recordCompletionDay(d, at(28, 23));
  assert.equal(d.streak, 2);
  assert.equal(E.effectiveStreak(d, at(29, 12)), 2);
  assert.equal(E.effectiveStreak(d, at(30, 12)), 0);
  E.recordCompletionDay(d, new Date(2026, 10, 3));
  assert.equal(d.streak, 1);
  assert.equal(d.best_streak, 2);
});

test('completing an on-time daily task schedules tomorrow with no catch-up', () => {
  const d = makeData({ total_pp: 0 });
  d.active_tasks.push(makeTask({ recurring: 'daily' }));
  const r = E.completeTask(d, 'a', at(28, 16));
  assert.equal(r.earned, 600);
  assert.equal(r.catchUp, 0);
  assert.equal(d.active_tasks.length, 1);
  assert.equal(new Date(d.active_tasks[0].deadline).getTime(), at(29, 18).getTime());
});

test('a daily task ignored for 7 days costs 3 misses and resumes in the future', () => {
  // Deadlines from 28 Oct to 3 Nov have passed (7 occurrences); the app is opened on 3 Nov at 7 PM
  const d = makeData();
  d.active_tasks.push(makeTask({ recurring: 'daily', severity: 'med' }));
  const now = new Date(2026, 10, 3, 19);
  const results = E.autoMissOverdue(d, now);
  assert.equal(results.length, 1);
  const misses = d.history.filter(h => h.status === 'missed');
  assert.equal(misses.length, 3);
  assert.equal(misses.filter(h => h.catch_up).length, 2);
  assert.equal(d.total_pp, 1000 - 30);
  assert.equal(d.active_tasks.length, 1);
  const next = new Date(d.active_tasks[0].deadline);
  assert.ok(next > now);
  assert.equal(next.getHours(), 18);
});

test('catch-up rule: floor(ignored / 2), at least the original miss', () => {
  const cases = [
    // [days after the deadline the task is missed, expected total misses]
    [0.5, 1], // nothing skipped
    [1.5, 1], // 2 ignored
    [2.5, 1], // 3 ignored
    [3.5, 2], // 4 ignored
    [29.5, 15] // 30 ignored, no cap
  ];
  cases.forEach(([daysLate, expected]) => {
    const d = makeData();
    d.active_tasks.push(makeTask({ recurring: 'daily' }));
    E.missTask(d, 'a', new Date(DEADLINE.getTime() + daysLate * 86400000));
    assert.equal(d.history.length, expected, `${daysLate} days late`);
  });
});

test('completing a daily task 3 days late charges one skipped repeat', () => {
  const d = makeData({ total_pp: 0 });
  d.active_tasks.push(makeTask({ recurring: 'daily', severity: 'med' }));
  const r = E.completeTask(d, 'a', at(31, 12)); // the 29th and 30th went by
  assert.equal(r.catchUp, 1);
  assert.equal(r.catchUpLoss, 10);
  assert.equal(d.history.filter(h => h.status === 'completed').length, 1);
  assert.equal(new Date(d.active_tasks[0].deadline).getTime(), at(31, 18).getTime());
});

test('weekly repeats skip whole weeks', () => {
  const d = makeData();
  d.active_tasks.push(makeTask({ recurring: 'weekly' }));
  E.missTask(d, 'a', new Date(2026, 10, 20, 12)); // 3 weekly deadlines skipped, 4 ignored
  assert.equal(d.history.length, 2);
  assert.equal(new Date(d.active_tasks[0].deadline).getTime(), new Date(2026, 10, 25, 18).getTime());
});

test('auto-miss waits 72 hours', () => {
  const d = makeData({ total_pp: 100 });
  d.active_tasks.push(makeTask());
  assert.equal(E.autoMissOverdue(d, at(31, 17)).length, 0);
  assert.equal(E.autoMissOverdue(d, at(31, 19)).length, 1);
  assert.equal(d.total_pp, 80);
});

test('due-date buckets', () => {
  const now = at(28, 12);
  assert.equal(E.bucketFor(at(28, 11), now), 'overdue');
  assert.equal(E.bucketFor(at(28, 23), now), 'today');
  assert.equal(E.bucketFor(at(29, 1), now), 'tomorrow');
  assert.equal(E.bucketFor(new Date(2026, 10, 2), now), 'week');
  assert.equal(E.bucketFor(new Date(2026, 10, 10), now), 'later');
});

test('ids stay unique within the same millisecond', () => {
  const ids = new Set();
  for (let i = 0; i < 5000; i++) ids.add(E.newId('hist'));
  assert.equal(ids.size, 5000);
});
