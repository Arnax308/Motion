/* ==========================================================================
   CATEGORIES VIEW — manage categories, their colour, icon and PP weight.
   ========================================================================== */

(function () {
  const M = window.Motion;
  const { UI, Store } = M;
  const { esc, icon } = UI;

  let root;

  function init(pageEl) {
    root = pageEl;
    root.addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const id = btn.closest('[data-id]') ? btn.closest('[data-id]').dataset.id : null;
      if (btn.dataset.act === 'new') openEditor(null);
      else if (btn.dataset.act === 'edit') openEditor(id);
      else if (btn.dataset.act === 'delete') remove(id);
      else if (btn.dataset.act === 'toggle') toggle(id);
    });
  }

  function stats(data, name) {
    const n = name.toLowerCase();
    const hist = data.history.filter(h => (h.category || '').toLowerCase() === n);
    const done = hist.filter(h => h.status === 'completed').length;
    const missed = hist.filter(h => h.status === 'missed').length;
    return {
      active: data.active_tasks.filter(t => (t.category || '').toLowerCase() === n).length,
      done,
      rate: done + missed ? Math.round(done / (done + missed) * 100) + '%' : '—'
    };
  }

  function render() {
    const data = Store.get();
    root.innerHTML = `
      <header class="page-head">
        <h1>Categories</h1><span class="sub">${data.categories.length} total · weights multiply the PP you earn</span>
        <span class="grow"></span>
        <button class="btn btn-primary" data-act="new">${icon('plus')}New category</button>
      </header>
      <div class="page-body"><div class="cat-grid">
        ${data.categories.map(c => {
          const s = stats(data, c.name);
          const on = c.active !== false;
          return `<div class="cat-card ${on ? '' : 'inactive'}" data-id="${esc(c.id)}">
            <div class="cat-top">
              <div class="cat-icon" style="background:${esc(c.color)}22;color:${esc(c.color)}">${icon(c.icon || 'tag')}</div>
              <div style="min-width:0"><div class="cat-name">${esc(c.name)}</div><div class="cat-weight">${c.weight}× PP</div></div>
              <button class="switch ${on ? 'on' : ''}" data-act="toggle" role="switch" aria-checked="${on}" title="${on ? 'Shown when adding tasks' : 'Hidden when adding tasks'}"></button>
            </div>
            <div class="cat-stats">
              <div>${s.active}<small>active</small></div>
              <div>${s.done}<small>done</small></div>
              <div>${s.rate}<small>success</small></div>
            </div>
            <div class="cat-actions">
              <button class="icon-btn" data-act="edit" title="Edit">${icon('pencil')}</button>
              <button class="icon-btn danger" data-act="delete" title="Delete">${icon('trash')}</button>
            </div>
          </div>`;
        }).join('')}
        <button class="cat-card cat-new" data-act="new">${icon('plus')}New category</button>
      </div></div>`;
  }

  function toggle(id) {
    Store.mutate(d => {
      const c = d.categories.find(x => x.id === id);
      if (c) c.active = c.active === false;
      return c;
    });
  }

  async function remove(id) {
    const data = Store.get();
    const cat = data.categories.find(c => c.id === id);
    if (!cat) return;
    if (data.categories.length <= 1) {
      UI.toast({ title: 'Keep at least one category', body: 'Add another category before deleting this one.', icon: 'alert-triangle', tone: 'danger' });
      return;
    }
    const s = stats(data, cat.name);
    const ok = await UI.confirm({
      title: `Delete ${cat.name}?`,
      html: s.active
        ? (s.active === 1
          ? '1 active task uses it. It’ll keep the name but earn PP at 1× weight. Your history is kept.'
          : `${s.active} active tasks use it. They’ll keep the name but earn PP at 1× weight. Your history is kept.`)
        : 'Your history for this category is kept.',
      confirmLabel: 'Delete',
      danger: true
    });
    if (!ok) return;
    Store.mutate(d => {
      d.categories = d.categories.filter(c => c.id !== id);
      return true;
    }, { undoable: true });
    if (M.State.category === cat.name) M.App.setCategory(null);
    UI.toast({ title: 'Category deleted', body: cat.name, icon: 'trash', tone: 'danger', undo: true });
  }

  function openEditor(id) {
    const data = Store.get();
    const existing = id ? data.categories.find(c => c.id === id) : null;
    const draft = existing
      ? { name: existing.name, icon: existing.icon || 'tag', color: existing.color, weight: parseFloat(existing.weight) || 1 }
      : { name: '', icon: 'tag', color: M.COLORS[data.categories.length % M.COLORS.length], weight: 1 };

    const body = UI.el(`<div style="display:flex;flex-direction:column;gap:16px">
      <div class="cat-preview"><div class="cat-icon" data-prev-icon></div><div><div class="cat-name" data-prev-name></div><div class="cat-weight" data-prev-weight></div></div></div>
      <div class="field"><label class="field-label" for="cat-name">Name</label>
        <input id="cat-name" class="input" maxlength="40" placeholder="Side projects" value="${esc(draft.name)}"><span class="field-error" hidden></span></div>
      <div class="field"><span class="field-label">Icon</span>
        <div class="icon-grid">${M.ICONS.map(n => `<button type="button" data-icon="${n}" title="${n}">${icon(n)}</button>`).join('')}</div></div>
      <div class="field"><span class="field-label">Colour</span>
        <div class="swatches">${M.COLORS.map(c => `<button type="button" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div></div>
      <div class="field"><div style="display:flex;justify-content:space-between"><label class="field-label" for="cat-weight">PP weight</label><span class="mono" data-weight-val></span></div>
        <input id="cat-weight" type="range" min="0.5" max="3" step="0.1" value="${draft.weight}">
        <span class="field-hint">Every task in this category earns PP multiplied by this.</span></div>
    </div>`);

    const nameInput = body.querySelector('#cat-name');
    const weightInput = body.querySelector('#cat-weight');
    const refresh = () => {
      const prevIcon = body.querySelector('[data-prev-icon]');
      prevIcon.style.background = `${draft.color}22`;
      prevIcon.style.color = draft.color;
      prevIcon.innerHTML = icon(draft.icon);
      body.querySelector('[data-prev-name]').textContent = draft.name || 'New category';
      body.querySelector('[data-prev-weight]').textContent = `${draft.weight.toFixed(1)}× PP`;
      body.querySelector('[data-weight-val]').textContent = `${draft.weight.toFixed(1)}×`;
      body.querySelectorAll('[data-icon]').forEach(b => b.classList.toggle('on', b.dataset.icon === draft.icon));
      body.querySelectorAll('[data-color]').forEach(b => b.classList.toggle('on', b.dataset.color.toLowerCase() === draft.color.toLowerCase()));
    };
    nameInput.addEventListener('input', () => { draft.name = nameInput.value; body.querySelector('.field-error').hidden = true; refresh(); });
    weightInput.addEventListener('input', () => { draft.weight = parseFloat(weightInput.value); refresh(); });
    body.querySelectorAll('[data-icon]').forEach(b => b.addEventListener('click', () => { draft.icon = b.dataset.icon; refresh(); }));
    body.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => { draft.color = b.dataset.color; refresh(); }));
    refresh();

    UI.dialog({
      title: existing ? 'Edit category' : 'New category', icon: 'tags', body, width: 460,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: existing ? 'Save' : 'Create', kind: 'primary', onClick: () => {
            const name = draft.name.trim();
            const err = body.querySelector('.field-error');
            const clash = Store.get().categories.find(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== id);
            if (!name || clash) {
              err.textContent = name ? 'That name’s already taken. Try another.' : 'Enter a name.';
              err.hidden = false;
              nameInput.focus();
              return false;
            }
            const weight = Math.round(draft.weight * 10) / 10;
            if (existing) {
              Store.mutate(d => {
                const c = d.categories.find(x => x.id === id);
                if (!c) return null;
                const oldName = c.name;
                Object.assign(c, { name, icon: draft.icon, color: draft.color, weight });
                if (oldName !== name) {
                  d.active_tasks.forEach(t => { if (t.category === oldName) t.category = name; });
                  d.history.forEach(h => { if (h.category === oldName) h.category = name; });
                  if (M.State.category === oldName) M.State.category = name;
                }
                return c;
              }, { undoable: true });
              UI.toast({ title: 'Category updated', body: name, icon: 'pencil', undo: true });
            } else {
              Store.mutate(d => {
                d.categories.push({ id: `cat-${Date.now()}`, name, subtext: '', icon: draft.icon, color: draft.color, weight, active: true });
                return true;
              }, { undoable: true });
              UI.toast({ title: 'Category created', body: `${name} · ${weight}× PP`, icon: 'tags', undo: true });
            }
          }
        }
      ]
    });
  }

  M.Views = M.Views || {};
  M.Views.categories = { init, render, openEditor };
})();
