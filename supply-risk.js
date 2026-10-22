// PSI Dashboard - Supply Risk Board (added 2026-10-22). Phase 0 + 1 of the Forecast plan.
// A board at the top of each brand's Forecast tab: for every model, how long stock lasts, when it is likely to run out, whether a
// delivery lands before that, the chance of running out within one lead time, an action flag and a suggested order.
//  - Demand: Croston-SBA (best in the back-test), with weeks on an empty shelf and pre-launch weeks treated as UNKNOWN, not zero.
//  - Range: "likely / cautious / worst case" = 50th / 80th / 90th percentile of demand over one lead time, from the model's own history.
//  - Supply: deliveries already typed into the Forecast tab's "Incoming" boxes (stored per model and week). Anything not typed in
//    is treated as NOT ordered, and the board says so.
//  - Phase 0: the "Ignore One-Off Spikes" setting is switched off once on each device (the back-test showed it under-forecasts by
//    about 28%) and its tooltip says so. The choice is respected afterwards.
// Nothing here changes the Overview, Weekly Entry, Full History or the existing forecast card. To undo: remove this script tag.
(function () {
  const BR = {
    samsung: { name: 'Samsung Locks', root: 'view-forecast', sw: 'switchView', view: 'forecast', lead: 60, box: 'brand-samsung', section: 'forecastSection', models: () => computeModels(getEntries()) },
    philips: { name: 'Philips Safes', root: 'pview-pforecast', sw: 'switchPhilipsView', view: 'pforecast', lead: 45, box: 'brand-philips', section: 'philipsForecastSection', models: () => computePhilipsModels(phGetEntries()) },
    plocks: { name: 'Philips Locks', root: 'plview-plforecast', sw: 'switchPlocksView', view: 'plforecast', lead: 60, box: 'brand-plocks', section: 'plocksForecastSection', models: () => computePlocksModels(plGetEntries()) }
  };
  const H = 14, MIN_UNITS = 15, OVERSTOCK_WEEKS = 26, CYCLE_WEEKS = 4;           // projection weeks, "real sales" threshold, overstock cover, order cycle
  const SERVICE = { core: 0.9, other: 0.8 };                                      // chance of NOT running out: core models (80% of sales) / the rest
  // <pure>
  const sum = a => a.reduce((x, y) => x + y, 0);
  const mean = a => a.length ? sum(a) / a.length : 0;
  const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const croston = h => { let z = 0, p = 1, q = 1, init = false; for (const v of h) { if (v > 0) { if (!init) { z = v; p = q; init = true; } else { z = 0.1 * v + 0.9 * z; p = 0.1 * q + 0.9 * p; } q = 1; } else q++; } return init ? 0.95 * z / p : 0; };
  const wkNum = lbl => { const m = /W(\d+)/.exec(lbl || ''); return m ? +m[1] : null; };
  const wkLabel = n => 'W' + String(((n - 1) % 52 + 52) % 52 + 1).padStart(2, '0');
  function projectStock(inv, rate, arr) {                                          // arr: {weeksAhead: units}; stock floors at zero (lost sales)
    let stock = inv, firstShort = null, empty = 0; const path = [inv];
    for (let t = 1; t <= H; t++) { stock += (arr[t] || 0) - rate; if (stock < 0) { stock = 0; if (firstShort === null) firstShort = t; empty++; } path.push(stock); }
    return { path, firstShort, empty };
  }
  function analyse(m, leadDays, latestNum, incoming, isCore) {
    const s = m.s.map(v => Math.max(0, v || 0)), inv = m.inv, n = s.length;
    const first = inv.findIndex(v => v != null); const start = first < 0 ? n : first;
    let invNow = 0; for (let i = n - 1; i >= 0; i--) if (inv[i] != null) { invNow = inv[i]; break; }
    const valid = s.map((v, i) => inv[i] != null && !(inv[i] <= 0 && v <= 0));
    const prelaunch = start, emptyWeeks = s.filter((v, i) => inv[i] != null && !valid[i]).length;
    const tot = sum(s), L = leadDays / 7, W = Math.ceil(L), scale = L / W;
    const rate = croston(s.filter((v, i) => valid[i]));
    const series = s.map((v, i) => valid[i] ? v : rate).slice(start);
    const wins = []; for (let i = 0; i + W <= series.length; i++) wins.push(sum(series.slice(i, i + W)) * scale);
    const arr = {}; let onOrder = 0, nextArr = null;
    const inc = incoming && incoming[m.name] || {};
    Object.keys(inc).forEach(wk => { const num = wkNum(wk); if (num == null || !(inc[wk] > 0)) return; let ahead = num - latestNum; if (ahead <= -26) ahead += 52; if (ahead >= 1 && ahead <= H) { arr[ahead] = (arr[ahead] || 0) + inc[wk]; onOrder += inc[wk]; } });
    const arrKeys = Object.keys(arr).map(Number).sort((a, b) => a - b); if (arrKeys.length) nextArr = { ahead: arrKeys[0], qty: arr[arrKeys[0]] };
    const nz = s.filter((v, i) => valid[i] && v > 0), vals = s.filter((v, i) => valid[i]);
    const adi = nz.length ? vals.length / nz.length : 99, mu = mean(nz), cv2 = mu ? mean(nz.map(v => (v - mu) ** 2)) / (mu * mu) : 0;
    const pattern = tot < MIN_UNITS ? 'Low Volume' : (adi < 1.32 ? (cv2 < 0.49 ? 'Smooth' : 'Erratic') : (cv2 < 0.49 ? 'Intermittent' : 'Lumpy'));
    const isNew = series.length < 12 || wins.length < 6;
    const p50 = pct(wins, 0.5), p80 = pct(wins, 0.8), p90 = pct(wins, 0.9), svc = isCore ? SERVICE.core : SERVICE.other;
    const rate80 = p80 / L;
    const likely = projectStock(invNow, rate, arr), cautious = projectStock(invNow, Math.max(rate, rate80), arr);
    const cover = rate > 0 ? invNow / rate : null;
    const risk = invNow <= 0 ? 100 : (wins.length ? Math.round(100 * wins.filter(w => w > invNow).length / wins.length) : null);
    const target = pct(wins, svc) + CYCLE_WEEKS * rate, net = invNow + onOrder, suggest = Math.max(0, Math.ceil(target - net));
    let action;
    if (pattern === 'Low Volume') action = 'Low Volume';
    else if (isNew) action = 'New Model';
    else if (likely.firstShort !== null) action = nextArr && nextArr.ahead > likely.firstShort ? 'Expedite' : (nextArr ? 'Watch' : (cover !== null && cover < L || risk >= 50 || invNow <= 0 ? 'Order Now' : 'Watch'));
    else if (cover !== null && cover >= OVERSTOCK_WEEKS) action = 'Overstock';
    else if ((risk !== null && risk >= 20) || (cover !== null && cover < 1.5 * L)) action = 'Watch';
    else action = 'OK';
    if (action === 'Watch' && !nextArr && likely.firstShort === null && risk >= 50) action = 'Order Now';
    return { name: m.name, pattern, invNow, rate, rate80, cover, p50, p80, p90, risk, svc, suggest, onOrder, nextArr, arr, likely, cautious, action, tot, L, W, isNew, emptyWeeks, prelaunch, series, isCore };
  }
  // </pure>
  const RANK = { 'Order Now': 0, 'Expedite': 1, 'Watch': 2, 'OK': 3, 'Overstock': 4, 'New Model': 5, 'Low Volume': 6 };
  const COL = { 'Order Now': 'var(--mac-red)', 'Expedite': 'var(--mac-orange)', 'Watch': '#ffd60a', 'OK': 'var(--mac-green)', 'Overstock': 'var(--mac-teal)', 'New Model': 'var(--mac-text3)', 'Low Volume': 'var(--mac-text3)' };
  const state = { samsung: { filter: null, open: null }, philips: { filter: null, open: null }, plocks: { filter: null, open: null } };
  const charts = {};
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const fmt1 = v => v == null ? '\u2014' : (v >= 100 ? '100+' : (Math.round(v * 10) / 10).toString());
  const incomingFor = k => { try { return JSON.parse(localStorage.getItem(k + '_incoming_v1') || '{}'); } catch (e) { return {}; } };

  const css = document.createElement('style'); css.id = 'psi-supply-risk';
  css.textContent = `
  .sr-board { background: var(--mac-surface); border: 1px solid var(--mac-border); border-radius: 12px; padding: 16px 18px 12px; margin: 0 0 16px; }
  .sr-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 10px 20px; }
  .sr-title { font-size: 16px; font-weight: 600; color: var(--mac-text); }
  .sr-sub { font-size: 11.5px; color: var(--mac-text2); margin-top: 3px; }
  .sr-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .sr-chip { font: inherit; font-size: 11.5px; font-weight: 600; padding: 4px 11px; border-radius: 999px; border: 1px solid transparent; cursor: pointer; background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--c); }
  .sr-chip.on { border-color: var(--c); }
  .sr-chip.zero { opacity: 0.45; }
  .sr-note { font-size: 11.5px; color: var(--mac-text2); background: color-mix(in srgb, var(--mac-orange) 12%, transparent); border-radius: 8px; padding: 7px 11px; margin: 10px 0 8px; }
  .sr-wrap { overflow-x: auto; }
  .sr-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .sr-table th { text-align: right; font-size: 11px; font-weight: 600; color: var(--mac-text2); padding: 8px 9px; border-bottom: 1px solid var(--mac-border2); white-space: nowrap; }
  .sr-table td { text-align: right; padding: 9px 9px; border-bottom: 1px solid var(--mac-border); white-space: nowrap; color: var(--mac-text); }
  .sr-table th:first-child, .sr-table td:first-child { text-align: left; }
  .sr-table tbody tr.sr-row { cursor: pointer; }
  .sr-table tbody tr.sr-row:hover { background: color-mix(in srgb, var(--mac-text) 5%, transparent); }
  .sr-name { font-weight: 600; } .sr-pat { font-size: 10.5px; color: var(--mac-text3); margin-left: 6px; font-weight: 400; }
  .sr-dim { color: var(--mac-text3); } .sr-bad { color: var(--mac-red); font-weight: 600; }
  .sr-act { display: inline-block; min-width: 76px; text-align: center; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; background: color-mix(in srgb, var(--c) 18%, transparent); color: var(--c); }
  .sr-detail td { text-align: left; white-space: normal; background: color-mix(in srgb, var(--mac-text) 3%, transparent); padding: 14px 16px; }
  .sr-dgrid { display: grid; grid-template-columns: minmax(250px, 1fr) minmax(0, 1.6fr); gap: 18px; align-items: start; }
  .sr-kv { display: grid; grid-template-columns: auto 1fr; gap: 5px 14px; font-size: 12px; }
  .sr-kv span:nth-child(odd) { color: var(--mac-text2); } .sr-kv span:nth-child(even) { color: var(--mac-text); font-weight: 600; text-align: right; }
  .sr-chartbox { position: relative; height: 200px; }
  .sr-foot { font-size: 11px; color: var(--mac-text3); margin-top: 10px; line-height: 1.5; }
  @media (max-width: 900px) { .sr-dgrid { grid-template-columns: 1fr; } }`;
  document.head.appendChild(css);

  function getAnalysis(k) {
    const b = BR[k], models = b.models(); if (!models.length) return null;
    const latestLbl = models[0].allWeeks[models[0].allWeeks.length - 1], latestNum = wkNum(latestLbl); if (latestNum == null) return null;
    const incoming = incomingFor(k);
    const tots = models.map(m => ({ n: m.name, t: Math.max(0, sum(m.s.map(v => Math.max(0, v || 0)))) })).sort((a, c) => c.t - a.t);
    const grand = sum(tots.map(x => x.t)) || 1; const core = new Set(); let run = 0; for (const x of tots) { if (run / grand >= 0.8) break; core.add(x.n); run += x.t; }
    const list = models.map(m => analyse(m, b.lead, latestNum, incoming, core.has(m.name)));
    list.sort((a, c) => RANK[a.action] - RANK[c.action] || (c.risk || 0) - (a.risk || 0) || (a.cover == null ? 1e9 : a.cover) - (c.cover == null ? 1e9 : c.cover));
    return { list, latestLbl, latestNum, lines: Object.values(incoming).reduce((a, o) => a + Object.keys(o || {}).length, 0) };
  }
  function stockOutText(a, which, latestNum) {
    const p = which === 'likely' ? a.likely : a.cautious; if (a.invNow <= 0) return 'Now';
    return p.firstShort === null ? '\u2014' : wkLabel(latestNum + p.firstShort);
  }
  function drawChart(k, a, latestNum, canvas) {
    if (typeof Chart === 'undefined') return;
    const N = 2000, base = a.series.slice(-26), mu = mean(base), sc = mu > 0 ? a.rate / mu : 0, paths = [];
    for (let i = 0; i < N; i++) { let st = a.invNow; const p = [st]; for (let t = 1; t <= H; t++) { const d = base.length ? base[Math.floor(Math.random() * base.length)] * sc : 0; st = Math.max(0, st + (a.arr[t] || 0) - d); p.push(st); } paths.push(p); }
    const at = (t, q) => pct(paths.map(p => p[t]), q);
    const labels = ['Now']; for (let t = 1; t <= H; t++) labels.push(wkLabel(latestNum + t));
    const brandCol = getComputedStyle(document.getElementById(BR[k].box)).getPropertyValue('--rd-brand').trim() || '#0a84ff';
    const leadIdx = a.L;
    if (charts[k]) { charts[k].destroy(); }
    charts[k] = new Chart(canvas, { type: 'line', data: { labels, datasets: [
      { label: 'Low End (10th Percentile)', data: labels.map((_, t) => at(t, 0.1)), borderColor: 'transparent', backgroundColor: 'transparent', pointRadius: 0, fill: false },
      { label: 'Likely Range', data: labels.map((_, t) => at(t, 0.9)), borderColor: 'transparent', backgroundColor: brandCol + '33', pointRadius: 0, fill: '-1' },
      { label: 'Median Stock', data: labels.map((_, t) => at(t, 0.5)), borderColor: brandCol, backgroundColor: brandCol, borderWidth: 2, pointRadius: 0, tension: 0.15, fill: false }
    ] }, options: { responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
      scales: { x: { ticks: { maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: 'Units In Stock', font: { size: 10 } }, ticks: { font: { size: 10 } } } } },
      plugins: [{ id: 'srLead', afterDraw(c) { const x = c.scales.x.getPixelForValue(Math.min(H, leadIdx)); const y = c.chartArea; const g = c.ctx; g.save(); g.setLineDash([4, 4]); g.strokeStyle = '#ff9f0a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y.top); g.lineTo(x, y.bottom); g.stroke(); g.setLineDash([]); g.fillStyle = '#ff9f0a'; g.font = '10px sans-serif'; g.textAlign = 'right'; g.fillText('An Order Placed Today Arrives About Here', x - 4, y.top + 11); g.restore(); } }] });
  }
  function detailRow(k, a, latestNum) {
    const tr = el('tr', 'sr-detail'); const td = el('td'); td.colSpan = 10; const g = el('div', 'sr-dgrid'); const kv = el('div', 'sr-kv');
    const add = (l, v) => { kv.appendChild(el('span', null, l)); kv.appendChild(el('span', null, v)); };
    const L = Math.round(BR[k].lead);
    add('Demand Pattern', a.pattern); add('Typical Weekly Demand', fmt1(a.rate));
    add('Demand Over ' + L + ' Days: Likely', Math.round(a.p50) + ' Units'); add('Cautious (80% Sure)', Math.round(a.p80) + ' Units'); add('Worst Case (90% Sure)', Math.round(a.p90) + ' Units');
    add('Stock-Out: Likely / Cautious', stockOutText(a, 'likely', latestNum) + ' / ' + stockOutText(a, 'cautious', latestNum));
    add('Deliveries Entered', a.onOrder > 0 ? Object.keys(a.arr).map(Number).sort((x, y) => x - y).map(t => wkLabel(latestNum + t) + ': ' + a.arr[t]).join(', ') : 'None');
    add('Weeks Left Out Of The Estimate', a.emptyWeeks + ' Empty Shelf, ' + a.prelaunch + ' Before Launch');
    if (a.suggest > 0 && ['Order Now', 'Watch', 'Expedite'].includes(a.action)) add('Suggested Order', a.suggest + ' Units (' + Math.round(a.svc * 100) + '% Cover + ' + CYCLE_WEEKS + ' Weeks)');
    const left = el('div'); left.appendChild(kv);
    const right = el('div'); const box = el('div', 'sr-chartbox'); const cv = el('canvas'); box.appendChild(cv); right.appendChild(box);
    g.appendChild(left); g.appendChild(right); td.appendChild(g); tr.appendChild(td);
    setTimeout(() => { try { drawChart(k, a, latestNum, cv); } catch (e) { console.warn('[supply-risk] chart', e && e.message); } }, 0);
    return tr;
  }
  function render(k) {
    const b = BR[k], root = document.getElementById(b.root); if (!root) return;
    let host = root.querySelector(':scope > .sr-board');
    const res = getAnalysis(k); if (!res) return;
    if (!host) { host = el('div', 'sr-board'); const sec = document.getElementById(b.section); if (sec && sec.parentNode === root) root.insertBefore(host, sec); else root.appendChild(host); }
    host.textContent = ''; const st = state[k], { list, latestLbl, latestNum, lines } = res;
    const counts = {}; list.forEach(a => counts[a.action] = (counts[a.action] || 0) + 1);
    const head = el('div', 'sr-head'); const ttl = el('div'); ttl.appendChild(el('div', 'sr-title', 'Supply Risk Board'));
    ttl.appendChild(el('div', 'sr-sub', b.name + '  |  Lead Time ' + b.lead + ' Days  |  Latest Week ' + latestLbl + '  |  Demand: Croston-SBA, Empty-Shelf Weeks Left Out'));
    head.appendChild(ttl); const chips = el('div', 'sr-chips');
    ['Order Now', 'Expedite', 'Watch', 'OK', 'Overstock', 'New Model', 'Low Volume'].forEach(name => {
      const c = el('button', 'sr-chip' + (st.filter === name ? ' on' : '') + (counts[name] ? '' : ' zero'), name + ' ' + (counts[name] || 0)); c.type = 'button'; c.style.setProperty('--c', COL[name]);
      c.addEventListener('click', () => { st.filter = st.filter === name ? null : name; st.open = null; render(k); }); chips.appendChild(c);
    });
    head.appendChild(chips); host.appendChild(head);
    host.appendChild(el('div', 'sr-note', lines > 0 ? 'Deliveries counted: the ' + lines + ' line' + (lines === 1 ? '' : 's') + ' typed into the Incoming boxes of the forecast below. Anything not typed there is treated as not ordered.' : 'No deliveries are entered, so every model is treated as having nothing on order. Type expected deliveries into the Incoming boxes of the forecast below to see arrival dates here.'));
    const wrap = el('div', 'sr-wrap'); const tbl = el('table', 'sr-table'); const thead = el('thead'); const hr = el('tr');
    [['Model', ''], ['On Hand', ''], ['Demand / Wk', 'Typical weekly demand (Croston-SBA, empty-shelf weeks left out)'], ['Cover (Wks)', 'On hand divided by weekly demand'], ['Stock-Out', 'Likely week, with the cautious week (80% sure) in brackets'], ['Next Arrival', 'From the Incoming boxes'], ['Gap (Wks)', 'Weeks without stock in the next ' + H + ' weeks, likely case'], ['Chance Of Running Out', 'Share of past lead-time windows in which demand beat today\'s stock'], ['Suggested Order', 'Covers the chosen chance of not running out over the lead time, plus ' + CYCLE_WEEKS + ' weeks'], ['Action', '']].forEach(([t, tip]) => { const th = el('th', null, t); if (tip) th.title = tip; hr.appendChild(th); });
    thead.appendChild(hr); tbl.appendChild(thead); const tb = el('tbody');
    list.filter(a => !st.filter || a.action === st.filter).forEach(a => {
      const tr = el('tr', 'sr-row'); const nm = el('td'); nm.appendChild(el('span', 'sr-name', a.name)); nm.appendChild(el('span', 'sr-pat', a.pattern)); tr.appendChild(nm);
      const cell = (t, cls) => { const td = el('td', cls || null, t); tr.appendChild(td); return td; };
      cell(String(a.invNow), a.invNow <= 0 ? 'sr-bad' : null); cell(fmt1(a.rate)); cell(fmt1(a.cover), a.cover != null && a.cover < a.L ? 'sr-bad' : null);
      const so = stockOutText(a, 'likely', latestNum), sc = stockOutText(a, 'cautious', latestNum); cell(so === '\u2014' && sc === '\u2014' ? '\u2014' : so + (sc !== so ? ' (' + sc + ')' : ''), so === 'Now' ? 'sr-bad' : null);
      cell(a.nextArr ? wkLabel(latestNum + a.nextArr.ahead) + ' (' + a.nextArr.qty + ')' : 'None', a.nextArr ? null : 'sr-dim');
      cell(a.nextArr || a.likely.empty === 0 ? (a.likely.empty ? String(a.likely.empty) : '0') : '\u2014', a.likely.empty > 0 ? 'sr-bad' : 'sr-dim');
      cell(a.risk == null ? '\u2014' : a.risk + '%', a.risk >= 50 ? 'sr-bad' : (a.risk == null ? 'sr-dim' : null));
      cell(a.suggest > 0 && ['Order Now', 'Watch', 'Expedite'].includes(a.action) ? String(a.suggest) : '\u2014', a.suggest > 0 && ['Order Now', 'Watch', 'Expedite'].includes(a.action) ? null : 'sr-dim');
      const ac = el('td'); const chip = el('span', 'sr-act', a.action); chip.style.setProperty('--c', COL[a.action]); ac.appendChild(chip); tr.appendChild(ac);
      tr.addEventListener('click', () => { st.open = st.open === a.name ? null : a.name; render(k); });
      tb.appendChild(tr); if (st.open === a.name) tb.appendChild(detailRow(k, a, latestNum));
    });
    tbl.appendChild(tb); wrap.appendChild(tbl); host.appendChild(wrap);
    host.appendChild(el('div', 'sr-foot', 'Indicative only. Built from ' + (list[0] ? list[0].series.length : 0) + ' or fewer weeks of history, so lumpy models stay hard to predict (the back-test missed by 66% to 80% on them): use the range, not a single date. Click a model for its range and projection. Core models (80% of units sold) are planned at 90% cover, the rest at 80%.'));
    phase0(k);
  }
  function phase0(k) {                                                             // switch the spike setting off once per device, and say why
    const root = document.getElementById(BR[k].root); if (!root) return;
    const spike = root.querySelector('[data-fcp-rate="spikes"]'), avg = root.querySelector('[data-fcp-rate="avg"]'); if (!spike || !avg) return;
    const why = 'Back-test (Oct 2026): this setting under-forecast demand by about 28% on this business, because the big weeks are real orders that repeat. It is off by default. ';
    if (spike.title.indexOf('Back-test') !== 0) spike.title = why + spike.title;
    let done = false; try { done = localStorage.getItem('psi_fc_spikes_reset_v1') === '1'; } catch (e) {}
    if (!done) { try { localStorage.setItem('psi_fc_spikes_reset_v1', '1'); } catch (e) {} if (spike.classList.contains('active')) avg.click(); }
  }
  function refreshVisible() { Object.keys(BR).forEach(k => { const r = document.getElementById(BR[k].root); if (r && r.offsetParent !== null) { try { render(k); } catch (e) { console.warn('[supply-risk]', e && e.message); } } }); }
  Object.keys(BR).forEach(k => {
    const b = BR[k], orig = window[b.sw]; if (typeof orig !== 'function') return;
    window[b.sw] = function (name) { const r = orig.apply(this, arguments); if (name === b.view) setTimeout(() => { try { render(k); } catch (e) { console.warn('[supply-risk]', e && e.message); } }, 80); return r; };
  });
  ['renderForecast', 'renderPlocksForecast'].forEach(fn => { const o = window[fn]; if (typeof o !== 'function') return; window[fn] = function () { const r = o.apply(this, arguments); setTimeout(refreshVisible, 40); return r; }; });
  window.__srTest = { analyse, projectStock, croston, wkLabel, wkNum };
})();
