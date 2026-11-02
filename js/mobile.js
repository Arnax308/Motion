/* ==========================================================================
   MOTION MOBILE — Android-only glue: resume handling, the back button,
   alerts start-up and keeping the background runner's copy of the data fresh.
   ========================================================================== */

(function () {
  const M = window.Motion;
  if (!M.Platform.isNative) {
    M.Mobile = { init: async () => {} };
    return;
  }
  const { App, BackgroundRunner } = window.Capacitor.Plugins;
  const RUNNER_LABEL = 'com.arnax.motion.sync';

  // The background runner has its own storage, so hand it what it needs to pull changes
  // and schedule alerts while the app is closed
  let lastScheduled = [];

  async function seedRunner() {
    if (!BackgroundRunner) return;
    const data = M.Store.get();
    await BackgroundRunner.dispatchEvent({
      label: RUNNER_LABEL,
      event: 'seed',
      details: {
        config: window.MotionSyncConfig || null,
        prefs: M.Alerts.getPrefs(),
        scheduled: lastScheduled,
        data: JSON.stringify({
          baseline_pp: data.baseline_pp, baseline_best_streak: data.baseline_best_streak,
          categories: data.categories, active_tasks: data.active_tasks, history: data.history,
          sync: { cursor: data.sync.cursor, updated: data.sync.updated, tombstones: data.sync.tombstones, dirty: [] }
        })
      }
    }).catch(e => console.warn('Background runner unavailable:', e));
  }

  async function init() {
    M.Alerts.onScheduled(list => {
      lastScheduled = list.map(a => a.id);
      seedRunner();
    });
    await M.Alerts.init();

    App.addListener('resume', () => {
      M.Sync.syncSoon(300);
      M.Alerts.refreshPermission().then(() => M.Alerts.rescheduleSoon());
    });
    App.addListener('pause', () => seedRunner());
    // Android back: close the top sheet or menu first, then go back to Today, then leave the app
    App.addListener('backButton', () => {
      if (M.UI.closeTop()) return;
      if (M.State.page !== 'today') M.App.navigate('today');
      else App.minimizeApp();
    });
  }

  M.Mobile = { init };
})();
