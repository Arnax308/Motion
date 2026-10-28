/* Applies the saved theme before first paint so there's no flash. */
(function () {
  const KEY = 'motion-theme';
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  function get() {
    try { return localStorage.getItem(KEY) || 'system'; } catch (e) { return 'system'; }
  }

  function apply() {
    const mode = get();
    const resolved = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
    document.documentElement.dataset.theme = resolved;
  }

  function set(mode) {
    try { localStorage.setItem(KEY, mode); } catch (e) { /* storage unavailable: theme lasts this session */ }
    apply();
    if (window.api && window.api.setTheme) window.api.setTheme(mode);
  }

  media.addEventListener('change', apply);
  apply();
  if (window.api && window.api.setTheme) window.api.setTheme(get());

  window.MotionTheme = { get, set };
})();
