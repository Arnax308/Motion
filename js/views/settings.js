/* ==========================================================================
   SETTINGS VIEW — sync status and, on the phone, alert preferences.
   ========================================================================== */

(function () {
  const M = window.Motion;
  const { UI, Platform } = M;
  const { esc, icon } = UI;

  const LEAD_OPTIONS = [[0, 'Off'], [15, '15 minutes before'], [30, '30 minutes before'], [60, '1 hour before'], [120, '2 hours before']];

  let root;

  function init(pageEl) {
    root = pageEl;
    root.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'sync-now') {
        M.Sync.syncNow();
        render();
      } else if (btn.dataset.act === 'test-alert') {
        M.Alerts.sendTest();
      } else if (btn.dataset.act === 'permissions') {
        M.Alerts.requestPermissions().then(render);
      } else if (btn.dataset.act === 'toggle-due') {
        const prefs = M.Alerts.getPrefs();
        M.Alerts.setPrefs({ atDeadline: !prefs.atDeadline }).then(render);
      }
    });
    root.addEventListener('change', e => {
      const field = e.target.dataset.pref;
      if (!field) return;
      const value = e.target.type === 'time' ? e.target.value : parseInt(e.target.value, 10);
      M.Alerts.setPrefs({ [field]: value }).then(render);
    });
    M.Sync.onStatus(() => { if (root.classList.contains('on')) render(); });
  }

  function ago(ts) {
    if (!ts) return 'never';
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} h ago`;
    return UI.fmtDay(ts);
  }

  // { tone, label } for the sync state, shared with the sidebar indicator
  function describeSync(s) {
    if (s.state === 'off') return { tone: 'muted', label: 'Sync not set up' };
    if (s.state === 'syncing') return { tone: 'accent', label: 'Syncing…' };
    if (s.state === 'offline') return { tone: 'warn', label: `Offline · last synced ${ago(s.last)}` };
    if (s.state === 'error') return { tone: 'danger', label: 'Sync problem' };
    if (s.last) return { tone: 'ok', label: `Synced ${ago(s.last)}` };
    return { tone: 'muted', label: 'Waiting to sync' };
  }

  function syncCard() {
    const s = M.Sync.status();
    const d = describeSync(s);
    if (s.state === 'off') {
      return `<div class="card settings-card">
        <div class="card-h">Sync</div>
        <p class="dialog-text">Sync isn’t set up on this device. Add your Firebase project and sync key to <code>js/sync-config.js</code> (the README explains how), then restart Motion.</p>
      </div>`;
    }
    const data = M.Store.get();
    return `<div class="card settings-card">
      <div class="card-h">Sync<button class="btn btn-sm" data-act="sync-now">${icon('refresh')}Sync now</button></div>
      <div class="sync-state"><span class="sync-dot ${d.tone}"></span>${esc(d.label)}</div>
      ${s.state === 'error' ? `<p class="field-error">${esc(s.error)}</p>` : ''}
      <p class="field-hint">Your laptop and phone share data through Firebase. Each keeps a full copy and works offline; changes sync whenever both get online.
        ${data.sync.dirty.length ? ` ${data.sync.dirty.length} change${data.sync.dirty.length === 1 ? '' : 's'} waiting to upload.` : ''}</p>
      <p class="field-hint">This device: <code>${esc(data.sync.device_id)}</code></p>
    </div>`;
  }

  function alertsCard() {
    if (!Platform.isNative || !M.Alerts) return '';
    const p = M.Alerts.getPrefs();
    const perm = M.Alerts.permissionState();
    return `<div class="card settings-card">
      <div class="card-h">Alerts<button class="btn btn-sm" data-act="test-alert">${icon('bell-ringing')}Send a test</button></div>
      ${perm.ok ? '' : `<div class="perm-warn">${icon('alert-triangle')}<span>${esc(perm.message)}</span>
        <button class="btn btn-sm" data-act="permissions">Allow</button></div>`}
      <div class="settings-row"><label for="pref-lead">Before a deadline</label>
        <select id="pref-lead" class="select" data-pref="leadMinutes">${LEAD_OPTIONS.map(([v, l]) => `<option value="${v}" ${p.leadMinutes === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="settings-row"><span>At the deadline</span>
        <button class="switch ${p.atDeadline ? 'on' : ''}" data-act="toggle-due" role="switch" aria-checked="${p.atDeadline}" aria-label="Alert at the deadline"></button></div>
      <div class="settings-row"><label for="pref-morning">Morning summary</label>
        <input id="pref-morning" class="input" type="time" data-pref="morning" value="${esc(p.morning)}"></div>
      <div class="settings-row"><label for="pref-streak">Streak reminder</label>
        <input id="pref-streak" class="input" type="time" data-pref="streak" value="${esc(p.streak)}"></div>
      <p class="field-hint">Clear a time to turn that alert off. The streak reminder only fires if you haven’t completed anything that day.</p>
    </div>`;
  }

  function render() {
    root.innerHTML = `
      <header class="page-head"><h1>Settings</h1><span class="grow"></span></header>
      <div class="page-body settings">
        ${syncCard()}
        ${alertsCard()}
      </div>`;
  }

  M.Views = M.Views || {};
  M.Views.settings = { init, render, describeSync };
})();
