// PSI Dashboard - Forecast tab upgrades (added 2026-10-21)
//  1. Product picker: choose exactly which products the forecast covers.
//  2. Sell-Out Rate: the forecast can ignore one-off spikes instead of averaging them in.
//  3. Chart: "Total" (one projected-inventory line against ONE matching Min Stock line) or
//     "By Product" (weeks of cover per product against the minimum), instead of 6 products
//     drawn against a Min Stock line that was calculated for all products together.
// It wraps the page's own renderForecast(models, brand): the products and sell-out rates are
// adjusted before the original draws the cards and table, and the chart is replaced afterwards.
// Anything unexpected falls back to the original forecast untouched. Overview numbers are not
// affected (they still use the plain 8-week average).
(function () {
  if (window.__fcpInstalled || typeof window.renderForecast !== 'function') return;
  window.__fcpInstalled = true;
  const orig = window.renderForecast;

  const BR = {
    samsung: { sec: 'forecastSection',        sel: 'forecastModelSel',        cards: 'forecastCards',        table: 'forecastTable',        lead: 60, store: 'samsung_incoming_v1', full: () => computeModels(getEntries()),         inst: () => forecastChartInst },
    philips: { sec: 'philipsForecastSection', sel: 'philipsForecastModelSel', cards: 'philipsForecastCards', table: 'philipsForecastTable', lead: 45, store: 'philips_incoming_v1', full: () => computePhilipsModels(phGetEntries()), inst: () => philipsForecastChartInst },
    plocks:  { sec: 'plocksForecastSection',  sel: 'plocksForecastModelSel',  cards: 'plocksForecastCards',  table: 'plocksForecastTable',  lead: 60, store: 'plocks_incoming_v1',  full: () => computePlocksModels(plGetEntries()),  inst: () => plForecastCI }
  };
  const SPIKE_MIN = 10, SPIKE_FACTOR = 4;       // a spike: at least 10 units AND more than 4x the product's typical (median) week
  const PREF_KEY = 'psi_forecast_prefs_v1';
  let prefs = {}; try { prefs = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch (e) {}
  const S = {};
  Object.keys(BR).forEach(k => { S[k] = { selected: null, spikes: !!(prefs[k] && prefs[k].spikes), chart: (prefs[k] && prefs[k].chart) === 'product' ? 'product' : 'total' }; });
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(Object.fromEntries(Object.keys(S).map(k => [k, { spikes: S[k].spikes, chart: S[k].chart }])))); } catch (e) {} };

  const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  function analyse(m) {                          // looks at the same last 8 weeks the page averages
    const weeks = m.allWeeks.slice(-8);
    const vals = m.s.slice(-8).map(v => (v == null ? 0 : v));
    const med = median(vals), flagged = [];
    const adj = vals.map((v, i) => { if (v >= SPIKE_MIN && v > SPIKE_FACTOR * med) { flagged.push({ week: weeks[i], units: v }); return med; } return v; });
    return { flagged, rawAvg: vals.reduce((a, b) => a + b, 0) / 8, adjAvg: adj.reduce((a, b) => a + b, 0) / 8 };
  }
  const loadIncoming = key => { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; } };
  const fmt = n => (Math.round(n * 10) / 10).toString();

  // ---------- styles ----------
  const css = document.createElement('style');
  css.textContent = `
  .fcp-bar{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:8px 20px;margin:10px 0 4px;padding:8px 10px;border:1px solid var(--mac-border);border-radius:var(--mac-radius-sm);background:var(--mac-surface2)}
  .fcp-group{display:flex;align-items:center;gap:6px}
  .fcp-lbl{font-size:11px;color:var(--mac-text3)}
  .fcp-prod-btn{font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid var(--mac-border2);background:var(--mac-surface);color:var(--mac-text);cursor:pointer}
  .fcp-note{flex-basis:100%;font-size:11px;color:var(--mac-text3);line-height:1.5}
  .fcp-panel{position:absolute;top:100%;left:8px;z-index:60;width:310px;background:var(--mac-surface);border:1px solid var(--mac-border2);border-radius:var(--mac-radius-sm);box-shadow:0 10px 28px rgba(0,0,0,.18);padding:8px}
  .fcp-panel[hidden]{display:none}
  .fcp-panel input[type=search]{width:100%;font-size:11px;padding:5px 8px;border-radius:6px;margin-bottom:6px;box-sizing:border-box}
  .fcp-quick{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
  .fcp-quick button,.fcp-done{font-size:10px;padding:3px 8px;border-radius:5px;border:1px solid var(--mac-border2);background:var(--mac-surface2);color:var(--mac-text);cursor:pointer}
  .fcp-list{max-height:240px;overflow:auto;border-top:1px solid var(--mac-border);padding-top:4px}
  .fcp-item{display:flex;align-items:center;gap:6px;font-size:11px;padding:3px 2px;cursor:pointer}
  .fcp-item .fcp-sub{margin-left:auto;color:var(--mac-text3);font-size:10px}
  .fcp-foot{display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:10px;color:var(--mac-text3)}`;
  document.head.appendChild(css);

  // ---------- toolbar ----------
  function rerender(brand) { try { window.renderForecast(BR[brand].full(), brand); } catch (e) { console.warn('[forecast-plus]', e && e.message); } }

  function buildUI(brand) {
    const b = BR[brand], sec = document.getElementById(b.sec);
    if (!sec || sec.querySelector('.fcp-bar')) return;
    const head = sec.querySelector('.card-header'); if (!head) return;
    const bar = document.createElement('div'); bar.className = 'fcp-bar';
    bar.innerHTML =
      '<div class="fcp-group"><span class="fcp-lbl">Products</span><button type="button" class="fcp-prod-btn"></button></div>' +
      '<div class="fcp-group"><span class="fcp-lbl">Sell-Out Rate</span><div class="tab-btns">' +
        '<button type="button" class="tab-btn" data-fcp-rate="avg" title="Average of the last 8 weeks, exactly as the Overview shows it">8-Week Average</button>' +
        '<button type="button" class="tab-btn" data-fcp-rate="spikes" title="A week counts as a one-off spike when it is at least ' + SPIKE_MIN + ' units and more than ' + SPIKE_FACTOR + 'x that product\'s typical (median) week. Spikes are replaced by the typical week.">Ignore One-Off Spikes</button></div></div>' +
      '<div class="fcp-group"><span class="fcp-lbl">Chart</span><div class="tab-btns">' +
        '<button type="button" class="tab-btn" data-fcp-chart="total" title="One line: total projected inventory against the total Min Stock">Total</button>' +
        '<button type="button" class="tab-btn" data-fcp-chart="product" title="Weeks of cover per product against the Min Stock threshold (10 lowest shown)">By Product</button></div></div>' +
      '<div class="fcp-note"></div>' +
      '<div class="fcp-panel" hidden><input type="search" placeholder="Search Products..."><div class="fcp-quick">' +
        '<button type="button" data-q="all">Select All</button><button type="button" data-q="none">Clear</button><button type="button" data-q="sell">Has Sell-Out</button><button type="button" data-q="risk">At Risk</button></div>' +
        '<div class="fcp-list"></div><div class="fcp-foot"><span class="fcp-count"></span><button type="button" class="fcp-done">Done</button></div></div>';
    head.insertAdjacentElement('afterend', bar);
    const panel = bar.querySelector('.fcp-panel'), prodBtn = bar.querySelector('.fcp-prod-btn');

    prodBtn.addEventListener('click', e => { e.stopPropagation(); panel.hidden = !panel.hidden; if (!panel.hidden) { panel.querySelector('input').value = ''; fillPanel(brand); } });
    bar.querySelector('.fcp-done').addEventListener('click', () => { panel.hidden = true; });
    panel.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => { panel.hidden = true; });
    panel.querySelector('input').addEventListener('input', () => fillPanel(brand));
    panel.querySelector('.fcp-quick').addEventListener('click', e => {
      const q = e.target.getAttribute && e.target.getAttribute('data-q'); if (!q) return;
      const all = b.full(), st = S[brand];
      if (q === 'all') st.selected = null;
      else if (q === 'none') st.selected = new Set();
      else if (q === 'sell') st.selected = new Set(all.filter(m => m.totalS > 0).map(m => m.name));
      else if (q === 'risk') st.selected = new Set(all.filter(m => m.weeksLeft !== null && m.weeksLeft <= TARGET_WEEKS * 2).map(m => m.name));
      fillPanel(brand); rerender(brand);
    });
    panel.querySelector('.fcp-list').addEventListener('change', e => {
      const cb = e.target; if (!cb || cb.type !== 'checkbox') return;
      const all = b.full().map(m => m.name), st = S[brand];
      const cur = new Set(st.selected || all);
      if (cb.checked) cur.add(cb.value); else cur.delete(cb.value);
      st.selected = all.every(n => cur.has(n)) ? null : cur;
      refreshLabels(brand); rerender(brand);
    });
    bar.querySelectorAll('[data-fcp-rate]').forEach(btn => btn.addEventListener('click', () => { S[brand].spikes = btn.getAttribute('data-fcp-rate') === 'spikes'; savePrefs(); rerender(brand); }));
    bar.querySelectorAll('[data-fcp-chart]').forEach(btn => btn.addEventListener('click', () => { S[brand].chart = btn.getAttribute('data-fcp-chart'); savePrefs(); rerender(brand); }));
  }

  function fillPanel(brand) {
    const b = BR[brand], st = S[brand], panel = document.querySelector('#' + b.sec + ' .fcp-panel'); if (!panel) return;
    const term = panel.querySelector('input').value.trim().toLowerCase(), all = b.full();
    panel.querySelector('.fcp-list').innerHTML = all.filter(m => !term || m.name.toLowerCase().includes(term)).map(m => {
      const a = analyse(m), rate = st.spikes && a.flagged.length ? a.adjAvg : a.rawAvg;
      const on = !st.selected || st.selected.has(m.name);
      return '<label class="fcp-item"><input type="checkbox" value="' + m.name.replace(/"/g, '&quot;') + '"' + (on ? ' checked' : '') + '><span>' + m.name + '</span><span class="fcp-sub">' + fmt(rate) + '/wk' + (a.flagged.length ? ' ⚡' : '') + '</span></label>';
    }).join('') || '<div class="fcp-sub" style="padding:6px">No Products Match.</div>';
    refreshLabels(brand);
  }

  function refreshLabels(brand) {
    const b = BR[brand], st = S[brand], sec = document.getElementById(b.sec); if (!sec) return;
    const all = b.full(), n = st.selected ? all.filter(m => st.selected.has(m.name)).length : all.length;
    const pb = sec.querySelector('.fcp-prod-btn'); if (pb) pb.textContent = (n === all.length ? 'All (' + all.length + ')' : n + ' of ' + all.length) + ' ▾';
    const cnt = sec.querySelector('.fcp-count'); if (cnt) cnt.textContent = n + ' of ' + all.length + ' selected';
    sec.querySelectorAll('[data-fcp-rate]').forEach(x => x.classList.toggle('active', (x.getAttribute('data-fcp-rate') === 'spikes') === st.spikes));
    sec.querySelectorAll('[data-fcp-chart]').forEach(x => x.classList.toggle('active', x.getAttribute('data-fcp-chart') === st.chart));
  }

  function refreshNote(brand) {
    const b = BR[brand], st = S[brand], note = document.querySelector('#' + b.sec + ' .fcp-note'); if (!note) return;
    const found = [];
    b.full().forEach(m => { const a = analyse(m); a.flagged.forEach(f => found.push({ name: m.name, week: f.week, units: f.units, raw: a.rawAvg, adj: a.adjAvg })); });
    found.sort((x, y) => y.units - x.units);
    const top = found.slice(0, 3).map(f => f.name + ' ' + f.week + ' (' + f.units + ' units)').join(', ') + (found.length > 3 ? ' and ' + (found.length - 3) + ' more' : '');
    if (!found.length) note.textContent = 'No one-off sell-out spikes in the last 8 weeks, so both rates give the same forecast.';
    else if (st.spikes) { const f = found[0]; note.textContent = 'Ignoring ' + found.length + ' one-off spike' + (found.length > 1 ? 's' : '') + ': ' + top + '. For example ' + f.name + ' now counts as ' + fmt(f.adj) + ' units a week instead of ' + fmt(f.raw) + '.'; }
    else note.textContent = found.length + ' one-off spike' + (found.length > 1 ? 's' : '') + ' in the last 8 weeks are included in the average: ' + top + '. Choose Ignore One-Off Spikes to leave them out. (The Overview always uses the plain average.)';
  }

  function showEmpty(brand) {
    const b = BR[brand], c = document.getElementById(b.cards);
    if (c) { c.style.display = 'grid'; c.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--mac-text3);font-size:12px;">No Products Selected. Use Products to choose which ones to forecast.</div>'; }
    const t = document.getElementById(b.table); if (t) t.innerHTML = '';
    const inst = b.inst(); if (inst) { inst.data.datasets = []; inst.update('none'); }
  }

  // ---------- chart ----------
  function fixChart(brand, list) {
    const b = BR[brand], st = S[brand], sel = document.getElementById(b.sel);
    if (!sel || sel.value !== '__all__') return;            // one product picked in the Model dropdown: the page's own chart is already consistent
    const inst = b.inst(); if (!inst) return;
    const weeks = inst.data.labels, inc = loadIncoming(b.store);
    const getInc = (n, w) => parseInt((inc[n] || {})[w] || 0) || 0;
    const proj = m => { let inv = m.latestInv; return weeks.map(w => { inv = Math.max(0, inv + getInc(m.name, w) - m.avgS); return Math.round(inv); }); };
    const red = { borderColor: '#ff3b30', borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0 };
    let datasets, unit = null, ymax;
    if (st.chart === 'total') {
      const per = list.map(proj), total = weeks.map((_, i) => per.reduce((s, p) => s + p[i], 0));
      const minTotal = Math.ceil(list.reduce((s, m) => s + m.avgS, 0) * (b.lead / 7));
      datasets = [{ label: 'Total Projected Inventory', data: total, borderColor: '#007aff', backgroundColor: '#007aff18', tension: .4, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2, fill: true },
                  Object.assign({ label: 'Min Stock (' + b.lead + 'd lead)', data: Array(weeks.length).fill(minTotal) }, red)];
    } else {
      const leadWeeks = b.lead / 7;
      const rows = list.filter(m => m.avgS > 0).map(m => ({ m, cover: proj(m).map(v => Math.round(v / m.avgS * 10) / 10) }));
      rows.sort((x, y) => x.cover[weeks.length - 1] - y.cover[weeks.length - 1]);
      datasets = rows.slice(0, 10).map((r, i) => ({ label: r.m.name, data: r.cover, borderColor: colorOf(i), backgroundColor: colorOf(i) + '18', tension: .4, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2, fill: false }))
        .concat([Object.assign({ label: 'Min Stock (' + fmt(leadWeeks) + ' weeks)', data: Array(weeks.length).fill(Math.round(leadWeeks * 10) / 10) }, red)]);
      unit = ' wks'; ymax = Math.ceil(leadWeeks * 3);
    }
    inst.data.datasets = datasets;
    inst.options.scales.y.ticks.callback = unit ? (v => v + unit) : undefined;
    inst.options.scales.y.max = ymax;
    inst.options.plugins.tooltip.callbacks = unit ? { label: c => c.dataset.label + ': ' + c.parsed.y + unit } : {};
    inst.update('none');
  }

  // ---------- the wrapper ----------
  window.renderForecast = function (models, brand) {
    const b = BR[brand];
    if (!b) return orig.apply(this, arguments);
    try {
      buildUI(brand);
      const st = S[brand];
      let list = (models || []).filter(m => !st.selected || st.selected.has(m.name));
      if (st.spikes) list = list.map(m => { const a = analyse(m); return a.flagged.length ? Object.assign({}, m, { avgS: a.adjAvg }) : m; });
      refreshLabels(brand); refreshNote(brand);
      if (!list.length) { showEmpty(brand); return; }
      const r = orig.call(this, list, brand);
      fixChart(brand, list);
      return r;
    } catch (e) {
      console.warn('[forecast-plus] falling back to the original forecast:', e && e.message);
      return orig.apply(this, arguments);
    }
  };
})();
