/* ==========================================================================
   MOTION PHONE KIT — sheets, snackbar, swipe rows, pull to refresh, haptics.
   ========================================================================== */

(function () {
  const M = window.Motion;
  const { UI } = M;
  const { esc, icon, el } = UI;
  const Cap = window.Capacitor;
  const Haptics = Cap && Cap.isNativePlatform && Cap.isNativePlatform() ? Cap.Plugins.Haptics : null;

  // HAPTICS (no-ops in the browser)
  const haptic = {
    tap() { if (Haptics) Haptics.impact({ style: 'LIGHT' }).catch(() => {}); },
    bump() { if (Haptics) Haptics.impact({ style: 'MEDIUM' }).catch(() => {}); },
    success() { if (Haptics) Haptics.notification({ type: 'SUCCESS' }).catch(() => {}); },
    warn() { if (Haptics) Haptics.notification({ type: 'WARNING' }).catch(() => {}); }
  };

  // TIME LABELS
  function relDue(deadline, now) {
    now = now || new Date();
    const d = new Date(deadline);
    const diff = d - now;
    const bucket = M.Engine.bucketFor(d, now);
    if (bucket === 'overdue') return { text: `${UI.fmtDuration(diff)} late`, cls: 'late' };
    if (diff <= 3 * 3600 * 1000) return { text: `in ${UI.fmtDuration(diff)}`, cls: 'soon' };
    if (bucket === 'today') return { text: UI.fmtTime(d), cls: '' };
    if (bucket === 'tomorrow') return { text: `Tmrw ${UI.fmtTime(d)}`, cls: '' };
    if (bucket === 'week') return { text: `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${UI.fmtTime(d)}`, cls: '' };
    return { text: UI.fmtShortDate(d), cls: '' };
  }

  function fullDue(deadline, now) {
    const d = new Date(deadline);
    const diff = d - (now || new Date());
    const when = `${UI.fmtDay(d)}, ${UI.fmtTime(d)}`;
    return diff < 0 ? `${when} · ${UI.fmtDuration(diff)} ago` : `${when} · in ${UI.fmtDuration(diff)}`;
  }

  // SHEETS — bottom sheets with a drag handle; the newest one closes first
  const sheets = [];

  function sheet(opts) {
    const wrap = el(`<div class="sheet-wrap">
      <div class="sheet-backdrop"></div>
      <div class="sheet${opts.full ? ' full' : ''}" role="dialog" aria-modal="true">
        <div class="sheet-handle"></div>
        ${opts.title !== undefined ? `<div class="sheet-head"><h2>${esc(opts.title)}</h2>
          <button class="p-icon-btn" data-close aria-label="Close">${icon('x')}</button></div>` : ''}
        <div class="sheet-body"></div>
        ${opts.foot ? '<div class="sheet-foot"></div>' : ''}
      </div></div>`);
    const panel = wrap.querySelector('.sheet');
    const body = wrap.querySelector('.sheet-body');
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);
    const foot = wrap.querySelector('.sheet-foot');
    if (foot) {
      if (typeof opts.foot === 'string') foot.innerHTML = opts.foot;
      else foot.appendChild(opts.foot);
    }

    const state = { el: wrap, body, foot, panel, closed: false };
    state.close = () => {
      if (state.closed) return;
      state.closed = true;
      const i = sheets.indexOf(state);
      if (i !== -1) sheets.splice(i, 1);
      if (document.activeElement) document.activeElement.blur();
      wrap.classList.add('closing');
      setTimeout(() => wrap.remove(), 260);
      if (opts.onClose) opts.onClose();
    };

    wrap.querySelector('.sheet-backdrop').addEventListener('click', state.close);
    const closeBtn = wrap.querySelector('[data-close]');
    if (closeBtn) closeBtn.addEventListener('click', state.close);

    // Drag the handle or header down to dismiss
    let startY = null;
    let dy = 0;
    const grab = e => {
      if (e.target.closest('button, input')) return;
      startY = e.clientY;
      dy = 0;
      panel.classList.add('dragging');
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* pointer already released */ }
    };
    const move = e => {
      if (startY === null) return;
      dy = Math.max(0, e.clientY - startY);
      panel.style.transform = `translateY(${dy}px)`;
    };
    const release = () => {
      if (startY === null) return;
      startY = null;
      panel.classList.remove('dragging');
      panel.style.transform = '';
      if (dy > 110) state.close();
    };
    wrap.querySelectorAll('.sheet-handle, .sheet-head').forEach(h => {
      h.addEventListener('pointerdown', grab);
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', release);
      h.addEventListener('pointercancel', release);
    });

    document.body.appendChild(wrap);
    sheets.push(state);
    if (opts.focus) setTimeout(() => { const f = body.querySelector(opts.focus); if (f) f.focus(); }, 320);
    return state;
  }

  function closeTopSheet() {
    if (!sheets.length) return false;
    sheets[sheets.length - 1].close();
    return true;
  }

  function confirmSheet(opts) {
    return new Promise(resolve => {
      let answered = false;
      const body = el(`<div>
        <p style="color:var(--text-2);margin:4px 0 18px">${opts.html || esc(opts.text)}</p>
        <button class="${opts.danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(opts.confirmLabel || 'Confirm')}</button>
        <button class="btn-text" data-no style="margin-top:6px">Cancel</button>
      </div>`);
      const s = sheet({ title: opts.title, body, onClose: () => { if (!answered) resolve(false); } });
      body.querySelector('[data-yes]').addEventListener('click', () => { answered = true; resolve(true); s.close(); });
      body.querySelector('[data-no]').addEventListener('click', s.close);
    });
  }

  // SNACKBAR — replaces the shared toast, so store and alert messages show here too
  let snackTimer = null;
  let currentSnack = null;

  function snack(opts) {
    if (currentSnack) currentSnack.remove();
    clearTimeout(snackTimer);
    const s = el(`<div class="snack ${opts.tone || ''}${sheets.length ? ' above-sheet' : ''}" role="status">
      <div class="s-ic">${icon(opts.icon || 'bolt')}</div>
      <div class="s-text"><div class="s-title">${esc(opts.title)}</div>${opts.body ? `<div class="s-body">${esc(opts.body)}</div>` : ''}</div>
      ${opts.undo ? '<button class="s-undo">UNDO</button>' : ''}
    </div>`);
    const dismiss = () => {
      if (!s.isConnected) return;
      s.classList.add('out');
      setTimeout(() => s.remove(), 200);
    };
    if (opts.undo) {
      s.querySelector('.s-undo').addEventListener('click', () => {
        haptic.tap();
        dismiss();
        if (M.Store.undo()) snack({ title: 'Undone', icon: 'arrow-back-up', tone: 'info', duration: 1800 });
      });
    }
    document.body.appendChild(s);
    currentSnack = s;
    snackTimer = setTimeout(dismiss, opts.duration || 4500);
    return dismiss;
  }
  UI.toast = snack;

  // SWIPE ROWS — right to complete, left to reveal Defer and Reschedule, tap for details
  const COMPLETE_AT = 96;
  const OPEN_AT = 60;
  const OPEN_X = -150;

  function bindSwipe(container, handlers) {
    let drag = null;
    let openCard = null;
    let suppressClick = false;

    const setX = (card, x) => { card.querySelector('.tcard-body').style.transform = x ? `translateX(${x}px)` : ''; };
    const closeOpen = () => {
      if (!openCard) return;
      setX(openCard, 0);
      openCard.classList.remove('open');
      openCard = null;
    };

    container.addEventListener('pointerdown', e => {
      const body = e.target.closest('.tcard-body');
      if (!body || e.target.closest('.tcheck')) return;
      const card = body.closest('.tcard');
      drag = { card, x0: e.clientX, y0: e.clientY, dx: 0, mode: null, base: card === openCard ? OPEN_X : 0, armed: false, pid: e.pointerId };
    });

    container.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.pid) return;
      const dx = e.clientX - drag.x0;
      const dy = e.clientY - drag.y0;
      if (!drag.mode) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        drag.mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
        if (drag.mode === 'v') { drag = null; return; }
        if (openCard && openCard !== drag.card) closeOpen();
        drag.card.classList.add('dragging');
        try { drag.card.setPointerCapture(e.pointerId); } catch (err) { /* pointer already released */ }
      }
      let x = drag.base + dx;
      if (x > 0) x = Math.min(x, 150);
      if (x < OPEN_X) x = OPEN_X + (x - OPEN_X) * 0.3;
      drag.dx = x;
      setX(drag.card, x);
      drag.card.classList.toggle('swiping-right', x > 0);
      const armed = x > COMPLETE_AT;
      if (armed !== drag.armed) {
        drag.armed = armed;
        drag.card.classList.toggle('armed', armed);
        if (armed) haptic.tap();
      }
    });

    const end = e => {
      if (!drag || (e && e.pointerId !== drag.pid)) return;
      const { card, mode, dx } = drag;
      drag = null;
      if (mode !== 'h') return;
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 50);
      card.classList.remove('dragging', 'armed');
      if (dx > COMPLETE_AT) {
        handlers.onComplete(card.dataset.id, card);
        return;
      }
      card.classList.remove('swiping-right');
      if (dx < -OPEN_AT) {
        setX(card, OPEN_X);
        card.classList.add('open');
        openCard = card;
        haptic.tap();
      } else {
        setX(card, 0);
        if (openCard === card) { card.classList.remove('open'); openCard = null; }
      }
    };
    container.addEventListener('pointerup', end);
    container.addEventListener('pointercancel', e => {
      if (drag && drag.card && drag.pid === e.pointerId) { setX(drag.card, drag.base); drag.card.classList.remove('dragging', 'swiping-right', 'armed'); }
      drag = null;
    });

    container.addEventListener('click', e => {
      if (suppressClick) return;
      const card = e.target.closest('.tcard');
      if (!card) { closeOpen(); return; }
      const id = card.dataset.id;
      const act = e.target.closest('[data-act]');
      if (act) {
        closeOpen();
        if (act.dataset.act === 'check') handlers.onComplete(id, card);
        else if (act.dataset.act === 'defer') handlers.onDefer(id);
        else if (act.dataset.act === 'resched') handlers.onReschedule(id);
        return;
      }
      if (card === openCard) { closeOpen(); return; }
      closeOpen();
      handlers.onTap(id);
    });
  }

  // PULL TO REFRESH on a scrolling screen
  function bindPullToRefresh(scroller, onRefresh) {
    const ptr = el(`<div class="ptr">${icon('arrow-down')}</div>`);
    scroller.prepend(ptr);
    let y0 = null;
    let pull = 0;
    scroller.addEventListener('touchstart', e => { y0 = scroller.scrollTop <= 0 ? e.touches[0].clientY : null; pull = 0; }, { passive: true });
    scroller.addEventListener('touchmove', e => {
      if (y0 === null) return;
      pull = Math.max(0, (e.touches[0].clientY - y0) * 0.5);
      ptr.style.transition = 'none';
      ptr.style.height = `${Math.min(pull, 80)}px`;
      const ready = pull > 60;
      if (ready && !ptr.classList.contains('ready')) haptic.tap();
      ptr.classList.toggle('ready', ready);
    }, { passive: true });
    scroller.addEventListener('touchend', async () => {
      if (y0 === null) return;
      y0 = null;
      ptr.style.transition = '';
      if (pull > 60) {
        ptr.classList.remove('ready');
        ptr.classList.add('spinning');
        ptr.innerHTML = icon('refresh');
        ptr.style.height = '48px';
        await Promise.resolve(onRefresh()).catch(() => {});
        ptr.classList.remove('spinning');
        ptr.innerHTML = icon('arrow-down');
      }
      ptr.style.height = '0';
    });
  }

  function ppFloat(anchor, text) {
    const r = anchor.getBoundingClientRect();
    const f = el(`<div class="pp-float">${esc(text)}</div>`);
    f.style.left = `${r.left}px`;
    f.style.top = `${r.top - 8}px`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1200);
  }

  function celebrate(level, title) {
    haptic.success();
    const colors = ['#8B5CF6', '#A78BFA', '#F5B544', '#34D399', '#60A5FA', '#F472B6'];
    const confetti = Array.from({ length: 40 }, (_, i) =>
      `<i class="confetti" style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-duration:${1.6 + Math.random() * 1.6}s;animation-delay:${Math.random() * 0.4}s"></i>`).join('');
    const overlay = el(`<div class="levelup">${confetti}
      <div class="levelup-card">
        <div class="ring" style="--p:100"><b>${level}</b></div>
        <h2>Level up</h2>
        <h1>${esc(title)}</h1>
        <p>You reached level ${level}. Keep the momentum going.</p>
        <button class="btn-primary" style="width:200px;margin:0 auto">Let’s go</button>
      </div></div>`);
    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
  }

  M.P = { haptic, relDue, fullDue, sheet, closeTopSheet, confirmSheet, snack, bindSwipe, bindPullToRefresh, ppFloat, celebrate };
})();
