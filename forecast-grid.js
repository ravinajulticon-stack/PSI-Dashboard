// PSI Dashboard - Weekly Forecast table, new layout (added 2026-10-30). Step 2 of the Weekly Forecast layout work (step 1 is forecast-demand.js).
// It REPLACES the old Table view of the Weekly Forecast (the Cards view, the chart, the Model dropdown and the Products filter are untouched):
//  - one row per model (the empty Incoming row is gone): Model, On Hand, Demand/Wk, then the next 8 weeks; a delivery shows as a small green +N in the week it lands
//  - quiet cells: plain numbers, a soft red tint when cover is below the lead time, a soft blue tint above 26 weeks of cover, unchanged values faded
//  - the Total row is pinned at the top; a Units / Weeks Of Cover switch; Order (most urgent first by default); filter chips with counts
//  - the rows are grouped under the Supply Risk Board's headings (Needs Action, Watch, Healthy, Overstock, Low Volume); quiet groups start folded when there are many models
//  - click a model row to open its drill-down in place: a stock chart against the healthy band and the bridge (opening, demand, receipts, closing, short, cover)
// Every number comes from the Supply Risk Board's own analysis (window.__srApi.getAnalysis), so the table and the Board always agree. Nothing is stored except the
// Units / Weeks Of Cover and Order choices (this browser only). If anything is unexpected the old table is left as it was.
// To undo: remove this script tag; the old Table view comes straight back.
(function () {
  if (window.__fgInstalled || typeof window.renderForecast !== 'function') return;
  window.__fgInstalled = true;
  const prev = window.renderForecast;
  const BR = {
    samsung: { table: 'forecastTable', lead: 60 },
    philips: { table: 'philipsForecastTable', lead: 45 },
    plocks: { table: 'plocksForecastTable', lead: 60 }
  };
  const keyOf = brand => brand === 'philips' ? 'philips' : brand === 'plocks' ? 'plocks' : 'samsung';
  const GROUPS = [['A', 'Needs Action'], ['W', 'Watch'], ['H', 'Healthy'], ['O', 'Overstock'], ['L', 'Low Volume']];
  const PREF_KEY = 'psi_fgrid_v1', MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // <pure>
  const HORIZON = 8, EXCESS_WEEKS = 26;
  function groupOf(action) { return action === 'Order Now' || action === 'Expedite' ? 'A' : action === 'Watch' ? 'W' : action === 'Overstock' ? 'O' : action === 'Low Volume' ? 'L' : 'H'; }
  function arrArray(arrMap) { const o = []; for (let i = 1; i <= HORIZON; i++) o.push((arrMap && arrMap[i]) || 0); return o; }      // the Board keys arrivals by weeks ahead (1 = next week)
  function project(now, rate, arr) { const out = []; let s = now; for (let i = 0; i < HORIZON; i++) { s = Math.max(0, s + (arr[i] || 0) - rate); out.push(s); } return out; }
  function tint(v, rate, leadWeeks) { if (!(rate > 0)) return ''; const c = v / rate; return c < leadWeeks ? 'out' : (c > EXCESS_WEEKS ? 'exc' : ''); }
  function coverText(v, rate) { if (!(rate > 0)) return '-'; const c = v / rate; return c >= 52 ? '52+' : String(Math.round(c)); }
  function rateText(r) { return r < 10 ? String(Math.round(r * 10) / 10) : String(Math.round(r)); }
  function minCover(v, rate) { return rate > 0 ? Math.min.apply(null, v.map(x => x / rate)) : Infinity; }
  function sortModels(list, ord) {
    const a = list.slice(), byName = (x, y) => x.name < y.name ? -1 : x.name > y.name ? 1 : 0;
    if (ord === 'n') a.sort(byName);
    else if (ord === 's') a.sort((x, y) => y.rate - x.rate || byName(x, y));
    else a.sort((x, y) => x.mc === y.mc ? byName(x, y) : (x.mc < y.mc ? -1 : 1));
    return a;
  }
  function bridge(now, rate, arr, v) {
    const rows = { open: [], demand: [], receipts: [], closing: [], short: [] }; let op = now;
    for (let i = 0; i < HORIZON; i++) { const rc = arr[i] || 0; rows.open.push(op); rows.demand.push(rate); rows.receipts.push(rc); rows.closing.push(v[i]); rows.short.push(Math.max(0, rate - (op + rc))); op = v[i]; }
    return rows;
  }
  function message(m, labels) {                                                       // one plain sentence about the model
    const last = labels[HORIZON - 1], out = m.v.findIndex(x => x <= 0.5);
    if (!(m.rate > 0)) return { text: 'No recent sales, nothing to plan', bad: false };
    if (out >= 0) {
      let ar = -1; for (let i = out; i < HORIZON; i++) if (m.arr[i] > 0) { ar = i; break; }
      if (ar > out) return { text: 'Runs out ' + labels[out] + ', arrives ' + labels[ar] + ' (+' + m.arr[ar] + '): ' + (ar - out) + ' week' + (ar - out > 1 ? 's' : '') + ' without stock', bad: true };
      if (ar === out) return { text: 'Runs out ' + labels[out] + ' even with +' + m.arr[ar] + ' arriving that week', bad: true };
      return { text: 'Runs out ' + labels[out] + ', nothing due by ' + last, bad: true };
    }
    if (m.mc < m.lead) return { text: 'Never runs out by ' + last + ', but cover stays below the lead time (lowest ' + (Math.round(m.mc * 10) / 10) + ' weeks)', bad: true };
    if (m.group === 'O') return { text: 'Overstocked: about ' + (m.cover >= 52 ? '52+' : Math.round(m.cover)) + ' weeks of cover', bad: false };
    return { text: 'Healthy through ' + last, bad: false };
  }
  function defaultOpen(counts) {                                                      // many models: only the groups that need a look start open
    const total = Object.keys(counts).reduce((a, g) => a + counts[g], 0), act = (counts.A || 0) + (counts.W || 0), o = {};
    Object.keys(counts).forEach(g => { o[g] = total <= 12 || act === 0 || g === 'A' || g === 'W'; });
    return o;
  }
  function weekNum(lbl) { const n = parseInt(String(lbl).replace(/[^0-9]/g, ''), 10); return isNaN(n) ? null : n; }
  function isoMonday(w, today) {                                                      // the Monday of ISO week w, in whichever year is closest to today
    let best = null;
    [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].forEach(y => {
      const jan4 = new Date(y, 0, 4), dow = (jan4.getDay() + 6) % 7, d = new Date(y, 0, 4 - dow + (w - 1) * 7);
      if (best === null || Math.abs(d - today) < Math.abs(best - today)) best = d;
    });
    return best;
  }
  // </pure>
  const fmtDay = d => d.getDate() + ' ' + MONTHS[d.getMonth()];
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  function loadPrefs() { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return { mode: p.mode === 'c' ? 'c' : 'u', ord: ['u', 's', 'n'].indexOf(p.ord) >= 0 ? p.ord : 'u' }; } catch (e) { return { mode: 'u', ord: 'u' }; } }
  const prefs = loadPrefs(), savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) {} };
  const ST = {}; Object.keys(BR).forEach(k => { ST[k] = { flt: 'all', open: null, sel: null, data: null }; });

  const css = document.createElement('style'); css.id = 'psi-fgrid';
  css.textContent = [
    '.fg-bar { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; margin: 0 0 10px; }',
    '.fg-seg { display: inline-flex; border: 1px solid var(--mac-border2); border-radius: 8px; overflow: hidden; }',
    '.fg-seg button { font: inherit; font-size: 11.5px; padding: 5px 11px; background: transparent; color: var(--mac-text2); border: 0; cursor: pointer; white-space: nowrap; }',
    '.fg-seg button + button { border-left: 1px solid var(--mac-border); }',
    '.fg-seg button.on { background: color-mix(in srgb, var(--mac-text) 9%, transparent); color: var(--mac-text); font-weight: 600; }',
    '.fg-sel { font: inherit; font-size: 11.5px; padding: 5px 8px; background: transparent; color: var(--mac-text); border: 1px solid var(--mac-border2); border-radius: 8px; }',
    '.fg-lab { font-size: 11px; color: var(--mac-text3); }',
    '.fg-scroll { overflow-x: auto; }',
    '.fg-table { width: 100%; min-width: 760px; border-collapse: collapse; table-layout: fixed; font-size: 12.5px; font-variant-numeric: tabular-nums; }',
    '.fg-table th { font-size: 11px; font-weight: 600; color: var(--mac-text2); text-align: right; padding: 6px 6px 8px; vertical-align: bottom; }',
    '.fg-table th small { display: block; font-size: 10.5px; font-weight: 400; color: var(--mac-text3); }',
    '.fg-table th.l, .fg-table td.l { text-align: left; }',
    '.fg-table td { text-align: right; padding: 8px 6px; border-top: 1px solid var(--mac-border); color: var(--mac-text); vertical-align: middle; }',
    '.fg-table td.dim { color: var(--mac-text2); }',
    '.fg-table td.same { color: var(--mac-text3); }',
    '.fg-table td.out { background: color-mix(in srgb, var(--mac-red) 14%, transparent); color: var(--mac-red); }',
    '.fg-table td.exc { background: color-mix(in srgb, var(--mac-accent) 14%, transparent); color: var(--mac-accent); }',
    '.fg-arr { display: block; font-size: 10.5px; color: var(--mac-green); }',
    '.fg-r { cursor: pointer; }',
    '.fg-r:hover td:not(.out):not(.exc) { background: color-mix(in srgb, var(--mac-text) 5%, transparent); }',
    '.fg-r.sel td:not(.out):not(.exc) { background: color-mix(in srgb, var(--mac-text) 5%, transparent); }',
    '.fg-name { font-weight: 600; }',
    '.fg-chev { display: inline-block; width: 12px; color: var(--mac-text3); font-size: 10px; }',
    '.fg-sub { display: block; font-size: 10.5px; color: var(--mac-text3); font-weight: 400; margin-left: 12px; }',
    '.fg-sub.bad { color: var(--mac-red); } .fg-sub.low { color: var(--mac-orange); } .fg-sub.over { color: var(--mac-accent); }',
    '.fg-tot td { font-weight: 600; background: color-mix(in srgb, var(--mac-text) 6%, transparent); border-top: 1px solid var(--mac-border2); border-bottom: 1px solid var(--mac-border2); }',
    '.fg-g td { text-align: left; padding: 11px 6px 5px; font-size: 11.5px; color: var(--mac-text2); border-top: 1px solid var(--mac-border2); cursor: pointer; }',
    '.fg-g b { color: var(--mac-text); font-size: 12.5px; }',
    '.fg-g .fold { color: var(--mac-text3); font-size: 11px; margin-left: 10px; }',
    '.fg-dr td { padding: 0; border-top: 0; text-align: left; }',
    '.fg-pn { border: 1px solid var(--mac-border); border-radius: 10px; margin: 4px 0 10px; padding: 12px 14px; background: color-mix(in srgb, var(--mac-text) 3%, transparent); cursor: default; }',
    '.fg-pn .h { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; }',
    '.fg-pn .h b { font-size: 13px; font-weight: 600; }',
    '.fg-pn .h button { font: inherit; font-size: 11.5px; padding: 3px 11px; border-radius: 8px; border: 1px solid var(--mac-border2); background: transparent; color: var(--mac-text); cursor: pointer; }',
    '.fg-pn .s { font-size: 12px; color: var(--mac-text2); margin: 0 0 8px; }',
    '.fg-pn .s.bad { color: var(--mac-red); }',
    '.fg-pn svg { width: 100%; height: auto; display: block; margin: 0 0 6px; }',
    '.fg-pn svg text { font-size: 11px; fill: var(--mac-text3); }',
    '.fg-pn table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; font-variant-numeric: tabular-nums; }',
    '.fg-pn td { text-align: right; padding: 4px 6px; border-top: 1px solid var(--mac-border); color: var(--mac-text); }',
    '.fg-pn td.l { text-align: left; color: var(--mac-text2); }',
    '.fg-pn td.same { color: var(--mac-text3); }',
    '.fg-leg { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 11px; color: var(--mac-text2); margin: 10px 0 0; }',
    '.fg-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }',
    '.fg-hint { font-size: 11px; color: var(--mac-text3); margin: 6px 0 0; }'
  ].join(' ');
  document.head.appendChild(css);

  function buildData(brand, host) {
    const res = window.__srApi && window.__srApi.getAnalysis(brand); if (!res || !res.list || !res.list.length) return null;
    const shown = new Set();                                                           // the models the old table drew, so the Products filter is respected
    host.querySelectorAll('tbody tr').forEach(r => { const c = r.children[0]; if (c && c.hasAttribute('rowspan')) { const n = c.textContent.trim(); if (n && !/^Total/i.test(n)) shown.add(n); } });
    if (!shown.size) return null;
    const labels = buildForecastWeeks(res.latestLbl, HORIZON), lead = BR[brand].lead / 7, today = new Date();
    const list = res.list.filter(a => shown.has(a.name)).map(a => {
      const arr = arrArray(a.arr), v = project(a.invNow, a.rate, arr);
      return { name: a.name, action: a.action, group: groupOf(a.action), now: a.invNow, rate: a.rate, arr, v, lead, mc: minCover(v, a.rate), cover: a.rate > 0 ? a.invNow / a.rate : Infinity, sug: a.suggest, nextAhead: a.nextArr ? a.nextArr.ahead : null, nextQty: a.nextArr ? a.nextArr.qty : 0 };
    });
    if (!list.length) return null;
    const days = labels.map(l => { const w = weekNum(l), d = w == null ? null : isoMonday(w, today); return d ? fmtDay(d) : ''; });
    return { labels, days, list, lead };
  }
  function subLine(m, labels) {
    const arrTxt = m.nextAhead ? ' · ' + labels[m.nextAhead - 1] + ' (' + m.nextQty + ') due' : '';
    if (m.group === 'A') return '<span class="fg-sub bad">' + m.action + '</span>';
    if (m.group === 'W') return '<span class="fg-sub low">Watch' + arrTxt + '</span>';
    if (m.group === 'O') return '<span class="fg-sub over">Overstock</span>';
    if (m.group === 'L') return '<span class="fg-sub">Low Volume</span>';
    return '<span class="fg-sub">' + m.action + arrTxt + '</span>';
  }
  function panelHtml(m, d) {
    const msg = message(m, d.labels), w = 600, h = 92, px = 38, labels = d.labels;
    const hi = m.rate * (d.lead + 4), lo = m.rate * d.lead, mx = Math.max.apply(null, m.v.concat([m.now, hi])) * 1.08 || 1;
    const X = i => px + i * (w - px - 8) / (HORIZON - 1), Y = v => h - 18 - v / mx * (h - 28);
    let s = '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Stock for ' + esc(m.name) + '">';
    if (m.rate > 0) s += '<rect x="' + px + '" y="' + Y(hi).toFixed(1) + '" width="' + (w - px - 8) + '" height="' + Math.max(1, Y(lo) - Y(hi)).toFixed(1) + '" style="fill: color-mix(in srgb, var(--mac-green) 14%, transparent)"/>';
    s += '<polyline points="' + m.v.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ') + '" style="fill: none; stroke: var(--mac-text2); stroke-width: 1.6"/>';
    m.v.forEach((v, i) => {
      if (v <= 0.5) s += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="3" style="fill: var(--mac-red)"/>';
      if (m.arr[i]) s += '<polygon points="' + (X(i) - 4) + ',' + (Y(v) - 12) + ' ' + (X(i) + 4) + ',' + (Y(v) - 12) + ' ' + X(i) + ',' + (Y(v) - 5) + '" style="fill: var(--mac-green)"/>';
      s += '<text x="' + X(i) + '" y="' + (h - 3) + '" text-anchor="middle">' + labels[i] + '</text>';
    });
    s += '</svg>';
    const b = bridge(m.now, m.rate, m.arr, m.v), row = (lab, arr, f) => '<tr><td class="l">' + lab + '</td>' + arr.map(f).join('') + '</tr>';
    let t = '<table><colgroup><col style="width: 104px">' + labels.map(() => '<col>').join('') + '</colgroup><tbody>';
    t += row('Opening', b.open, v => '<td class="same">' + Math.round(v) + '</td>');
    t += row('Demand', b.demand, v => '<td class="same">-' + Math.round(v) + '</td>');
    t += row('Receipts', b.receipts, v => v ? '<td style="color: var(--mac-green)">+' + v + '</td>' : '<td class="same">-</td>');
    t += row('Closing', b.closing, v => '<td style="font-weight: 600">' + Math.round(v) + '</td>');
    if (b.short.some(x => x > 0.5)) t += row('Short', b.short, v => v > 0.5 ? '<td style="color: var(--mac-red)">' + Math.round(v) + '</td>' : '<td class="same">-</td>');
    t += row('Weeks Of Cover', b.closing, v => '<td class="same">' + coverText(v, m.rate) + '</td>');
    t += '</tbody></table>';
    const sug = m.sug > 0 && (m.group === 'A' || m.group === 'W') ? ' Suggested order: ' + m.sug + ' units.' : '';
    return '<div class="fg-pn" data-p="1"><div class="h"><b>' + esc(m.name) + ': Planner Bridge</b><button type="button" data-x="1">Close</button></div><p class="s' + (msg.bad ? ' bad' : '') + '">' + msg.text + '.' + sug + '</p>' + s + t + '</div>';
  }
  function render(brand) {
    const st = ST[brand], d = st.data, host = document.getElementById(BR[brand].table); if (!d || !host) return;
    const counts = {}; GROUPS.forEach(g => { counts[g[0]] = d.list.filter(m => m.group === g[0]).length; });
    if (!st.open) st.open = defaultOpen(counts);
    const vis = st.flt === 'all' ? d.list : d.list.filter(m => m.group === st.flt), mode = prefs.mode;
    let h = '<div class="fg"><div class="fg-bar"><span class="fg-seg" data-seg="mode"><button type="button" data-v="u" class="' + (mode === 'u' ? 'on' : '') + '">Units</button><button type="button" data-v="c" class="' + (mode === 'c' ? 'on' : '') + '">Weeks Of Cover</button></span>';
    h += '<span class="fg-lab">Order</span><select class="fg-sel" data-sel="ord" aria-label="Order"><option value="u"' + (prefs.ord === 'u' ? ' selected' : '') + '>Most Urgent First</option><option value="s"' + (prefs.ord === 's' ? ' selected' : '') + '>Largest Demand First</option><option value="n"' + (prefs.ord === 'n' ? ' selected' : '') + '>Name</option></select>';
    h += '<span class="fg-seg" data-seg="flt"><button type="button" data-v="all" class="' + (st.flt === 'all' ? 'on' : '') + '">All (' + d.list.length + ')</button>' + GROUPS.filter(g => counts[g[0]]).map(g => '<button type="button" data-v="' + g[0] + '" class="' + (st.flt === g[0] ? 'on' : '') + '">' + g[1] + ' (' + counts[g[0]] + ')</button>').join('') + '</span></div>';
    h += '<div class="fg-scroll"><table class="fg-table"><colgroup><col style="width: 214px"><col style="width: 58px"><col style="width: 62px">' + d.labels.map(() => '<col>').join('') + '</colgroup>';
    h += '<thead><tr><th class="l">Model</th><th>On Hand</th><th>Demand/Wk</th>' + d.labels.map((l, i) => '<th>' + l + '<small>' + d.days[i] + '</small></th>').join('') + '</tr></thead><tbody>';
    const tn = vis.reduce((a, m) => a + m.now, 0), tr = vis.reduce((a, m) => a + m.rate, 0);
    h += '<tr class="fg-tot"><td class="l">Total (' + vis.length + ' Models)</td><td>' + (mode === 'u' ? Math.round(tn) : coverText(tn, tr)) + '</td><td>' + Math.round(tr) + '</td>' + d.labels.map((l, i) => { const tv = vis.reduce((a, m) => a + m.v[i], 0); return '<td>' + (mode === 'u' ? Math.round(tv) : coverText(tv, tr)) + '</td>'; }).join('') + '</tr>';
    const rowHtml = m => {
      const open = m.name === st.sel;
      let r = '<tr class="fg-r' + (open ? ' sel' : '') + '" data-n="' + esc(m.name) + '" tabindex="0"><td class="l"><span class="fg-chev">' + (open ? '&#9662;' : '&#9656;') + '</span><span class="fg-name">' + esc(m.name) + '</span>' + subLine(m, d.labels) + '</td>';
      r += '<td class="dim">' + (mode === 'u' ? Math.round(m.now) : coverText(m.now, m.rate)) + '</td><td class="dim">' + rateText(m.rate) + '</td>';
      d.labels.forEach((l, i) => {
        const v = m.v[i], op = i === 0 ? m.now : m.v[i - 1], rc = m.arr[i], sh = Math.max(0, m.rate - (op + rc));
        let k = tint(v, m.rate, m.lead); if (!k && i > 0 && Math.round(v) === Math.round(m.v[i - 1]) && !rc) k = 'same';
        const tip = l + ': ' + Math.round(op) + ' - ' + rateText(m.rate) + ' demand' + (rc ? ' + ' + rc + ' arriving' : '') + ' = ' + Math.round(v) + (sh > 0.5 ? ' (short ' + Math.round(sh) + ')' : '');
        r += '<td class="' + k + '" title="' + esc(tip) + '">' + (mode === 'u' ? Math.round(v) : coverText(v, m.rate)) + (rc ? '<span class="fg-arr">+' + rc + '</span>' : '') + '</td>';
      });
      r += '</tr>';
      if (open) r += '<tr class="fg-dr"><td colspan="' + (3 + d.labels.length) + '">' + panelHtml(m, d) + '</td></tr>';
      return r;
    };
    GROUPS.forEach(g => {
      if (st.flt !== 'all' && st.flt !== g[0]) return;
      const list = sortModels(vis.filter(m => m.group === g[0]), prefs.ord); if (!list.length) return;
      const open = st.flt !== 'all' || st.open[g[0]];
      h += '<tr class="fg-g" data-g="' + g[0] + '"><td colspan="' + (3 + d.labels.length) + '"><span class="fg-chev">' + (open ? '&#9662;' : '&#9656;') + '</span><b>' + g[1] + '</b> (' + list.length + ')' + (open ? '' : '<span class="fold">' + list.slice(0, 3).map(m => esc(m.name)).join(', ') + (list.length > 3 ? ', ...' : '') + '</span>') + '</td></tr>';
      if (open) list.forEach(m => { h += rowHtml(m); });
    });
    h += '</tbody></table></div>';
    h += '<div class="fg-leg"><span><i style="background: color-mix(in srgb, var(--mac-red) 30%, transparent)"></i>Below Lead Time Cover</span><span><i style="background: color-mix(in srgb, var(--mac-accent) 30%, transparent)"></i>Over 26 Weeks Of Cover</span><span style="color: var(--mac-green)">+300 Arrival From The Deliveries Tab</span><span style="color: var(--mac-text3)">Faded: Same As Last Week</span></div>';
    h += '<div class="fg-hint">Click a model row to open its drill-down. Demand is the same number the Supply Risk Board uses.</div></div>';
    host.innerHTML = h;
  }
  function bind(brand, host) {
    if (host.__fgBound) return; host.__fgBound = true;
    host.addEventListener('click', e => {
      const st = ST[brand]; if (!st.data) return;
      if (e.target.closest('button[data-x]')) { st.sel = null; render(brand); return; }
      if (e.target.closest('[data-p]')) return;
      const seg = e.target.closest('.fg-seg button');
      if (seg) { const kind = seg.parentNode.getAttribute('data-seg'); if (kind === 'mode') { prefs.mode = seg.getAttribute('data-v'); savePrefs(); } else { st.flt = seg.getAttribute('data-v'); } render(brand); return; }
      const g = e.target.closest('tr.fg-g'); if (g) { const k = g.getAttribute('data-g'); st.open[k] = !st.open[k]; render(brand); return; }
      const r = e.target.closest('tr.fg-r'); if (r) { const n = r.getAttribute('data-n'); st.sel = st.sel === n ? null : n; render(brand); }
    });
    host.addEventListener('change', e => { const s = e.target.closest('select[data-sel]'); if (s && ST[brand].data) { prefs.ord = s.value; savePrefs(); render(brand); } });
    host.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr.fg-r')) { e.preventDefault(); e.target.click(); } });
  }
  function drawGrid(brand) {
    const host = document.getElementById(BR[brand].table); if (!host) return;
    const d = buildData(brand, host); if (!d) return;                                  // anything unexpected: the old table stays
    const st = ST[brand]; st.data = d; if (st.sel && !d.list.some(m => m.name === st.sel)) st.sel = null;
    bind(brand, host); render(brand);
  }
  window.renderForecast = function (models, brand) {
    const r = prev.apply(this, arguments);
    try { drawGrid(keyOf(brand)); } catch (e) { console.warn('[forecast-grid] kept the old table:', e && e.message); }
    return r;
  };
})();
