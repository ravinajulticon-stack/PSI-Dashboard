// ══════════════════════════════════════════════════════════
// PSI Dashboard — Week Range Filter (Inventory trend + Weekly
// sell-out charts only). Loaded after the main inline script.
// Injects its own CSS + <select> dropdowns, then wraps the
// existing chart-builder and render functions rather than
// editing them directly.
// ══════════════════════════════════════════════════════════
(function () {
  // ── CSS ──
  const style = document.createElement('style');
  style.textContent = `
.week-range-select { display: inline-block; width: auto; font-family: var(--font); font-size: 11px; font-weight: 500; background: var(--mac-surface2); border: 1px solid var(--mac-border2); color: var(--mac-text2); padding: 3px 8px; border-radius: 20px; outline: none; cursor: pointer; }
.week-range-select:focus { border-color: var(--mac-accent); }
.week-range-sep { font-size: 11px; color: var(--mac-text3); }
`;
  document.head.appendChild(style);

  // ── Inject the two <select> dropdowns into each brand's filter bar ──
  function injectSelectors(searchInputId, fromId, toId) {
    const input = document.getElementById(searchInputId);
    if (!input) return;
    const searchWrap = input.closest('.search-wrap');
    if (!searchWrap || !searchWrap.parentNode || document.getElementById(fromId)) return;
    const sep = document.createElement('div');
    sep.className = 'filter-sep';
    const label = document.createElement('span');
    label.className = 'filter-label';
    label.textContent = 'Weeks';
    const fromSel = document.createElement('select');
    fromSel.id = fromId;
    fromSel.className = 'week-range-select';
    const dash = document.createElement('span');
    dash.className = 'week-range-sep';
    dash.textContent = '\u2013';
    const toSel = document.createElement('select');
    toSel.id = toId;
    toSel.className = 'week-range-select';
    const parent = searchWrap.parentNode;
    parent.insertBefore(sep, searchWrap);
    parent.insertBefore(label, searchWrap);
    parent.insertBefore(fromSel, searchWrap);
    parent.insertBefore(dash, searchWrap);
    parent.insertBefore(toSel, searchWrap);
  }
  injectSelectors('searchInput', 'chartWeekFrom', 'chartWeekTo');
  injectSelectors('philipsSearchInput', 'philipsChartWeekFrom', 'philipsChartWeekTo');
  injectSelectors('plocksSearchInput', 'plocksChartWeekFrom', 'plocksChartWeekTo');

  // ── Namespaced state (kept separate from state/phState/plState) ──
  const wr = {
    chartWeekFrom: null, chartWeekTo: null,
    phChartWeekFrom: null, phChartWeekTo: null,
    plChartWeekFrom: null, plChartWeekTo: null
  };

  function getWeekRangeIdx(allWeeks, fromWk, toWk) {
    let fromIdx = fromWk ? allWeeks.indexOf(fromWk) : 0;
    let toIdx = toWk ? allWeeks.indexOf(toWk) : allWeeks.length - 1;
    if (fromIdx < 0) fromIdx = 0;
    if (toIdx < 0) toIdx = allWeeks.length - 1;
    if (fromIdx > toIdx) { const t = fromIdx; fromIdx = toIdx; toIdx = t; }
    return [fromIdx, toIdx];
  }

  function populateSelectors(fromId, toId, allWeeks, keyFrom, keyTo) {
    const fromSel = document.getElementById(fromId);
    const toSel = document.getElementById(toId);
    if (!fromSel || !toSel || !allWeeks.length) return;
    const key = allWeeks.join(',');
    if (fromSel.dataset.weeksKey !== key) {
      const opts = allWeeks.map(w => `<option value="${w}">${w}</option>`).join('');
      fromSel.innerHTML = opts;
      toSel.innerHTML = opts;
      fromSel.dataset.weeksKey = key;
      toSel.dataset.weeksKey = key;
      wr[keyFrom] = (wr[keyFrom] && allWeeks.includes(wr[keyFrom])) ? wr[keyFrom] : allWeeks[0];
      wr[keyTo] = (wr[keyTo] && allWeeks.includes(wr[keyTo])) ? wr[keyTo] : allWeeks[allWeeks.length - 1];
    }
    fromSel.value = wr[keyFrom];
    toSel.value = wr[keyTo];
  }

  // Slice only the .inv / .s per-week arrays used by these two charts;
  // every other model field (totals, weeksLeft, etc.) stays untouched,
  // so metrics/table/forecast are unaffected by this filter.
  function sliceModels(models, allWeeks, fromWk, toWk) {
    const [fromIdx, toIdx] = getWeekRangeIdx(allWeeks, fromWk, toWk);
    const weeks = allWeeks.slice(fromIdx, toIdx + 1);
    const sliced = models.map(m => ({
      ...m,
      inv: (m.inv || []).slice(fromIdx, toIdx + 1),
      s: (m.s || []).slice(fromIdx, toIdx + 1)
    }));
    return [sliced, weeks];
  }

  function wrapChartFn(name, keyFrom, keyTo) {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function (models, allWeeks) {
      const [sm, sw] = sliceModels(models, allWeeks, wr[keyFrom], wr[keyTo]);
      orig(sm, sw);
    };
  }
  wrapChartFn('buildInvChart', 'chartWeekFrom', 'chartWeekTo');
  wrapChartFn('buildSellChart', 'chartWeekFrom', 'chartWeekTo');
  wrapChartFn('phBuildInvChart', 'phChartWeekFrom', 'phChartWeekTo');
  wrapChartFn('phBuildSellChart', 'phChartWeekFrom', 'phChartWeekTo');
  wrapChartFn('plBuildInvChart', 'plChartWeekFrom', 'plChartWeekTo');
  wrapChartFn('plBuildSellChart', 'plChartWeekFrom', 'plChartWeekTo');

  function wrapRenderFn(name, getEntriesFn, computeFn, fromId, toId, keyFrom, keyTo) {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function () {
      orig();
      const models = computeFn(getEntriesFn());
      const allWeeks = models[0]?.allWeeks || [];
      populateSelectors(fromId, toId, allWeeks, keyFrom, keyTo);
    };
  }
  wrapRenderFn('renderDashboard', () => getEntries(), computeModels,
    'chartWeekFrom', 'chartWeekTo', 'chartWeekFrom', 'chartWeekTo');
  wrapRenderFn('renderPhilipsDashboard', () => phGetEntries(), computePhilipsModels,
    'philipsChartWeekFrom', 'philipsChartWeekTo', 'phChartWeekFrom', 'phChartWeekTo');
  wrapRenderFn('renderPlocksDashboard', () => plGetEntries(), computePlocksModels,
    'plocksChartWeekFrom', 'plocksChartWeekTo', 'plChartWeekFrom', 'plChartWeekTo');

  // ── Wire the dropdowns' change events ──
  function wireSelect(id, stateKey, rebuild) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => { wr[stateKey] = el.value; rebuild(); });
  }
  wireSelect('chartWeekFrom', 'chartWeekFrom', () => {
    const m = computeModels(getEntries()); const aw = m[0]?.allWeeks || [];
    buildInvChart(m, aw); buildSellChart(m, aw);
  });
  wireSelect('chartWeekTo', 'chartWeekTo', () => {
    const m = computeModels(getEntries()); const aw = m[0]?.allWeeks || [];
    buildInvChart(m, aw); buildSellChart(m, aw);
  });
  wireSelect('philipsChartWeekFrom', 'phChartWeekFrom', () => {
    const m = computePhilipsModels(phGetEntries()); const aw = m[0]?.allWeeks || [];
    phBuildInvChart(m, aw); phBuildSellChart(m, aw);
  });
  wireSelect('philipsChartWeekTo', 'phChartWeekTo', () => {
    const m = computePhilipsModels(phGetEntries()); const aw = m[0]?.allWeeks || [];
    phBuildInvChart(m, aw); phBuildSellChart(m, aw);
  });
  wireSelect('plocksChartWeekFrom', 'plChartWeekFrom', () => {
    const m = computePlocksModels(plGetEntries()); const aw = m[0]?.allWeeks || [];
    plBuildInvChart(m, aw); plBuildSellChart(m, aw);
  });
  wireSelect('plocksChartWeekTo', 'plChartWeekTo', () => {
    const m = computePlocksModels(plGetEntries()); const aw = m[0]?.allWeeks || [];
    plBuildInvChart(m, aw); plBuildSellChart(m, aw);
  });
})();
