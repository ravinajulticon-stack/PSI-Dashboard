// ══════════════════════════════════════════════════════════
// PSI Dashboard — Archive/Hide Models + "Dashboard"→"Overview"
// rename. Loaded last, after model-sync.js, week-range-filter.js
// and search-chart-filter.js. Does not edit index.html beyond
// the one <script src> line that loads this file.
//
// Design:
//  - Models gain an `archived` boolean (default false), synced
//    through the existing `psi_models` Supabase table (adds an
//    `archived` column).
//  - We NEVER override the shared getModels()/phGetModels()/
//    plGetModels() globals directly — model-sync.js relies on
//    the FULL (unfiltered) list for its own merge/save cycle,
//    and overriding them would silently wipe archived models on
//    the next sync. Instead we wrap the specific consumer
//    functions (compute*, entry-view renderers, history-view
//    renderers) so archived models disappear from Overview,
//    Weekly Entry and Full History, while the raw getters still
//    return everything for our own Manage Models panel.
// ══════════════════════════════════════════════════════════
(function () {
  // ── 1. Rename "Dashboard" sub-tab label to "Overview" (cosmetic only) ──
  function renameDashboardTabs() {
    const selectors = [
      '.seg-btn[data-view="dashboard"]',
      '.seg-btn[data-pview="pdashboard"]',
      '.seg-btn[data-plview="pldashboard"]'
    ];
    selectors.forEach(sel => {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim() === 'Dashboard') el.textContent = 'Overview';
    });
  }
  renameDashboardTabs();

  // ── 2. Supabase helpers for the archived flag ──
  async function supaGetAllModels(brand) {
    try {
      const r = await fetch(`${SUPA_URL}/rest/v1/psi_models?select=name,region,archived&brand=eq.${brand}&order=name.asc`, { headers: SH });
      return r.ok ? await r.json() : null;
    } catch (e) { return null; }
  }
  async function supaSetArchived(brand, name, archived) {
    try {
      await fetch(`${SUPA_URL}/rest/v1/psi_models?brand=eq.${brand}&name=eq.${encodeURIComponent(name)}`, {
        method: 'PATCH',
        headers: { ...SH, 'Prefer': 'return=minimal' },
        body: JSON.stringify({ archived })
      });
    } catch (e) {}
  }

  // Pull remote archived/name/region for a brand and reconcile with local:
  // add any remote model missing locally, and make the local `archived`
  // flag match remote for every model already known locally too (so
  // archiving on one device is reflected on the other after a sync).
  async function syncArchivedStatus(brand, getModelsFn, saveModelsFn) {
    const remote = await supaGetAllModels(brand);
    if (!remote) return false;
    const local = getModelsFn();
    const byName = {};
    local.forEach(m => { byName[m.name] = m; });
    let changed = false;
    remote.forEach(rm => {
      const existing = byName[rm.name];
      if (!existing) {
        byName[rm.name] = { name: rm.name, region: rm.region, archived: !!rm.archived };
        changed = true;
      } else if (!!existing.archived !== !!rm.archived) {
        existing.archived = !!rm.archived;
        changed = true;
      }
    });
    if (changed) saveModelsFn(Object.values(byName));
    return changed;
  }

  // ── 3. Generic helper: run `fn` with a brand's getModels temporarily
  //    swapped to an archived-filtered version, then restore it. Safe
  //    because all these render functions are fully synchronous. ──
  function withActiveModelsOnly(globalGetterName, fn) {
    return function (...args) {
      const orig = window[globalGetterName];
      window[globalGetterName] = () => orig().filter(m => !m.archived);
      try {
        return fn.apply(this, args);
      } finally {
        window[globalGetterName] = orig;
      }
    };
  }

  function wrapIfFunction(name, wrapper) {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = wrapper(orig);
  }

  // Weekly Entry — hide archived models from the dropdown + bulk list
  wrapIfFunction('populateModelSelect', orig => withActiveModelsOnly('getModels', orig));
  wrapIfFunction('buildBulkFields', orig => withActiveModelsOnly('getModels', orig));
  wrapIfFunction('renderPhilipsEntry', orig => withActiveModelsOnly('phGetModels', orig));
  wrapIfFunction('renderPlocksEntry', orig => withActiveModelsOnly('plGetModels', orig));

  // Full History — hide archived models from the table + totals row
  wrapIfFunction('renderHistoryView', orig => withActiveModelsOnly('getModels', orig));
  wrapIfFunction('renderPhilipsHistory', orig => withActiveModelsOnly('phGetModels', orig));
  wrapIfFunction('renderPlocksHistory', orig => withActiveModelsOnly('plGetModels', orig));

  // Weekly Entry's "Recent Entries" panel — also reads getModels() directly
  wrapIfFunction('renderRecentHistory', orig => withActiveModelsOnly('getModels', orig));
  wrapIfFunction('phRenderRecentHistory', orig => withActiveModelsOnly('phGetModels', orig));
  wrapIfFunction('plRenderRecentHistory', orig => withActiveModelsOnly('plGetModels', orig));

  // Overview (charts, table, alerts, metrics) + Weekly Forecast (it reuses
  // the same computed array) — filter archived out of the computed output.
  function wrapComputeFn(name) {
    wrapIfFunction(name, orig => function (entries) {
      const result = orig(entries);
      const archivedNames = new Set(getModelsForBrand(name).filter(m => m.archived).map(m => m.name));
      return archivedNames.size ? result.filter(m => !archivedNames.has(m.name)) : result;
    });
  }
  function getModelsForBrand(computeFnName) {
    if (computeFnName === 'computeModels') return getModels();
    if (computeFnName === 'computePhilipsModels') return phGetModels();
    if (computeFnName === 'computePlocksModels') return plGetModels();
    return [];
  }
  wrapComputeFn('computeModels');
  wrapComputeFn('computePhilipsModels');
  wrapComputeFn('computePlocksModels');

  // ── 4. "Manage Models" panel — one per brand, built on demand ──
  const BRANDS = [
    { key: 'samsung', label: 'Samsung Locks', searchId: 'searchInput',
      getModelsFn: () => getModels(), saveModelsFn: m => saveModels(m),
      refresh: () => { if (typeof renderDashboard === 'function') renderDashboard();
                        if (typeof renderEntryView === 'function') renderEntryView();
                        if (typeof renderHistoryView === 'function') renderHistoryView();
                        if (typeof renderRecentHistory === 'function') renderRecentHistory(); } },
    { key: 'philips', label: 'Philips Safes', searchId: 'philipsSearchInput',
      getModelsFn: () => phGetModels(), saveModelsFn: m => phSaveModels(m),
      refresh: () => { if (typeof renderPhilipsDashboard === 'function') renderPhilipsDashboard();
                        if (typeof renderPhilipsEntry === 'function') renderPhilipsEntry();
                        if (typeof renderPhilipsHistory === 'function') renderPhilipsHistory();
                        if (typeof phRenderRecentHistory === 'function') phRenderRecentHistory(); } },
    { key: 'plocks', label: 'Philips Locks', searchId: 'plocksSearchInput',
      getModelsFn: () => plGetModels(), saveModelsFn: m => plSaveModels(m),
      refresh: () => { if (typeof renderPlocksDashboard === 'function') renderPlocksDashboard();
                        if (typeof renderPlocksEntry === 'function') renderPlocksEntry();
                        if (typeof renderPlocksHistory === 'function') renderPlocksHistory();
                        if (typeof plRenderRecentHistory === 'function') plRenderRecentHistory(); } }
  ];

  function buildModalShell(brand) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = `manageModelsOverlay-${brand.key}`;
    overlay.innerHTML = `
      <div class="modal" style="max-width:480px;">
        <div class="modal-header">
          <div class="modal-title">Manage Models — ${brand.label}</div>
          <button class="modal-close" data-close-manage="${brand.key}">&#x2715;</button>
        </div>
        <div style="font-size:12px;color:var(--mac-text2);margin-bottom:14px;">
          Archived models are hidden from Overview, Weekly Entry and Full
          History, but their historical data is kept. Unarchive anytime.
        </div>
        <div id="manageModelsList-${brand.key}"></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeManageModal(brand.key); });
    overlay.querySelector(`[data-close-manage="${brand.key}"]`).addEventListener('click', () => closeManageModal(brand.key));
    return overlay;
  }

  function openManageModal(brand) {
    let overlay = document.getElementById(`manageModelsOverlay-${brand.key}`);
    if (!overlay) overlay = buildModalShell(brand);
    renderManageList(brand);
    overlay.classList.add('open');
  }
  function closeManageModal(key) {
    const overlay = document.getElementById(`manageModelsOverlay-${key}`);
    if (overlay) overlay.classList.remove('open');
  }

  function renderManageList(brand) {
    const list = document.getElementById(`manageModelsList-${brand.key}`);
    if (!list) return;
    const models = [...brand.getModelsFn()].sort((a, b) => a.name.localeCompare(b.name));
    if (!models.length) {
      list.innerHTML = `<div style="font-size:12px;color:var(--mac-text3);">No models yet.</div>`;
      return;
    }
    list.innerHTML = models.map(m => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 2px;border-bottom:1px solid var(--mac-border);gap:10px;">
        <div style="min-width:0;">
          <div style="font-size:13px;font-weight:600;color:var(--mac-text);${m.archived ? 'opacity:0.5;' : ''}">${m.name}</div>
          <div style="font-size:11px;color:var(--mac-text3);">${m.region || ''}${m.archived ? ' · Archived' : ''}</div>
        </div>
        <button data-toggle-archive="${m.name}" style="flex-shrink:0;font-family:var(--font);font-size:11px;font-weight:600;
          padding:5px 12px;border-radius:20px;cursor:pointer;border:1px solid var(--mac-border2);
          background:${m.archived ? 'var(--mac-accent)' : 'var(--mac-surface2)'};
          color:${m.archived ? '#fff' : 'var(--mac-text2)'};">
          ${m.archived ? 'Unarchive' : 'Archive'}
        </button>
      </div>`).join('');
    list.querySelectorAll('[data-toggle-archive]').forEach(btn => {
      btn.addEventListener('click', () => toggleArchive(brand, btn.getAttribute('data-toggle-archive')));
    });
  }

  async function toggleArchive(brand, name) {
    const models = brand.getModelsFn();
    const m = models.find(x => x.name === name);
    if (!m) return;
    m.archived = !m.archived;
    brand.saveModelsFn(models);
    supaSetArchived(brand.key, name, m.archived);
    brand.refresh();
    renderManageList(brand);
    if (typeof showToast === 'function') {
      showToast(m.archived ? `Archived ${name}` : `Unarchived ${name}`, 'success');
    }
  }

  function injectManageButton(brand) {
    const searchInput = document.getElementById(brand.searchId);
    if (!searchInput) return;
    const searchWrap = searchInput.closest('.search-wrap');
    if (!searchWrap || !searchWrap.parentNode || document.getElementById(`manageModelsBtn-${brand.key}`)) return;
    const btn = document.createElement('button');
    btn.id = `manageModelsBtn-${brand.key}`;
    btn.className = 'filter-btn';
    btn.textContent = 'Manage Models';
    btn.style.marginLeft = '6px';
    btn.addEventListener('click', () => openManageModal(brand));
    searchWrap.parentNode.insertBefore(btn, searchWrap.nextSibling);
  }

  BRANDS.forEach(injectManageButton);

  // ── 5. Cross-device archived-status sync ──
  function syncAllArchivedStatus() {
    BRANDS.forEach(b => { syncArchivedStatus(b.key, b.getModelsFn, b.saveModelsFn).then(changed => { if (changed) b.refresh(); }); });
  }
  window.addEventListener('load', () => { setTimeout(syncAllArchivedStatus, 1500); });
  const _origForceSync = window.forceSync;
  if (typeof _origForceSync === 'function') {
    window.forceSync = function () {
      _origForceSync();
      syncAllArchivedStatus();
    };
  }
})();
