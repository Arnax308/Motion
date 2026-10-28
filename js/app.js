/* ==========================================================================
   MOTION APP — routing, sidebar, right rail, shortcuts and timers.
   ========================================================================== */

(function () {
  const M = window.Motion;
  const { Engine, UI, Store } = M;
  const { esc, icon } = UI;

  const NAV = [
    { id: 'today', label: 'Today', icon: 'sun' },
    { id: 'all', label: 'All tasks', icon: 'list-check' },
    { id: 'history', label: 'History', icon: 'history' },
    { id: 'stats', label: 'Stats', icon: 'chart-dots-3' },
    { id: 'categories', label: 'Categories', icon: 'tags' }
  ];
  const TASK_PAGES = ['today', 'all'];

  function readPref(key, fallback) {
    try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
  }

  M.State = {
    page: 'today',
    category: null,
    layout: readPref('motion-layout', 'list'),
    railTaskId: null
  };

  const $ = sel => document.querySelector(sel);

  // ROUTING
  function navigate(page) {
    if (!NAV.some(n => n.id === page)) return;
    UI.closePopover();
    M.State.page = page;
    const section = TASK_PAGES.includes(page) ? 'tasks' : page;
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('on', p.id === `page-${section}`));
    $('.app').classList.toggle('no-rail', !TASK_PAGES.includes(page));
    $('.main').scrollTop = 0;
    renderAll();
  }

  function setCategory(name) {
    M.State.category = name || null;
    if (!TASK_PAGES.includes(M.State.page)) navigate('all');
    else renderAll();
  }

  function setLayout(layout) {
    M.State.layout = layout;
    try { localStorage.setItem('motion-layout', layout); } catch (e) { /* not persisted */ }
    renderCurrent();
  }

  function renderCurrent() {
    const page = M.State.page;
    if (TASK_PAGES.includes(page)) M.Views.tasks.render(page);
    else M.Views[page].render();
  }

  function renderAll() {
    renderSidebar();
    renderCurrent();
    if (TASK_PAGES.includes(M.State.page)) renderRail();
  }

  // SIDEBAR
  function renderSidebar() {
    const data = Store.get();
    const now = new Date();
    let dueToday = 0, overdue = 0;
    data.active_tasks.forEach(t => {
      const b = Engine.bucketFor(t.deadline, now);
      if (b === 'overdue') overdue++;
      if (b === 'today' || b === 'overdue') dueToday++;
    });
    const counts = { today: dueToday, all: data.active_tasks.length };

    $('[data-nav]').innerHTML = NAV.map((n, i) => `
      <button class="nav-item ${M.State.page === n.id && !(n.id === 'all' && M.State.category) ? 'on' : ''}" data-page="${n.id}" title="${n.label} (${i + 1})">
        ${icon(n.icon)}<span>${n.label}</span>
        ${counts[n.id] ? `<span class="count ${n.id === 'today' && overdue ? 'hot' : ''}">${counts[n.id]}</span>` : ''}
      </button>`).join('');

    const perCat = {};
    data.active_tasks.forEach(t => { perCat[t.category] = (perCat[t.category] || 0) + 1; });
    $('[data-cats]').innerHTML = data.categories.map(c => `
      <button class="nav-item ${M.State.category === c.name && TASK_PAGES.includes(M.State.page) ? 'on' : ''} ${c.active === false ? 'inactive' : ''}" data-cat="${esc(c.name)}">
        <span class="dot" style="background:${esc(c.color)}"></span><span class="nav-label">${esc(c.name)}</span>
        <span class="count">${perCat[c.name] || 0}</span>
      </button>`).join('');

    renderPlayer(data, now);
  }

  function renderPlayer(data, now) {
    const lp = Engine.levelProgress(data.total_pp);
    const streak = Engine.effectiveStreak(data, now);
    const best = Math.max(data.best_streak || 0, streak);
    const ring = $('[data-player] .ring');
    const pulsing = ring && ring.classList.contains('pulse');
    $('[data-player]').innerHTML = `
      <div class="player-top">
        <div class="ring ${pulsing ? 'pulse' : ''}" style="--p:${Math.round(lp.ratio * 100)}"><b>${lp.level}</b></div>
        <div><div class="p-title">${esc(lp.title)}</div>
          <div class="p-sub">Level ${lp.level}${lp.nextTitle ? ` · ${esc(lp.nextTitle)} at ${lp.nextTitleLevel}` : ''}</div></div>
      </div>
      <div class="xp" title="${UI.fmtNum(lp.pp - lp.start)} / ${UI.fmtNum(lp.next - lp.start)} PP this level"><div style="width:${Math.round(lp.ratio * 100)}%"></div></div>
      <div class="xp-row"><span>${UI.fmtNum(lp.pp)} PP</span><span>${UI.fmtNum(lp.toNext)} to Lvl ${lp.level + 1}</span></div>
      <div class="stats-mini">
        <div title="Current streak">${icon('flame')}<span>${streak}<small>day streak</small></span></div>
        <div title="Best streak">${icon('trophy')}<span>${best}<small>best</small></span></div>
      </div>`;
    $('[data-player] .stats-mini div:first-child i').style.color = 'var(--streak)';
    $('[data-player] .stats-mini div:last-child i').style.color = 'var(--gold)';
  }

  function renderThemeSwitch() {
    const mode = window.MotionTheme.get();
    $('[data-theme-switch]').innerHTML = `<span>Theme</span><div class="seg" role="group" aria-label="Theme">
      ${[['system', 'device-desktop', 'Match system'], ['light', 'sun', 'Light'], ['dark', 'moon', 'Dark']].map(([m, ic, label]) =>
        `<button data-mode="${m}" class="${mode === m ? 'on' : ''}" title="${label}" aria-label="${label}">${icon(ic)}</button>`).join('')}
    </div>`;
  }

  // RIGHT RAIL
  function renderRail() {
    const data = Store.get();
    const now = new Date();
    const todayKey = Engine.dateKey(now);
    const todayHist = data.history.filter(h => Engine.dateKey(h.completion_time) === todayKey);
    const done = todayHist.filter(h => h.status === 'completed').length;
    const remaining = data.active_tasks.filter(t => ['overdue', 'today'].includes(Engine.bucketFor(t.deadline, now)));
    const missedToday = todayHist.filter(h => h.status === 'missed').length;
    const total = done + missedToday + remaining.length;
    const pct = total ? Math.round(done / total * 100) : 0;
    const net = todayHist.reduce((s, h) => s + (h.pp_earned || 0), 0);
    const onTable = remaining.reduce((s, t) => s + Engine.ppBreakdown(data, t, now).total, 0);

    const daily = Engine.dailyAggregate(data.history);
    const weekStart = Engine.startOfWeek(now);
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = Engine.addDays(weekStart, i);
      const key = Engine.dateKey(d);
      const agg = daily[key];
      let cls = '', inner = '';
      if (agg && agg.completed && !agg.missed) { cls = 'full'; inner = icon('check'); }
      else if (agg && agg.completed) cls = 'part';
      else if (agg && agg.missed) { cls = 'miss'; inner = icon('x'); }
      if (key === todayKey) cls += ' now';
      week.push(`<div>${'MTWTFSS'[i]}<div class="d ${cls}" title="${UI.fmtDay(d)}${agg ? `: ${agg.completed} done, ${agg.missed} missed` : ''}">${inner}</div></div>`);
    }

    const streak = Engine.effectiveStreak(data, now);
    const streakText = !streak ? 'Finish a task today to start a streak'
      : data.last_completion_date === todayKey ? `<b>${streak} day${streak === 1 ? '' : 's'}</b> — today’s covered`
        : `<b>${streak} day${streak === 1 ? '' : 's'}</b> — finish a task today to keep it`;

    $('.rail').innerHTML = `
      <div class="card">
        <div class="card-h">Today’s progress<span class="muted">${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></div>
        <div class="today-prog">
          <div class="big-ring" style="--p:${pct}"><div>${done}/${total}<small>done</small></div></div>
          <div class="kv">
            <span>Earned today<b class="${net < 0 ? 'neg' : 'gold'}">${UI.fmtSigned(net)} PP</b></span>
            <span>Still on the table<b>+${UI.fmtNum(onTable)} PP</b></span>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-h">This week<button class="link" data-goto="stats">View stats</button></div>
        <div class="week">${week.join('')}</div>
        <div class="streak-line">${icon('flame')}<span>${streakText}</span></div>
      </div>
      ${breakdownCard(data, now)}`;
  }

  function breakdownCard(data, now) {
    let task = data.active_tasks.find(t => t.id === M.State.railTaskId);
    if (!task) {
      task = data.active_tasks.slice().sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
        .find(t => new Date(t.deadline) >= now) || data.active_tasks[0];
    }
    if (!task) {
      return `<div class="card"><div class="card-h">How PP works</div>
        <ul class="breakdown">
          <li><span>Base PP you set</span><span>100</span></li>
          <li><span>Done 1h+ early / late</span><span>×2 / ×½</span></li>
          <li><span>Severity</span><span>×0.5 – ×5</span></li>
          <li><span>Category weight</span><span>×0.5 – ×3</span></li>
          <li><span>Rescheduled</span><span>×½</span></li>
        </ul></div>`;
    }
    const b = Engine.ppBreakdown(data, task, now);
    const tip = b.timing === 'early' ? 'If you finish it now.'
      : b.timing === 'ontime' ? 'Within the last hour: no early bonus.'
        : 'Already late: PP is halved.';
    return `<div class="card">
      <div class="card-h">How “+${UI.fmtNum(b.total)}” is worked out</div>
      <div class="breakdown-title" title="${esc(task.title)}">${esc(task.title)}</div>
      <ul class="breakdown">
        ${b.steps.map(s => `<li><span>${esc(s.label)}</span><span>${esc(s.value)}</span></li>`).join('')}
        <li class="total"><span>Total</span><span>${UI.fmtNum(b.total)} PP</span></li>
      </ul>
      <p class="bd-note">${tip} Missing it costs ${Engine.missPenalty(task)} PP.</p>
    </div>`;
  }

  function celebrateLevel(level) {
    UI.toast({
      title: `Level ${level} — ${Engine.titleFor(level)}`,
      body: `You crossed ${UI.fmtNum((level - 1) * Engine.LEVEL_SIZE)} PP`,
      icon: 'arrow-big-up-lines', tone: 'level', duration: 7000
    });
    const ring = $('[data-player] .ring');
    if (ring) {
      ring.classList.add('pulse');
      setTimeout(() => { const r = $('[data-player] .ring'); if (r) r.classList.remove('pulse'); }, 2600);
    }
  }

  // AUTO-MISS — tasks 72h past their deadline count as missed
  function runAutoMiss() {
    const due = Store.get().active_tasks.some(t => new Date() > Engine.autoMissAt(t));
    if (!due) return false;
    const results = Store.mutate(d => Engine.autoMissOverdue(d));
    const lost = results.reduce((s, r) => s + r.loss + r.catchUpLoss, 0);
    UI.toast({
      title: `${results.length} overdue task${results.length === 1 ? ' was' : 's were'} marked missed`,
      body: `More than ${Engine.AUTO_MISS_HOURS}h past due · −${lost} PP`,
      icon: 'alert-triangle', tone: 'danger', duration: 8000
    });
    return true;
  }

  // EVENTS
  function bindShell() {
    $('.side').addEventListener('click', e => {
      const page = e.target.closest('[data-page]');
      const cat = e.target.closest('[data-cat]');
      const mode = e.target.closest('[data-mode]');
      if (page) {
        M.State.category = null;
        navigate(page.dataset.page);
      } else if (cat) {
        setCategory(M.State.category === cat.dataset.cat && TASK_PAGES.includes(M.State.page) ? null : cat.dataset.cat);
      } else if (mode) {
        window.MotionTheme.set(mode.dataset.mode);
        renderThemeSwitch();
      } else if (e.target.closest('[data-add-cat]')) {
        M.Views.categories.openEditor(null);
      }
    });

    $('.rail').addEventListener('click', e => {
      const go = e.target.closest('[data-goto]');
      if (go) navigate(go.dataset.goto);
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (UI.closeTop()) e.preventDefault();
        else if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
        return;
      }
      const target = e.target;
      const typing = target.closest && target.closest('input, textarea, select, [contenteditable="true"]');
      if (typing || UI.isLayerOpen() || e.altKey) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (Store.undo()) UI.toast({ title: 'Undone', icon: 'arrow-back-up', tone: 'info', duration: 2000 });
        else UI.toast({ title: 'Nothing to undo', icon: 'arrow-back-up', tone: 'info', duration: 2000 });
        return;
      }
      if (e.ctrlKey || e.metaKey) return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        if (!TASK_PAGES.includes(M.State.page)) navigate('today');
        M.Views.tasks.focusQuickAdd();
      } else if (e.key === '/') {
        e.preventDefault();
        if (M.State.page !== 'history') navigate('history');
        M.Views.history.focusSearch();
      } else if (/^[1-5]$/.test(e.key)) {
        M.State.category = null;
        navigate(NAV[+e.key - 1].id);
      }
    });
  }

  // INIT
  async function init() {
    await Store.load();
    M.Views.tasks.init($('#page-tasks'));
    M.Views.history.init($('#page-history'));
    M.Views.stats.init($('#page-stats'));
    M.Views.categories.init($('#page-categories'));
    bindShell();
    renderThemeSwitch();
    Store.subscribe(() => renderAll());

    navigate('today');
    runAutoMiss();

    // Keep relative times fresh and catch tasks that pass the auto-miss window
    setInterval(() => {
      if (runAutoMiss()) return;
      if (!UI.isLayerOpen()) renderAll();
    }, 60 * 1000);
  }

  M.App = { navigate, setCategory, setLayout, renderRail, celebrateLevel };
  document.addEventListener('DOMContentLoaded', init);
})();
