const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dataFile = require('../data-file.js');

const VALID = { total_pp: 870, streak: 4, categories: [], active_tasks: [], history: [] };

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-data-'));
  return path.join(dir, 'data.json');
}

test('missing file loads as null so the app can create defaults', () => {
  assert.deepEqual(dataFile.load(tempFile()), { data: null, status: 'missing' });
});

test('save then load round-trips and leaves no temp file', () => {
  const file = tempFile();
  assert.equal(dataFile.save(file, VALID).success, true);
  assert.deepEqual(dataFile.load(file), { data: VALID, status: 'ok' });
  assert.equal(fs.existsSync(file + '.tmp'), false);
});

test('invalid data is refused instead of overwriting the file', () => {
  const file = tempFile();
  dataFile.save(file, VALID);
  for (const bad of [null, [], {}, { total_pp: 'x', categories: [], active_tasks: [], history: [] }, { total_pp: 1 }]) {
    assert.equal(dataFile.save(file, bad).success, false);
  }
  assert.deepEqual(dataFile.load(file).data, VALID);
});

test('a corrupt file is kept aside and the newest backup is restored', () => {
  const file = tempFile();
  const backups = path.join(path.dirname(file), 'backups');
  fs.mkdirSync(backups);
  fs.writeFileSync(path.join(backups, 'data-2026-10-20.json'), JSON.stringify({ ...VALID, total_pp: 100 }));
  fs.writeFileSync(path.join(backups, 'data-2026-10-27.json'), JSON.stringify({ ...VALID, total_pp: 800 }));
  fs.writeFileSync(file, '{"total_pp": 87');

  const res = dataFile.load(file);
  assert.equal(res.status, 'recovered');
  assert.equal(res.data.total_pp, 800);
  assert.equal(fs.readFileSync(res.corruptPath, 'utf8'), '{"total_pp": 87');
  // The original is untouched until the app saves the recovered data
  assert.equal(fs.readFileSync(file, 'utf8'), '{"total_pp": 87');
});

test('a corrupt file with no usable backup reports corrupt but is still kept', () => {
  const file = tempFile();
  fs.writeFileSync(file, 'not json');
  const res = dataFile.load(file);
  assert.equal(res.status, 'corrupt');
  assert.equal(res.data, null);
  assert.ok(fs.existsSync(res.corruptPath));
});

test('backups are made once per day and only the newest 14 are kept', () => {
  const file = tempFile();
  dataFile.save(file, VALID);
  for (let day = 1; day <= 20; day++) {
    assert.ok(dataFile.backup(file, new Date(2026, 9, day)));
  }
  assert.equal(dataFile.backup(file, new Date(2026, 9, 20)), null); // same day again
  const kept = dataFile.listBackups(file).map(p => path.basename(p));
  assert.equal(kept.length, dataFile.BACKUP_KEEP);
  assert.equal(kept[0], 'data-2026-10-20.json');
  assert.equal(kept.at(-1), 'data-2026-10-07.json');
});

test('a corrupt file is never copied into backups', () => {
  const file = tempFile();
  fs.writeFileSync(file, '{broken');
  assert.equal(dataFile.backup(file, new Date()), null);
  assert.equal(dataFile.listBackups(file).length, 0);
});

test('saves fall back to a direct write when rename stays locked', () => {
  const file = tempFile();
  dataFile.save(file, VALID);
  const realRename = fs.renameSync;
  let attempts = 0;
  fs.renameSync = () => {
    attempts++;
    const err = new Error('locked');
    err.code = 'EPERM';
    throw err;
  };
  try {
    const res = dataFile.save(file, { ...VALID, total_pp: 999 });
    assert.equal(res.success, true);
    assert.equal(res.fallback, true);
    assert.equal(attempts, 5);
  } finally {
    fs.renameSync = realRename;
  }
  assert.equal(dataFile.load(file).data.total_pp, 999);
  assert.equal(fs.existsSync(file + '.tmp'), false);
});
