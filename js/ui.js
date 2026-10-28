/* ==========================================================================
   MOTION UI KIT — formatting, popovers, menus, dialogs, toasts, date picker.
   ========================================================================== */

(function () {
  const M = window.Motion;

  M.ICONS = [
    'code', 'terminal-2', 'device-laptop', 'briefcase', 'chart-line', 'cash', 'book', 'school', 'brain',
    'bulb', 'pencil', 'language', 'flask', 'activity', 'run', 'barbell', 'bike', 'swimming', 'heart',
    'users', 'microphone', 'square-check', 'home', 'coffee', 'moon', 'leaf', 'music',
    'palette', 'camera', 'plane', 'shopping-cart', 'tools', 'category', 'tag', 'star', 'target', 'flame'
  ];

  M.COLORS = ['#8B5CF6', '#60A5FA', '#38BDF8', '#34D399', '#A3E635', '#F5B544', '#FB923C', '#F87171', '#F472B6', '#94A3B8'];

  // FORMATTING
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function icon(name, extra) {
    return `<i class="ti ti-${name}${extra ? ' ' + extra : ''}" aria-hidden="true"></i>`;
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  const fmtNum = n => Math.round(n).toLocaleString('en-US');
  const fmtTime = d => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const fmtDay = d => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtShortDate = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const fmtMonth = (y, m) => new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  function fmtDuration(ms) {
    const mins = Math.max(0, Math.round(Math.abs(ms) / 60000));
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return mins % 60 ? `${hours}h ${mins % 60}m` : `${hours}h`;
    const days = Math.floor(hours / 24);
    return hours % 24 ? `${days}d ${hours % 24}h` : `${days}d`;
  }

  function fmtSigned(n) {
    return (n > 0 ? '+' : n < 0 ? '−' : '') + fmtNum(Math.abs(n));
  }

  function toHHMM(d) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // POPOVERS
  let currentPopover = null;

  function closePopover() {
    if (!currentPopover) return false;
    const p = currentPopover;
    currentPopover = null;
    p.el.remove();
    document.removeEventListener('mousedown', p.outside, true);
    window.removeEventListener('resize', p.close);
    if (p.anchor) p.anchor.classList.remove('open');
    if (p.onClose) p.onClose();
    return true;
  }

  function positionPopover(pop, anchor) {
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    const hgt = pop.offsetHeight;
    let left = Math.min(r.left, window.innerWidth - w - 12);
    let top = r.bottom + 6;
    if (top + hgt > window.innerHeight - 12) top = Math.max(12, r.top - hgt - 6);
    pop.style.left = `${Math.max(12, left)}px`;
    pop.style.top = `${top}px`;
  }

  function popover(anchor, content, opts) {
    opts = opts || {};
    const sameAnchor = currentPopover && currentPopover.anchor === anchor;
    closePopover();
    if (sameAnchor && !opts.force) return null; // clicking the trigger again toggles it shut

    const pop = document.createElement('div');
    pop.className = 'popover' + (opts.padded ? ' popover-pad' : '');
    if (typeof content === 'string') pop.innerHTML = content;
    else pop.appendChild(content);
    document.body.appendChild(pop);
    positionPopover(pop, anchor);
    anchor.classList.add('open');

    const state = {
      el: pop,
      anchor,
      onClose: opts.onClose,
      close: closePopover,
      reposition: () => positionPopover(pop, anchor),
      outside: e => {
        if (!pop.contains(e.target) && !anchor.contains(e.target)) closePopover();
      }
    };
    currentPopover = state;
    setTimeout(() => document.addEventListener('mousedown', state.outside, true));
    window.addEventListener('resize', state.close);
    const focusable = opts.autofocus === false ? null : pop.querySelector('[autofocus], input, textarea');
    if (focusable) setTimeout(() => focusable.focus());
    return state;
  }

  // items: [{ label, icon, hint, active, danger, onSelect } | 'sep']
  function menu(anchor, items, opts) {
    const wrap = document.createElement('div');
    items.forEach(item => {
      if (item === 'sep') {
        wrap.appendChild(el('<div class="menu-sep"></div>'));
        return;
      }
      const btn = el(`<button class="menu-item${item.active ? ' active' : ''}${item.danger ? ' danger' : ''}">
        ${item.dot ? `<span class="dot" style="background:${esc(item.dot)}"></span>` : ''}
        ${item.icon ? icon(item.icon) : ''}<span>${esc(item.label)}</span>
        ${item.hint ? `<span class="hint">${esc(item.hint)}</span>` : ''}
      </button>`);
      btn.addEventListener('click', () => {
        closePopover();
        item.onSelect();
      });
      wrap.appendChild(btn);
    });
    return popover(anchor, wrap, opts);
  }

  // DIALOGS
  const dialogs = [];

  function dialog(opts) {
    const overlay = el(`<div class="dialog-overlay">
      <div class="dialog" role="dialog" aria-modal="true" style="${opts.width ? `width:${opts.width}px` : ''}">
        <div class="dialog-head">${opts.icon ? icon(opts.icon) : ''}<h2>${esc(opts.title)}</h2>
          <button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
        <div class="dialog-body"></div>
        <div class="dialog-foot"></div>
      </div></div>`);
    const body = overlay.querySelector('.dialog-body');
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);

    const state = { el: overlay, body, close: null };
    state.close = () => {
      const i = dialogs.indexOf(state);
      if (i === -1) return;
      dialogs.splice(i, 1);
      closePopover();
      overlay.remove();
      if (opts.onClose) opts.onClose();
    };

    const foot = overlay.querySelector('.dialog-foot');
    (opts.actions || []).forEach(a => {
      const btn = el(`<button class="btn ${a.kind ? 'btn-' + a.kind : ''}">${a.icon ? icon(a.icon) : ''}${esc(a.label)}</button>`);
      btn.addEventListener('click', () => {
        const keepOpen = a.onClick ? a.onClick(state) === false : false;
        if (!keepOpen) state.close();
      });
      foot.appendChild(btn);
    });
    if (!opts.actions || !opts.actions.length) foot.remove();

    overlay.querySelector('[data-close]').addEventListener('click', state.close);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) state.close(); });
    // Enter in a single-line input triggers the primary action
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'button') {
        const primary = foot.querySelector('.btn-primary, .btn-danger');
        if (primary) { e.preventDefault(); primary.click(); }
      }
    });

    document.body.appendChild(overlay);
    dialogs.push(state);
    const first = overlay.querySelector('[autofocus]') || overlay.querySelector('.dialog-body input, .dialog-body textarea');
    if (first) setTimeout(() => first.focus());
    return state;
  }

  function confirm(opts) {
    return new Promise(resolve => {
      let answered = false;
      dialog({
        title: opts.title,
        body: `<p class="dialog-text">${opts.html || esc(opts.text)}</p>`,
        width: 400,
        onClose: () => { if (!answered) resolve(false); },
        actions: [
          { label: 'Cancel', kind: 'ghost' },
          { label: opts.confirmLabel || 'Confirm', kind: opts.danger ? 'danger' : 'primary', onClick: () => { answered = true; resolve(true); } }
        ]
      });
    });
  }

  // Esc closes the topmost layer first
  function closeTop() {
    if (closePopover()) return true;
    if (dialogs.length) {
      dialogs[dialogs.length - 1].close();
      return true;
    }
    return false;
  }

  const isLayerOpen = () => !!currentPopover || dialogs.length > 0;

  // TOASTS
  function toast(opts) {
    const container = document.getElementById('toasts');
    const t = el(`<div class="toast ${opts.tone || ''}" role="status">
      <div class="toast-icon">${icon(opts.icon || 'bolt')}</div>
      <div class="toast-text"><div class="toast-title">${esc(opts.title)}</div>
        ${opts.body ? `<div class="toast-body">${esc(opts.body)}</div>` : ''}</div>
      ${opts.undo ? '<button class="toast-undo">Undo</button>' : ''}
    </div>`);
    const dismiss = () => {
      if (!t.isConnected) return;
      t.classList.add('out');
      setTimeout(() => t.remove(), 200);
    };
    if (opts.undo) {
      t.querySelector('.toast-undo').addEventListener('click', () => {
        dismiss();
        if (M.Store.undo()) toast({ title: 'Undone', icon: 'arrow-back-up', tone: 'info', duration: 2000 });
      });
    }
    container.appendChild(t);
    while (container.children.length > 4) container.firstElementChild.remove();
    let timer = setTimeout(dismiss, opts.duration || 5000);
    t.addEventListener('mouseenter', () => clearTimeout(timer));
    t.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 2000); });
    return dismiss;
  }

  function ppFloat(anchorEl, text) {
    const r = anchorEl.getBoundingClientRect();
    const f = el(`<div class="pp-float">${esc(text)}</div>`);
    f.style.left = `${r.left - 4}px`;
    f.style.top = `${r.top - 6}px`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1200);
  }

  // WHEN PICKER — quick days, time presets, typed time and a calendar
  const TIME_PRESETS = [['09:00', '9 AM'], ['12:00', '12 PM'], ['18:00', '6 PM'], ['21:00', '9 PM'], ['23:59', '11:59']];

  function nextWeekend(now) {
    const d = M.Engine.startOfDay(now);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) return d;
    return M.Engine.addDays(d, 6 - dow);
  }

  // The next preset time that's at least 30 minutes away, used as the default due time
  function defaultDue(now) {
    now = now || new Date();
    for (const [hhmm] of TIME_PRESETS) {
      const [h, m] = hhmm.split(':').map(Number);
      const d = new Date(now);
      d.setHours(h, m, 0, 0);
      if (d - now >= 30 * 60000) return d;
    }
    const d = M.Engine.addDays(M.Engine.startOfDay(now), 1);
    d.setHours(18, 0, 0, 0);
    return d;
  }

  function whenPicker(opts) {
    const Engine = M.Engine;
    let value = new Date(opts.value);
    let calOpen = false;
    let calMonth = new Date(value.getFullYear(), value.getMonth(), 1);

    const root = el(`<div class="when">
      <div class="when-days"></div>
      <div class="when-cal" hidden></div>
      <div class="when-times"></div>
      <div class="when-time-row">${icon('clock', 'muted')}<input class="input" type="time" required></div>
      <div class="when-summary"></div>
    </div>`);
    const daysEl = root.querySelector('.when-days');
    const calEl = root.querySelector('.when-cal');
    const timesEl = root.querySelector('.when-times');
    const timeInput = root.querySelector('input[type="time"]');
    const summaryEl = root.querySelector('.when-summary');

    function setDate(day) {
      const d = new Date(day);
      d.setHours(value.getHours(), value.getMinutes(), 0, 0);
      value = d;
      changed();
    }

    function setTime(hhmm) {
      const [h, m] = hhmm.split(':').map(Number);
      const d = new Date(value);
      d.setHours(h, m, 0, 0);
      value = d;
      changed();
    }

    function changed() {
      render();
      if (opts.onChange) opts.onChange(new Date(value));
    }

    function render() {
      const now = new Date();
      const today = Engine.startOfDay(now);
      const quick = [
        ['Today', today],
        ['Tomorrow', Engine.addDays(today, 1)],
        ['Weekend', nextWeekend(now)]
      ];
      const selectedKey = Engine.dateKey(value);
      const quickMatch = quick.some(([, d]) => Engine.dateKey(d) === selectedKey);
      const showCal = calOpen || !quickMatch;

      daysEl.innerHTML = quick.map(([label, d], i) =>
        `<button type="button" data-day="${i}" class="${!showCal && Engine.dateKey(d) === selectedKey ? 'on' : ''}">${label}<small>${d.toLocaleDateString('en-US', { weekday: 'short' })}</small></button>`
      ).join('') + `<button type="button" data-pick class="${showCal ? 'on' : ''}">${icon('calendar')}<small>Pick</small></button>`;
      daysEl.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => {
        calOpen = false;
        setDate(quick[+b.dataset.day][1]);
      }));
      daysEl.querySelector('[data-pick]').addEventListener('click', () => {
        calOpen = !showCal || !quickMatch ? true : false;
        render();
      });

      calEl.hidden = !showCal;
      if (showCal) renderCalendar(today);

      const hhmm = toHHMM(value);
      timesEl.innerHTML = TIME_PRESETS.map(([v, label]) => `<button type="button" data-t="${v}" class="${v === hhmm ? 'on' : ''}">${label}</button>`).join('');
      timesEl.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => setTime(b.dataset.t)));
      if (document.activeElement !== timeInput) timeInput.value = hhmm;

      const diff = value - now;
      summaryEl.className = 'when-summary' + (diff < 0 ? ' warn' : '');
      summaryEl.textContent = diff < 0
        ? `${fmtDay(value)}, ${fmtTime(value)} has already passed`
        : `Due ${fmtDay(value)}, ${fmtTime(value)} · in ${fmtDuration(diff)}`;
      if (currentPopover && currentPopover.el.contains(root)) currentPopover.reposition();
    }

    function renderCalendar(today) {
      const y = calMonth.getFullYear();
      const m = calMonth.getMonth();
      const first = new Date(y, m, 1);
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const lead = (first.getDay() + 6) % 7;
      const atCurrentMonth = y === today.getFullYear() && m === today.getMonth();
      let cells = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => `<span class="wd">${d}</span>`).join('');
      for (let i = 0; i < lead; i++) cells += '<span></span>';
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(y, m, day);
        const cls = [Engine.dateKey(d) === Engine.dateKey(value) ? 'on' : '', Engine.dateKey(d) === Engine.dateKey(today) ? 'today' : ''].join(' ');
        cells += `<button type="button" data-d="${day}" class="${cls}" ${d < today ? 'disabled' : ''}>${day}</button>`;
      }
      calEl.innerHTML = `<div class="cal-head">
          <button type="button" class="icon-btn" data-prev ${atCurrentMonth ? 'disabled' : ''} aria-label="Previous month">${icon('chevron-left')}</button>
          <span>${fmtMonth(y, m)}</span>
          <button type="button" class="icon-btn" data-next aria-label="Next month">${icon('chevron-right')}</button>
        </div><div class="cal-grid">${cells}</div>`;
      calEl.querySelector('[data-prev]').addEventListener('click', () => { calMonth = new Date(y, m - 1, 1); calOpen = true; render(); });
      calEl.querySelector('[data-next]').addEventListener('click', () => { calMonth = new Date(y, m + 1, 1); calOpen = true; render(); });
      calEl.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => {
        calOpen = true;
        setDate(new Date(y, m, +b.dataset.d));
      }));
    }

    timeInput.addEventListener('change', () => { if (timeInput.value) setTime(timeInput.value); });
    render();
    return { el: root, get: () => new Date(value) };
  }

  M.UI = {
    esc, icon, el,
    fmtNum, fmtTime, fmtDay, fmtShortDate, fmtMonth, fmtDuration, fmtSigned, toHHMM,
    popover, closePopover, menu, dialog, confirm, closeTop, isLayerOpen,
    toast, ppFloat, whenPicker, defaultDue
  };
})();
