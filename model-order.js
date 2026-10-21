// PSI Dashboard - Model Summary order follows the product list (added 2026-10-21)
// Weekly Entry and Full History list products in the order of each brand's product list, but the
// Overview's Model Summary sorted them alphabetically. When the table is sorted by "Model" (its
// starting sort), it now uses the same product-list order, so all three screens agree. Clicking
// Model again reverses that order. The other sorts (Inv., Runway, Sell-Out) and all filters and
// search work exactly as before. On Samsung the "Model" column header was wired to sort by
// inventory by mistake; it now sorts by Model as well.
(function () {
  const BR = [
    { fn: 'getVisible',   st: () => state,   list: () => getModels(),   keys: ['model', 'name'] },
    { fn: 'phGetVisible', st: () => phState, list: () => phGetModels(), keys: ['model'] },
    { fn: 'plGetVisible', st: () => plState, list: () => plGetModels(), keys: ['model'] }
  ];
  BR.forEach(b => {
    const orig = window[b.fn];
    if (typeof orig !== 'function') return;
    window[b.fn] = function () {
      const rows = orig.apply(this, arguments);
      try {
        const st = b.st();
        if (!b.keys.includes(st.sort)) return rows;
        const pos = new Map(b.list().map((m, i) => [m.name, i]));
        const at = m => (pos.has(m.name) ? pos.get(m.name) : 1e6);   // unknown names go last
        return rows.sort((x, y) => st.sortDir * (at(x) - at(y)));
      } catch (e) { return rows; }                                   // anything odd: keep the original order
    };
  });
})();
