// PSI Dashboard - the Weekly Forecast uses the Supply Risk Board's demand number (added 2026-10-30). Step 1 of the Weekly Forecast layout work.
// Until now the Weekly Forecast projected stock with a plain 8-week average of sales (Avg S/wk), while the Supply Risk Board uses a better estimate (it leaves out
// empty-shelf weeks and any week marked as a one-off). The two disagreed on lumpy models: 709-FVP-7HWS-BLACK was 2 a week on the card and 25 on the Board.
// This script wraps renderForecast(models, brand) and hands the original the Board's demand as each model's avgS, so the cards, the table and the chart all use it.
// It also redraws the card when a week is marked as a one-off (or undone). Nothing is stored. To undo: remove this script tag; the card goes back to the plain 8-week average.
(function () {
  if (window.__fcDemandInstalled || typeof window.renderForecast !== 'function') return;
  window.__fcDemandInstalled = true;
  const prev = window.renderForecast;
  const keyOf = brand => brand === 'philips' ? 'philips' : brand === 'plocks' ? 'plocks' : 'samsung';
  const FULL = { samsung: () => computeModels(getEntries()), philips: () => computePhilipsModels(phGetEntries()), plocks: () => computePlocksModels(plGetEntries()) };
  const SEC = { samsung: 'forecastSection', philips: 'philipsForecastSection', plocks: 'plocksForecastSection' };
  const OLD_SUB = 'Projected inventory based on Avg S/wk · next 8 weeks', NEW_SUB = 'Projected inventory based on weekly demand, the same number the Supply Risk Board uses · next 8 weeks';

  function boardDemand(brand) {                                              // {model: demand per week} from the Board's own analysis, or null if it is not ready
    try {
      const res = window.__srApi && window.__srApi.getAnalysis(keyOf(brand)); if (!res || !res.list) return null;
      const out = {}; res.list.forEach(a => { if (typeof a.rate === 'number' && isFinite(a.rate)) out[a.name] = a.rate; }); return out;
    } catch (e) { return null; }
  }
  function relabel() {                                                       // say what the number is now
    Object.keys(SEC).forEach(k => {
      const s = document.getElementById(SEC[k]); if (!s) return;
      s.querySelectorAll('div').forEach(d => { if (d.children.length === 0 && d.textContent.trim() === OLD_SUB) d.textContent = NEW_SUB; });
      s.querySelectorAll('th').forEach(t => { if (t.textContent.trim() === 'Avg S/wk') t.textContent = 'Demand/Wk'; });
    });
  }
  window.renderForecast = function (models, brand) {
    let list = models;
    try { const d = boardDemand(brand); if (d && Array.isArray(models)) list = models.map(m => (d[m.name] != null) ? Object.assign({}, m, { avgS: d[m.name], plainAvgS: m.avgS }) : m); } catch (e) { list = models; }
    const r = prev.call(this, list, brand);
    try { relabel(); } catch (e) {}
    return r;
  };
  function redrawVisible() {                                                 // a one-off was marked or undone: redraw the forecast that is on screen
    Object.keys(FULL).forEach(k => { const s = document.getElementById(SEC[k]); if (s && s.offsetParent !== null) { try { window.renderForecast(FULL[k](), k); } catch (e) { console.warn('[forecast-demand]', e && e.message); } } });
  }
  let hooks = 0; (function hook() { if (window.PSI_ONEOFF) window.PSI_ONEOFF.onChange(redrawVisible); else if (hooks++ < 20) setTimeout(hook, 600); })();
})();
