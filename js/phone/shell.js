/* ==========================================================================
   MOTION PHONE SHELL — tabs, pushed screens, back button, status bar, start-up.
   ========================================================================== */

(function () {
  const M = window.Motion;
  const { UI, Store, P, PhoneScreens, PhoneMe, PhoneTasks } = M;
  const { icon } = UI;
  const Cap = window.Capacitor;
  const StatusBar = Cap && Cap.isNativePlatform && Cap.isNativePlatform() ? Cap.Plugins.StatusBar : null;

  const TABS = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'tasks', label: 'Tasks', icon: 'list-check' },
    { id: 'new' },
    { id: 'stats', label: 'Stats', icon: 'chart-dots-3' },
    { id: 'me', label: 'You', icon: 'user-circle' }
  ];
  const screens = { home: PhoneScreens.home, tasks: PhoneScreens.tasks, stats: PhoneScreens.stats, me: PhoneMe.me };
  const sections = {};
  const stale = new Set();
  const stack = [];
  const pushed = {};
  let current = 'home';

  const $ = sel => document.querySelector(sel);

  function renderNav() {
    $('.p-nav').innerHTML = TABS.map(t => t.id === 'new'
      ? `<button class="p-fab" data-tab="new" aria-label="New task">${icon('plus')}</button>`
      : `<button class="${current === t.id ? 'on' : ''}" data-tab="${t.id}">${icon(t.icon)}<span>${t.label}</span></button>`).join('');
  }

  function renderScreen(id) {
    screens[id].render();
    stale.delete(id);
  }

  function renderAll() {
    renderScreen(current);
    Object.keys(screens).forEach(id => { if (id !== current) stale.add(id); });
    if (stack.length) stack[stack.length - 1].screen.render();
  }

  function tab(id) {
    if (id === 'new') { P.haptic.tap(); PhoneTasks.openEditor(); return; }
    while (stack.length) popScreen();
    if (id === current) { sections[id].scrollTo({ top: 0, behavior: 'smooth' }); return; }
    P.haptic.tap();
    current = id;
    Object.keys(sections).forEach(k => sections[k].classList.toggle('on', k === id));
    if (stale.has(id)) renderScreen(id);
    renderNav();
  }

  // Pushed screens are built once and reused, so their listeners aren't duplicated
  function push(name) {
    const screen = PhoneMe.screens[name];
    let el = pushed[name];
    if (!el) {
      el = document.createElement('div');
      el.className = 'p-stack-screen';
      screen.init(el);
      el.addEventListener('click', e => { if (e.target.closest('[data-back]')) back(); });
      pushed[name] = el;
    }
    el.classList.remove('out');
    el.scrollTop = 0;
    $('.p-app').appendChild(el);
    screen.render();
    stack.push({ name, el, screen });
    P.haptic.tap();
  }

  function popScreen() {
    const top = stack.pop();
    if (!top) return;
    top.el.classList.add('out');
    setTimeout(() => { if (top.el.classList.contains('out')) top.el.remove(); }, 200);
  }

  // Android back: sheet, then pushed screen, then Home. Returns false when the app should leave.
  function back() {
    if (document.querySelector('.levelup')) { document.querySelector('.levelup').remove(); return true; }
    if (P.closeTopSheet()) return true;
    if (stack.length) { popScreen(); return true; }
    if (current !== 'home') { tab('home'); return true; }
    return false;
  }

  function applyTheme() {
    if (!StatusBar) return;
    const dark = document.documentElement.dataset.theme !== 'light';
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || (dark ? '#0B0B0F' : '#F7F7F9');
    StatusBar.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => {});
    StatusBar.setBackgroundColor({ color: bg }).catch(() => {});
  }

  // Sync status changes only touch the little dots, so a re-render never interrupts a swipe
  function refreshSyncDots() {
    const d = M.Sync.describe(M.Sync.status());
    document.querySelectorAll('[data-sync]').forEach(b => {
      b.innerHTML = `<span class="sync-dot ${d.tone}"></span>`;
      b.setAttribute('aria-label', d.label);
    });
  }

  async function init() {
    await Store.load();

    const host = $('.p-screens');
    Object.keys(screens).forEach(id => {
      const section = document.createElement('section');
      section.className = 'p-screen' + (id === current ? ' on' : '');
      host.appendChild(section);
      sections[id] = section;
      screens[id].init(section);
    });
    renderNav();
    renderAll();
    applyTheme();

    $('.p-nav').addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (b) tab(b.dataset.tab);
    });
    Store.subscribe(() => renderAll());
    M.Sync.onStatus(refreshSyncDots);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => setTimeout(applyTheme, 50));

    // Pull the laptop's changes before the auto-miss so they don't fight
    await M.Sync.start(5000);
    M.Lifecycle.runAutoMiss();
    M.Mobile.init().catch(e => console.warn('Mobile setup failed:', e));

    // Keep due times fresh and catch tasks passing the auto-miss window
    setInterval(() => {
      if (M.Lifecycle.runAutoMiss()) return;
      if (!document.querySelector('.sheet-wrap') && !document.querySelector('.tcard.dragging')) renderAll();
    }, 60 * 1000);
  }

  M.Phone = { tab, push, back, applyTheme };
  document.addEventListener('DOMContentLoaded', init);
})();
