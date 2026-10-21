// PSI Dashboard - Overview controls sit next to what they change (added 2026-10-21)
// Before: one bar at the top held Filter, Sort, Weeks, Search, Manage Models and Refresh, although
// Filter and Sort only change the Model Summary table (far below) and Weeks only changes the charts.
// Now: Filter and Sort sit on the Model Summary card, Weeks sits above the two charts, and the top bar
// keeps Search (it narrows both the table and the charts), Manage Models and Refresh.
// The existing buttons and selects are MOVED, not copied, so their ids and click handlers still work.
// If the page does not have the expected layout, nothing is moved. To undo: remove this script tag.
(function () {
  const VIEWS = ['view-dashboard', 'pview-pdashboard', 'plview-pldashboard'];
  const css = document.createElement('style');
  css.textContent = [
    '.filter-bar > .search-wrap { margin-left: 0 !important; }',
    '.filter-bar > [id^="manageModelsBtn"] { margin-left: auto !important; }',
    '.ovl-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 22px; padding: 10px 16px; border-bottom: 1px solid var(--mac-border); background: var(--mac-surface2); }',
    '.ovl-group { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }',
    '.ovl-charts-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin: 0 2px 8px; }',
    '.ovl-title { font-size: 13px; font-weight: 600; color: var(--mac-text); }'
  ].join('\n');
  document.head.appendChild(css);

  function arrange(root) {
    if (!root || root.getAttribute('data-ovl') === '1') return;
    const bar = root.querySelector('.filter-bar'), table = root.querySelector('.table-section'), charts = root.querySelector('.charts-row');
    const head = table && table.querySelector('.table-header');
    if (!bar || !head || !charts) return;
    const kids = Array.from(bar.children);
    const at = name => kids.findIndex(k => k.classList.contains('filter-label') && k.textContent.trim().toLowerCase() === name);
    const f = at('filter'), s = at('sort'), w = at('weeks');
    const sw = kids.findIndex(k => k.classList.contains('search-wrap'));
    if (f < 0 || s <= f || w <= s || sw <= w) return;
    const pick = (a, b) => kids.slice(a, b).filter(k => !k.classList.contains('filter-sep'));
    const make = (cls, nodes, tip) => { const d = document.createElement('div'); d.className = cls; if (tip) d.title = tip; nodes.forEach(n => d.appendChild(n)); return d; };
    head.insertAdjacentElement('afterend', make('ovl-tools', [make('ovl-group', pick(f, s), 'Filters the Model Summary table'), make('ovl-group', pick(s, w), 'Sorts the Model Summary table')]));
    const title = document.createElement('span');
    title.className = 'ovl-title'; title.textContent = 'Charts';
    charts.insertAdjacentElement('beforebegin', make('ovl-charts-head', [title, make('ovl-group', pick(w, sw), 'Sets the week range for both charts')]));
    kids.filter(k => k.classList.contains('filter-sep')).forEach(k => k.remove());
    kids[sw].title = 'Narrows the table and both charts';
    root.setAttribute('data-ovl', '1');
  }
  VIEWS.forEach(id => arrange(document.getElementById(id)));
})();
