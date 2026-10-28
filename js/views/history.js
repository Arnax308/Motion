/* ==========================================================================
   HISTORY VIEW — everything completed, missed or deferred, newest first.
   ========================================================================== */

(function () {
  const M = window.Motion;
  const { Engine, UI, Store } = M;
  const { esc, icon } = UI;

  const STATUS = {
    completed: { label: 'Completed', icon: 'check' },
    missed: { label: 'Missed', icon: 'x' },
    deferred: { label: 'Deferred', icon: 'player-pause' }
  };

  let root, listEl, filtersEl, searchInput;
  const filters = { status: 'all', category: '', query: '' };

  function init(pageEl) {
    root = pageEl;
    root.innerHTML = `
      <header class="page-head">
        <h1>History</h1><span class="sub" data-sub></span><span class="grow"></span>
        <label class="search">${icon('search')}<input data-search placeholder="Search history" aria-label="Search history"><span class="kbd">/</span></label>
      </header>
      <div class="hist-filters" data-filters></div>
      <div class="page-body" data-list></div>`;
    listEl = root.querySelector('[data-list]');
    filtersEl = root.querySelector('[data-filters]');
    searchInput = root.querySelector('[data-search]');
    searchInput.addEventListener('input', () => { filters.query = searchInput.value.trim().toLowerCase(); renderList(); });
  }

  function focusSearch() {
    searchInput.focus();
    searchInput.select();
  }

  function render() {
    const data = Store.get();
    root.querySelector('[data-sub]').textContent = `${data.history.length} entries`;
    renderFilters(data);
    renderList();
  }

  function renderFilters(data) {
    const counts = { all: data.history.length, completed: 0, missed: 0, deferred: 0 };
    data.history.forEach(h => { if (counts[h.status] !== undefined) counts[h.status]++; });
    const cats = [...new Set(data.history.map(h => h.category).filter(Boolean))].sort();
    if (filters.category && !cats.includes(filters.category)) filters.category = '';

    filtersEl.innerHTML = `
      <div class="seg" role="group" aria-label="Status">
        ${['all', 'completed', 'missed', 'deferred'].map(s => `<button data-status="${s}" class="${filters.status === s ? 'on' : ''}">${s === 'all' ? 'All' : STATUS[s].label}<span class="mono muted">${counts[s]}</span></button>`).join('')}
      </div>
      <select class="select" data-cat aria-label="Category">
        <option value="">All categories</option>
        ${cats.map(c => `<option value="${esc(c)}" ${c === filters.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>`;
    filtersEl.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', () => {
      filters.status = b.dataset.status;
      renderFilters(Store.get());
      renderList();
    }));
    filtersEl.querySelector('[data-cat]').addEventListener('change', e => { filters.category = e.target.value; renderList(); });
  }

  function dayLabel(key) {
    const today = Engine.dateKey(new Date());
    const diff = Engine.daysBetweenKeys(key, today);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    const d = Engine.keyToDate(key);
    const opts = { weekday: 'short', day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('en-GB', opts);
  }

  function renderList() {
    const data = Store.get();
    if (!data.history.length) {
      listEl.innerHTML = `<div class="empty">${icon('history')}<h3>Your track record starts here</h3><p>Tasks you complete, miss or defer show up in this log.</p></div>`;
      return;
    }

    const items = data.history.filter(h =>
      (filters.status === 'all' || h.status === filters.status) &&
      (!filters.category || h.category === filters.category) &&
      (!filters.query || (h.title || '').toLowerCase().includes(filters.query) || (h.category || '').toLowerCase().includes(filters.query))
    ).sort((a, b) => new Date(b.completion_time) - new Date(a.completion_time));

    if (!items.length) {
      listEl.innerHTML = `<div class="empty">${icon('filter-off')}<h3>No matching entries</h3><p>Try a different search or filter.</p><button class="btn" data-clear>Clear filters</button></div>`;
      listEl.querySelector('[data-clear]').addEventListener('click', () => {
        Object.assign(filters, { status: 'all', category: '', query: '' });
        searchInput.value = '';
        render();
      });
      return;
    }

    const groups = new Map();
    items.forEach(h => {
      const k = Engine.dateKey(h.completion_time);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(h);
    });

    listEl.innerHTML = [...groups.entries()].map(([key, list]) => {
      const net = list.reduce((s, h) => s + (h.pp_earned || 0), 0);
      return `<div class="hist-group">
        <div class="g-head">${dayLabel(key)}<span class="n">${list.length}</span>
          <span class="sum ${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}">${UI.fmtSigned(net)} PP</span></div>
        ${list.map(h => rowHtml(h, data)).join('')}
      </div>`;
    }).join('');
  }

  function rowHtml(h, data) {
    const status = STATUS[h.status] || STATUS.completed;
    const cat = Engine.findCategory(data, h.category);
    const sev = Engine.severityOf(h.severity);
    const meta = [
      `<span><span class="dot" style="background:${cat ? esc(cat.color) : 'var(--text-3)'}"></span>${esc(h.category || 'Uncategorized')}</span>`,
      `<span>${sev.label}</span>`
    ];
    if (h.deadline) {
      const done = new Date(h.completion_time);
      const due = new Date(h.deadline);
      let timing = '';
      if (h.status === 'completed') timing = done > due ? ' · done late' : done < new Date(due.getTime() - 3600 * 1000) ? ' · done early' : ' · on time';
      meta.push(`<span>Due ${UI.fmtShortDate(due)}, ${UI.fmtTime(due)}${timing}</span>`);
    }
    if (h.catch_up) meta.push('<span title="A repeat that passed while the task was overdue">Skipped repeat</span>');
    const pp = h.pp_earned || 0;
    return `<div class="hist-row">
      <div class="status-icon ${esc(h.status)}" title="${status.label}">${icon(status.icon)}</div>
      <div class="r-body"><div class="r-title">${esc(h.title)}</div><div class="r-meta">${meta.join('')}</div></div>
      <span class="pp-badge ${pp > 0 ? 'pos' : pp < 0 ? 'neg' : 'zero'}">${UI.fmtSigned(pp)} PP</span>
      <span class="hist-time">${UI.fmtTime(h.completion_time)}</span>
    </div>`;
  }

  M.Views = M.Views || {};
  M.Views.history = { init, render, focusSearch };
})();
