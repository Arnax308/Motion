/* ==========================================================================
   STATS VIEW — monthly KPIs, activity grid, weekly PP and category breakdown.
   ========================================================================== */

(function () {
  const M = window.Motion;
  const { Engine, UI, Store } = M;
  const { esc, icon } = UI;

  const HEAT_WEEKS = 26;
  const BAR_WEEKS = 12;

  let root;
  const now0 = new Date();
  const state = { year: now0.getFullYear(), month: now0.getMonth(), scope: 'month' };

  function init(pageEl) {
    root = pageEl;
    root.addEventListener('click', e => {
      const btn = e.target.closest('[data-nav], [data-scope]');
      if (!btn || btn.disabled) return;
      if (btn.dataset.nav) {
        const d = new Date(state.year, state.month + (btn.dataset.nav === 'next' ? 1 : -1), 1);
        state.year = d.getFullYear();
        state.month = d.getMonth();
      } else {
        state.scope = btn.dataset.scope;
      }
      render();
    });
  }

  function delta(cur, prev, opts) {
    if (cur === null || prev === null || prev === undefined) return `<em>No data for ${opts.prevName}</em>`;
    const diff = cur - prev;
    if (diff === 0) return `<em>Same as ${opts.prevName}</em>`;
    const good = opts.lowerIsBetter ? diff < 0 : diff > 0;
    const amount = opts.format(diff);
    return `<em class="${good ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${amount} vs ${opts.prevName}</em>`;
  }

  function render() {
    const data = Store.get();
    const today = new Date();
    const isCurrent = state.year === today.getFullYear() && state.month === today.getMonth();
    const prevDate = new Date(state.year, state.month - 1, 1);
    const prevName = prevDate.toLocaleDateString('en-US', { month: 'short' });
    const cur = Engine.monthStats(data.history, state.year, state.month);
    const prev = Engine.monthStats(data.history, prevDate.getFullYear(), prevDate.getMonth());

    const earnedDelta = prev.count === 0 ? `<em>No data for ${prevName}</em>`
      : prev.earned === 0 ? delta(cur.earned, 0, { prevName, format: d => UI.fmtNum(Math.abs(d)) })
        : delta(cur.earned, prev.earned, { prevName, format: d => `${Math.round(Math.abs(d) / prev.earned * 100)}%` });
    const rateDelta = delta(cur.rate === null ? null : Math.round(cur.rate * 100), prev.rate === null ? null : Math.round(prev.rate * 100),
      { prevName, format: d => `${Math.abs(d)} pts` });
    const missedDelta = prev.count === 0 ? `<em>No data for ${prevName}</em>`
      : delta(cur.missed, prev.missed, { prevName, lowerIsBetter: true, format: d => Math.abs(d) });

    // The activity grid and weekly bars end at the selected month (or today)
    const monthEnd = new Date(state.year, state.month + 1, 0);
    const end = monthEnd < today ? monthEnd : today;
    const daily = Engine.dailyAggregate(data.history);

    root.innerHTML = `
      <header class="page-head">
        <h1>Stats</h1><span class="grow"></span>
        <div class="month-nav">
          <button class="icon-btn" data-nav="prev" aria-label="Previous month">${icon('chevron-left')}</button>
          <span>${UI.fmtMonth(state.year, state.month)}</span>
          <button class="icon-btn" data-nav="next" aria-label="Next month" ${isCurrent ? 'disabled' : ''}>${icon('chevron-right')}</button>
        </div>
      </header>
      <div class="page-body">
        <div class="kpis">
          <div class="kpi"><span>PP earned</span><b style="color:var(--gold)">${UI.fmtNum(cur.earned)}</b>${earnedDelta}</div>
          <div class="kpi"><span>Completion rate</span><b>${cur.rate === null ? '—' : Math.round(cur.rate * 100) + '%'}</b>${rateDelta}</div>
          <div class="kpi"><span>Missed</span><b>${cur.missed}</b>${missedDelta}</div>
          <div class="kpi"><span>Best day</span><b>${cur.bestDay ? UI.fmtShortDate(Engine.keyToDate(cur.bestDay.key)) : '—'}</b>
            <em>${cur.bestDay ? `+${UI.fmtNum(cur.bestDay.earned)} PP` : 'Complete a task to set one'}</em></div>
        </div>
        <div class="stats-grid">
          <div class="card">
            <div class="card-h">Activity · last ${HEAT_WEEKS} weeks</div>
            ${heatmapHtml(daily, end, today)}
          </div>
          <div class="card">
            <div class="card-h">PP earned per week</div>
            ${barsHtml(daily, end)}
          </div>
        </div>
        <div class="card">
          <div class="card-h">Categories
            <div class="seg">
              <button data-scope="month" class="${state.scope === 'month' ? 'on' : ''}">${UI.fmtMonth(state.year, state.month)}</button>
              <button data-scope="all" class="${state.scope === 'all' ? 'on' : ''}">All time</button>
            </div>
          </div>
          ${categoryTableHtml(data)}
        </div>
      </div>`;
  }

  function heatLevel(agg) {
    if (!agg) return '';
    if (agg.earned <= 0) return agg.missed > 0 ? 'miss' : '';
    if (agg.earned < 100) return 'l1';
    if (agg.earned < 250) return 'l2';
    if (agg.earned < 500) return 'l3';
    return 'l4';
  }

  function heatmapHtml(daily, end, today) {
    const start = Engine.addDays(Engine.startOfWeek(end), -(HEAT_WEEKS - 1) * 7);
    const todayKey = Engine.dateKey(today);
    let cells = '';
    let months = '';
    let lastMonth = -1;
    for (let w = 0; w < HEAT_WEEKS; w++) {
      const weekStart = Engine.addDays(start, w * 7);
      // Label a column when a new month starts within it
      for (let i = 0; i < 7; i++) {
        const d = Engine.addDays(weekStart, i);
        if (d.getMonth() !== lastMonth && (d.getDate() <= 7 || w === 0)) {
          if (w < HEAT_WEEKS - 1) months += `<span style="grid-column:${w + 1} / span 3">${d.toLocaleDateString('en-US', { month: 'short' })}</span>`;
          lastMonth = d.getMonth();
          break;
        }
      }
      for (let i = 0; i < 7; i++) {
        const d = Engine.addDays(weekStart, i);
        const key = Engine.dateKey(d);
        if (d > today) { cells += '<i class="future"></i>'; continue; }
        const agg = daily[key];
        const tip = agg
          ? `${UI.fmtDay(d)}: ${UI.fmtSigned(agg.pp)} PP · ${agg.completed} done, ${agg.missed} missed${agg.deferred ? `, ${agg.deferred} deferred` : ''}`
          : `${UI.fmtDay(d)}: no activity`;
        cells += `<i class="${heatLevel(agg)}${key === todayKey ? ' sel' : ''}" title="${esc(tip)}"></i>`;
      }
    }
    return `<div class="heat-wrap">
        <div class="heat-months" style="grid-template-columns:repeat(${HEAT_WEEKS},1fr)">${months}</div>
        <div class="heat-days"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span></span></div>
        <div class="heat" style="grid-template-columns:repeat(${HEAT_WEEKS},1fr)">${cells}</div>
      </div>
      <div class="heat-legend">Less <i style="background:var(--heat-0)"></i><i style="background:var(--heat-1)"></i><i style="background:var(--heat-2)"></i><i style="background:var(--heat-3)"></i><i style="background:var(--heat-4)"></i> More
        <i style="background:var(--red-soft);margin-left:10px"></i> Only misses</div>`;
  }

  function barsHtml(daily, end) {
    const lastWeek = Engine.startOfWeek(end);
    const thisWeek = Engine.dateKey(Engine.startOfWeek(new Date()));
    const weeks = [];
    for (let w = BAR_WEEKS - 1; w >= 0; w--) {
      const start = Engine.addDays(lastWeek, -w * 7);
      let earned = 0;
      for (let i = 0; i < 7; i++) {
        const agg = daily[Engine.dateKey(Engine.addDays(start, i))];
        if (agg) earned += agg.earned;
      }
      weeks.push({ start, earned });
    }
    const max = Math.max(1, ...weeks.map(w => w.earned));
    if (weeks.every(w => w.earned === 0)) {
      return `<div class="empty" style="padding:40px 0">${icon('chart-bar')}<p>No PP earned in these weeks yet.</p></div>`;
    }
    return `<div class="bars">${weeks.map(w => `
      <div class="bar ${Engine.dateKey(w.start) === thisWeek ? 'current' : ''}" title="Week of ${UI.fmtShortDate(w.start)}: +${UI.fmtNum(w.earned)} PP">
        <span class="v">${w.earned ? UI.fmtNum(w.earned) : ''}</span>
        <div style="height:${Math.max(1, Math.round(w.earned / max * 100))}%"></div>
        <span class="l">${w.start.getDate()}/${w.start.getMonth() + 1}</span>
      </div>`).join('')}</div>`;
  }

  function categoryTableHtml(data) {
    const from = new Date(state.year, state.month, 1);
    const to = new Date(state.year, state.month + 1, 1);
    const items = state.scope === 'all' ? data.history : data.history.filter(h => {
      const t = new Date(h.completion_time);
      return t >= from && t < to;
    });

    const rows = data.categories.map(c => ({ name: c.name, color: c.color }));
    items.forEach(h => {
      if (h.category && !rows.some(r => r.name.toLowerCase() === h.category.toLowerCase())) rows.push({ name: h.category, color: null });
    });
    rows.forEach(r => {
      const list = items.filter(h => (h.category || '').toLowerCase() === r.name.toLowerCase());
      r.done = list.filter(h => h.status === 'completed').length;
      r.missed = list.filter(h => h.status === 'missed').length;
      r.deferred = list.filter(h => h.status === 'deferred').length;
      r.earned = list.filter(h => h.status === 'completed').reduce((s, h) => s + (h.pp_earned || 0), 0);
      r.rate = r.done + r.missed > 0 ? Math.round(r.done / (r.done + r.missed) * 100) : null;
    });
    rows.sort((a, b) => b.earned - a.earned || b.done - a.done);

    if (!items.length) return `<div class="empty" style="padding:28px 0"><p>Nothing finished ${state.scope === 'all' ? 'yet' : 'this month'}.</p></div>`;

    return `<table class="table">
      <thead><tr><th>Category</th><th class="num">Done</th><th class="num">Missed</th><th class="num">Deferred</th><th class="num">PP earned</th><th style="width:30%">Success rate</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td><span class="dot" style="background:${r.color ? esc(r.color) : 'var(--text-3)'};margin-right:8px"></span>${esc(r.name)}${r.color ? '' : ' <span class="muted">(deleted)</span>'}</td>
        <td class="num">${r.done}</td><td class="num">${r.missed}</td><td class="num">${r.deferred}</td>
        <td class="num" style="color:var(--gold)">${UI.fmtNum(r.earned)}</td>
        <td>${r.rate === null ? '<span class="muted">—</span>' : `<div class="rate"><div class="rate-bar"><div style="width:${r.rate}%;background:${r.color ? esc(r.color) : 'var(--text-3)'}"></div></div><span>${r.rate}%</span></div>`}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  M.Views = M.Views || {};
  M.Views.stats = { init, render };
})();
