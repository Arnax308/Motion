/* ==========================================================================
   MOTION LIFECYCLE — housekeeping shared by the desktop and phone shells.
   ========================================================================== */

(function () {
  const M = window.Motion;
  const { Engine, Store } = M;

  // Tasks 72h past their deadline count as missed. Returns true if any were.
  function runAutoMiss() {
    const due = Store.get().active_tasks.some(t => new Date() > Engine.autoMissAt(t));
    if (!due) return false;
    const results = Store.mutate(d => Engine.autoMissOverdue(d));
    const lost = results.reduce((s, r) => s + r.loss + r.catchUpLoss, 0);
    M.UI.toast({
      title: `${results.length} overdue task${results.length === 1 ? ' was' : 's were'} marked missed`,
      body: `More than ${Engine.AUTO_MISS_HOURS}h past due · −${lost} PP`,
      icon: 'alert-triangle', tone: 'danger', duration: 8000
    });
    return true;
  }

  M.Lifecycle = { runAutoMiss };
})();
