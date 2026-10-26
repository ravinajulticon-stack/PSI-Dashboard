// PSI Dashboard - Overview redesign (added 2026-10-21)
// From the user's chosen direction (clean light look + a "Needs Attention" panel), with their decisions:
// status names stay Healthy / Monitor / Critical, each brand keeps its own colour, built all at once.
//  - Header: the Search / Manage Models / Refresh row joins the title row (Overview only).
//  - KPI cards: icon in a soft brand-tinted circle, plain dark number, and each card states its real period
//    (as at the last week shown, last 8 weeks, or first to last week). Only the runway card uses status colour.
//  - Needs Attention panel replaces the stack of alert rows: status icon, model (with its Type), runway pill,
//    Latest Inventory, Avg Weekly Demand, Projected Runway; the 5 most urgent, View All for the rest; a row opens
//    the weekly detail. When nothing is at risk the original green "all clear" bar stays.
//  - Model Summary: frozen Model column (keeping each row's tint) with a colour dot matching the charts, names and
//    status pills on one line, clearer column names (number headers may wrap to two lines so the table fits), numbers right-aligned with thousands separators, neutral
//    colours (Min / Max headers too) except Runway and Status.
//  - Models panel: double-click a name to show only that model in both charts.
// Calculations are untouched: it only reads the models the page renders and restyles the result.
// This script loads BEFORE type-filter.js and period-filter.js so it receives their filtered / as-at data.
// To undo: remove this script tag.
(function () {
  const BR = {
    samsung: { root: 'view-dashboard', metrics: 'metricsGrid', alerts: 'alertsSection', getM: () => getModels(), open: 'openModal', st: () => state,
      fns: { m: 'renderMetrics', a: 'renderAlerts', t: 'renderTable' }, refresh: () => { if (typeof renderDashboard === 'function') renderDashboard(); } },
    philips: { root: 'pview-pdashboard', metrics: 'philipsMetricsGrid', alerts: 'philipsAlertsSection', getM: () => phGetModels(), open: 'phOpenModal', st: () => phState,
      fns: { m: 'phRenderMetrics', a: 'phRenderAlerts', t: 'phRenderTable' }, refresh: () => { if (typeof renderPhilipsDashboard === 'function') renderPhilipsDashboard(); } },
    plocks: { root: 'plview-pldashboard', metrics: 'plocksMetricsGrid', alerts: 'plocksAlertsSection', getM: () => plGetModels(), open: 'plOpenModal', st: () => plState,
      fns: { m: 'plRenderMetrics', a: 'plRenderAlerts', t: 'plRenderTable' }, refresh: () => { if (typeof renderPlocksDashboard === 'function') renderPlocksDashboard(); } }
  };
  const expanded = { samsung: false, philips: false, plocks: false };
  const el = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => (typeof n === 'number' && isFinite(n)) ? n.toLocaleString('en-AU') : '\u2014';
  const svg = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const ICON = {
    box: svg('<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>'),
    trend: svg('<path d="M3 17l6-6 4 4 7-7"/><path d="M14 8h6v6"/>'),
    store: svg('<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>'),
    flag: svg('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
    cart: svg('<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.4 11h11.2L21 8H6.2"/>'),
    pulse: svg('<path d="M3 12h4l3-7 4 14 3-7h4"/>'),
    shield: svg('<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z"/><path d="M12 8v5"/><path d="M12 16h.01"/>'),
    alert: svg('<path d="M12 4l9 16H3l9-16z"/><path d="M12 10v4"/><path d="M12 17h.01"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>')
  };

  const css = document.createElement('style');
  css.textContent = `
  .rd-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px 24px; }
  .rd-head > .filter-bar.rd-head-tools { background: none; border: 0; box-shadow: none; padding: 0; margin: 0; flex-wrap: wrap; }
  .metrics .metric-card { border-top: 1px solid var(--mac-border) !important; display: grid; grid-template-columns: 44px minmax(0, 1fr); column-gap: 14px; row-gap: 2px; align-items: center; padding: 18px 20px; }
  .metrics .metric-card .metric-icon { grid-row: 1 / span 3; width: 44px; height: 44px; margin: 0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0; background: color-mix(in srgb, var(--rd-brand, var(--mac-accent)) 12%, transparent); color: var(--rd-brand, var(--mac-accent)); }
  .metrics .metric-card .metric-icon svg { width: 22px; height: 22px; }
  .metrics .metric-card .metric-label { margin: 0; }
  .metrics .metric-card .metric-value { color: var(--mac-text) !important; line-height: 1.15; }
  .metrics .metric-card .metric-sub { margin: 0; }
  .metrics .metric-card.rd-risk .metric-icon { background: color-mix(in srgb, var(--mac-red) 12%, transparent); color: var(--mac-red); }
  .metrics .metric-card.rd-risk .metric-value { color: var(--mac-red) !important; }
  .metrics .metric-card.rd-ok .metric-icon { background: color-mix(in srgb, var(--mac-green) 14%, transparent); color: var(--mac-green); }
  .na-panel { background: var(--mac-surface); border: 1px solid var(--mac-border); border-radius: 12px; overflow: hidden; }
  .na-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 14px 18px; }
  .na-title { font-size: 15px; font-weight: 600; color: var(--mac-text); }
  .na-count { font-size: 11px; font-weight: 600; padding: 2px 10px; border-radius: 999px; background: color-mix(in srgb, var(--mac-orange) 18%, transparent); color: #7a4a00; }
  .na-sub { font-size: 12px; color: var(--mac-text3); }
  .na-all { margin-left: auto; font: inherit; font-size: 12px; font-weight: 600; color: var(--rd-brand, var(--mac-accent)); background: none; border: 0; cursor: pointer; padding: 6px 4px; }
  .na-row { display: grid; grid-template-columns: 28px minmax(170px, 1.5fr) minmax(120px, auto) repeat(3, minmax(110px, 1fr)) 16px; align-items: center; gap: 12px; width: 100%; box-sizing: border-box; padding: 12px 18px; border: 0; border-top: 1px solid var(--mac-border); background: none; text-align: left; font: inherit; color: inherit; cursor: pointer; }
  .na-row:hover { background: var(--mac-surface2); }
  .na-ico { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .na-ico svg { width: 15px; height: 15px; }
  .na-ico.crit { background: color-mix(in srgb, var(--mac-red) 14%, transparent); color: var(--mac-red); }
  .na-ico.mon { background: color-mix(in srgb, var(--mac-orange) 18%, transparent); color: #a35c00; }
  .na-model { min-width: 0; }
  .na-model b { display: block; font-size: 13px; color: var(--mac-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .na-model small { display: block; font-size: 11px; color: var(--mac-text3); }
  .na-pill { justify-self: start; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
  .na-pill.crit { background: color-mix(in srgb, var(--mac-red) 12%, transparent); color: #a8231a; }
  .na-pill.mon { background: color-mix(in srgb, var(--mac-orange) 18%, transparent); color: #7a4a00; }
  .na-cell small { display: block; font-size: 11px; color: var(--mac-text3); }
  .na-cell b { font-size: 14px; font-weight: 600; color: var(--mac-text); font-variant-numeric: tabular-nums; }
  .na-cell i { font-style: normal; font-size: 11px; color: var(--mac-text3); margin-left: 4px; }
  .na-chev { color: var(--mac-text3); font-size: 18px; line-height: 1; }
  @media (max-width: 900px) { .na-row { grid-template-columns: 28px minmax(0, 1fr) auto; } .na-cell, .na-chev { display: none; } }
  .table-section .dash-table th:first-child, .table-section .dash-table td:first-child { position: sticky; left: 0; z-index: 1; background: linear-gradient(var(--rd-row, transparent), var(--rd-row, transparent)), var(--mac-surface); }
  .table-section .dash-table tbody tr:hover > td:first-child { --rd-row: rgba(0, 122, 255, 0.04); }
  .table-section .dash-table tbody tr.selected > td:first-child { --rd-row: rgba(0, 122, 255, 0.08); }
  .table-section .dash-table td:first-child .model-name, .table-section .dash-table tbody td:last-child, .table-section .dash-table tbody td:last-child * { white-space: nowrap; }
  .table-section .dash-table thead th.rd-quiet { color: var(--mac-text2) !important; }
  .table-section .dash-table thead th.rd-num, .table-section .dash-table thead th.rd-run { white-space: normal !important; line-height: 1.25; vertical-align: bottom; }
  .table-section .dash-table thead th:first-child { z-index: 2; }
  .table-section .dash-table .rd-num, .table-section .dash-table .rd-run { text-align: right; font-variant-numeric: tabular-nums; }
  .table-section .dash-table td.rd-num, .table-section .dash-table td.rd-num * { color: var(--mac-text) !important; }
  .rd-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }`;
  document.head.appendChild(css);

  // ---------- 1) header row (after every script has built its bars) ----------
  function headerOf(root) {
    const inside = root.querySelector('.section-header'); if (inside) return inside;
    const p = root.previousElementSibling; return p && p.classList.contains('section-header') ? p : null;
  }
  function mergeHeaders() {
    Object.keys(BR).forEach(k => {
      const root = el(BR[k].root); if (!root) return;
      const head = headerOf(root), top = root.querySelector(':scope > .filter-bar');
      if (head && top) { head.classList.add('rd-head'); top.classList.add('rd-head-tools'); top.setAttribute('data-rd-brand', k); head.appendChild(top); }
      const btn = Array.from((head || root).querySelectorAll('button')).find(b => /Refresh/.test(b.textContent));
      if (btn) { const c = getComputedStyle(btn).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)') root.style.setProperty('--rd-brand', c); }
    });
    syncHeadTools();
  }
  function syncHeadTools() {                                   // the tools only show while that brand's Overview is shown
    document.querySelectorAll('.rd-head-tools').forEach(t => {
      const b = BR[t.getAttribute('data-rd-brand')], root = b && el(b.root);
      if (root && !root.contains(t)) t.style.display = getComputedStyle(root).display === 'none' ? 'none' : '';
    });
  }
  ['switchView', 'switchPhilipsView', 'switchPlocksView', 'switchBrand'].forEach(n => {
    const o = window[n]; if (typeof o !== 'function') return;
    window[n] = function () { const r = o.apply(this, arguments); try { syncHeadTools(); } catch (e) {} return r; };
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mergeHeaders); else setTimeout(mergeHeaders, 0);

  // ---------- 2) KPI cards ----------
  function styleCards(brand, models, allWeeks) {
    const grid = el(BR[brand].metrics); if (!grid) return;
    const ws = Array.isArray(allWeeks) && allWeeks.length ? allWeeks : ((models && models[0] && models[0].allWeeks) || []);
    const first = ws[0] || '', last = ws[ws.length - 1] || '', s8 = ws[Math.max(0, ws.length - 8)] || '';
    const span = first && last ? first + ' \u2013 ' + last : '';
    grid.querySelectorAll('.metric-card').forEach(card => {
      const lab = (card.querySelector('.metric-label') || {}).textContent || '', l = lab.toLowerCase().trim();
      const icon = card.querySelector('.metric-icon'), sub = card.querySelector('.metric-sub'), val = card.querySelector('.metric-value');
      let ic = ICON.box, note = null;
      if (l.startsWith('total inventory')) { ic = ICON.box; note = 'Units \u00b7 As At ' + last; }
      else if (l.startsWith('total sell-out')) { ic = ICON.trend; note = 'Units \u00b7 Last 8 Weeks (' + s8 + ' \u2013 ' + last + ')'; }
      else if (l.startsWith('retail expansion')) { ic = ICON.store; note = 'Units Placed \u00b7 ' + span; }
      else if (l.startsWith('project channel')) { ic = ICON.flag; note = 'Project Units \u00b7 ' + span; }
      else if (l.startsWith('total purchase')) { ic = ICON.cart; note = 'Units Purchased \u00b7 ' + span; }
      else if (l.startsWith('active models')) { ic = ICON.pulse; note = 'With Sell-Out \u00b7 Last 8 Weeks'; }
      else if (/^below \d+-day runway/.test(l)) {
        ic = ICON.shield; note = 'Models Under ' + l.match(/\d+/)[0] + ' Days Of Cover';
        const n = parseInt(((val && val.textContent) || '0').replace(/\D/g, ''), 10) || 0;
        card.classList.toggle('rd-risk', n > 0); card.classList.toggle('rd-ok', n === 0);
      }
      if (icon && icon.getAttribute('data-rd') !== l) { icon.innerHTML = ic; icon.setAttribute('data-rd', l); }
      if (sub && note && last) sub.textContent = note;
      if (val && /^\d{4,}$/.test(val.textContent.trim())) val.textContent = num(parseInt(val.textContent.trim(), 10));
    });
  }

  // ---------- 3) Needs Attention panel ----------
  function renderNeeds(brand, models) {
    const b = BR[brand], box = el(b.alerts); if (!box || !Array.isArray(models)) return;
    const TW = brand === 'philips' ? PH_TARGET_WEEKS : TARGET_WEEKS;       // Safes: 45-day lead time; Samsung and Locks: 60 days
    const crit = models.filter(m => m.weeksLeft !== null && m.weeksLeft <= TW).sort((x, y) => x.weeksLeft - y.weeksLeft);
    const warn = models.filter(m => m.weeksLeft !== null && m.weeksLeft > TW && m.weeksLeft <= TW * 2).sort((x, y) => x.weeksLeft - y.weeksLeft);
    const all = crit.map(m => [m, 'crit']).concat(warn.map(m => [m, 'mon']));
    if (!all.length) return;                                     // keep the page's own green "all clear" bar
    const defs = new Map(b.getM().map(d => [d.name, d]));
    const shown = expanded[brand] ? all : all.slice(0, 5);
    const rows = shown.map(([m, k]) => {
      const d = defs.get(m.name) || {}, sub = d.type || d.region || m.region || '';
      return '<button type="button" class="na-row" data-name="' + esc(m.name) + '">' +
        '<span class="na-ico ' + k + '">' + (k === 'crit' ? ICON.alert : ICON.info) + '</span>' +
        '<span class="na-model"><b>' + esc(m.name) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span>' +
        '<span class="na-pill ' + k + '">' + (k === 'crit' ? 'Critical' : 'Monitor') + ' \u00b7 Runway ' + m.weeksLeft + ' wks</span>' +
        '<span class="na-cell"><small>Latest Inventory</small><b>' + num(m.latestInv) + '</b><i>units</i></span>' +
        '<span class="na-cell"><small>Avg Weekly Demand</small><b>' + (m.avgS > 0 ? (Math.round(m.avgS * 10) / 10).toLocaleString('en-AU') : '\u2014') + '</b><i>units</i></span>' +
        '<span class="na-cell"><small>Projected Runway</small><b>' + m.weeksLeft + ' wks</b></span>' +
        '<span class="na-chev" aria-hidden="true">\u203a</span></button>';
    }).join('');
    const more = all.length > 5 ? '<button type="button" class="na-all">' + (expanded[brand] ? 'Show Fewer' : 'View All (' + all.length + ')') + '</button>' : '';
    box.innerHTML = '<div class="na-panel"><div class="na-head"><span class="na-title">Needs Attention</span>' +
      '<span class="na-count">' + all.length + (all.length === 1 ? ' Model' : ' Models') + '</span>' +
      '<span class="na-sub">' + crit.length + ' Critical \u00b7 ' + warn.length + ' Monitor \u00b7 Most Urgent First</span>' + more + '</div>' + rows + '</div>';
    box.querySelectorAll('.na-row').forEach(r => r.addEventListener('click', () => { const f = window[b.open]; if (typeof f === 'function') f(r.getAttribute('data-name')); }));
    const allBtn = box.querySelector('.na-all'); if (allBtn) allBtn.addEventListener('click', () => { expanded[brand] = !expanded[brand]; renderNeeds(brand, models); });
  }

  // ---------- 4) Model Summary table ----------
  const HEAD = { 'Latest I': 'Latest Inventory', 'Total P': 'Total Purchased', 'Total S': 'Sell-Out (8 Wks)', 'Total RE': 'Retail Expansion', 'Total Proj': 'Project Units', 'Avg S/wk': 'Avg Sales/Wk' };
  const NUMS = ['Latest Inventory', 'Total Purchased', 'Sell-Out (8 Wks)', 'Retail Expansion', 'Project Units', 'Avg Sales/Wk', 'Min (60d)', 'Max (60d)'];
  function styleTable(brand) {
    const root = el(BR[brand].root), table = root && root.querySelector('.table-section .dash-table'); if (!table) return;
    const ths = Array.from(table.querySelectorAll('thead th'));
    ths.forEach(th => {
      Array.from(th.childNodes).forEach(n => { if (n.nodeType === 3) { const t = n.textContent.trim(); if (HEAD[t]) n.textContent = n.textContent.replace(t, HEAD[t]); } });
    });
    const names = ths.map(th => th.textContent.replace(/[\u2191\u2193\u25b2\u25bc\u2195]/g, '').trim());
    const numIdx = names.map((n, i) => NUMS.includes(n) ? i : -1).filter(i => i >= 0), runIdx = names.indexOf('Runway');
    numIdx.forEach(i => ths[i].classList.add('rd-num')); if (runIdx >= 0) ths[runIdx].classList.add('rd-run');
    names.forEach((n, i) => { if (/^(Min|Max) \(/.test(n)) ths[i].classList.add('rd-quiet'); });
    const list = BR[brand].getM().map(m => m.name);
    table.querySelectorAll('tbody tr').forEach(tr => {
      const tds = tr.children;
      if (tds[0] && /^Total/i.test(tds[0].textContent.trim())) { const c = getComputedStyle(tr).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)') tds[0].style.setProperty('--rd-row', c); }
      numIdx.forEach(i => {
        const td = tds[i]; if (!td) return; td.classList.add('rd-num');
        const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT); let n;
        while ((n = walker.nextNode())) { const t = n.textContent.trim(); if (/^-?\d{4,}$/.test(t)) n.textContent = n.textContent.replace(t, parseInt(t, 10).toLocaleString('en-AU')); }
      });
      if (runIdx >= 0 && tds[runIdx]) tds[runIdx].classList.add('rd-run');
      const name = tr.getAttribute('data-plmodel') || tr.getAttribute('data-phmodel') || tr.getAttribute('data-model') || '';
      const nm = tr.querySelector('.model-name');
      if (name && nm && !nm.querySelector('.rd-dot')) {
        const i = list.indexOf(name), dot = document.createElement('span');
        dot.className = 'rd-dot'; dot.style.background = typeof colorOf === 'function' ? colorOf(i >= 0 ? i : 0) : '#999';
        nm.insertBefore(dot, nm.firstChild);
      }
    });
  }

  // ---------- 5) Models panel: double-click (two quick clicks) shows only that model ----------
  function hookPanel(brand) {
    const root = el(BR[brand].root), p = root && root.querySelector('.mdl-panel'); if (!p || p.getAttribute('data-rd')) return;
    p.setAttribute('data-rd', '1');
    const foot = p.querySelector('.mdl-foot'); if (foot) foot.textContent = 'Click a name to hide or show it in both charts. Double-click to show only that model. Point at a name to highlight it.';
    // The browser's own 'dblclick' event never fires here: the first click hides the model and redraws the list, so the
    // second click lands on a replaced element. So the double-click is detected from two clicks on the same name within
    // 400 ms (this also makes it work as a double-tap on a phone). It runs in the capture phase and stops the second
    // click, so the model is not toggled back on top of being isolated.
    let last = { name: null, t: 0 };
    p.querySelector('.mdl-grid').addEventListener('click', e => {
      const it = e.target.closest('.mdl-item'); if (!it) return;
      const keep = it.getAttribute('data-name'), now = Date.now();
      if (last.name !== keep || now - last.t > 400) { last = { name: keep, t: now }; return; }
      last = { name: null, t: 0 };
      e.stopPropagation();
      const st = BR[brand].st();
      const names = Array.from(p.querySelectorAll('.mdl-item')).map(x => x.getAttribute('data-name'));
      st.hidden.clear(); names.forEach(n => { if (n !== keep) st.hidden.add(n); });
      BR[brand].refresh();
    }, true);
  }

  // ---------- wire into the page's own render steps ----------
  Object.keys(BR).forEach(brand => {
    const f = BR[brand].fns;
    const wrap = (name, after) => { const o = window[name]; if (typeof o !== 'function') return; window[name] = function () { const r = o.apply(this, arguments); try { after(arguments); } catch (e) { console.warn('[overview-redesign]', e && e.message); } return r; }; };
    wrap(f.m, a => styleCards(brand, a[0], a[1]));
    wrap(f.a, a => renderNeeds(brand, a[0]));
    wrap(f.t, () => { styleTable(brand); hookPanel(brand); });
  });
})();
