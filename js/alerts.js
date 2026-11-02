/* ==========================================================================
   MOTION ALERTS — schedules phone notifications from AlertsCore.
   Only active in the Android app; elsewhere every call is a no-op.
   ========================================================================== */

(function () {
  const M = window.Motion;
  const { Platform, AlertsCore, Store } = M;
  const LN = Platform.isNative ? window.Capacitor.Plugins.LocalNotifications : null;

  const PREFS_KEY = 'motion-alert-prefs';
  const CHANNEL = 'motion-alerts';
  const RESCHEDULE_DELAY_MS = 1500;

  let prefs = AlertsCore.withDefaults();
  let permission = { ok: true, message: '' };
  let timer = null;
  const changeListeners = [];

  async function loadPrefs() {
    try { prefs = AlertsCore.withDefaults(JSON.parse(await Platform.get(PREFS_KEY))); } catch (e) { /* defaults */ }
  }

  async function setPrefs(patch) {
    prefs = Object.assign({}, prefs, patch);
    await Platform.set(PREFS_KEY, JSON.stringify(prefs));
    await reschedule();
  }

  async function refreshPermission() {
    if (!LN) return permission;
    const notif = await LN.checkPermissions();
    let exact = { exact_alarm: 'granted' };
    try { exact = await LN.checkExactNotificationSetting(); } catch (e) { /* older Android: always exact */ }
    if (notif.display !== 'granted') permission = { ok: false, message: 'Notifications are off for Motion, so alerts can’t show.' };
    else if (exact.exact_alarm !== 'granted') permission = { ok: false, message: 'Exact alarms are off, so alerts may arrive late.' };
    else permission = { ok: true, message: '' };
    return permission;
  }

  async function requestPermissions() {
    if (!LN) return permission;
    const notif = await LN.requestPermissions();
    if (notif.display === 'granted') {
      const exact = await LN.checkExactNotificationSetting().catch(() => ({ exact_alarm: 'granted' }));
      if (exact.exact_alarm !== 'granted') await LN.changeExactNotificationSetting().catch(() => {});
    }
    await refreshPermission();
    await reschedule();
    return permission;
  }

  // Replaces every pending Motion alert with a freshly built schedule
  async function reschedule() {
    if (!LN || !Store.get()) return;
    const list = AlertsCore.buildSchedule(Store.get(), prefs, new Date());
    const pending = await LN.getPending();
    const ours = pending.notifications.filter(n => n.extra && n.extra.motion);
    if (ours.length) await LN.cancel({ notifications: ours.map(n => ({ id: n.id })) });
    if (list.length && permission.ok !== false) {
      await LN.schedule({
        notifications: list.map(a => ({
          id: a.id,
          title: a.title,
          body: a.body,
          channelId: CHANNEL,
          smallIcon: 'ic_stat_motion',
          schedule: { at: a.at, allowWhileIdle: true },
          extra: { motion: true, kind: a.kind, key: a.key }
        }))
      });
    }
    changeListeners.forEach(fn => fn(list));
  }

  function rescheduleSoon() {
    clearTimeout(timer);
    timer = setTimeout(() => reschedule().catch(e => console.warn('Could not schedule alerts:', e)), RESCHEDULE_DELAY_MS);
  }

  async function sendTest() {
    if (!LN) return;
    await LN.schedule({
      notifications: [{
        id: AlertsCore.alertId('test'),
        title: 'Motion alerts work',
        body: 'This is how deadline alerts will look.',
        channelId: CHANNEL,
        smallIcon: 'ic_stat_motion',
        schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true },
        extra: { motion: true, kind: 'test' }
      }]
    });
    M.UI.toast({ title: 'Test alert in 3 seconds', icon: 'bell-ringing', tone: 'info', duration: 3000 });
  }

  async function init() {
    if (!LN) return;
    await loadPrefs();
    await LN.createChannel({ id: CHANNEL, name: 'Deadlines and reminders', importance: 5, visibility: 1, vibration: true }).catch(() => {});
    await refreshPermission();
    if (!permission.ok) await requestPermissions();
    Store.subscribe(rescheduleSoon);
    await reschedule();
  }

  M.Alerts = {
    init,
    reschedule,
    rescheduleSoon,
    sendTest,
    requestPermissions,
    refreshPermission,
    getPrefs: () => prefs,
    setPrefs,
    permissionState: () => permission,
    onScheduled: fn => changeListeners.push(fn)
  };
})();
