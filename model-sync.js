// ══════════════════════════════════════════════════════════
// PSI Dashboard — Model List Cross-Device Sync (via Supabase)
// Loaded after the main inline script. Relies on globals already
// defined there: SUPA_URL, SUPA_KEY, SH, getModels/saveModels,
// phGetModels/phSaveModels, plGetModels/plSaveModels,
// populateModelSelect, buildBulkFields, renderPhilipsEntry,
// renderPlocksEntry, showToast.
// ══════════════════════════════════════════════════════════
(function () {
  async function supaGetModels(brand) {
    try {
      const r = await fetch(
        `${SUPA_URL}/rest/v1/psi_models?select=name,region&brand=eq.${brand}&order=name.asc`,
        { headers: SH }
      );
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }

  async function supaInsertModel(brand, name, region) {
    try {
      await fetch(`${SUPA_URL}/rest/v1/psi_models`, {
        method: 'POST',
        headers: { ...SH, 'Prefer': 'return=minimal,resolution=ignore-duplicates' },
        body: JSON.stringify({ brand, name, region })
      });
    } catch (e) {}
  }

  async function mergeModelsFromSupabase(brand, getModelsFn, saveModelsFn) {
    const remote = await supaGetModels(brand);
    if (!remote) return false;
    const local = getModelsFn();
    const map = {};
    local.forEach(m => { map[m.name] = m; });
    let changed = false;
    remote.forEach(m => { if (!map[m.name]) { map[m.name] = m; changed = true; } });
    if (changed) saveModelsFn(Object.values(map));
    return changed;
  }

  async function syncAllModelsFromSupabase() {
    try {
      const [mS, mP, mL] = await Promise.all([
        mergeModelsFromSupabase('samsung', getModels, saveModels),
        mergeModelsFromSupabase('philips', phGetModels, phSaveModels),
        mergeModelsFromSupabase('plocks', plGetModels, plSaveModels)
      ]);
      if (mS && typeof populateModelSelect === 'function') { populateModelSelect(); buildBulkFields(); }
      if (mP && typeof renderPhilipsEntry === 'function') renderPhilipsEntry();
      if (mL && typeof renderPlocksEntry === 'function') renderPlocksEntry();
    } catch (e) {}
  }

  // Pull in models added from other devices on page load
  window.addEventListener('load', () => {
    setTimeout(syncAllModelsFromSupabase, 1200);
  });

  // Also refresh models whenever the manual ↻ Refresh (forceSync) is used
  const _orig_forceSync = window.forceSync;
  if (typeof _orig_forceSync === 'function') {
    window.forceSync = function () {
      _orig_forceSync();
      syncAllModelsFromSupabase();
    };
  }

  // Push newly added models to Supabase so they sync to all devices
  const _orig_saveNewModel = window.saveNewModel;
  if (typeof _orig_saveNewModel === 'function') {
    window.saveNewModel = function () {
      const nameEl = document.getElementById('newModelName');
      const regionEl = document.getElementById('newModelRegion');
      const name = nameEl ? nameEl.value.trim().toUpperCase() : '';
      const region = regionEl ? regionEl.value : '';
      const existed = name && getModels().find(m => m.name === name);
      _orig_saveNewModel();
      if (name && !existed) supaInsertModel('samsung', name, region);
    };
  }

  const _orig_philipsSaveNewModel = window.philipsSaveNewModel;
  if (typeof _orig_philipsSaveNewModel === 'function') {
    window.philipsSaveNewModel = function () {
      const nameEl = document.getElementById('philipsNewModelName');
      const regionEl = document.getElementById('philipsNewModelRegion');
      const name = nameEl ? nameEl.value.trim().toUpperCase() : '';
      const region = regionEl ? regionEl.value : '';
      const existed = name && phGetModels().find(m => m.name === name);
      _orig_philipsSaveNewModel();
      if (name && !existed) supaInsertModel('philips', name, region);
    };
  }

  const _orig_plocksSaveNewModel = window.plocksSaveNewModel;
  if (typeof _orig_plocksSaveNewModel === 'function') {
    window.plocksSaveNewModel = function () {
      const nameEl = document.getElementById('plocksNewModelName');
      const regionEl = document.getElementById('plocksNewModelRegion');
      const name = nameEl ? nameEl.value.trim().toUpperCase() : '';
      const region = regionEl ? regionEl.value : '';
      const existed = name && plGetModels().find(m => m.name === name);
      _orig_plocksSaveNewModel();
      if (name && !existed) supaInsertModel('plocks', name, region);
    };
  }
})();
