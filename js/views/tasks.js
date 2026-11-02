/* ==========================================================================
   TASKS VIEW — Today and All tasks pages: quick add, list/board, actions.
   ========================================================================== */

(function () {
  const M = window.Motion;
  const { Engine, UI, Store } = M;
  const { esc, icon } = UI;

  const GROUP_LABELS = { overdue: 'Overdue', today: 'Today', tomorrow: 'Tomorrow', week: 'This week', later: 'Later' };
  const PAGE_GROUPS = {
    today: ['overdue', 'today', 'tomorrow'],
    all: ['overdue', 'today', 'tomorrow', 'week', 'later']
  };
  const REPEAT_LABELS = { none: 'Repeat', daily: 'Daily', weekly: 'Weekly' };
  const TIMING_LABELS = { early: 'early ×2', ontime: 'on time', late: 'late ×½' };

  let root, groupsEl, filtersEl, chipsEl, titleInput, errorEl;
  let currentPage = 'today';
  let qa = null;

  // QUICK ADD STATE
  function activeCategories() {
    return Store.get().categories.filter(c => c.active !== false);
  }

  function resetQuickAdd(keepCategory) {
    const cats = activeCategories();
    const keep = keepCategory && qa && cats.some(c => c.name === qa.category) ? qa.category : null;
    qa = {
      category: keep || (cats[0] ? cats[0].name : ''),
      severity: 'med',
      base: 100,
      due: UI.defaultDue(),
      recurring: 'none',
      note: ''
    };
  }

  function quickTask() {
    return { deadline: qa.due, base_pp: qa.base, severity: qa.severity, category: qa.category };
  }

  // LAYOUT
  function init(pageEl) {
    root = pageEl;
    root.innerHTML = `
      <header class="page-head">
        <h1 data-title>Today</h1><span class="sub" data-sub></span>
        <span class="grow"></span>
        <button class="btn btn-primary" data-new>${icon('plus')}New task<span class="kbd">N</span></button>
      </header>
      <form class="quick" data-quick autocomplete="off">
        <div class="quick-input">${icon('circle-plus')}<input data-qa-title maxlength="200" placeholder="Add a task, then press Enter"></div>
        <div class="quick-chips">
          <button type="button" class="chip" data-chip="category"></button>
          <button type="button" class="chip" data-chip="severity"></button>
          <button type="button" class="chip" data-chip="due"></button>
          <button type="button" class="chip" data-chip="base"></button>
          <button type="button" class="chip" data-chip="repeat"></button>
          <button type="button" class="chip" data-chip="note"></button>
          <span class="quick-est"><small>Up to</small><span data-est></span><button type="submit" class="btn btn-primary btn-sm">Add</button></span>
        </div>
        <div class="quick-error" data-qa-error hidden></div>
      </form>
      <div class="filters" data-filters></div>
      <div data-groups></div>`;

    groupsEl = root.querySelector('[data-groups]');
    filtersEl = root.querySelector('[data-filters]');
    chipsEl = root.querySelector('.quick-chips');
    titleInput = root.querySelector('[data-qa-title]');
    errorEl = root.querySelector('[data-qa-error]');

    resetQuickAdd();
    bindQuickAdd();
    bindList();
    root.querySelector('[data-new]').addEventListener('click', focusQuickAdd);
  }

  function updateChips() {
    const data = Store.get();
    const cat = Engine.findCategory(data, qa.category);
    const sev = Engine.severityOf(qa.severity);
    const chip = name => chipsEl.querySelector(`[data-chip="${name}"]`);

    chip('category').innerHTML = cat
      ? `<span class="dot" style="background:${esc(cat.color)}"></span>${esc(cat.name)} · ${cat.weight}×`
      : `${icon('tag')}No category`;
    chip('category').classList.add('set');
    chip('severity').innerHTML = `${icon('flag-3')}${sev.label} ×${sev.mult}`;
    chip('severity').classList.toggle('set', qa.severity !== 'med');
    chip('due').innerHTML = `${icon('calendar')}${dueChipLabel(qa.due)}`;
    chip('due').classList.add('set');
    chip('base').innerHTML = `${icon('coin')}${UI.fmtNum(qa.base)} base`;
    chip('base').classList.toggle('set', qa.base !== 100);
    chip('repeat').innerHTML = `${icon('repeat')}${REPEAT_LABELS[qa.recurring]}`;
    chip('repeat').classList.toggle('set', qa.recurring !== 'none');
    chip('note').innerHTML = `${icon('notes')}${qa.note ? 'Note added' : 'Note'}`;
    chip('note').classList.toggle('set', !!qa.note);
    root.querySelector('[data-est]').textContent = `+${UI.fmtNum(Engine.maxPp(data, quickTask()))} PP`;
  }

  function dueChipLabel(d) {
    const bucket = Engine.bucketFor(d, new Date());
    const day = bucket === 'today' ? 'Today' : bucket === 'tomorrow' ? 'Tomorrow' : bucket === 'overdue' ? 'Past' : UI.fmtDay(d);
    return `${day}, ${UI.fmtTime(d)}`;
  }

  function bindQuickAdd() {
    chipsEl.addEventListener('click', e => {
      const chip = e.target.closest('[data-chip]');
      if (!chip) return;
      const kind = chip.dataset.chip;

      if (kind === 'category') {
        const items = activeCategories().map(c => ({
          label: c.name, dot: c.color, hint: `${c.weight}×`, active: c.name === qa.category,
          onSelect: () => { qa.category = c.name; updateChips(); }
        }));
        items.push('sep', { label: 'Manage categories', icon: 'settings', onSelect: () => M.App.navigate('categories') });
        UI.menu(chip, items);
      } else if (kind === 'severity') {
        UI.menu(chip, Engine.SEVERITY_ORDER.map(key => ({
          label: Engine.SEVERITY[key].label, icon: 'flag-3', hint: `×${Engine.SEVERITY[key].mult}`, active: key === qa.severity,
          onSelect: () => { qa.severity = key; updateChips(); }
        })));
      } else if (kind === 'due') {
        const picker = UI.whenPicker({ value: qa.due, onChange: d => { qa.due = d; updateChips(); } });
        UI.popover(chip, picker.el, { padded: true, autofocus: false });
      } else if (kind === 'base') {
        const box = UI.el(`<div style="width:240px">
          <div class="popover-title">Base PP</div>
          <input class="input mono" type="number" min="1" max="10000" step="1" value="${qa.base}">
          <div class="when-times" style="margin-top:8px">${[25, 50, 100, 200, 500].map(v => `<button type="button" data-v="${v}" class="${v === qa.base ? 'on' : ''}">${v}</button>`).join('')}</div>
          <p class="field-hint" style="margin-top:8px">Severity, category weight and timing multiply this.</p>
        </div>`);
        const input = box.querySelector('input');
        const set = v => {
          qa.base = Math.min(10000, Math.max(1, parseInt(v, 10) || 1));
          box.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', +b.dataset.v === qa.base));
          updateChips();
        };
        input.addEventListener('input', () => set(input.value));
        input.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); UI.closePopover(); titleInput.focus(); } });
        box.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { input.value = b.dataset.v; set(b.dataset.v); }));
        UI.popover(chip, box, { padded: true });
      } else if (kind === 'repeat') {
        UI.menu(chip, [['none', 'Does not repeat', 'circle-off'], ['daily', 'Every day', 'repeat'], ['weekly', 'Every week', 'calendar-repeat']].map(([v, label, ic]) => ({
          label, icon: ic, active: qa.recurring === v, onSelect: () => { qa.recurring = v; updateChips(); }
        })));
      } else if (kind === 'note') {
        const box = UI.el(`<div style="width:280px"><div class="popover-title">Note</div>
          <textarea class="textarea" rows="3" maxlength="500" placeholder="Chapters 4–7, focus on scheduling"></textarea></div>`);
        const ta = box.querySelector('textarea');
        ta.value = qa.note;
        ta.addEventListener('input', () => { qa.note = ta.value; updateChips(); });
        UI.popover(chip, box, { padded: true });
      }
    });

    titleInput.addEventListener('input', () => { errorEl.hidden = true; });

    root.querySelector('[data-quick]').addEventListener('submit', e => {
      e.preventDefault();
      const title = titleInput.value.trim();
      if (!title) {
        errorEl.textContent = 'Give the task a name first.';
        errorEl.hidden = false;
        titleInput.focus();
        return;
      }
      const due = new Date(qa.due);
      Store.mutate(d => Engine.addTask(d, {
        title, category: qa.category, severity: qa.severity, base_pp: qa.base,
        deadline: due, recurring: qa.recurring, description: qa.note.trim()
      }), { undoable: true });
      UI.toast({ title: 'Task added', body: `${title} · due ${UI.fmtDay(due)}, ${UI.fmtTime(due)}`, icon: 'plus', undo: true });
      titleInput.value = '';
      resetQuickAdd(true);
      updateChips();
      titleInput.focus();
    });
  }

  function focusQuickAdd() {
    titleInput.focus();
    titleInput.scrollIntoView({ block: 'nearest' });
  }

  // RENDERING
  function render(page) {
    if (page) currentPage = page;
    const data = Store.get();
    const now = new Date();
    const filter = M.State.category;

    // Keep the quick-add category valid if categories changed
    if (!activeCategories().some(c => c.name === qa.category)) resetQuickAdd();
    updateChips();

    root.querySelector('[data-title]').textContent = currentPage === 'today' ? 'Today' : 'All tasks';
    root.querySelector('[data-sub]').textContent = currentPage === 'today'
      ? now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
      : `${data.active_tasks.length} active`;

    renderFilters(data);

    const tasks = data.active_tasks
      .filter(t => !filter || t.category === filter)
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    const groups = {};
    PAGE_GROUPS[currentPage].forEach(g => { groups[g] = []; });
    tasks.forEach(t => {
      const b = Engine.bucketFor(t.deadline, now);
      if (groups[b]) groups[b].push(t);
    });

    const shown = Object.values(groups).reduce((n, g) => n + g.length, 0);
    if (shown === 0) {
      groupsEl.className = '';
      groupsEl.innerHTML = emptyState(tasks.length, filter);
      const btn = groupsEl.querySelector('[data-goto-all]');
      if (btn) btn.addEventListener('click', () => M.App.navigate('all'));
      return;
    }

    if (M.State.layout === 'board') renderBoard(groups, data, now);
    else renderGroups(groups, data, now);
  }

  function emptyState(totalForFilter, filter) {
    if (currentPage === 'today' && totalForFilter > 0) {
      return `<div class="empty">${icon('mood-smile')}<h3>Nothing due today or tomorrow</h3>
        <p>You have ${totalForFilter} task${totalForFilter === 1 ? '' : 's'} coming up later.</p>
        <button class="btn" data-goto-all>${icon('list-check')}See all tasks</button></div>`;
    }
    return `<div class="empty">${icon('sparkles')}<h3>${filter ? `No ${esc(filter)} tasks` : 'Plan your next win'}</h3>
      <p>Type a task above and press Enter. Finish it early to earn double PP.</p></div>`;
  }

  function renderFilters(data) {
    const counts = {};
    data.active_tasks.forEach(t => { counts[t.category] = (counts[t.category] || 0) + 1; });
    const cats = data.categories.filter(c => c.active !== false || counts[c.name]);
    filtersEl.innerHTML = `<button class="filter ${!M.State.category ? 'on' : ''}" data-cat="">All</button>`
      + cats.map(c => `<button class="filter ${M.State.category === c.name ? 'on' : ''}" data-cat="${esc(c.name)}"><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</button>`).join('')
      + `<div class="seg push" role="group" aria-label="Layout">
          <button class="${M.State.layout === 'list' ? 'on' : ''}" data-layout="list" title="List">${icon('list')}</button>
          <button class="${M.State.layout === 'board' ? 'on' : ''}" data-layout="board" title="Board">${icon('layout-kanban')}</button>
        </div>`;
    filtersEl.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => M.App.setCategory(b.dataset.cat || null)));
    filtersEl.querySelectorAll('[data-layout]').forEach(b => b.addEventListener('click', () => M.App.setLayout(b.dataset.layout)));
  }

  function groupHeader(key, list, data, now) {
    let sum = '';
    if (key === 'overdue' && list.length) {
      const soonest = Math.min(...list.map(t => Engine.autoMissAt(t).getTime()));
      sum = `auto-missed in ${UI.fmtDuration(soonest - now)}`;
    } else if (list.length) {
      const total = list.reduce((s, t) => s + Engine.ppBreakdown(data, t, now).total, 0);
      sum = `up to +${UI.fmtNum(total)} PP`;
    }
    return `<div class="g-head g-${key}">${key === 'overdue' ? icon('alert-triangle') : ''}${GROUP_LABELS[key]}<span class="n">${list.length}</span><span class="sum">${sum}</span></div>`;
  }

  function renderGroups(groups, data, now) {
    groupsEl.className = 'task-groups';
    groupsEl.innerHTML = Object.keys(groups).filter(k => groups[k].length).map(k => `
      <div class="group">${groupHeader(k, groups[k], data, now)}
        ${groups[k].map(t => rowHtml(t, k, data, now)).join('')}
      </div>`).join('');
  }

  function renderBoard(groups, data, now) {
    groupsEl.className = 'board';
    groupsEl.innerHTML = Object.keys(groups).filter(k => k !== 'overdue' || groups[k].length).map(k => `
      <div class="b-col">${groupHeader(k, groups[k], data, now)}
        ${groups[k].length ? groups[k].map(t => cardHtml(t, k, data, now)).join('') : '<div class="b-empty">Nothing here</div>'}
      </div>`).join('');
  }

  function dueLabel(task, bucket, now) {
    const d = new Date(task.deadline);
    const diff = d - now;
    if (bucket === 'overdue') return { text: `−${UI.fmtDuration(diff)}`, cls: 'late' };
    if (bucket === 'today') return diff <= 2 * 3600 * 1000 ? { text: `in ${UI.fmtDuration(diff)}`, cls: 'soon' } : { text: UI.fmtTime(d), cls: '' };
    if (bucket === 'tomorrow') return { text: UI.fmtTime(d), cls: '' };
    if (bucket === 'week') return { text: `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${UI.fmtTime(d)}`, cls: '' };
    return { text: UI.fmtShortDate(d), cls: '' };
  }

  function metaHtml(task, data) {
    const cat = Engine.findCategory(data, task.category);
    const parts = [cat
      ? `<span><span class="dot" style="background:${esc(cat.color)}"></span>${esc(cat.name)}</span>`
      : `<span class="uncat" title="This category was deleted"><span class="dot" style="background:var(--text-3)"></span>${esc(task.category || 'Uncategorized')}</span>`];
    if (task.recurring && task.recurring !== 'none') parts.push(`<span class="tag tag-repeat">${task.recurring === 'daily' ? 'DAILY' : 'WEEKLY'}</span>`);
    if (task.rescheduled) parts.push(`<span class="tag tag-resched" title="${esc(task.rescheduled_reason || 'Rescheduled')}">RESCHEDULED</span>`);
    if (task.description) parts.push(`<span class="note">${icon('notes')} ${esc(task.description)}</span>`);
    return parts.join('');
  }

  function ppHtml(task, data, now) {
    const b = Engine.ppBreakdown(data, task, now);
    const why = TIMING_LABELS[b.timing] + (b.rescheduled ? ' · ½' : '');
    return `<span class="pp">+${UI.fmtNum(b.total)}<small>${why}</small></span>`;
  }

  function toolsHtml() {
    return `<div class="r-tools">
      <button class="icon-btn ok" data-act="complete" title="Complete">${icon('check')}</button>
      <button class="icon-btn" data-act="reschedule" title="Reschedule">${icon('calendar-repeat')}</button>
      <button class="icon-btn" data-act="defer" title="Defer (no PP change)">${icon('player-pause')}</button>
      <button class="icon-btn" data-act="more" title="More">${icon('dots')}</button>
    </div>`;
  }

  function rowHtml(task, bucket, data, now) {
    const sev = Engine.severityOf(task.severity);
    const due = dueLabel(task, bucket, now);
    return `<div class="row" data-id="${esc(task.id)}">
      <button class="check sev-${esc(task.severity || 'med')}" data-act="check" aria-label="Complete ${esc(task.title)}">${icon('check')}</button>
      <div class="r-body"><div class="r-title">${esc(task.title)}</div><div class="r-meta">${metaHtml(task, data)}</div></div>
      ${toolsHtml()}
      <span class="sev sev-${esc(task.severity || 'med')}">${sev.short}${task.severity === 'life_changing' ? ' ×5' : ''}</span>
      <span class="due ${due.cls}">${due.text}</span>
      ${ppHtml(task, data, now)}
    </div>`;
  }

  function cardHtml(task, bucket, data, now) {
    const sev = Engine.severityOf(task.severity);
    const due = dueLabel(task, bucket, now);
    return `<div class="bcard" data-id="${esc(task.id)}">
      <div class="bcard-top">
        <button class="check sev-${esc(task.severity || 'med')}" data-act="check" aria-label="Complete ${esc(task.title)}">${icon('check')}</button>
        <div class="r-body"><div class="r-title">${esc(task.title)}</div><div class="r-meta" style="flex-wrap:wrap">${metaHtml(task, data)}</div></div>
      </div>
      ${toolsHtml()}
      <div class="bcard-foot"><span class="sev sev-${esc(task.severity || 'med')}">${sev.short}</span><span class="due ${due.cls}">${due.text}</span>${ppHtml(task, data, now)}</div>
    </div>`;
  }

  // ACTIONS
  function bindList() {
    groupsEl.addEventListener('click', e => {
      const item = e.target.closest('[data-id]');
      if (!item) return;
      const id = item.dataset.id;
      const actEl = e.target.closest('[data-act]');
      const act = actEl ? actEl.dataset.act : 'edit';
      if (act === 'check' || act === 'complete') complete(id, item.querySelector('.check'), item);
      else if (act === 'reschedule') openReschedule(id);
      else if (act === 'defer') defer(id);
      else if (act === 'more') openMore(id, actEl);
      else openEdit(id);
    });

    groupsEl.addEventListener('mouseover', e => {
      const item = e.target.closest('[data-id]');
      if (item && M.State.railTaskId !== item.dataset.id) {
        M.State.railTaskId = item.dataset.id;
        M.App.renderRail();
      }
    });
  }

  function catchUpNote(res) {
    if (!res.catchUp) return '';
    return ` · ${res.catchUp} skipped repeat${res.catchUp === 1 ? '' : 's'} missed (−${res.catchUpLoss} PP)`;
  }

  function findTask(id) {
    return Store.get().active_tasks.find(t => t.id === id);
  }

  function complete(id, checkEl, itemEl) {
    const task = findTask(id);
    if (!task) return;
    const preview = Engine.ppBreakdown(Store.get(), task, new Date());
    checkEl.classList.add('done');
    itemEl.classList.add('leaving');
    UI.ppFloat(checkEl, `+${UI.fmtNum(preview.total)}`);

    setTimeout(() => {
      const res = Store.mutate(d => Engine.completeTask(d, id), { undoable: true });
      if (!res) return;
      const why = { early: 'early bonus ×2', ontime: 'on time', late: 'late, halved' }[res.breakdown.timing];
      UI.toast({
        title: `+${UI.fmtNum(res.earned)} PP`,
        body: `${res.task.title} — ${why}${res.respawned ? ' · next one added' : ''}${catchUpNote(res)}`,
        icon: 'check', tone: 'success', undo: true
      });
      if (res.levelAfter > res.levelBefore) M.App.celebrateLevel(res.levelAfter);
    }, 280);
  }

  function defer(id) {
    const res = Store.mutate(d => Engine.deferTask(d, id), { undoable: true });
    if (res) UI.toast({ title: 'Task deferred', body: `${res.task.title} · no PP change${res.respawned ? ' · next one added' : ''}${catchUpNote(res)}`, icon: 'player-pause', tone: 'info', undo: true });
  }

  function miss(id) {
    const res = Store.mutate(d => Engine.missTask(d, id), { undoable: true });
    if (res) UI.toast({ title: `Marked missed · −${res.loss + res.catchUpLoss} PP`, body: `${res.task.title}${catchUpNote(res)}`, icon: 'x', tone: 'danger', undo: true });
  }

  function remove(id) {
    const res = Store.mutate(d => Engine.deleteTask(d, id), { undoable: true });
    if (res) UI.toast({ title: 'Task deleted', body: res.title, icon: 'trash', tone: 'danger', undo: true });
  }

  function openMore(id, anchor) {
    const task = findTask(id);
    if (!task) return;
    UI.menu(anchor, [
      { label: 'Edit', icon: 'pencil', onSelect: () => openEdit(id) },
      { label: 'Reschedule', icon: 'calendar-repeat', onSelect: () => openReschedule(id) },
      { label: 'Defer', icon: 'player-pause', hint: '±0 PP', onSelect: () => defer(id) },
      { label: 'Mark missed', icon: 'x', hint: `−${Engine.missPenalty(task)} PP`, onSelect: () => miss(id) },
      'sep',
      { label: 'Delete', icon: 'trash', danger: true, onSelect: () => remove(id) }
    ]);
  }

  function openReschedule(id) {
    const task = findTask(id);
    if (!task) return;
    const start = new Date(task.deadline) > new Date() ? new Date(task.deadline) : UI.defaultDue();
    const picker = UI.whenPicker({ value: start });
    const body = UI.el(`<div style="display:flex;flex-direction:column;gap:14px">
      <p class="dialog-text"><b>${esc(task.title)}</b> is due ${UI.fmtDay(task.deadline)}, ${UI.fmtTime(task.deadline)}.
        ${task.rescheduled ? 'It’s already been rescheduled, so its PP stays halved.' : 'Rescheduling halves the PP you’ll earn for it.'}</p>
      <div data-picker></div>
      <div class="field"><label class="field-label" for="resched-reason">Reason (optional)</label>
        <textarea id="resched-reason" autofocus class="textarea" rows="2" maxlength="300" placeholder="Blocked by a dependency"></textarea></div>
    </div>`);
    body.querySelector('[data-picker]').appendChild(picker.el);
    picker.el.style.width = '100%';
    UI.dialog({
      title: 'Reschedule task', icon: 'calendar-repeat', body, width: 420,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Reschedule', kind: 'primary', onClick: () => {
            const when = picker.get();
            const reason = body.querySelector('textarea').value.trim();
            Store.mutate(d => Engine.rescheduleTask(d, id, when, reason), { undoable: true });
            UI.toast({ title: 'Rescheduled', body: `${task.title} · due ${UI.fmtDay(when)}, ${UI.fmtTime(when)}`, icon: 'calendar-repeat', undo: true });
          }
        }
      ]
    });
  }

  function openEdit(id) {
    const task = findTask(id);
    if (!task) return;
    const data = Store.get();
    const cats = data.categories.filter(c => c.active !== false || c.name === task.category);
    const hasCat = cats.some(c => c.name === task.category);
    const body = UI.el(`<div style="display:flex;flex-direction:column;gap:14px">
      <div class="field"><label class="field-label" for="edit-title">Title</label>
        <input id="edit-title" class="input" maxlength="200" value="${esc(task.title)}"><span class="field-error" hidden></span></div>
      <div class="field"><label class="field-label" for="edit-note">Note</label>
        <textarea id="edit-note" class="textarea" rows="2" maxlength="500">${esc(task.description || '')}</textarea></div>
      <div class="field-row">
        <div class="field"><label class="field-label" for="edit-cat">Category</label>
          <select id="edit-cat" class="select">
            ${hasCat ? '' : `<option value="${esc(task.category)}" selected>${esc(task.category || 'Uncategorized')} (deleted)</option>`}
            ${cats.map(c => `<option value="${esc(c.name)}" ${c.name === task.category ? 'selected' : ''}>${esc(c.name)} · ${c.weight}×</option>`).join('')}
          </select></div>
        <div class="field"><label class="field-label" for="edit-base">Base PP</label>
          <input id="edit-base" class="input mono" type="number" min="1" max="10000" value="${parseInt(task.base_pp, 10) || 100}"></div>
      </div>
      <div class="field"><span class="field-label">Severity</span>
        <div class="seg seg-block" data-sev>${Engine.SEVERITY_ORDER.map(k => `<button type="button" data-v="${k}" class="${k === (task.severity || 'med') ? 'on' : ''}">${k === 'life_changing' ? 'Life' : Engine.SEVERITY[k].label} ×${Engine.SEVERITY[k].mult}</button>`).join('')}</div></div>
      <div class="field-row">
        <div class="field"><label class="field-label" for="edit-repeat">Repeat</label>
          <select id="edit-repeat" class="select">
            ${[['none', 'Does not repeat'], ['daily', 'Every day'], ['weekly', 'Every week']].map(([v, l]) => `<option value="${v}" ${v === (task.recurring || 'none') ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
        <div class="field"><span class="field-label">Due</span>
          <button type="button" class="btn" data-resched style="justify-content:flex-start">${icon('calendar-repeat')}${UI.fmtDay(task.deadline)}, ${UI.fmtTime(task.deadline)}</button></div>
      </div>
    </div>`);

    let severity = task.severity || 'med';
    body.querySelectorAll('[data-sev] button').forEach(b => b.addEventListener('click', () => {
      severity = b.dataset.v;
      body.querySelectorAll('[data-sev] button').forEach(x => x.classList.toggle('on', x === b));
    }));

    const dlg = UI.dialog({
      title: 'Edit task', icon: 'pencil', body, width: 480,
      actions: [
        { label: 'Delete', kind: 'ghost', icon: 'trash', onClick: () => remove(id) },
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Save', kind: 'primary', onClick: () => {
            const title = body.querySelector('#edit-title').value.trim();
            if (!title) {
              const err = body.querySelector('.field-error');
              err.textContent = 'Enter a title.';
              err.hidden = false;
              return false;
            }
            Store.mutate(d => {
              const t = d.active_tasks.find(x => x.id === id);
              if (!t) return null;
              t.title = title;
              t.description = body.querySelector('#edit-note').value.trim();
              t.category = body.querySelector('#edit-cat').value;
              t.base_pp = Math.min(10000, Math.max(1, parseInt(body.querySelector('#edit-base').value, 10) || 1));
              t.severity = severity;
              t.recurring = body.querySelector('#edit-repeat').value;
              return t;
            }, { undoable: true });
            UI.toast({ title: 'Task updated', body: title, icon: 'pencil', undo: true });
          }
        }
      ]
    });
    body.querySelector('[data-resched]').addEventListener('click', () => { dlg.close(); openReschedule(id); });
  }

  M.Views = M.Views || {};
  M.Views.tasks = { init, render, focusQuickAdd };
})();
