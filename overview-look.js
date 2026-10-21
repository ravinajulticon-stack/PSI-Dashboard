// PSI Dashboard - Overview look (added 2026-10-21)
// The visual pass that makes the page look like the user's chosen mockup ("Option 1"), within their decisions:
// each brand keeps its own colour, statuses stay Healthy / Monitor / Critical, and the chart legend sits on the
// right of Inventory Trend (the user chose this over the shared panel above both charts).
//  - Page: wider (up to 1680 px) with roomier padding.
//  - Top bar: "Inventory Forecast" app title, brand tabs with a coloured underline, the signed-in user's initials.
//  - Tabs bar: Overview / Weekly Entry / Full History / Forecast as pills; the active one filled in the brand colour.
//  - Every tab (not just Overview): larger section titles, 12 px rounded cards, larger table and form text.
//    Weekly Entry: bigger labels, inputs and Recent Entries text. Full History: bigger table text. Forecast:
//    rounded cards, 16 px card titles, bigger table text.
//  - Overview: larger card text, bigger search box and buttons, larger table text.
//  - Model Summary: Filter as a segmented control and Sort as a "Sort: ..." dropdown (with a reverse button) on the
//    title row; the original sort buttons stay in the page (hidden) and do the actual sorting.
//  - Inventory Trend: the Models list moves to the right of the chart; it still controls both charts (click to hide /
//    show, point to highlight, double-click for only that model, Show All, Has Sell-Out Only); beside the chart the
//    list is always open (no Collapse) and is as tall as the chart.
// No calculations are touched. To undo: remove this script tag.
(function () {
  const BR = {
    samsung: { root: 'view-dashboard', sub: 'subnav-samsung', tab: 'brandTab-samsung', search: 'searchInput', sortAttr: 'data-sort', filterAttr: 'data-filter' },
    philips: { root: 'pview-pdashboard', sub: 'subnav-philips', tab: 'brandTab-philips', search: 'philipsSearchInput', sortAttr: 'data-psort', filterAttr: 'data-pfilter' },
    plocks: { root: 'plview-pldashboard', sub: 'subnav-plocks', tab: 'brandTab-plocks', search: 'plocksSearchInput', sortAttr: 'data-plsort', filterAttr: 'data-plfilter' }
  };
  const el = id => document.getElementById(id);
  const searchIcon = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8a94a3" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>') + '")';

  const css = document.createElement('style');
  css.textContent = `
  .page { max-width: 1680px !important; padding-left: 28px !important; padding-right: 28px !important; }
  .brand-bar .rd-app { display: flex; align-items: center; gap: 10px; padding: 0 20px 0 4px; margin-right: 8px; border-right: 1px solid var(--mac-border); font-size: 16px; font-weight: 700; color: var(--mac-text); white-space: nowrap; align-self: stretch; }
  .brand-bar .rd-app svg { width: 24px; height: 24px; }
  .brand-bar .brand-tab.active { box-shadow: inset 0 -2px 0 var(--rd-tab, var(--mac-accent)); }
  .brand-bar .rd-user { display: flex; align-items: center; gap: 8px; margin-right: 12px; font-size: 12px; font-weight: 600; color: var(--mac-text); white-space: nowrap; }
  .brand-bar .rd-user b { width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #1f2a37; color: #fff; font-size: 11px; letter-spacing: .02em; }
  .sub-toolbar .seg-control { background: none; border: 0; box-shadow: none; padding: 0; gap: 8px; }
  .sub-toolbar .seg-control .seg-btn { border: 0; box-shadow: none; border-radius: 999px; padding: 6px 16px; font-size: 12.5px; font-weight: 500; background: #eef1f5; color: var(--mac-text); }
  .sub-toolbar .seg-control .seg-btn.active { background: var(--rd-brand, var(--mac-accent)); color: #fff; }
  .rd-head .section-title, .rd-look .section-header .section-title { font-size: 26px; font-weight: 700; letter-spacing: -0.01em; }
  .rd-head .section-sub, .rd-look .section-header .section-sub { font-size: 13px; margin-top: 2px; }
  .rd-head-tools input { height: 36px; min-width: 260px; box-sizing: border-box; border-radius: 8px; font-size: 13px; padding-left: 34px !important; background-repeat: no-repeat; background-position: 11px center; background-size: 15px 15px; }
  .rd-head-tools button { height: 36px; padding: 0 16px; border-radius: 8px; font-size: 13px; font-weight: 600; }
  .rd-look .per-bar { border-radius: 12px; padding: 10px 14px; }
  .rd-look .per-bar .filter-btn.active { background: var(--rd-brand, var(--mac-accent)); border-color: var(--rd-brand, var(--mac-accent)); color: #fff; }
  .rd-look .metrics { gap: 16px; }
  .rd-look .metric-card { border-radius: 12px; padding: 20px 22px; box-shadow: 0 1px 2px rgba(16, 24, 40, 0.05); }
  .rd-look .metric-card .metric-label { font-size: 13px; font-weight: 600; color: var(--mac-text); }
  .rd-look .metric-card .metric-value { font-size: 30px; font-weight: 700; }
  .rd-look .metric-card .metric-sub { font-size: 12px; }
  .rd-look .na-panel, .rd-look .chart-card, .rd-look .table-section, .rd-look .alert-card.ok { border-radius: 12px; }
  .rd-look .na-title { font-size: 16px; }
  .rd-look .chart-card .card-title { font-size: 16px; font-weight: 600; }
  .rd-look .charts-row { grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); }
  .rd-inv-body { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 18px; align-items: start; }
  .charts-row .rd-inv-body > div[style*="height:200px"] { height: 260px !important; }
  .rd-inv-body > .mdl-panel { display: flex; flex-direction: column; max-height: 260px; margin: 0; padding: 0 0 0 16px; border: 0; border-left: 1px solid var(--mac-border); border-radius: 0; background: none; box-shadow: none; }
  .rd-inv-body .mdl-title { font-size: 13px; font-weight: 600; }
  .rd-inv-body .mdl-actions { display: flex; flex-wrap: nowrap; gap: 4px; width: 100%; }
  .rd-inv-body .mdl-actions button { font-size: 10.5px; white-space: nowrap; }
  .rd-inv-body .mdl-actions [data-a="fold"] { display: none; }
  .rd-inv-body .mdl-panel .mdl-grid, .rd-inv-body .mdl-panel.fold .mdl-grid { display: flex; flex-direction: column; gap: 1px; flex: 1 1 auto; min-height: 0; max-height: none; }
  .rd-inv-body .mdl-panel.fold .mdl-foot { display: block; }
  .rd-inv-body .mdl-item { font-size: 12.5px; padding: 3px 6px; }
  .rd-inv-body .mdl-item i { width: 9px; height: 9px; }
  .rd-inv-body .mdl-foot { font-size: 10.5px; line-height: 1.35; }
  @media (max-width: 1150px) { .rd-inv-body { grid-template-columns: 1fr; } .rd-inv-body > .mdl-panel { border-left: 0; padding-left: 0; } }
  .rd-look .table-section .table-header { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 16px; }
  .rd-look .table-header .card-title { font-size: 18px; font-weight: 600; }
  .rd-look .table-header > .ovl-tools { margin: 0 0 0 auto; padding: 0; border: 0; background: none; }
  .rd-look .ovl-tools .filter-label { display: none; }
  .rd-look .ovl-tools .rd-filter { background: #eef1f5; border-radius: 999px; padding: 3px; gap: 2px; }
  .rd-look .ovl-tools .rd-filter .filter-btn { border: 0; background: none; color: var(--mac-text2); font-size: 12.5px; padding: 5px 14px; border-radius: 999px; }
  .rd-look .ovl-tools .rd-filter .filter-btn.active { background: var(--rd-brand, var(--mac-accent)); color: #fff; }
  .rd-look .ovl-tools .rd-sortgrp .filter-btn { display: none; }
  .rd-sort { display: flex; align-items: center; gap: 4px; }
  .rd-sort select, .rd-sort button { height: 32px; border-radius: 8px; border: 1px solid var(--mac-border); background: var(--mac-surface); color: var(--mac-text); font: inherit; font-size: 12.5px; }
  .rd-sort select { padding: 0 10px; cursor: pointer; }
  .rd-sort button { width: 32px; cursor: pointer; }
  .rd-look .entry-form-card label, .rd-look .entry-form-card .form-label, .rd-look .entry-history-card label { font-size: 12px; }
  .rd-look .entry-form-card input, .rd-look .entry-form-card select, .rd-look .entry-form-card textarea { font-size: 13px; border-radius: 8px; }
  .rd-look .recent-raw-table th, .rd-look .recent-raw-table td { font-size: 12.5px; }
  .rd-look .raw-table-wrap { border-radius: 12px; }
  .rd-look .raw-table th, .rd-look .raw-table td { font-size: 12.5px; }
  .rd-look .forecast-card, .rd-look .forecast-section { border-radius: 12px; }
  .rd-look .forecast-section .card-title { font-size: 16px; font-weight: 600; }
  .rd-look .forecast-table th, .rd-look .forecast-table td { font-size: 12.5px; }
  .rd-look .dash-table thead th { font-size: 12px; font-weight: 600; }
  .table-section .dash-table thead th:first-child { --rd-row: rgb(242, 242, 247); }
  .rd-look .dash-table tbody td { font-size: 13px; padding-top: 12px; padding-bottom: 12px; }`;
  document.head.appendChild(css);

  function topBar() {
    const bar = document.querySelector('.brand-bar'); if (!bar || bar.querySelector('.rd-app')) return;
    const app = document.createElement('div'); app.className = 'rd-app';
    app.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg><span>Inventory Forecast</span>';
    bar.insertBefore(app, bar.firstChild);
  }
  function userChip() {                                         // initials of the signed-in account, from the stored sign-in
    const right = document.querySelector('.brand-bar .brand-right'); if (!right) return true;
    if (right.querySelector('.rd-user')) return true;
    let email = '';
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!/auth/i.test(k)) continue; const m = String(localStorage.getItem(k) || '').match(/"email"\s*:\s*"([^"@]+@[^"]+)"/); if (m) { email = m[1]; break; } } } catch (e) {}
    if (!email) return false;
    const parts = email.split('@')[0].split(/[._-]+/).filter(Boolean); if (!parts.length) return true;
    const name = parts.slice(0, 2).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    const ini = (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0][0]).toUpperCase();
    const chip = document.createElement('div'); chip.className = 'rd-user'; chip.title = email;
    const b = document.createElement('b'); b.textContent = ini; const s = document.createElement('span'); s.textContent = name;
    chip.appendChild(b); chip.appendChild(s); right.insertBefore(chip, right.firstChild); return true;
  }
  function colours() {
    Object.keys(BR).forEach(k => {
      const root = el(BR[k].root), c = root && getComputedStyle(root).getPropertyValue('--rd-brand').trim(); if (!c) return;
      const sub = el(BR[k].sub); if (sub) sub.style.setProperty('--rd-brand', c);
      const tab = el(BR[k].tab); if (tab) tab.style.setProperty('--rd-tab', c);
    });
  }
  function moveLegend(root) {
    const panel = root.querySelector('.mdl-panel'), card = root.querySelector('.charts-row > .chart-card');
    if (!panel || !card || card.querySelector('.rd-inv-body')) return;
    const canvas = card.querySelector('canvas'); if (!canvas) return;
    const wrap = canvas.parentElement, body = document.createElement('div'); body.className = 'rd-inv-body';
    wrap.parentNode.insertBefore(body, wrap); body.appendChild(wrap); body.appendChild(panel);
    const foot = panel.querySelector('.mdl-foot'); if (foot) foot.textContent = 'Click to hide or show \u00b7 Double-click for only that model \u00b7 Point to highlight';
  }
  function syncSort(k) {
    const b = BR[k], root = el(b.root), sel = root && root.querySelector('.rd-sort select'); if (!sel) return;
    const act = Array.from(root.querySelectorAll('.ovl-tools [' + b.sortAttr + ']')).find(x => /active/.test(x.className));
    if (act && sel.value !== act.getAttribute(b.sortAttr)) sel.value = act.getAttribute(b.sortAttr);
  }
  function tableTools(k) {
    const b = BR[k], root = el(b.root), tools = root && root.querySelector('.ovl-tools'), head = root && root.querySelector('.table-section .table-header');
    if (!tools || !head || root.querySelector('.rd-sort')) return;
    head.appendChild(tools);
    const fb = tools.querySelector('[' + b.filterAttr + ']'); if (fb && fb.closest('.ovl-group')) fb.closest('.ovl-group').classList.add('rd-filter');
    const btns = Array.from(tools.querySelectorAll('[' + b.sortAttr + ']')); if (!btns.length) return;
    const grp = btns[0].closest('.ovl-group') || btns[0].parentElement; grp.classList.add('rd-sortgrp');
    const box = document.createElement('div'); box.className = 'rd-sort';
    const sel = document.createElement('select'); sel.setAttribute('aria-label', 'Sort');
    btns.forEach(x => { const o = document.createElement('option'); const t = x.textContent.trim(); o.value = x.getAttribute(b.sortAttr); o.textContent = 'Sort: ' + (t === 'Inv.' ? 'Inventory' : t); sel.appendChild(o); });
    const dir = document.createElement('button'); dir.type = 'button'; dir.title = 'Reverse The Sort Order'; dir.setAttribute('aria-label', 'Reverse the sort order'); dir.textContent = '\u21c5';
    const press = () => { const x = btns.find(y => y.getAttribute(b.sortAttr) === sel.value); if (x) x.click(); syncSort(k); };
    sel.addEventListener('change', press); dir.addEventListener('click', press);
    box.appendChild(sel); box.appendChild(dir); grp.appendChild(box); syncSort(k);
  }
  function init() {
    topBar(); colours();
    Object.keys(BR).forEach(k => {
      const root = el(BR[k].root); if (!root) return;
      root.classList.add('rd-look');
      const box = root.closest('[id^="brand-"]');                       // the whole brand: all four tabs
      if (box) { box.classList.add('rd-look'); const c = getComputedStyle(root).getPropertyValue('--rd-brand').trim(); if (c) box.style.setProperty('--rd-brand', c); }
      const s = el(BR[k].search); if (s) s.style.backgroundImage = searchIcon;
      try { moveLegend(root); } catch (e) { console.warn('[overview-look]', e && e.message); }
      try { tableTools(k); } catch (e) { console.warn('[overview-look]', e && e.message); }
    });
    if (!userChip()) { let n = 0; const t = setInterval(() => { if (userChip() || ++n > 30) clearInterval(t); }, 1000); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);
})();
