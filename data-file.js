/* ==========================================================================
   MOTION DATA FILE — safe loading and saving of data.json.
   Plain Node (no Electron) so it can be unit tested.
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const BACKUP_KEEP = 14;
const RENAME_RETRIES = 5;
// OneDrive and antivirus scanners briefly lock files on Windows
const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);

function isObject(d) {
  return !!d && typeof d === 'object' && !Array.isArray(d);
}

// What a save must look like; anything else is a renderer bug and is refused
function isValidData(d) {
  return isObject(d) &&
    typeof d.total_pp === 'number' && Number.isFinite(d.total_pp) &&
    Array.isArray(d.categories) && Array.isArray(d.active_tasks) && Array.isArray(d.history);
}

function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function backupDir(file) {
  return path.join(path.dirname(file), 'backups');
}

// Newest first
function listBackups(file) {
  const dir = backupDir(file);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(n => /^data-\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .sort()
    .reverse()
    .map(n => path.join(dir, n));
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// Returns { data, status } where status is 'ok', 'missing', 'recovered' or 'corrupt'.
// A file that can't be parsed is set aside (never overwritten) and the newest good backup is used.
function load(file) {
  if (!fs.existsSync(file)) return { data: null, status: 'missing' };

  let error;
  try {
    const data = readJson(file);
    if (isObject(data)) return { data, status: 'ok' };
    error = 'File does not contain a data object';
  } catch (err) {
    error = err.message;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const corruptPath = path.join(path.dirname(file), `${path.parse(file).name}.corrupt-${stamp}.json`);
  try {
    fs.copyFileSync(file, corruptPath);
  } catch (err) {
    return { data: null, status: 'corrupt', error: `${error}; could not set the file aside: ${err.message}`, unsafe: true };
  }

  for (const backup of listBackups(file)) {
    try {
      const data = readJson(backup);
      if (isValidData(data)) return { data, status: 'recovered', backup, corruptPath, error };
    } catch (e) {
      // Try the next older backup
    }
  }
  return { data: null, status: 'corrupt', corruptPath, error };
}

// Copies the current file into backups/ once per day and prunes old copies
function backup(file, now) {
  if (!fs.existsSync(file)) return null;
  const dir = backupDir(file);
  const target = path.join(dir, `data-${localDate(now || new Date())}.json`);
  if (fs.existsSync(target)) return null;
  try {
    // Only back up files that parse, so recovery never restores garbage
    if (!isValidData(readJson(file))) return null;
  } catch (e) {
    return null;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(file, target);
  listBackups(file).slice(BACKUP_KEEP).forEach(old => fs.unlinkSync(old));
  return target;
}

function save(file, data) {
  if (!isValidData(data)) return { success: false, error: 'Refused to save data with an invalid shape' };

  try {
    backup(file);
  } catch (err) {
    console.error('Backup failed:', err);
  }

  const json = JSON.stringify(data, null, 2);
  const tmpFile = file + '.tmp';
  try {
    fs.writeFileSync(tmpFile, json, 'utf8');
    for (let attempt = 0; attempt < RENAME_RETRIES; attempt++) {
      try {
        fs.renameSync(tmpFile, file);
        return { success: true };
      } catch (err) {
        if (!RETRYABLE.has(err.code)) throw err;
        sleepSync(25 * (attempt + 1));
      }
    }
    // The rename kept failing on a locked file: write in place so the save isn't lost
    fs.writeFileSync(file, json, 'utf8');
    try { fs.unlinkSync(tmpFile); } catch (e) { /* leftover tmp file is harmless */ }
    return { success: true, fallback: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { load, save, backup, listBackups, isValidData, BACKUP_KEEP };
