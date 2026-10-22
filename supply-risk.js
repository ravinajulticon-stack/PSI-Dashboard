// PSI Dashboard - Supply Risk Board (added 2026-10-22). Phase 0 + 1 of the Forecast plan.
// A board at the top of each brand's Forecast tab: for every model, how long stock lasts, when it is likely to run out, whether a
// delivery lands before that, the chance of running out within one lead time, an action flag and a suggested order.
//  - Demand: Croston-SBA (best in the back-test), with weeks on an empty shelf and pre-launch weeks treated as UNKNOWN, not zero.
//  - Range: "likely / cautious / worst case" = 50th / 80th / 90th percentile of demand over one lead time, from the model's own history.
//  - Supply: deliveries already typed into the Forecast tab's "Incoming" boxes (stored per model and week). Anything not typed in
//    is treated as NOT ordered, and the board says so.
//  - Phase 0: the "Ignore One-Off Spikes" option was removed from the forecast card (the back-test showed it under-forecast demand by
//    about 28%).
//  - Overstock: a new model with under 12 weeks of history but 26+ weeks of cover is flagged Overstock (it used to read "New Model").
//  - Forecast Accuracy: a collapsible panel under the board replays the history and shows how far off the forecast would have been
//    (average miss and bias, 4 and 8 weeks ahead, by demand pattern and by week), new method against the current 8-week average.
//  - Deliveries: when deliveries.js is loaded, the lines on the Deliveries tab (PO, quantity, original and revised date, status) supply the arrivals,
//    with their delay shown on the board; models without a line still use the older Incoming boxes. Overdue lines are not counted.
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
  let BASE_YEAR = 0;                                                               // year of the latest week; set on every render
  const wkLabel = n => 'W' + String(((n - 1) % 52 + 52) % 52 + 1).padStart(2, '0') + (BASE_YEAR && n > 52 ? ' \u2019' + String(BASE_YEAR + 1).slice(-2) : '');   // weeks past W52 get a next-year mark
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
    else if (isNew) action = (cover !== null && cover >= OVERSTOCK_WEEKS && likely.firstShort === null) ? 'Overstock' : 'New Model';   // a new model sitting on 26+ weeks of stock is still overstock
    else if (likely.firstShort !== null) action = nextArr && nextArr.ahead > likely.firstShort ? 'Expedite' : (nextArr ? 'Watch' : (cover !== null && cover < L || risk >= 50 || invNow <= 0 ? 'Order Now' : 'Watch'));
    else if (cover !== null && cover >= OVERSTOCK_WEEKS) action = 'Overstock';
    else if ((risk !== null && risk >= 20) || (cover !== null && cover < 1.5 * L)) action = 'Watch';
    else action = 'OK';
    if (action === 'Watch' && !nextArr && likely.firstShort === null && risk >= 50) action = 'Order Now';
    return { name: m.name, pattern, invNow, rate, rate80, cover, p50, p80, p90, risk, svc, suggest, onOrder, nextArr, arr, likely, cautious, action, tot, L, W, isNew, emptyWeeks, prelaunch, series, isCore };
  }
  function patternOf(s, valid, tot) {                                            // same split as analyse(): smooth / erratic / intermittent / lumpy
    const nz = s.filter((v, i) => valid[i] && v > 0), vals = s.filter((v, i) => valid[i]);
    const adi = nz.length ? vals.length / nz.length : 99, mu = mean(nz), cv2 = mu ? mean(nz.map(v => (v - mu) ** 2)) / (mu * mu) : 0;
    return tot < MIN_UNITS ? 'Low Volume' : (adi < 1.32 ? (cv2 < 0.49 ? 'Smooth' : 'Erratic') : (cv2 < 0.49 ? 'Intermittent' : 'Lumpy'));
  }
  function backtest(models) {                                                      // replay history: forecast the next 4 / 8 weeks from each week since W16, score against what sold
    const mk = () => ({ ae: 0, f: 0, a: 0 }), R = { models: 0, h: { 4: { n: mk(), c: mk() }, 8: { n: mk(), c: mk() } }, pat: {}, org: {} };
    const add = (pair, fn, fc, act) => { [[pair.n, fn], [pair.c, fc]].forEach(([acc, f]) => { acc.ae += Math.abs(f - act); acc.f += f; acc.a += act; }); };
    models.forEach(m => {
      const s = m.s.map(v => Math.max(0, v || 0)), inv = m.inv, n = s.length, tot = sum(s); if (tot < MIN_UNITS) return;
      const valid = s.map((v, i) => inv[i] != null && !(inv[i] <= 0 && v <= 0)), pat = patternOf(s, valid, tot);
      R.models++; R.pat[pat] = R.pat[pat] || { models: 0, n: mk(), c: mk() }; R.pat[pat].models++;
      for (const H of [4, 8]) for (let t = 12; t <= n - H - 1; t++) {
        const act = sum(s.slice(t + 1, t + 1 + H));
        const fn = croston(s.slice(0, t + 1).filter((v, i) => valid[i])) * H, fc = mean(s.slice(Math.max(0, t - 7), t + 1)) * H;
        add(R.h[H], fn, fc, act);
        if (H === 8) { const o = R.org[t] = R.org[t] || { lbl: m.allWeeks[t], n: mk(), c: mk() }; add(o, fn, fc, act); add(R.pat[pat], fn, fc, act); }
      }
    });
    const sc = acc => acc.a > 0 ? { miss: 100 * acc.ae / acc.a, bias: 100 * (acc.f - acc.a) / acc.a } : null;
    return { models: R.models, h4: { n: sc(R.h[4].n), c: sc(R.h[4].c) }, h8: { n: sc(R.h[8].n), c: sc(R.h[8].c) },
      pat: Object.fromEntries(Object.entries(R.pat).map(([k, v]) => [k, { models: v.models, n: sc(v.n), c: sc(v.c) }])),
      org: Object.keys(R.org).map(Number).sort((a, b) => a - b).map(t => ({ lbl: R.org[t].lbl, n: sc(R.org[t].n), c: sc(R.org[t].c) })) };
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
  .sr-chip { font: inherit; font-size: 11.5px; font-weight: 600; width: 112px; padding: 4px 0; box-sizing: border-box; text-align: center; white-space: nowrap; border-radius: 999px; border: 1px solid transparent; cursor: pointer; background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--c); }
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
  .sr-act { display: inline-block; width: 88px; box-sizing: border-box; text-align: center; white-space: nowrap; font-size: 11px; font-weight: 700; padding: 3px 0; border-radius: 999px; background: color-mix(in srgb, var(--c) 18%, transparent); color: var(--c); }
  .sr-detail td { text-align: left; white-space: normal; background: color-mix(in srgb, var(--mac-text) 3%, transparent); padding: 14px 16px; }
  .sr-dgrid { display: grid; grid-template-columns: minmax(250px, 1fr) minmax(0, 1.6fr); gap: 18px; align-items: start; }
  .sr-kv { display: grid; grid-template-columns: auto 1fr; gap: 5px 14px; font-size: 12px; }
  .sr-kv span:nth-child(odd) { color: var(--mac-text2); } .sr-kv span:nth-child(even) { color: var(--mac-text); font-weight: 600; text-align: right; }
  .sr-chartbox { position: relative; height: 200px; }
  .sr-foot { font-size: 11px; color: var(--mac-text3); margin-top: 10px; line-height: 1.5; }
  .sr-acc { margin-top: 12px; border-top: 1px solid var(--mac-border); padding-top: 10px; }
  .sr-acc-toggle { font: inherit; font-size: 12px; font-weight: 600; color: var(--mac-text); background: color-mix(in srgb, var(--mac-text) 8%, transparent); border: 0; border-radius: 8px; padding: 6px 14px; cursor: pointer; }
  .sr-acc-toggle:hover { background: color-mix(in srgb, var(--mac-text) 14%, transparent); }
  .sr-acc h4 { font-size: 12.5px; font-weight: 600; color: var(--mac-text); margin: 16px 0 6px; }
  .sr-acc p { font-size: 11.5px; color: var(--mac-text2); line-height: 1.55; margin: 8px 0 0; }
  .sr-acc table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .sr-acc th { text-align: right; font-size: 11px; font-weight: 600; color: var(--mac-text2); padding: 6px 9px; border-bottom: 1px solid var(--mac-border2); }
  .sr-acc td { text-align: right; padding: 7px 9px; border-bottom: 1px solid var(--mac-border); color: var(--mac-text); white-space: nowrap; }
  .sr-acc th:first-child, .sr-acc td:first-child { text-align: left; }
  .sr-acc td.better { color: var(--mac-green); font-weight: 600; }
  .sr-accgrid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 20px; align-items: start; }
  @media (max-width: 900px) { .sr-accgrid { grid-template-columns: 1fr; } }
  @media (max-width: 900px) { .sr-dgrid { grid-template-columns: 1fr; } }`;
  document.head.appendChild(css);

  function getAnalysis(k) {
    const b = BR[k], models = b.models(); if (!models.length) return null;
    const latestLbl = models[0].allWeeks[models[0].allWeeks.length - 1], latestNum = wkNum(latestLbl); if (latestNum == null) return null;
    const yr = parseInt(((models[0].rows || []).slice(-1)[0] || {}).month, 10); BASE_YEAR = isNaN(yr) ? 0 : yr;
    const P = window.PSI_PIPELINE, legacy = incomingFor(k), incoming = Object.assign({}, legacy), pl = P ? P.lines(k) : [], over = new Set();
    if (pl.length) { const arrs = P.arrivals(k); P.models(k).forEach(n => { incoming[n] = arrs[n] || {}; over.add(n); }); }          // a model with a line on the Deliveries tab ignores the old Incoming boxes
    const pi = pl.map(l => ({ l, i: P.info(l) })).filter(x => x.i.open), legacyN = Object.keys(legacy).filter(n => !over.has(n)).reduce((s, n) => s + Object.keys(legacy[n] || {}).length, 0);
    const pipe = P ? { any: pl.length > 0, n: pi.filter(x => !x.i.overdue).length, units: sum(pi.filter(x => !x.i.overdue).map(x => +x.l.qty || 0)), delayed: pi.filter(x => x.i.delay > 0).length, overdue: pi.filter(x => x.i.overdue).length, meta: P.meta(k), legacyN } : null;
    const tots = models.map(m => ({ n: m.name, t: Math.max(0, sum(m.s.map(v => Math.max(0, v || 0)))) })).sort((a, c) => c.t - a.t);
    const grand = sum(tots.map(x => x.t)) || 1; const core = new Set(); let run = 0; for (const x of tots) { if (run / grand >= 0.8) break; core.add(x.n); run += x.t; }
    const list = models.map(m => analyse(m, b.lead, latestNum, incoming, core.has(m.name)));
    list.sort((a, c) => RANK[a.action] - RANK[c.action] || (c.risk || 0) - (a.risk || 0) || (a.cover == null ? 1e9 : a.cover) - (c.cover == null ? 1e9 : c.cover));
    const aheadOf = x => { let n = P.isoWeek(x.eff) - latestNum; if (n <= -26) n += 52; return n; };
    list.forEach(a => { a.dl = pi.filter(x => x.l.model === a.name && x.i.eff).map(x => ({ po: x.l.po, qty: +x.l.qty || 0, eff: x.i.eff, due: x.i.due, delay: x.i.delay, overdue: x.i.overdue })).sort((p, q) => p.eff - q.eff); a.nextLine = a.nextArr ? a.dl.find(x => !x.overdue && aheadOf(x) === a.nextArr.ahead) : null; });
    return { list, latestLbl, latestNum, pipe, lines: Object.values(incoming).reduce((a, o) => a + Object.keys(o || {}).length, 0) };
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
    const rawCol = getComputedStyle(document.getElementById(BR[k].box)).getPropertyValue('--rd-brand').trim() || 'rgb(10, 132, 255)';
    const mm = /(\d+)\D+(\d+)\D+(\d+)/.exec(rawCol);                                // the brand colour comes back as rgb(...), so build the faded band from its parts
    const brandCol = mm ? 'rgb(' + mm[1] + ',' + mm[2] + ',' + mm[3] + ')' : '#0a84ff', bandCol = mm ? 'rgba(' + mm[1] + ',' + mm[2] + ',' + mm[3] + ',0.22)' : 'rgba(10,132,255,0.22)';
    const leadIdx = a.L;
    if (charts[k]) { charts[k].destroy(); }
    charts[k] = new Chart(canvas, { type: 'line', data: { labels, datasets: [
      { label: 'Low End (10th Percentile)', data: labels.map((_, t) => at(t, 0.1)), borderColor: 'transparent', backgroundColor: 'transparent', pointRadius: 0, fill: false },
      { label: 'Likely Range', data: labels.map((_, t) => at(t, 0.9)), borderColor: 'transparent', backgroundColor: bandCol, pointRadius: 0, fill: '-1' },
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
    const PP = window.PSI_PIPELINE;
    add('Deliveries Entered', a.dl && a.dl.length ? a.dl.map(x => (x.po ? x.po + ': ' : '') + x.qty + ' on ' + PP.fmtDate(x.eff) + (x.overdue ? ' (Overdue, Not Counted)' : (x.delay > 0 ? ' (' + x.delay + ' Days Late)' : ''))).join('; ') : (a.onOrder > 0 ? Object.keys(a.arr).map(Number).sort((x, y) => x - y).map(t => wkLabel(latestNum + t) + ': ' + a.arr[t]).join(', ') : 'None'));
    add('Weeks Left Out Of The Estimate', a.emptyWeeks + ' Empty Shelf, ' + a.prelaunch + ' Before Launch');
    add('Weeks Of History', a.series.length + (a.isNew ? ' (Short: Treat With Care)' : ''));
    if (a.suggest > 0 && ['Order Now', 'Watch', 'Expedite'].includes(a.action)) add('Suggested Order', a.suggest + ' Units (' + Math.round(a.svc * 100) + '% Cover + ' + CYCLE_WEEKS + ' Weeks)');
    const left = el('div'); left.appendChild(kv);
    const right = el('div'); const box = el('div', 'sr-chartbox'); const cv = el('canvas'); box.appendChild(cv); right.appendChild(box);
    g.appendChild(left); g.appendChild(right); td.appendChild(g); tr.appendChild(td);
    setTimeout(() => { try { drawChart(k, a, latestNum, cv); } catch (e) { console.warn('[supply-risk] chart', e && e.message); } }, 0);
    return tr;
  }
  const pctTxt = v => v == null ? '\u2014' : (Math.round(v * 10) / 10).toFixed(1) + '%';
  const biasTxt = v => v == null ? '\u2014' : (v >= 0 ? '+' : '\u2212') + Math.abs(Math.round(v * 10) / 10).toFixed(1) + '%' + (Math.abs(v) < 0.5 ? '' : (v < 0 ? ' (Too Low)' : ' (Too High)'));
  function accTable(headers, rows) {
    const t = el('table'), th = el('thead'), hr = el('tr'); headers.forEach(h => hr.appendChild(el('th', null, h))); th.appendChild(hr); t.appendChild(th);
    const tb = el('tbody'); rows.forEach(r => { const tr = el('tr'); r.forEach(c => { const td = el('td', c && c.cls ? c.cls : null, c && c.t != null ? c.t : c); tr.appendChild(td); }); tb.appendChild(tr); }); t.appendChild(tb); return t;
  }
  function drawAccuracy(k, org, canvas) {
    if (typeof Chart === 'undefined' || !org.length) return;
    const rawCol = getComputedStyle(document.getElementById(BR[k].box)).getPropertyValue('--rd-brand').trim() || 'rgb(10, 132, 255)';
    const mm = /(\d+)\D+(\d+)\D+(\d+)/.exec(rawCol), brandCol = mm ? 'rgb(' + mm[1] + ',' + mm[2] + ',' + mm[3] + ')' : '#0a84ff';
    if (charts[k + 'acc']) charts[k + 'acc'].destroy();
    charts[k + 'acc'] = new Chart(canvas, { type: 'line', data: { labels: org.map(o => o.lbl), datasets: [
      { label: 'New Method', data: org.map(o => o.n ? Math.round(o.n.miss * 10) / 10 : null), borderColor: brandCol, backgroundColor: brandCol, borderWidth: 2, pointRadius: 2, tension: 0.15 },
      { label: 'Current 8-Week Average', data: org.map(o => o.c ? Math.round(o.c.miss * 10) / 10 : null), borderColor: '#98989d', backgroundColor: '#98989d', borderWidth: 2, borderDash: [5, 4], pointRadius: 2, tension: 0.15 }
    ] }, options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: true, labels: { boxWidth: 12, font: { size: 10 } } }, tooltip: { mode: 'index', intersect: false } },
      scales: { x: { ticks: { maxTicksLimit: 10, font: { size: 10 } }, grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: 'Average Miss (%)', font: { size: 10 } }, ticks: { font: { size: 10 } } } } } });
  }
  function accuracyBlock(k, host) {
    const st = state[k], box = el('div', 'sr-acc'), tg = el('button', 'sr-acc-toggle', (st.acc ? 'Hide' : 'Show') + ' Forecast Accuracy'); tg.type = 'button';
    tg.addEventListener('click', () => { st.acc = !st.acc; render(k); }); box.appendChild(tg);
    if (st.acc) {
      const mine = backtest(BR[k].models()), all = backtest([].concat(...Object.keys(BR).map(x => BR[x].models())));
      box.appendChild(el('p', null, 'How far off the forecast would have been. For every week since W16 the history is replayed: forecast the next 4 and 8 weeks using only the weeks before, then compare with what actually sold. Lower is better. "New Method" is the one this board uses; "Current" is the 8-week average the Overview and the old forecast card use.'));
      const better = (a, b) => (a && b && a.miss < b.miss) ? 'better' : null;
      const row = (scope, label, r) => [scope, label, { t: pctTxt(r.n && r.n.miss), cls: better(r.n, r.c) }, pctTxt(r.c && r.c.miss), biasTxt(r.n && r.n.bias), biasTxt(r.c && r.c.bias)];
      box.appendChild(el('h4', null, 'Average Miss And Bias'));
      box.appendChild(accTable(['Scope', 'Look-Ahead', 'Miss: New', 'Miss: Current', 'Bias: New', 'Bias: Current'], [
        row(BR[k].name + ' (' + mine.models + ' Models)', 'Next 4 Weeks', { n: mine.h4.n, c: mine.h4.c }), row('', 'Next 8 Weeks', { n: mine.h8.n, c: mine.h8.c }),
        row('All Brands (' + all.models + ' Models)', 'Next 4 Weeks', { n: all.h4.n, c: all.h4.c }), row('', 'Next 8 Weeks', { n: all.h8.n, c: all.h8.c })]));
      const g = el('div', 'sr-accgrid'), left = el('div'), right = el('div');
      const pats = ['Smooth', 'Erratic', 'Intermittent', 'Lumpy'].filter(p => mine.pat[p]);
      left.appendChild(el('h4', null, 'By Demand Pattern: ' + BR[k].name + ', Next 8 Weeks'));
      left.appendChild(pats.length ? accTable(['Pattern', 'Models', 'Miss: New', 'Miss: Current'], pats.map(p => [p, String(mine.pat[p].models), { t: pctTxt(mine.pat[p].n && mine.pat[p].n.miss), cls: better(mine.pat[p].n, mine.pat[p].c) }, pctTxt(mine.pat[p].c && mine.pat[p].c.miss)])) : el('p', null, 'Not enough history to score yet.'));
      right.appendChild(el('h4', null, 'Average Miss By The Week The Forecast Was Made'));
      const cb = el('div', 'sr-chartbox'), cv = el('canvas'); cb.appendChild(cv); right.appendChild(cb);
      g.appendChild(left); g.appendChild(right); box.appendChild(g);
      box.appendChild(el('p', null, 'Read with care: sales are recorded as zero on weeks the shelf was empty, so models that ran out look easier to forecast than they were, which slightly flatters the Current method and slightly penalises the New one. Lumpy and intermittent models miss by far more whichever method is used, so lean on the range and the chance of running out, not on one date. Models that sold fewer than ' + MIN_UNITS + ' units are left out.'));
      setTimeout(() => { try { drawAccuracy(k, mine.org, cv); } catch (e) { console.warn('[supply-risk] accuracy chart', e && e.message); } }, 0);
    }
    host.appendChild(box);
  }
  function noteText(res) {
    const p = res.pipe, lines = res.lines, P = window.PSI_PIPELINE;
    if (p && p.any) {
      let t = 'Deliveries counted: ' + p.n + ' on the Deliveries tab (' + p.units.toLocaleString() + ' units)' + (p.delayed ? ', ' + p.delayed + ' running late' : '') + (p.overdue ? ', ' + p.overdue + ' overdue and not counted' : '');
      if (p.meta && p.meta.updatedAt) { const age = P.daysBetween(new Date(p.meta.updatedAt), new Date()); t += '. Last updated ' + P.fmtDate(new Date(p.meta.updatedAt)) + (p.meta.updatedBy ? ' by ' + p.meta.updatedBy : '') + (age > P.staleDays ? ', which is ' + age + ' days ago: check the dates with ' + P.owner : ''); }
      return t + '.' + (p.legacyN ? ' Models with no delivery line use the older Incoming boxes.' : '') + ' Anything not entered is treated as not ordered.';
    }
    if (lines > 0) return 'Deliveries counted: the ' + lines + ' line' + (lines === 1 ? '' : 's') + ' typed into the older Incoming boxes. Add them on the Deliveries tab to see delays and dates here. Anything not entered is treated as not ordered.';
    if (p && p.meta && p.meta.confirmed === 'none') { const age = P.daysBetween(new Date(p.meta.updatedAt), new Date()); return 'Nothing is on order for this brand: confirmed by ' + (p.meta.updatedBy || 'Unknown') + ' on ' + P.fmtDate(new Date(p.meta.updatedAt)) + (age > P.staleDays ? ', which is ' + age + ' days ago: confirm again on the Deliveries tab' : '') + '. Every model is treated as having nothing on order.'; }
    return 'No deliveries are entered, so every model is treated as having nothing on order. Add them on the Deliveries tab' + (P ? ' (' + P.owner + ' keeps this list)' : '') + ' to see arrival dates and delays here.';
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
    if (window.PSI_PIPELINE && window.PSI_PIPELINE.openReport) { const rb = el('button', 'sr-acc-toggle', 'Weekly Supply Report'); rb.type = 'button'; rb.style.marginTop = '8px'; rb.addEventListener('click', () => window.PSI_PIPELINE.openReport(k)); ttl.appendChild(rb); }
    head.appendChild(ttl); const chips = el('div', 'sr-chips');
    ['Order Now', 'Expedite', 'Watch', 'OK', 'Overstock', 'New Model', 'Low Volume'].forEach(name => {
      const c = el('button', 'sr-chip' + (st.filter === name ? ' on' : '') + (counts[name] ? '' : ' zero'), name + ' ' + (counts[name] || 0)); c.type = 'button'; c.style.setProperty('--c', COL[name]);
      c.addEventListener('click', () => { st.filter = st.filter === name ? null : name; st.open = null; render(k); }); chips.appendChild(c);
    });
    head.appendChild(chips); host.appendChild(head);
    host.appendChild(el('div', 'sr-note', noteText(res)));
    const wrap = el('div', 'sr-wrap'); const tbl = el('table', 'sr-table'); const thead = el('thead'); const hr = el('tr');
    [['Model', ''], ['On Hand', ''], ['Demand / Wk', 'Typical weekly demand (Croston-SBA, empty-shelf weeks left out)'], ['Cover (Wks)', 'On hand divided by weekly demand'], ['Stock-Out', 'Likely week, with the cautious week (80% sure) in brackets'], ['Next Arrival', 'From the Incoming boxes'], ['Gap (Wks)', 'Weeks without stock in the next ' + H + ' weeks, likely case'], ['Chance Of Running Out', 'Share of past lead-time windows in which demand beat today\'s stock'], ['Suggested Order', 'Covers the chosen chance of not running out over the lead time, plus ' + CYCLE_WEEKS + ' weeks'], ['Action', '']].forEach(([t, tip]) => { const th = el('th', null, t); if (tip) th.title = tip; hr.appendChild(th); });
    thead.appendChild(hr); tbl.appendChild(thead); const tb = el('tbody');
    list.filter(a => !st.filter || a.action === st.filter).forEach(a => {
      const tr = el('tr', 'sr-row'); const nm = el('td'); nm.appendChild(el('span', 'sr-name', a.name)); nm.appendChild(el('span', 'sr-pat', a.pattern)); tr.appendChild(nm);
      const cell = (t, cls) => { const td = el('td', cls || null, t); tr.appendChild(td); return td; };
      cell(String(a.invNow), a.invNow <= 0 ? 'sr-bad' : null); cell(fmt1(a.rate)); cell(fmt1(a.cover), a.cover != null && a.cover < a.L ? 'sr-bad' : null);
      const so = stockOutText(a, 'likely', latestNum), sc = stockOutText(a, 'cautious', latestNum); cell(so === '\u2014' && sc === '\u2014' ? '\u2014' : so + (sc !== so ? ' (' + sc + ')' : ''), so === 'Now' ? 'sr-bad' : null);
      const late = a.nextLine && a.nextLine.delay > 0, od = !a.nextArr && a.dl && a.dl.some(x => x.overdue);
      const nx = cell(a.nextArr ? wkLabel(latestNum + a.nextArr.ahead) + ' (' + a.nextArr.qty + ')' + (late ? ' +' + a.nextLine.delay + 'd' : '') : (od ? 'Overdue' : 'None'), late || od ? 'sr-bad' : (a.nextArr ? null : 'sr-dim'));
      if (late) nx.title = 'Running ' + a.nextLine.delay + ' days late'; if (od) nx.title = 'The date has passed and it is not marked Arrived, so it is not counted. Update it on the Deliveries tab.';
      cell(a.nextArr || a.likely.empty === 0 ? (a.likely.empty ? String(a.likely.empty) : '0') : '\u2014', a.likely.empty > 0 ? 'sr-bad' : 'sr-dim');
      cell(a.risk == null ? '\u2014' : a.risk + '%', a.risk >= 50 ? 'sr-bad' : (a.risk == null ? 'sr-dim' : null));
      cell(a.suggest > 0 && ['Order Now', 'Watch', 'Expedite'].includes(a.action) ? String(a.suggest) : '\u2014', a.suggest > 0 && ['Order Now', 'Watch', 'Expedite'].includes(a.action) ? null : 'sr-dim');
      const ac = el('td'); const chip = el('span', 'sr-act', a.action); chip.style.setProperty('--c', COL[a.action]); ac.appendChild(chip); tr.appendChild(ac);
      tr.addEventListener('click', () => { st.open = st.open === a.name ? null : a.name; render(k); });
      tb.appendChild(tr); if (st.open === a.name) tb.appendChild(detailRow(k, a, latestNum));
    });
    tbl.appendChild(tb); wrap.appendChild(tbl); host.appendChild(wrap);
    host.appendChild(el('div', 'sr-foot', 'Indicative only. Built from ' + (list[0] ? list[0].series.length : 0) + ' or fewer weeks of history, so lumpy models stay hard to predict (the back-test missed by 66% to 80% on them): use the range, not a single date. Click a model for its range and projection. Core models (80% of units sold) are planned at 90% cover, the rest at 80%.'));
    accuracyBlock(k, host);
  }
  function refreshVisible() { Object.keys(BR).forEach(k => { const r = document.getElementById(BR[k].root); if (r && r.offsetParent !== null) { try { render(k); } catch (e) { console.warn('[supply-risk]', e && e.message); } } }); }
  Object.keys(BR).forEach(k => {
    const b = BR[k], orig = window[b.sw]; if (typeof orig !== 'function') return;
    window[b.sw] = function (name) { const r = orig.apply(this, arguments); if (name === b.view) setTimeout(() => { try { render(k); if (window.PSI_PIPELINE) window.PSI_PIPELINE.refresh(k); } catch (e) { console.warn('[supply-risk]', e && e.message); } }, 80); return r; };
  });
  ['renderForecast', 'renderPlocksForecast'].forEach(fn => { const o = window[fn]; if (typeof o !== 'function') return; window[fn] = function () { const r = o.apply(this, arguments); setTimeout(refreshVisible, 40); return r; }; });
  window.__srApi = { getAnalysis, BR, wkLabel, stockOutText };                     // used by the Weekly Supply Report in deliveries.js
  let hooks = 0; (function hook() { if (window.PSI_PIPELINE) window.PSI_PIPELINE.onChange(refreshVisible); else if (hooks++ < 20) setTimeout(hook, 600); })();   // redraw the board when deliveries change
  window.__srTest = { analyse, projectStock, croston, wkLabel, wkNum, backtest, patternOf };
})();
