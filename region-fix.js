// ══════════════════════════════════════════════════════════
// PSI Dashboard — Fix Philips Safes / Philips Locks region
// Both brands' entry-save functions hardcode region:'AU' on
// every entry regardless of the model's actual assigned
// region (Samsung does this correctly already). Rather than
// edit those four save functions directly inside the giant
// index.html, this wraps them to correct the region right
// after saving, and also runs once on load to retroactively
// fix any historical entries that were saved with the wrong
// hardcoded region.
// ══════════════════════════════════════════════════════════
(function () {
  // Pre-existing bug fix: several places in the original code call
  // phRenderDashboard()/plRenderDashboard() directly (unguarded, no
  // typeof check) but those names were never actually defined — the
  // real functions are renderPhilipsDashboard()/renderPlocksDashboard().
  // Every one of those call sites has been throwing a ReferenceError
  // silently (including right after every single Philips/Plocks entry
  // save, which is what caused this region fix's own post-save
  // correction to never run — the exception escaped before reaching
  // it). Defining these as aliases fixes every call site at once,
  // without editing index.html.
  if (typeof window.phRenderDashboard !== 'function' && typeof renderPhilipsDashboard === 'function') {
    window.phRenderDashboard = renderPhilipsDashboard;
  }
  if (typeof window.plRenderDashboard !== 'function' && typeof renderPlocksDashboard === 'function') {
    window.plRenderDashboard = renderPlocksDashboard;
  }

  function reconcilePhilipsRegion() {
    if (typeof phGetEntries !== 'function' || typeof phGetModels !== 'function') return false;
    const entries = phGetEntries();
    const byName = {};
    phGetModels().forEach(m => { byName[m.name] = m.region; });
    let changed = false;
    entries.forEach(e => {
      const correct = byName[e.model];
      if (correct && e.region !== correct) { e.region = correct; changed = true; }
    });
    if (changed) phSaveEntries(entries);
    return changed;
  }
  function reconcilePlocksRegion() {
    if (typeof plGetEntries !== 'function' || typeof plGetModels !== 'function') return false;
    const entries = plGetEntries();
    const byName = {};
    plGetModels().forEach(m => { byName[m.name] = m.region; });
    let changed = false;
    entries.forEach(e => {
      const correct = byName[e.model];
      if (correct && e.region !== correct) { e.region = correct; changed = true; }
    });
    if (changed) plSaveEntries(entries);
    return changed;
  }

  function refreshPhilips() {
    if (typeof phRenderRecentHistory === 'function') phRenderRecentHistory();
    if (typeof phRenderDashboard === 'function') phRenderDashboard();
  }
  function refreshPlocks() {
    if (typeof plRenderRecentHistory === 'function') plRenderRecentHistory();
    if (typeof plRenderDashboard === 'function') plRenderDashboard();
  }

  function wrapIfFunction(name, reconcileFn, refreshFn) {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function (...args) {
      const result = orig.apply(this, args);
      if (reconcileFn()) refreshFn();
      return result;
    };
  }

  wrapIfFunction('philipsSubmitEntry', reconcilePhilipsRegion, refreshPhilips);
  wrapIfFunction('philipsSubmitBulk', reconcilePhilipsRegion, refreshPhilips);
  wrapIfFunction('plocksSubmitEntry', reconcilePlocksRegion, refreshPlocks);
  wrapIfFunction('plocksSubmitBulk', reconcilePlocksRegion, refreshPlocks);

  // One-time retroactive cleanup of historical entries saved before this fix.
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (reconcilePhilipsRegion()) refreshPhilips();
      if (reconcilePlocksRegion()) refreshPlocks();
    }, 2000);
  });
})();
