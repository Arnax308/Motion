/* ==========================================================================
   MOTION PHONE "YOU" — profile tab plus the History, Categories and Settings
   screens it opens.
   ========================================================================== */

(function () {
  const M = window.Motion;
  const { Engine, UI, Store, P, Platform } = M;
  const { esc, icon, el } = UI;

  const STATUS = { completed: ['check', 'Completed'], missed: ['x', 'Missed'], deferred: ['player-pause', 'Deferred'] };

  function topbar(title, extra) {
    return `<div class="p-topbar"><button class="p-back" data-back aria-label="Back">${icon('arrow-left')}</button><h2>${esc(title)}</h2>${extra || ''}</div>`;
  }

  // ME (tab)
  const me = {
    init(root) {
      root.innerHTML = '<div data-content></div>';
      this.content = root.querySelector('[data-content]');
      root.addEventListener('click', e => {
        const go = e.target.closest('[data-push]');
        if (go) M.Phone.push(go.dataset.push);
      });
    },
    render() {
      const data = Store.get();
      const now = new Date();
      const lp = Engine.levelProgress(data.total_pp);
      const streak = Engine.effectiveStreak(data, now);
      const sync = M.Sync.describe(M.Sync.status());
      const bands = Engine.TITLE_BANDS;
      this.content.innerHTML = `
        <div class="p-head"><div><div class="p-eyebrow">Level ${lp.level}</div><div class="p-title">You</div></div></div>
        <div class="hero">
          <div class="hero-top">
            <div class="ring" style="--p:${Math.round(lp.ratio * 100)};--size:76px"><div><b>${lp.level}</b><small>LEVEL</small></div></div>
            <div><div class="hero-name">${esc(lp.title)}</div>
              <div class="hero-sub">${UI.fmtNum(lp.pp)} PP · ${UI.fmtNum(lp.toNext)} to level ${lp.level + 1}</div></div>
          </div>
          <div class="xpbar"><div style="width:${Math.round(lp.ratio * 100)}%"></div></div>
          <div class="hero-chips">
            <div class="hero-chip">${icon('flame', 'flame')}<div><b>${streak}</b><small>streak</small></div></div>
            <div class="hero-chip">${icon('trophy', 'gold')}<div><b>${Math.max(data.best_streak || 0, streak)}</b><small>best</small></div></div>
            <div class="hero-chip">${icon('checks')}<div><b>${data.history.filter(h => h.status === 'completed').length}</b><small>done</small></div></div>
          </div>
          <ul class="ladder">${bands.map((b, i) => {
            const next = bands[i + 1];
            const cls = lp.level >= b.from && (!next || lp.level < next.from) ? 'now' : lp.level >= b.from ? 'done' : '';
            return `<li class="${cls}"><span class="lv">Lvl ${b.from}${next ? '–' + (next.from - 1) : '+'}</span>${esc(b.title)}${cls === 'now' ? icon('map-pin') : cls === 'done' ? icon('check') : icon('lock')}</li>`;
          }).join('')}</ul>
        </div>
        <div class="p-section"><h3>Your stuff</h3></div>
        <div class="rows">
          <button class="row" data-push="history"><span class="r-ic">${icon('history')}</span><span class="r-main"><span class="r-title">History</span><span class="r-sub">${data.history.length} entries</span></span>${icon('chevron-right', 'chev')}</button>
          <button class="row" data-push="categories"><span class="r-ic">${icon('tags')}</span><span class="r-main"><span class="r-title">Categories</span><span class="r-sub">${data.categories.length} categories · weights multiply PP</span></span>${icon('chevron-right', 'chev')}</button>
          <button class="row" data-push="settings"><span class="r-ic">${icon('settings')}</span><span class="r-main"><span class="r-title">Settings</span><span class="r-sub"><span class="sync-dot ${sync.tone}"></span> ${esc(sync.label)}</span></span>${icon('chevron-right', 'chev')}</button>
        </div>`;
    }
  };

  // HISTORY (pushed)
  const history = {
    state: { query: '', status: 'all' },
    init(root) {
      root.innerHTML = `${topbar('History')}
        <label class="search">${icon('search')}<input type="search" placeholder="Search history" data-q></label>
        <div class="chips" data-status></div>
        <div data-list></div>`;
      root.querySelector('[data-q]').addEventListener('input', e => { this.state.query = e.target.value.trim().toLowerCase(); this.renderList(); });
      root.addEventListener('click', e => {
        const s = e.target.closest('[data-st]');
        if (s) { this.state.status = s.dataset.st; P.haptic.tap(); this.render(); }
      });
      this.root = root;
    },
    render() {
      const data = Store.get();
      const counts = { all: data.history.length, completed: 0, missed: 0, deferred: 0 };
      data.history.forEach(h => { if (counts[h.status] !== undefined) counts[h.status]++; });
      this.root.querySelector('[data-status]').innerHTML = ['all', 'completed', 'missed', 'deferred'].map(s =>
        `<button class="chip ${this.state.status === s ? 'on' : ''}" data-st="${s}">${s === 'all' ? 'All' : STATUS[s][1]} <span class="muted mono">${counts[s]}</span></button>`).join('');
      this.renderList();
    },
    renderList() {
      const data = Store.get();
      const { query, status } = this.state;
      const items = data.history.filter(h =>
        (status === 'all' || h.status === status) &&
        (!query || (h.title || '').toLowerCase().includes(query) || (h.category || '').toLowerCase().includes(query))
      ).sort((a, b) => new Date(b.completion_time) - new Date(a.completion_time));
      const out = this.root.querySelector('[data-list]');
      if (!items.length) {
        out.innerHTML = `<div class="empty"><div class="em-ic">${icon('history')}</div><h3>${data.history.length ? 'No matches' : 'Nothing here yet'}</h3>
          <p>${data.history.length ? 'Try another search or filter.' : 'Finished, missed and deferred tasks show up here.'}</p></div>`;
        return;
      }
      const groups = new Map();
      items.forEach(h => { const k = Engine.dateKey(h.completion_time); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(h); });
      const today = Engine.dateKey(new Date());
      const label = k => { const diff = Engine.daysBetweenKeys(k, today); return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : Engine.keyToDate(k).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: Engine.keyToDate(k).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }); };
      out.innerHTML = [...groups.entries()].map(([k, list]) => {
        const net = list.reduce((s, h) => s + (h.pp_earned || 0), 0);
        return `<div class="day-head">${label(k)}<span class="aside ${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}">${UI.fmtSigned(net)} PP</span></div>
          <div class="rows">${list.map(h => {
            const pp = h.pp_earned || 0;
            const [ic] = STATUS[h.status] || STATUS.completed;
            const cat = Engine.findCategory(data, h.category);
            return `<div class="row"><span class="r-ic st-ic ${esc(h.status)}">${icon(ic)}</span>
              <span class="r-main"><span class="r-title">${esc(h.title)}</span>
              <span class="r-sub"><span class="dot" style="background:${cat ? esc(cat.color) : 'var(--text-3)'}"></span> ${esc(h.category || 'Uncategorized')} · ${UI.fmtTime(h.completion_time)}${h.catch_up ? ' · skipped repeat' : ''}</span></span>
              <span class="r-end ${pp > 0 ? 'pos' : pp < 0 ? 'neg' : 'zero'}">${UI.fmtSigned(pp)}</span></div>`;
          }).join('')}</div>`;
      }).join('');
    }
  };

  // CATEGORIES (pushed)
  const categories = {
    init(root) {
      root.innerHTML = `${topbar('Categories', `<button class="p-icon-btn" data-add aria-label="New category">${icon('plus')}</button>`)}<div data-list></div>`;
      root.addEventListener('click', e => {
        if (e.target.closest('[data-add]')) { openCategory(null); return; }
        const sw = e.target.closest('[data-toggle]');
        if (sw) {
          P.haptic.tap();
          Store.mutate(d => { const c = d.categories.find(x => x.id === sw.dataset.toggle); if (c) c.active = c.active === false; return c; });
          return;
        }
        const row = e.target.closest('[data-cat]');
        if (row) openCategory(row.dataset.cat);
      });
      this.root = root;
    },
    render() {
      const data = Store.get();
      this.root.querySelector('[data-list]').innerHTML = `
        <p class="f-hint" style="margin:0 2px 12px">Tasks in a category earn PP multiplied by its weight. Switched-off categories are hidden when adding tasks.</p>
        <div class="rows">${data.categories.map(c => {
          const active = data.active_tasks.filter(t => t.category === c.name).length;
          return `<div class="row" data-cat="${esc(c.id)}">
            <span class="r-ic" style="background:${esc(c.color)}22;color:${esc(c.color)}">${icon(c.icon || 'tag')}</span>
            <span class="r-main"><span class="r-title">${esc(c.name)}</span><span class="r-sub">${c.weight}× PP · ${active} active</span></span>
            <button class="switch ${c.active !== false ? 'on' : ''}" data-toggle="${esc(c.id)}" role="switch" aria-checked="${c.active !== false}" aria-label="Show ${esc(c.name)} when adding tasks"></button>
          </div>`;
        }).join('')}</div>
        <button class="btn-secondary" data-add style="margin-top:14px">${icon('plus')}New category</button>`;
    }
  };

  function openCategory(id) {
    const data = Store.get();
    const existing = id ? data.categories.find(c => c.id === id) : null;
    const draft = existing
      ? { name: existing.name, icon: existing.icon || 'tag', color: existing.color, weight: parseFloat(existing.weight) || 1 }
      : { name: '', icon: 'tag', color: M.COLORS[data.categories.length % M.COLORS.length], weight: 1 };

    const body = el(`<div>
      <input class="f-input f-title" data-name maxlength="40" placeholder="Category name" value="${esc(draft.name)}">
      <p class="f-error" data-err hidden></p>
      <label class="f-label">Icon</label>
      <div class="icon-grid">${M.ICONS.map(n => `<button type="button" data-icon="${n}">${icon(n)}</button>`).join('')}</div>
      <label class="f-label">Colour</label>
      <div class="swatches">${M.COLORS.map(c => `<button type="button" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>
      <label class="f-label">PP weight · <span class="mono" data-wv></span></label>
      <input type="range" min="0.5" max="3" step="0.1" value="${draft.weight}" data-weight>
      ${existing ? `<button class="btn-text danger" data-delete style="margin-top:16px">${icon('trash')}Delete category</button>` : ''}
    </div>`);
    const foot = el(`<button class="btn-primary">${icon('check')}${existing ? 'Save' : 'Create category'}</button>`);
    const refresh = () => {
      body.querySelectorAll('[data-icon]').forEach(b => b.classList.toggle('on', b.dataset.icon === draft.icon));
      body.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('on', b.dataset.color.toLowerCase() === draft.color.toLowerCase()));
      body.querySelector('[data-wv]').textContent = `${draft.weight.toFixed(1)}×`;
    };
    body.addEventListener('click', async e => {
      const ic = e.target.closest('[data-icon]');
      const col = e.target.closest('[data-color]');
      if (ic) { draft.icon = ic.dataset.icon; P.haptic.tap(); refresh(); }
      else if (col) { draft.color = col.dataset.color; P.haptic.tap(); refresh(); }
      else if (e.target.closest('[data-delete]')) {
        if (Store.get().categories.length <= 1) { P.snack({ title: 'Keep at least one category', icon: 'alert-triangle', tone: 'danger' }); return; }
        const n = Store.get().active_tasks.filter(t => t.category === existing.name).length;
        const ok = await P.confirmSheet({
          title: `Delete ${existing.name}?`,
          text: n ? `${n} active task${n === 1 ? ' uses' : 's use'} it and will earn PP at 1× weight. History is kept.` : 'Your history for it is kept.',
          confirmLabel: 'Delete', danger: true
        });
        if (!ok) return;
        Store.mutate(d => { d.categories = d.categories.filter(c => c.id !== existing.id); return true; }, { undoable: true });
        P.snack({ title: 'Category deleted', body: existing.name, icon: 'trash', tone: 'danger', undo: true });
        s.close();
      }
    });
    body.querySelector('[data-weight]').addEventListener('input', e => { draft.weight = parseFloat(e.target.value); refresh(); });
    body.querySelector('[data-name]').addEventListener('input', e => { draft.name = e.target.value; body.querySelector('[data-err]').hidden = true; });
    refresh();
    const s = P.sheet({ title: existing ? 'Edit category' : 'New category', body, foot, full: true });

    foot.addEventListener('click', () => {
      const name = draft.name.trim();
      const clash = Store.get().categories.find(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== id);
      if (!name || clash) {
        const err = body.querySelector('[data-err]');
        err.textContent = name ? 'That name’s already taken.' : 'Enter a name.';
        err.hidden = false;
        P.haptic.warn();
        return;
      }
      const weight = Math.round(draft.weight * 10) / 10;
      if (existing) {
        Store.mutate(d => {
          const c = d.categories.find(x => x.id === id);
          if (!c) return null;
          const old = c.name;
          Object.assign(c, { name, icon: draft.icon, color: draft.color, weight });
          if (old !== name) {
            d.active_tasks.forEach(t => { if (t.category === old) t.category = name; });
            d.history.forEach(h => { if (h.category === old) h.category = name; });
          }
          return c;
        }, { undoable: true });
      } else {
        Store.mutate(d => { d.categories.push({ id: `cat-${Date.now()}`, name, subtext: '', icon: draft.icon, color: draft.color, weight, active: true }); return true; }, { undoable: true });
      }
      P.haptic.success();
      P.snack({ title: existing ? 'Category saved' : 'Category created', body: `${name} · ${weight}× PP`, icon: 'tags', undo: true });
      s.close();
    });
  }

  // SETTINGS (pushed)
  const LEADS = [[0, 'Off'], [15, '15m'], [30, '30m'], [60, '1h'], [120, '2h']];

  const settings = {
    init(root) {
      this.root = root;
      root.addEventListener('click', e => {
        const t = e.target;
        if (t.closest('[data-syncnow]')) { P.haptic.tap(); M.Sync.syncNow().then(() => this.render()); this.render(); }
        else if (t.closest('[data-lead]')) { P.haptic.tap(); M.Alerts.setPrefs({ leadMinutes: Number(t.closest('[data-lead]').dataset.lead) }).then(() => this.render()); }
        else if (t.closest('[data-due]')) { P.haptic.tap(); M.Alerts.setPrefs({ atDeadline: !M.Alerts.getPrefs().atDeadline }).then(() => this.render()); }
        else if (t.closest('[data-toggle-time]')) {
          const key = t.closest('[data-toggle-time]').dataset.toggleTime;
          const prefs = M.Alerts.getPrefs();
          P.haptic.tap();
          M.Alerts.setPrefs({ [key]: prefs[key] ? '' : (key === 'morning' ? '08:00' : '20:00') }).then(() => this.render());
        }
        else if (t.closest('[data-test]')) M.Alerts.sendTest();
        else if (t.closest('[data-perm]')) M.Alerts.requestPermissions().then(() => this.render());
        else if (t.closest('[data-theme]')) { P.haptic.tap(); window.MotionTheme.set(t.closest('[data-theme]').dataset.theme); M.Phone.applyTheme(); this.render(); }
      });
      root.addEventListener('change', e => {
        const key = e.target.dataset.time;
        if (key && e.target.value) M.Alerts.setPrefs({ [key]: e.target.value }).then(() => this.render());
      });
      M.Sync.onStatus(() => { if (root.isConnected) this.render(); });
    },
    render() {
      const s = M.Sync.status();
      const d = M.Sync.describe(s);
      const data = Store.get();
      const prefs = M.Alerts.getPrefs();
      const perm = M.Alerts.permissionState();
      const theme = window.MotionTheme.get();
      const timeRow = (key, label, sub) => `<div class="row">
          <span class="r-main"><span class="r-title">${label}</span><span class="r-sub">${sub}</span></span>
          ${prefs[key] ? `<input class="f-input" type="time" data-time="${key}" value="${esc(prefs[key])}" style="width:118px;min-height:44px;padding:8px 10px">` : ''}
          <button class="switch ${prefs[key] ? 'on' : ''}" data-toggle-time="${key}" role="switch" aria-checked="${!!prefs[key]}" aria-label="${label}"></button>
        </div>`;
      this.root.innerHTML = `${topbar('Settings')}
        <div class="p-section" style="margin-top:8px"><h3>Sync</h3></div>
        <div class="rows">
          <div class="row"><span class="r-ic">${icon('cloud')}</span><span class="r-main"><span class="r-title"><span class="sync-dot ${d.tone}"></span> ${esc(d.label)}</span>
            <span class="r-sub">${s.state === 'off' ? 'Add your Firebase details to js/sync-config.js and rebuild.' : s.error ? esc(s.error) : `${data.sync.dirty.length} change${data.sync.dirty.length === 1 ? '' : 's'} waiting to upload`}</span></span></div>
          ${s.state !== 'off' ? `<button class="row" data-syncnow><span class="r-ic">${icon('refresh')}</span><span class="r-main"><span class="r-title">Sync now</span><span class="r-sub">Also: pull down on Home or Tasks</span></span></button>` : ''}
        </div>

        <div class="p-section"><h3>Alerts</h3>${Platform.isNative ? '' : '<span class="aside">phone app only</span>'}</div>
        ${perm.ok ? '' : `<div class="rows" style="margin-bottom:10px"><button class="row" data-perm><span class="r-ic" style="color:var(--gold)">${icon('alert-triangle')}</span>
          <span class="r-main"><span class="r-title">Allow alerts</span><span class="r-sub">${esc(perm.message)}</span></span>${icon('chevron-right', 'chev')}</button></div>`}
        <div class="rows">
          <div class="row" style="flex-wrap:wrap"><span class="r-main"><span class="r-title">Before a deadline</span><span class="r-sub">While the early bonus still counts</span></span>
            <div class="segs" style="width:100%;margin-top:4px">${LEADS.map(([v, l]) => `<button type="button" class="${prefs.leadMinutes === v ? 'on' : ''}" data-lead="${v}">${l}</button>`).join('')}</div></div>
          <div class="row"><span class="r-main"><span class="r-title">At the deadline</span><span class="r-sub">When a task becomes due</span></span>
            <button class="switch ${prefs.atDeadline ? 'on' : ''}" data-due role="switch" aria-checked="${prefs.atDeadline}" aria-label="At the deadline"></button></div>
          ${timeRow('morning', 'Morning summary', 'What’s due and the PP on offer')}
          ${timeRow('streak', 'Streak reminder', 'Only if nothing’s done that day')}
          <button class="row" data-test><span class="r-ic">${icon('bell-ringing')}</span><span class="r-main"><span class="r-title">Send a test alert</span><span class="r-sub">Arrives in 3 seconds</span></span></button>
        </div>

        <div class="p-section"><h3>Appearance</h3></div>
        <div class="segs">${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<button type="button" class="${theme === v ? 'on' : ''}" data-theme="${v}">${l}</button>`).join('')}</div>

        <p class="f-hint" style="text-align:center;margin-top:28px">Motion · device ${esc(data.sync.device_id)}</p>`;
    }
  };

  M.PhoneMe = { me, screens: { history, categories, settings } };
})();
