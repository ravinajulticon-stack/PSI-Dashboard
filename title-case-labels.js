// PSI Dashboard - Title Case wording on the Overview (added 2026-10-21)
// Labels the page builds itself ("Has sell-out", "Total inventory", "Model summary" ...) are
// rewritten to Title Case ("Has Sell-Out", "Total Inventory", "Model Summary" ...).
// Only an exact list of known labels is touched, and only inside the three Overview views, the
// brand sub-title under each heading, and the row-detail pop-up. Product names, numbers, the
// sentence-style messages (alerts, "All active models are within acceptable runway.") and unit
// abbreviations (Avg S/wk, Min (60d)) are left alone. Weekly Entry, Full History and Forecast
// are never touched. It is idempotent: a label that is already Title Case does not match.
(function () {
  const EXACT = {
    'Has sell-out': 'Has Sell-Out',
    'Sell-out': 'Sell-Out',
    'Total inventory': 'Total Inventory',
    'units · latest week': 'Units · Latest Week',
    'Total sell-out': 'Total Sell-Out',
    'total units placed': 'Total Units Placed',
    'Project channel': 'Project Channel',
    'total project units': 'Total Project Units',
    'models at risk': 'Models at Risk',
    'Inventory trend': 'Inventory Trend',
    'Active only': 'Active Only',
    'Weekly sell-out': 'Weekly Sell-Out',
    'Model summary': 'Model Summary',
    'Click any row for weekly detail': 'Click Any Row for Weekly Detail',
    'No activity': 'No Activity',
    'All models': 'All Models',
    'Total purchase': 'Total Purchase',
    'units purchased': 'Units Purchased',
    'Active models': 'Active Models',
    'with sell-out activity': 'With Sell-Out Activity',
    'Latest inventory': 'Latest Inventory',
    'Runway estimate': 'Runway Estimate'
  };
  const PATTERNS = [
    [/^units last (\d+) weeks$/, (m, n) => 'Units Last ' + n + ' Weeks'],
    [/^Below (\d+)-day runway$/, (m, n) => 'Below ' + n + '-Day Runway'],
    [/^(\d+) weeks · (W\d+) → (W\d+) · (\d+)-day validity$/, (m, a, b, c, d) => a + ' Weeks · ' + b + ' → ' + c + ' · ' + d + '-Day Validity'],
    [/^(\d+) weeks tracked (W\d+) to (W\d+) · (\d+)-day (validity|lead)$/, (m, a, b, c, d, e) => a + ' Weeks Tracked ' + b + ' to ' + c + ' · ' + d + '-Day ' + e.charAt(0).toUpperCase() + e.slice(1)]
  ];
  const PLACEHOLDERS = { 'Search model...': 'Search Model...' };

  function fixText(core) {
    if (Object.prototype.hasOwnProperty.call(EXACT, core)) return EXACT[core];
    for (const [re, fn] of PATTERNS) if (re.test(core)) return core.replace(re, fn);
    return null;
  }

  function retitle(node) {
    if (!node) return;
    if (node.nodeType === 3) {                              // a text node
      const raw = node.nodeValue;
      const m = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
      const next = fixText(m[2].replace(/\s+/g, ' '));
      if (next !== null && next !== m[2]) node.nodeValue = m[1] + next + m[3];
      return;
    }
    if (node.nodeType !== 1 || /^(SCRIPT|STYLE|OPTION|CANVAS)$/.test(node.tagName)) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let t; const nodes = [];
    while ((t = walker.nextNode())) nodes.push(t);
    nodes.forEach(retitle);
    node.querySelectorAll('[placeholder]').forEach(e => {
      const p = e.getAttribute('placeholder');
      if (Object.prototype.hasOwnProperty.call(PLACEHOLDERS, p)) e.setAttribute('placeholder', PLACEHOLDERS[p]);
    });
  }

  function watch(el) {
    if (!el) return;
    retitle(el);
    new MutationObserver(muts => {
      muts.forEach(m => {
        if (m.type === 'characterData') retitle(m.target);
        else m.addedNodes.forEach(retitle);
      });
    }).observe(el, { childList: true, subtree: true, characterData: true });
  }

  try {
    ['view-dashboard', 'pview-pdashboard', 'plview-pldashboard',   // the three Overview views
     'philipsDashMeta', 'plocksDashMeta'].forEach(id => watch(document.getElementById(id)));  // sub-title under each brand heading
    const grid = document.getElementById('modalGrid');             // row-detail pop-up (shared)
    if (grid) watch(grid.closest('[class*="modal"]') || grid.parentElement || grid);
  } catch (e) {
    console.warn('[title-case-labels] not applied:', e && e.message);
  }
})();
