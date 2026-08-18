// ══════════════════════════════════════════════════════════
// PSI Dashboard — Search Model filters charts too
// Loaded after week-range-filter.js. Extends the existing
// "Search model..." inputs (which already filter the Model
// summary table) so they also filter the Inventory trend and
// Weekly sell-out charts + their legends, per brand. The
// Weekly Forecast section is untouched (out of scope by
// design — it has its own separate model selector).
// ══════════════════════════════════════════════════════════
(function () {
  function matches(name, query) {
    if (!query) return true;
    return name.toLowerCase().includes(query.toLowerCase());
  }

  // Wrap whatever buildXChart currently is (may already be wrapped by
  // week-range-filter.js) so the composed result filters by search
  // first, then hands off to the existing chain (week slicing, then
  // the original Chart.js build).
  function wrapChartFnForSearch(name, getQuery) {
    const orig = window[name];
    if (typeof orig !== 'function') return;
    window[name] = function (models, allWeeks) {
      const q = getQuery();
      const filtered = q ? models.filter(m => matches(m.name, q)) : models;
      orig(filtered, allWeeks);
    };
  }
  wrapChartFnForSearch('buildInvChart', () => state.search);
  wrapChartFnForSearch('buildSellChart', () => state.search);
  wrapChartFnForSearch('phBuildInvChart', () => phState.search);
  wrapChartFnForSearch('phBuildSellChart', () => phState.search);
  wrapChartFnForSearch('plBuildInvChart', () => plState.search);
  wrapChartFnForSearch('plBuildSellChart', () => plState.search);

  // The existing search inputs already have their own 'input' listener
  // (which updates state.search and re-renders the table). We attach a
  // second listener on the same element/event — it runs after the
  // original, so state.search is already up to date — to also rebuild
  // the two charts.
  function wireSearchRebuild(inputId, getEntriesFn, computeFn, rebuildFns) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.addEventListener('input', () => {
      const models = computeFn(getEntriesFn());
      const allWeeks = models[0]?.allWeeks || [];
      rebuildFns.forEach(fn => fn(models, allWeeks));
    });
  }
  wireSearchRebuild('searchInput', () => getEntries(), computeModels, [
    (m, aw) => buildInvChart(m, aw),
    (m, aw) => buildSellChart(m, aw)
  ]);
  wireSearchRebuild('philipsSearchInput', () => phGetEntries(), computePhilipsModels, [
    (m, aw) => phBuildInvChart(m, aw),
    (m, aw) => phBuildSellChart(m, aw)
  ]);
  wireSearchRebuild('plocksSearchInput', () => plGetEntries(), computePlocksModels, [
    (m, aw) => plBuildInvChart(m, aw),
    (m, aw) => plBuildSellChart(m, aw)
  ]);
})();
