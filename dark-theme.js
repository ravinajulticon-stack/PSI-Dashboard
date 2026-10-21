// PSI Dashboard - Dark theme (added 2026-10-21)
// Makes the dashboard dark, matching the Saleout Dashboard's palette (macOS dark: #1c1c1e page, #2c2c2e cards,
// #3a3a3c / #48484a inner surfaces, #f5f5f7 text). The page is built on --mac-* colour variables, so most of the work
// is redefining them; the rest are the few places that hard-code a light colour:
//  - the top bar and the tabs bar (Saleout's own title-bar / toolbar translucent blacks),
//  - the Needs Attention pills (their text was a dark brown / red made for a light page),
//  - the row tints behind the frozen Model column, and the pill / segmented-control backgrounds from overview-look.js,
//  - every Chart.js chart (axis text, grid lines, tooltips), through a small global plugin.
// The brand colours (blue / orange / purple) stay as they are; the I (Inventory) data colour stays blue.
// Styling only: no calculation or data is touched. To undo: remove this script tag from index.html.
(function () {
  const css = `
  :root { color-scheme: dark;
    --mac-bg: #1c1c1e; --mac-surface: #2c2c2e; --mac-surface2: #3a3a3c; --mac-surface3: #48484a;
    --mac-sidebar: rgba(44, 44, 46, 0.85);
    --mac-border: rgba(255, 255, 255, 0.08); --mac-border2: rgba(255, 255, 255, 0.14);
    --mac-shadow: 0 4px 24px rgba(0, 0, 0, 0.4); --mac-shadow-lg: 0 8px 40px rgba(0, 0, 0, 0.6);
    --mac-text: #f5f5f7; --mac-text2: #aeaeb2; --mac-text3: #6e6e73; --mac-text4: #48484a;
    --mac-accent: #0a84ff; --mac-accent-bg: rgba(10, 132, 255, 0.16); --mac-accent-border: rgba(10, 132, 255, 0.35);
    --mac-green: #30d158; --mac-green-bg: rgba(48, 209, 88, 0.16);
    --mac-red: #ff453a; --mac-red-bg: rgba(255, 69, 58, 0.16);
    --mac-orange: #ff9f0a; --mac-orange-bg: rgba(255, 159, 10, 0.16);
    --mac-purple: #bf5af2; --mac-purple-bg: rgba(191, 90, 242, 0.16);
    --mac-teal: #5ac8fa; --mac-teal-bg: rgba(90, 200, 250, 0.16);
  }
  .brand-bar { background: rgba(28, 28, 30, 0.85); border-bottom-color: var(--mac-border); }
  .sub-toolbar { background: rgba(44, 44, 46, 0.7); border-bottom-color: var(--mac-border); }
  .na-count, .na-ico.mon, .na-pill.mon { color: #ffb340; }
  .na-pill.crit { color: #ff6961; }
  .table-section .dash-table tbody tr:hover > td:first-child { --rd-row: rgba(255, 255, 255, 0.05); }
  .table-section .dash-table tbody tr.selected > td:first-child { --rd-row: rgba(255, 255, 255, 0.09); }
  .table-section .dash-table thead th:first-child { --rd-row: var(--mac-surface2); }
  .sub-toolbar .seg-control .seg-btn { background: var(--mac-surface2); }
  .rd-look .ovl-tools .rd-filter { background: var(--mac-surface2); }
  .brand-bar .rd-user b { background: var(--mac-surface3); }
  .rd-look th[style*="mac-accent"], .rd-look td[style*="mac-accent"]:not(.model-col), .rd-look span[style*="mac-accent"]:not([onclick]), .rd-look .col-i, .rd-look .val-i { --mac-accent: #0a84ff; }  /* I column = data colour, not brand */
  .pill-gray { color: var(--mac-text2); }
  .raw-table thead tr.row-col th.col-summary { color: var(--mac-text2); }
  .model-region { color: var(--mac-text2); }`;
  const st = document.createElement('style'); st.id = 'psi-dark-theme'; st.textContent = css; document.head.appendChild(st);

  // Chart.js draws with colours passed in each chart's own options (light axis text, dark-on-white tooltips), so a global
  // plugin rewrites them as each chart is created, and the charts already on the page are updated once.
  if (typeof Chart === 'undefined') return;
  const D = { tick: '#98989d', grid: 'rgba(255, 255, 255, 0.08)', tipBg: '#3a3a3c', tipBorder: 'rgba(255, 255, 255, 0.14)', tipTitle: '#f5f5f7', tipBody: '#aeaeb2' };
  function darken(chart) {
    const o = chart.config.options = chart.config.options || {};
    const sc = o.scales = o.scales || {};
    Object.keys(sc).forEach(k => {
      const s = sc[k] = sc[k] || {};
      s.ticks = Object.assign({}, s.ticks, { color: D.tick });
      if (!(s.grid && s.grid.display === false)) s.grid = Object.assign({}, s.grid, { color: D.grid });
    });
    const p = o.plugins = o.plugins || {};
    p.tooltip = Object.assign({}, p.tooltip, { backgroundColor: D.tipBg, borderColor: D.tipBorder, titleColor: D.tipTitle, bodyColor: D.tipBody });
    if (p.legend && p.legend.labels) p.legend.labels = Object.assign({}, p.legend.labels, { color: D.tick });
  }
  Chart.defaults.color = D.tick; Chart.defaults.borderColor = D.grid;
  Chart.register({ id: 'psiDark', beforeInit: darken });
  try { Object.values(Chart.instances).forEach(c => { darken(c); c.update('none'); }); } catch (e) { console.warn('[dark-theme]', e && e.message); }
})();
