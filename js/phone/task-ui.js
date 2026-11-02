/* ==========================================================================
   MOTION PHONE TASKS — task cards, actions, and the detail / new / edit /
   reschedule sheets.
   ========================================================================== */

(function () {
  const M = window.Motion;
  const { Engine, UI, Store, P } = M;
  const { esc, icon, el } = UI;

  const TIMING = { early: 'early ×2', ontime: 'on time', late: 'late ×½' };
  const QUICK_TIMES = [['09:00', '9 AM'], ['12:00', '12 PM'], ['18:00', '6 PM'], ['21:00', '9 PM']];
  const PP_PRESETS = [50, 100, 200, 500];

  const findTask = id => Store.get().active_tasks.find(t => t.id === id);

  function catOf(name) {
    return Engine.findCategory(Store.get(), name);
  }

  // CARD
  function cardHtml(task, data, now) {
    const cat = Engine.findCategory(data, task.category);
    const due = P.relDue(task.deadline, now);
    const b = Engine.ppBreakdown(data, task, now);
    const meta = [`<span><span class="dot" style="background:${cat ? esc(cat.color) : 'var(--text-3)'}"></span>${esc(task.category || 'Uncategorized')}</span>`];
    if (task.recurring && task.recurring !== 'none') meta.push(`<span class="badge repeat">${task.recurring === 'daily' ? 'DAILY' : 'WEEKLY'}</span>`);
    if (task.rescheduled) meta.push('<span class="badge resched">MOVED</span>');
    if (task.description) meta.push(`<span class="tnote">${esc(task.description)}</span>`);
    return `<div class="tcard" data-id="${esc(task.id)}" style="--cat:${cat ? esc(cat.color) : 'var(--text-3)'}">
      <div class="tcard-bg">
        <span class="done-hint">${icon('circle-check')}Complete</span>
        <div class="actions">
          <button class="act-defer" data-act="defer">${icon('player-pause')}Defer</button>
          <button class="act-resched" data-act="resched">${icon('calendar-repeat')}Move</button>
        </div>
      </div>
      <div class="tcard-body">
        <button class="tcheck sev-${esc(task.severity || 'med')}" data-act="check" aria-label="Complete ${esc(task.title)}">${icon('check')}</button>
        <div class="tmain"><div class="ttitle">${esc(task.title)}</div><div class="tmeta">${meta.join('')}</div></div>
        <div class="tside"><span class="tdue ${due.cls}">${due.text}</span><span class="tpp" title="${TIMING[b.timing]}">+${UI.fmtNum(b.total)}</span></div>
      </div>
    </div>`;
  }

  function listHtml(tasks, data, now) {
    return `<div class="tlist">${tasks.map(t => cardHtml(t, data, now)).join('')}</div>`;
  }

  // Swipe and tap behaviour for any element holding task cards
  function bindList(container) {
    P.bindSwipe(container, {
      onComplete: (id, card) => complete(id, card),
      onDefer: defer,
      onReschedule: openReschedule,
      onTap: openDetail
    });
  }

  // ACTIONS
  function complete(id, card) {
    const task = findTask(id);
    if (!task) return;
    const preview = Engine.ppBreakdown(Store.get(), task, new Date());
    P.haptic.success();
    if (card) {
      const check = card.querySelector('.tcheck');
      check.classList.add('done');
      P.ppFloat(check, `+${UI.fmtNum(preview.total)}`);
      card.classList.add('leaving');
    }
    setTimeout(() => {
      const res = Store.mutate(d => Engine.completeTask(d, id), { undoable: true });
      if (!res) return;
      const why = { early: 'early bonus ×2', ontime: 'on time', late: 'late, halved' }[res.breakdown.timing];
      const extra = res.catchUp ? ` · ${res.catchUp} skipped repeat${res.catchUp === 1 ? '' : 's'} −${res.catchUpLoss}` : '';
      P.snack({ title: `+${UI.fmtNum(res.earned)} PP`, body: `${res.task.title} — ${why}${res.respawned ? ' · next one added' : ''}${extra}`, icon: 'check', tone: 'success', undo: true });
      if (res.levelAfter > res.levelBefore) setTimeout(() => P.celebrate(res.levelAfter, Engine.titleFor(res.levelAfter)), 400);
    }, card ? 280 : 0);
  }

  function defer(id) {
    const res = Store.mutate(d => Engine.deferTask(d, id), { undoable: true });
    if (!res) return;
    P.haptic.tap();
    P.snack({ title: 'Deferred', body: `${res.task.title} · no PP change${res.respawned ? ' · next one added' : ''}`, icon: 'player-pause', tone: 'info', undo: true });
  }

  function miss(id) {
    const res = Store.mutate(d => Engine.missTask(d, id), { undoable: true });
    if (!res) return;
    P.haptic.warn();
    P.snack({ title: `Missed · −${res.loss + res.catchUpLoss} PP`, body: res.task.title, icon: 'x', tone: 'danger', undo: true });
  }

  function remove(id) {
    const res = Store.mutate(d => Engine.deleteTask(d, id), { undoable: true });
    if (!res) return;
    P.haptic.warn();
    P.snack({ title: 'Task deleted', body: res.title, icon: 'trash', tone: 'danger', undo: true });
  }

  // DETAIL SHEET
  function openDetail(id) {
    const task = findTask(id);
    if (!task) return;
    const data = Store.get();
    const now = new Date();
    const cat = catOf(task.category);
    const b = Engine.ppBreakdown(data, task, now);
    const sev = Engine.severityOf(task.severity);
    const late = new Date(task.deadline) < now;
    P.haptic.tap();

    const body = el(`<div>
      <div class="detail-cat"><span class="dot" style="background:${cat ? esc(cat.color) : 'var(--text-3)'}"></span>
        ${cat ? icon(cat.icon || 'tag') : ''}${esc(task.category || 'Uncategorized')}</div>
      <div class="detail-title">${esc(task.title)}</div>
      ${task.description ? `<div class="detail-note">${esc(task.description)}</div>` : ''}
      <div class="detail-meta">
        <span class="pill ${late ? 'late' : ''}">${icon('calendar')}${esc(P.fullDue(task.deadline, now))}</span>
        <span class="pill">${icon('flag-3')}${sev.label} ×${sev.mult}</span>
        ${task.recurring && task.recurring !== 'none' ? `<span class="pill">${icon('repeat')}${task.recurring === 'daily' ? 'Every day' : 'Every week'}</span>` : ''}
        ${task.rescheduled ? `<span class="pill">${icon('calendar-repeat')}Rescheduled${task.rescheduled_reason ? ': ' + esc(task.rescheduled_reason) : ''}</span>` : ''}
      </div>
      <ul class="breakdown">
        ${b.steps.map(s => `<li><span>${esc(s.label)}</span><span>${esc(s.value)}</span></li>`).join('')}
        <li class="total"><span>If you finish now</span><span>+${UI.fmtNum(b.total)} PP</span></li>
      </ul>
      <div class="btn-row">
        <button class="btn-tile" data-a="resched">${icon('calendar-repeat')}Reschedule</button>
        <button class="btn-tile" data-a="defer">${icon('player-pause')}Defer</button>
        <button class="btn-tile" data-a="edit">${icon('pencil')}Edit</button>
      </div>
      <button class="btn-text danger" data-a="miss" style="margin-top:10px">${icon('x')}Mark missed · −${Engine.missPenalty(task)} PP</button>
      <button class="btn-text danger" data-a="delete">${icon('trash')}Delete task</button>
    </div>`);
    const foot = el(`<button class="btn-primary success" data-a="complete">${icon('check')}Complete · +${UI.fmtNum(b.total)} PP</button>`);
    const s = P.sheet({ title: '', body, foot });
    s.el.addEventListener('click', e => {
      const btn = e.target.closest('[data-a]');
      if (!btn) return;
      s.close();
      const a = btn.dataset.a;
      if (a === 'complete') {
        const card = document.querySelector(`.p-screen.on .tcard[data-id="${CSS.escape(id)}"]`);
        complete(id, card);
      } else if (a === 'resched') openReschedule(id);
      else if (a === 'defer') defer(id);
      else if (a === 'edit') openEditor(id);
      else if (a === 'miss') miss(id);
      else if (a === 'delete') remove(id);
    });
  }

  // DATE HELPERS for native <input type="date|time">
  function dateValue(d) { return Engine.dateKey(d); }
  function timeValue(d) { return UI.toHHMM(d); }
  function combine(dateStr, timeStr) {
    const [y, m, day] = dateStr.split('-').map(Number);
    const [h, min] = (timeStr || '18:00').split(':').map(Number);
    return new Date(y, m - 1, day, h, min, 0, 0);
  }

  function nextWeekend(now) {
    const d = Engine.startOfDay(now);
    const dow = d.getDay();
    return dow === 0 || dow === 6 ? d : Engine.addDays(d, 6 - dow);
  }

  // A "when" block: day chips, native date and time pickers, quick times, and a summary line
  function whenBlock(initial, onChange) {
    let due = new Date(initial);
    const box = el(`<div>
      <div class="chips" data-days></div>
      <div class="f-row" style="margin-top:10px">
        <input class="f-input" type="date" data-date aria-label="Date">
        <input class="f-input" type="time" data-time aria-label="Time">
      </div>
      <div class="chips" data-times style="margin-top:10px"></div>
      <p class="f-hint" data-hint></p>
    </div>`);
    const dateIn = box.querySelector('[data-date]');
    const timeIn = box.querySelector('[data-time]');

    function render() {
      const now = new Date();
      const today = Engine.startOfDay(now);
      const days = [['Today', today], ['Tomorrow', Engine.addDays(today, 1)], ['Weekend', nextWeekend(now)]];
      const key = Engine.dateKey(due);
      box.querySelector('[data-days]').innerHTML = days.map(([label, d], i) =>
        `<button type="button" class="chip ${Engine.dateKey(d) === key ? 'on' : ''}" data-day="${i}">${label}</button>`).join('');
      box.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => {
        const d = days[+b.dataset.day][1];
        due = combine(Engine.dateKey(d), timeValue(due));
        changed();
      }));
      const hhmm = timeValue(due);
      box.querySelector('[data-times]').innerHTML = QUICK_TIMES.map(([v, label]) =>
        `<button type="button" class="chip ${v === hhmm ? 'on' : ''}" data-t="${v}">${label}</button>`).join('');
      box.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => {
        due = combine(dateValue(due), b.dataset.t);
        changed();
      }));
      if (document.activeElement !== dateIn) dateIn.value = dateValue(due);
      if (document.activeElement !== timeIn) timeIn.value = hhmm;
      const hint = box.querySelector('[data-hint]');
      const past = due < now;
      hint.className = 'f-hint' + (past ? ' warn' : '');
      hint.textContent = past ? `${UI.fmtDay(due)}, ${UI.fmtTime(due)} has already passed` : `Due ${P.fullDue(due, now)}`;
    }
    function changed() {
      P.haptic.tap();
      render();
      onChange(new Date(due));
    }
    dateIn.addEventListener('change', () => { if (dateIn.value) { due = combine(dateIn.value, timeValue(due)); changed(); } });
    timeIn.addEventListener('change', () => { if (timeIn.value) { due = combine(dateValue(due), timeIn.value); changed(); } });
    render();
    return { el: box, get: () => new Date(due) };
  }

  // NEW / EDIT SHEET
  function openEditor(id) {
    const existing = id ? findTask(id) : null;
    const data = Store.get();
    const cats = data.categories.filter(c => c.active !== false || (existing && c.name === existing.category));
    const f = existing ? {
      title: existing.title, note: existing.description || '', category: existing.category,
      severity: existing.severity || 'med', base: parseInt(existing.base_pp, 10) || 100,
      due: new Date(existing.deadline), recurring: existing.recurring || 'none'
    } : {
      title: '', note: '', category: (cats[0] && cats[0].name) || '', severity: 'med', base: 100,
      due: UI.defaultDue(), recurring: 'none'
    };

    const body = el(`<div>
      <input class="f-input f-title" data-f="title" maxlength="200" placeholder="What needs doing?" value="${esc(f.title)}" enterkeyhint="done">
      <p class="f-error" data-err hidden></p>
      <textarea class="f-area" data-f="note" maxlength="500" placeholder="Add a note (optional)" style="margin-top:10px">${esc(f.note)}</textarea>

      ${existing ? `<label class="f-label">When</label>
        <button type="button" class="btn-secondary" data-resched style="justify-content:flex-start;padding:0 14px">${icon('calendar-repeat')}${esc(P.fullDue(existing.deadline))}</button>
        <p class="f-hint">Changing the date reschedules the task, which halves its PP.</p>`
        : '<label class="f-label">When</label><div data-when></div>'}

      <label class="f-label">Category</label>
      <div class="chips" data-cats></div>

      <label class="f-label">Severity</label>
      <div class="segs sev" data-sev>${Engine.SEVERITY_ORDER.map(k => `<button type="button" data-v="${k}">${k === 'life_changing' ? 'Life' : Engine.SEVERITY[k].label.replace('Medium', 'Med')}<small>×${Engine.SEVERITY[k].mult}</small></button>`).join('')}</div>

      <label class="f-label">Base PP</label>
      <div class="stepper">
        <button type="button" data-step="-25" aria-label="Less">${icon('minus')}</button>
        <input type="number" inputmode="numeric" min="1" max="10000" data-f="base" value="${f.base}" aria-label="Base PP">
        <button type="button" data-step="25" aria-label="More">${icon('plus')}</button>
      </div>
      <div class="chips" data-presets style="margin-top:10px"></div>

      <label class="f-label">Repeat</label>
      <div class="segs" data-repeat>${[['none', 'Never'], ['daily', 'Daily'], ['weekly', 'Weekly']].map(([v, l]) => `<button type="button" data-v="${v}">${l}</button>`).join('')}</div>

      <div class="preview" data-preview></div>
    </div>`);
    const foot = el(`<button class="btn-primary" data-save>${icon(existing ? 'check' : 'plus')}${existing ? 'Save changes' : 'Add task'}</button>`);

    const titleIn = body.querySelector('[data-f="title"]');
    const noteIn = body.querySelector('[data-f="note"]');
    const baseIn = body.querySelector('[data-f="base"]');
    const errEl = body.querySelector('[data-err]');

    if (!existing) {
      const when = whenBlock(f.due, d => { f.due = d; renderPreview(); });
      body.querySelector('[data-when]').appendChild(when.el);
    }

    function renderCats() {
      const c = body.querySelector('[data-cats]');
      c.innerHTML = cats.map(x => `<button type="button" class="chip ${x.name === f.category ? 'on' : ''}" data-cat="${esc(x.name)}">
          <span class="dot" style="background:${esc(x.color)}"></span>${esc(x.name)}<span class="muted mono" style="font-size:11px">${x.weight}×</span></button>`).join('')
        + `<button type="button" class="chip" data-manage>${icon('settings')}Manage</button>`;
    }
    function renderSegs(sel, value) {
      body.querySelectorAll(`${sel} button`).forEach(b => b.classList.toggle('on', b.dataset.v === value));
    }
    function renderPresets() {
      body.querySelector('[data-presets]').innerHTML = PP_PRESETS.map(v => `<button type="button" class="chip ${v === f.base ? 'on' : ''}" data-preset="${v}">${v}</button>`).join('');
    }
    function renderPreview() {
      const t = { deadline: f.due, base_pp: f.base, severity: f.severity, category: f.category, rescheduled: existing ? existing.rescheduled : false };
      const d = new Date(f.due);
      const at = {
        early: new Date(d.getTime() - 2 * 3600 * 1000),
        ontime: new Date(d.getTime() - 30 * 60 * 1000),
        late: new Date(d.getTime() + 3600 * 1000)
      };
      const pp = k => UI.fmtNum(Engine.ppBreakdown(Store.get(), t, at[k]).total);
      body.querySelector('[data-preview]').innerHTML =
        `<div><span>Early</span><b>+${pp('early')}</b></div><div><span>On time</span><b>+${pp('ontime')}</b></div><div><span>Late</span><b>+${pp('late')}</b></div>`;
    }
    function setBase(v) {
      f.base = Math.min(10000, Math.max(1, Math.round(v) || 1));
      if (document.activeElement !== baseIn) baseIn.value = f.base;
      renderPresets();
      renderPreview();
    }

    renderCats();
    renderSegs('[data-sev]', f.severity);
    renderSegs('[data-repeat]', f.recurring);
    renderPresets();
    renderPreview();

    body.addEventListener('click', e => {
      const t = e.target;
      const catBtn = t.closest('[data-cat]');
      if (catBtn) { f.category = catBtn.dataset.cat; P.haptic.tap(); renderCats(); renderPreview(); return; }
      if (t.closest('[data-manage]')) { s.close(); M.Phone.push('categories'); return; }
      const sev = t.closest('[data-sev] button');
      if (sev) { f.severity = sev.dataset.v; P.haptic.tap(); renderSegs('[data-sev]', f.severity); renderPreview(); return; }
      const rep = t.closest('[data-repeat] button');
      if (rep) { f.recurring = rep.dataset.v; P.haptic.tap(); renderSegs('[data-repeat]', f.recurring); return; }
      const step = t.closest('[data-step]');
      if (step) { P.haptic.tap(); setBase(f.base + Number(step.dataset.step)); baseIn.value = f.base; return; }
      const preset = t.closest('[data-preset]');
      if (preset) { P.haptic.tap(); setBase(Number(preset.dataset.preset)); baseIn.value = f.base; return; }
      if (t.closest('[data-resched]')) { s.close(); openReschedule(existing.id); }
    });
    baseIn.addEventListener('input', () => setBase(parseInt(baseIn.value, 10)));
    baseIn.addEventListener('blur', () => { baseIn.value = f.base; });
    titleIn.addEventListener('input', () => { errEl.hidden = true; });
    titleIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); titleIn.blur(); } });

    const s = P.sheet({ title: existing ? 'Edit task' : 'New task', body, foot, full: true, focus: existing ? null : '[data-f="title"]' });

    foot.addEventListener('click', () => {
      const title = titleIn.value.trim();
      if (!title) {
        errEl.textContent = 'Give the task a name first.';
        errEl.hidden = false;
        P.haptic.warn();
        titleIn.focus();
        return;
      }
      const note = noteIn.value.trim();
      if (existing) {
        Store.mutate(d => {
          const t = d.active_tasks.find(x => x.id === existing.id);
          if (!t) return null;
          Object.assign(t, { title, description: note, category: f.category, severity: f.severity, base_pp: f.base, recurring: f.recurring });
          return t;
        }, { undoable: true });
        P.snack({ title: 'Saved', body: title, icon: 'pencil', undo: true });
      } else {
        Store.mutate(d => Engine.addTask(d, {
          title, description: note, category: f.category, severity: f.severity, base_pp: f.base, deadline: f.due, recurring: f.recurring
        }), { undoable: true });
        P.snack({ title: 'Task added', body: `${title} · due ${UI.fmtDay(f.due)}, ${UI.fmtTime(f.due)}`, icon: 'plus', tone: 'success', undo: true });
      }
      P.haptic.success();
      s.close();
    });
  }

  // RESCHEDULE SHEET
  function openReschedule(id) {
    const task = findTask(id);
    if (!task) return;
    const start = new Date(task.deadline) > new Date() ? new Date(task.deadline) : UI.defaultDue();
    let due = start;
    const body = el(`<div>
      <p style="color:var(--text-2);margin-bottom:6px"><b style="color:var(--text)">${esc(task.title)}</b> is due ${esc(P.fullDue(task.deadline))}.</p>
      <p class="f-hint warn" style="margin-top:0">${task.rescheduled ? 'It’s already been rescheduled, so its PP stays halved.' : 'Rescheduling halves the PP you’ll earn for it.'}</p>
      <label class="f-label">New time</label>
      <div data-when></div>
      <label class="f-label">Reason (optional)</label>
      <textarea class="f-area" data-reason maxlength="300" placeholder="Blocked by a dependency"></textarea>
    </div>`);
    const when = whenBlock(start, d => { due = d; });
    body.querySelector('[data-when]').appendChild(when.el);
    const foot = el(`<button class="btn-primary">${icon('calendar-repeat')}Reschedule</button>`);
    const s = P.sheet({ title: 'Reschedule', body, foot });
    foot.addEventListener('click', () => {
      const reason = body.querySelector('[data-reason]').value.trim();
      Store.mutate(d => Engine.rescheduleTask(d, id, due, reason), { undoable: true });
      P.haptic.success();
      P.snack({ title: 'Rescheduled', body: `${task.title} · due ${UI.fmtDay(due)}, ${UI.fmtTime(due)}`, icon: 'calendar-repeat', undo: true });
      s.close();
    });
  }

  M.PhoneTasks = { cardHtml, listHtml, bindList, complete, openDetail, openEditor, openReschedule };
})();
