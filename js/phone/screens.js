/* ==========================================================================
   MOTION PHONE SCREENS — Home, Tasks and Stats.
   ========================================================================== */

(function () {
  const M = window.Motion;
  const { Engine, UI, Store, P, PhoneTasks } = M;
  const { esc, icon } = UI;

  function greeting(now) {
    const h = now.getHours();
    if (h < 5) return 'Up late';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function syncButton() {
    const d = M.Sync.describe(M.Sync.status());
    return `<button class="p-icon-btn" data-sync aria-label="${esc(d.label)}" title="${esc(d.label)}"><span class="sync-dot ${d.tone}"></span></button>`;
  }

  function emptyState(iconName, title, text, withButton) {
    return `<div class="empty"><div class="em-ic">${icon(iconName)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>
      ${withButton ? `<button class="btn-primary" data-new>${icon('plus')}Add a task</button>` : ''}</div>`;
  }

  // HOME
  const home = {
    init(root) {
      root.innerHTML = '<div data-content></div>';
      P.bindPullToRefresh(root, () => M.Sync.syncNow());
      PhoneTasks.bindList(root);
      root.addEventListener('click', e => {
        if (e.target.closest('[data-new]')) PhoneTasks.openEditor();
        else if (e.target.closest('[data-sync]')) M.Phone.push('settings');
        else if (e.target.closest('[data-goto-tasks]')) M.Phone.tab('tasks');
        else if (e.target.closest('[data-goto-me]')) M.Phone.tab('me');
      });
      this.content = root.querySelector('[data-content]');
    },

    render() {
      const data = Store.get();
      const now = new Date();
      const lp = Engine.levelProgress(data.total_pp);
      const streak = Engine.effectiveStreak(data, now);
      const best = Math.max(data.best_streak || 0, streak);

      const todayKey = Engine.dateKey(now);
      const todayHist = data.history.filter(h => Engine.dateKey(h.completion_time) === todayKey);
      const done = todayHist.filter(h => h.status === 'completed').length;
      const missed = todayHist.filter(h => h.status === 'missed').length;
      const groups = { overdue: [], today: [], tomorrow: [] };
      let later = 0;
      data.active_tasks.slice().sort((a, b) => new Date(a.deadline) - new Date(b.deadline)).forEach(t => {
        const b = Engine.bucketFor(t.deadline, now);
        if (groups[b]) groups[b].push(t);
        else later++;
      });
      const dueNow = groups.overdue.length + groups.today.length;
      const total = done + missed + dueNow;
      const net = todayHist.reduce((s, h) => s + (h.pp_earned || 0), 0);
      const onTable = groups.overdue.concat(groups.today).reduce((s, t) => s + Engine.ppBreakdown(data, t, now).total, 0);

      const section = (key, title, list) => {
        if (!list.length) return '';
        let aside = '';
        if (key === 'overdue') aside = `auto-missed in ${UI.fmtDuration(Math.min(...list.map(t => Engine.autoMissAt(t).getTime())) - now)}`;
        else aside = `up to +${UI.fmtNum(list.reduce((s, t) => s + Engine.ppBreakdown(data, t, now).total, 0))}`;
        return `<div class="p-section ${key}"><h3>${title}</h3><span class="n">${list.length}</span><span class="aside">${aside}</span></div>
          ${PhoneTasks.listHtml(list, data, now)}`;
      };

      const anyTasks = data.active_tasks.length > 0;
      const upNext = section('overdue', 'Overdue', groups.overdue) + section('today', 'Today', groups.today) + section('tomorrow', 'Tomorrow', groups.tomorrow);

      this.content.innerHTML = `
        <div class="p-head">
          <div><div class="p-eyebrow">${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
            <div class="p-title">${greeting(now)}</div></div>
          ${syncButton()}
        </div>

        <div class="hero press" data-goto-me>
          <div class="hero-top">
            <div class="ring" style="--p:${Math.round(lp.ratio * 100)}"><div><b>${lp.level}</b><small>LEVEL</small></div></div>
            <div style="min-width:0"><div class="hero-name">${esc(lp.title)}</div>
              <div class="hero-sub">${UI.fmtNum(lp.toNext)} PP to level ${lp.level + 1}</div></div>
          </div>
          <div class="xpbar"><div style="width:${Math.round(lp.ratio * 100)}%"></div></div>
          <div class="hero-chips">
            <div class="hero-chip">${icon('coin', 'gold')}<div><b class="gold">${UI.fmtNum(lp.pp)}</b><small>total PP</small></div></div>
            <div class="hero-chip">${icon('flame', 'flame')}<div><b>${streak}</b><small>streak</small></div></div>
            <div class="hero-chip">${icon('trophy', 'gold')}<div><b>${best}</b><small>best</small></div></div>
          </div>
        </div>

        <div class="p-card today-strip">
          <div class="ring" style="--p:${total ? Math.round(done / total * 100) : 0}"><div><b>${done}/${total}</b></div></div>
          <div class="today-kv">
            <span>Earned today<b class="${net < 0 ? 'neg' : 'gold'}">${UI.fmtSigned(net)}</b></span>
            <span>On the table<b>+${UI.fmtNum(onTable)}</b></span>
          </div>
        </div>

        ${upNext || (anyTasks
          ? emptyState('mood-smile', 'Nothing due today or tomorrow', `You have ${later} task${later === 1 ? '' : 's'} coming up later.`, false)
          : emptyState('sparkles', 'Plan your next win', 'Add a task and finish it early for double PP.', true))}
        ${later && upNext ? `<div style="text-align:center;margin-top:18px"><button class="p-link" data-goto-tasks>${later} more coming up · See all</button></div>` : ''}
        ${!upNext && anyTasks ? `<div style="text-align:center"><button class="p-link" data-goto-tasks>See all tasks</button></div>` : ''}`;
    }
  };

  // TASKS
  const FILTERS = [['upcoming', 'Upcoming'], ['overdue', 'Overdue'], ['repeating', 'Repeating'], ['all', 'All']];

  const tasks = {
    state: { query: '', filter: 'upcoming', category: null },

    init(root) {
      root.innerHTML = `
        <div class="p-head"><div><div class="p-eyebrow" data-count></div><div class="p-title">Tasks</div></div>${syncButton()}</div>
        <label class="search">${icon('search')}<input type="search" placeholder="Search tasks" data-q enterkeyhint="search"></label>
        <div class="chips" data-filters></div>
        <div class="chips" data-cats style="margin-top:8px"></div>
        <div data-list></div>`;
      P.bindPullToRefresh(root, () => M.Sync.syncNow());
      PhoneTasks.bindList(root.querySelector('[data-list]'));
      root.querySelector('[data-q]').addEventListener('input', e => { this.state.query = e.target.value.trim().toLowerCase(); this.renderList(); });
      root.addEventListener('click', e => {
        const f = e.target.closest('[data-filter]');
        const c = e.target.closest('[data-catf]');
        if (f) { this.state.filter = f.dataset.filter; P.haptic.tap(); this.render(); }
        else if (c) { this.state.category = c.dataset.catf || null; P.haptic.tap(); this.render(); }
        else if (e.target.closest('[data-new]')) PhoneTasks.openEditor();
        else if (e.target.closest('[data-sync]')) M.Phone.push('settings');
      });
      this.root = root;
    },

    render() {
      const data = Store.get();
      const root = this.root;
      root.querySelector('[data-count]').textContent = `${data.active_tasks.length} active`;
      root.querySelector('[data-filters]').innerHTML = FILTERS.map(([v, l]) =>
        `<button class="chip ${this.state.filter === v ? 'on' : ''}" data-filter="${v}">${l}</button>`).join('');
      const used = new Set(data.active_tasks.map(t => t.category));
      const cats = data.categories.filter(c => used.has(c.name));
      root.querySelector('[data-cats]').innerHTML = cats.length > 1
        ? `<button class="chip ${!this.state.category ? 'on' : ''}" data-catf="">All categories</button>` + cats.map(c =>
          `<button class="chip ${this.state.category === c.name ? 'on' : ''}" data-catf="${esc(c.name)}"><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</button>`).join('')
        : '';
      const sync = root.querySelector('[data-sync]');
      if (sync) sync.outerHTML = syncButton();
      this.renderList();
    },

    renderList() {
      const data = Store.get();
      const now = new Date();
      const { query, filter, category } = this.state;
      const list = data.active_tasks.filter(t => {
        const overdue = new Date(t.deadline) < now;
        if (filter === 'upcoming' && overdue) return false;
        if (filter === 'overdue' && !overdue) return false;
        if (filter === 'repeating' && (!t.recurring || t.recurring === 'none')) return false;
        if (category && t.category !== category) return false;
        if (query && !(t.title.toLowerCase().includes(query) || (t.description || '').toLowerCase().includes(query))) return false;
        return true;
      }).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

      const out = this.root.querySelector('[data-list]');
      if (!list.length) {
        out.innerHTML = data.active_tasks.length
          ? emptyState('filter-off', 'No tasks match', 'Try another filter or search.', false)
          : emptyState('list-check', 'No tasks yet', 'Tap + to add your first one.', true);
        return;
      }
      const groups = new Map();
      list.forEach(t => {
        const key = new Date(t.deadline) < now ? 'overdue' : Engine.dateKey(t.deadline);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(t);
      });
      const todayKey = Engine.dateKey(now);
      const tomorrowKey = Engine.dateKey(Engine.addDays(now, 1));
      const label = key => key === 'overdue' ? 'Overdue' : key === todayKey ? 'Today' : key === tomorrowKey ? 'Tomorrow'
        : Engine.keyToDate(key).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
      out.innerHTML = [...groups.entries()].map(([key, items]) => `
        <div class="day-head" ${key === 'overdue' ? 'style="color:var(--red)"' : ''}>${label(key)}<span class="muted mono" style="font-size:12px">${items.length}</span></div>
        ${PhoneTasks.listHtml(items, data, now)}`).join('');
    }
  };

  // STATS
  const stats = {
    month: { y: new Date().getFullYear(), m: new Date().getMonth() },

    init(root) {
      root.innerHTML = '<div data-content></div>';
      this.content = root.querySelector('[data-content]');
      root.addEventListener('click', e => {
        const nav = e.target.closest('[data-month]');
        if (!nav || nav.disabled) return;
        const d = new Date(this.month.y, this.month.m + Number(nav.dataset.month), 1);
        this.month = { y: d.getFullYear(), m: d.getMonth() };
        P.haptic.tap();
        this.render();
      });
    },

    render() {
      const data = Store.get();
      const today = new Date();
      const { y, m } = this.month;
      const isCurrent = y === today.getFullYear() && m === today.getMonth();
      const prev = new Date(y, m - 1, 1);
      const prevName = prev.toLocaleDateString('en-US', { month: 'short' });
      const cur = Engine.monthStats(data.history, y, m);
      const last = Engine.monthStats(data.history, prev.getFullYear(), prev.getMonth());

      const delta = (a, b, opts) => {
        if (a === null || b === null || !last.count) return `<em>No data for ${prevName}</em>`;
        const diff = a - b;
        if (!diff) return `<em>Same as ${prevName}</em>`;
        const good = opts && opts.lowerIsBetter ? diff < 0 : diff > 0;
        return `<em class="${good ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${opts && opts.fmt ? opts.fmt(Math.abs(diff)) : Math.abs(diff)} vs ${prevName}</em>`;
      };
      const rate = s => s.rate === null ? null : Math.round(s.rate * 100);

      // 13 weeks of activity ending this week (or the selected month's last week)
      const monthEnd = new Date(y, m + 1, 0);
      const end = monthEnd < today ? monthEnd : today;
      const daily = Engine.dailyAggregate(data.history);
      const WEEKS = 13;
      const start = Engine.addDays(Engine.startOfWeek(end), -(WEEKS - 1) * 7);
      const todayKey = Engine.dateKey(today);
      let cells = '';
      for (let i = 0; i < WEEKS * 7; i++) {
        const d = Engine.addDays(start, i);
        const key = Engine.dateKey(d);
        if (d > today) { cells += '<i class="future"></i>'; continue; }
        const a = daily[key];
        let cls = '';
        if (a && a.earned > 0) cls = a.earned < 100 ? 'l1' : a.earned < 250 ? 'l2' : a.earned < 500 ? 'l3' : 'l4';
        else if (a && a.missed) cls = 'miss';
        cells += `<i class="${cls}${key === todayKey ? ' today' : ''}"></i>`;
      }

      const weeks = [];
      for (let w = 7; w >= 0; w--) {
        const ws = Engine.addDays(Engine.startOfWeek(end), -w * 7);
        let earned = 0;
        for (let i = 0; i < 7; i++) { const a = daily[Engine.dateKey(Engine.addDays(ws, i))]; if (a) earned += a.earned; }
        weeks.push({ ws, earned, cur: Engine.dateKey(ws) === Engine.dateKey(Engine.startOfWeek(today)) });
      }
      const maxWeek = Math.max(1, ...weeks.map(w => w.earned));

      const from = new Date(y, m, 1);
      const to = new Date(y, m + 1, 1);
      const monthItems = data.history.filter(h => { const t = new Date(h.completion_time); return t >= from && t < to; });
      const catRows = data.categories.map(c => {
        const items = monthItems.filter(h => h.category === c.name);
        const doneN = items.filter(h => h.status === 'completed').length;
        const missN = items.filter(h => h.status === 'missed').length;
        return { c, done: doneN, missed: missN, earned: items.filter(h => h.status === 'completed').reduce((s, h) => s + h.pp_earned, 0) };
      }).filter(r => r.done || r.missed).sort((a, b) => b.earned - a.earned);
      const maxCat = Math.max(1, ...catRows.map(r => r.earned));

      this.content.innerHTML = `
        <div class="p-head">
          <div><div class="p-eyebrow">Your progress</div><div class="p-title">Stats</div></div>
          <div class="month-sw">
            <button data-month="-1" aria-label="Previous month">${icon('chevron-left')}</button>
            <span>${new Date(y, m, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
            <button data-month="1" aria-label="Next month" ${isCurrent ? 'disabled' : ''}>${icon('chevron-right')}</button>
          </div>
        </div>
        <div class="kpis">
          <div class="kpi"><span>PP earned</span><b class="gold">${UI.fmtNum(cur.earned)}</b>${delta(cur.earned, last.earned, { fmt: UI.fmtNum })}</div>
          <div class="kpi"><span>Completion</span><b>${rate(cur) === null ? '—' : rate(cur) + '%'}</b>${delta(rate(cur), rate(last), { fmt: n => n + ' pts' })}</div>
          <div class="kpi"><span>Missed</span><b>${cur.missed}</b>${delta(cur.missed, last.missed, { lowerIsBetter: true })}</div>
          <div class="kpi"><span>Best day</span><b>${cur.bestDay ? UI.fmtShortDate(Engine.keyToDate(cur.bestDay.key)) : '—'}</b><em>${cur.bestDay ? '+' + UI.fmtNum(cur.bestDay.earned) + ' PP' : 'Nothing yet'}</em></div>
        </div>
        <div class="p-section"><h3>Activity</h3><span class="aside">last 13 weeks</span></div>
        <div class="p-card"><div class="heat" style="grid-template-columns:repeat(${WEEKS},1fr)">${cells}</div>
          <div class="heat-foot"><span>${UI.fmtShortDate(start)}</span><span>Mon → Sun, darker = more PP</span></div></div>
        <div class="p-section"><h3>PP per week</h3></div>
        <div class="p-card"><div class="bars">${weeks.map(w => `<div class="bar ${w.cur ? 'cur' : ''}"><span>${w.earned ? UI.fmtNum(w.earned) : ''}</span>
          <div style="height:${Math.max(2, Math.round(w.earned / maxWeek * 100))}%"></div><span>${w.ws.getDate()}/${w.ws.getMonth() + 1}</span></div>`).join('')}</div></div>
        <div class="p-section"><h3>Categories</h3><span class="aside">this month</span></div>
        <div class="p-card">${catRows.length ? catRows.map(r => `<div class="catbar">
            <div class="cb-main"><div class="cb-top"><span>${esc(r.c.name)}</span><span>+${UI.fmtNum(r.earned)}</span></div>
              <div class="track"><div style="width:${Math.round(r.earned / maxCat * 100)}%;background:${esc(r.c.color)}"></div></div>
              <div class="cb-sub">${r.done} done · ${r.missed} missed${r.done + r.missed ? ` · ${Math.round(r.done / (r.done + r.missed) * 100)}% success` : ''}</div></div>
          </div>`).join('') : '<p class="muted" style="text-align:center;padding:12px">Nothing finished this month yet.</p>'}</div>`;
    }
  };

  M.PhoneScreens = { home, tasks, stats };
})();
