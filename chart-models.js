// PSI Dashboard - one shared "Models" panel for the two Overview charts (added 2026-10-21)
// Before: each chart had its own legend (up to 5-6 rows on Philips Locks, names cut off at 18 characters),
// clicking a name only hid it in Inventory Trend, and the same product could be a different colour in
// the two charts (each chart coloured by position in its own list).
// Now: one panel above both charts lists every product once with its full name. Clicking a name hides or
// shows it in BOTH charts; pointing at a name highlights it and fades the rest; each product keeps ONE
// colour in both charts; Show All / Has Sell-Out Only / Collapse are in the panel header. The old legends
// stay in the page (hidden) and the charts are a little taller. To undo: remove this script tag.
(function () {
  const lazy = f => { try { return f(); } catch (e) { return null; } };
  const BR = {
    samsung: { root: 'view-dashboard',     st: () => state,   list: () => getModels(),   inv: () => invCI,   sell: () => sellCI,   invFn: 'buildInvChart',   sellFn: 'buildSellChart',   compute: () => computeModels(getEntries()) },
    philips: { root: 'pview-pdashboard',   st: () => phState, list: () => phGetModels(), inv: () => phInvCI, sell: () => phSellCI, invFn: 'phBuildInvChart', sellFn: 'phBuildSellChart', compute: () => computePhilipsModels(phGetEntries()) },
    plocks:  { root: 'plview-pldashboard', st: () => plState, list: () => plGetModels(), inv: () => plInvCI, sell: () => plSellCI, invFn: 'plBuildInvChart', sellFn: 'plBuildSellChart', compute: () => computePlocksModels(plGetEntries()) }
  };
  const KEY = 'psi_models_panel_v1';
  let folded = {}; try { folded = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  const saveFold = () => { try { localStorage.setItem(KEY, JSON.stringify(folded)); } catch (e) {} };
  const colorFor = (brand, name) => { const i = lazy(() => BR[brand].list().findIndex(m => m.name === name)); return colorOf(i >= 0 ? i : 0); };

  const css = document.createElement('style');
  css.textContent = [
    '.charts-row .chart-legend { display: none !important; }',
    '.charts-row .chart-card > div[style*="height:200px"] { height: 260px !important; }',
    '.mdl-panel { background: var(--mac-surface); border: 1px solid var(--mac-border); border-radius: var(--mac-radius-sm); padding: 8px 12px; margin: 0 0 10px; }',
    '.mdl-head { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; }',
    '.mdl-title { font-size: 12px; font-weight: 600; color: var(--mac-text); }',
    '.mdl-count { font-size: 11px; color: var(--mac-text3); }',
    '.mdl-actions { margin-left: auto; display: flex; gap: 6px; }',
    '.mdl-actions button { font-family: inherit; font-size: 11px; padding: 2px 8px; border: 1px solid var(--mac-border2); border-radius: 6px; background: var(--mac-surface2); color: var(--mac-text); cursor: pointer; }',
    '.mdl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(205px, 1fr)); gap: 2px 8px; max-height: 112px; overflow-y: auto; margin-top: 8px; }',
    '.mdl-item { display: flex; align-items: center; gap: 6px; min-width: 0; font-family: inherit; font-size: 11px; text-align: left; padding: 2px 6px; border: 1px solid transparent; border-radius: 5px; background: none; color: var(--mac-text); cursor: pointer; }',
    '.mdl-item:hover { background: var(--mac-surface2); border-color: var(--mac-accent); }',
    '.mdl-item i { width: 8px; height: 8px; border-radius: 50%; flex: none; }',
    '.mdl-item span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.mdl-item.off { opacity: .4; text-decoration: line-through; }',
    '.mdl-foot { font-size: 11px; color: var(--mac-text3); margin-top: 6px; }',
    '.mdl-panel.fold .mdl-grid, .mdl-panel.fold .mdl-foot { display: none; }'
  ].join('\n');
  document.head.appendChild(css);

  function ensurePanel(brand) {
    const b = BR[brand], root = document.getElementById(b.root); if (!root) return null;
    let p = root.querySelector('.mdl-panel'); if (p) return p;
    const row = root.querySelector('.charts-row'); if (!row) return null;
    p = document.createElement('div'); p.className = 'mdl-panel';
    p.innerHTML = '<div class="mdl-head"><span class="mdl-title">Models</span><span class="mdl-count"></span><span class="mdl-actions"><button type="button" data-a="all">Show All</button><button type="button" data-a="sell">Has Sell-Out Only</button><button type="button" data-a="fold"></button></span></div><div class="mdl-grid"></div><div class="mdl-foot">Click a name to hide or show it in both charts. Point at a name to highlight it.</div>';
    row.insertAdjacentElement('beforebegin', p);
    const grid = p.querySelector('.mdl-grid');
    grid.addEventListener('click', e => { const it = e.target.closest('.mdl-item'); if (it) toggle(brand, it.dataset.name); });
    grid.addEventListener('mouseover', e => { const it = e.target.closest('.mdl-item'); if (it) spotlight(brand, it.dataset.name); });
    grid.addEventListener('mouseleave', () => clearSpot(brand));
    p.querySelector('.mdl-actions').addEventListener('click', e => { const a = e.target.getAttribute && e.target.getAttribute('data-a'); if (a) action(brand, a); });
    return p;
  }

  function syncPanel(brand) {
    const b = BR[brand], p = ensurePanel(brand); if (!p) return;
    const ch = lazy(b.inv), st = b.st(), names = ch ? ch.data.datasets.map(d => d.label) : [];
    const off = names.filter(n => st.hidden.has(n)).length;
    p.querySelector('.mdl-count').textContent = '(' + names.length + ')' + (off ? ' \u00b7 ' + off + ' Hidden' : '');
    const grid = p.querySelector('.mdl-grid'); grid.textContent = '';
    names.forEach(n => {
      const it = document.createElement('button'); it.type = 'button'; it.className = 'mdl-item' + (st.hidden.has(n) ? ' off' : ''); it.dataset.name = n; it.title = n;
      const dot = document.createElement('i'); dot.style.background = colorFor(brand, n);
      const t = document.createElement('span'); t.textContent = n;
      it.appendChild(dot); it.appendChild(t); grid.appendChild(it);
    });
    p.classList.toggle('fold', !!folded[brand]);
    p.querySelector('[data-a="fold"]').textContent = folded[brand] ? 'Expand \u25be' : 'Collapse \u25b4';
  }

  const restore = ch => ch.data.datasets.forEach(d => { if (d._base) Object.assign(d, d._base); });
  function applyHidden(brand) {
    const b = BR[brand], st = b.st();
    [lazy(b.inv), lazy(b.sell)].forEach(ch => { if (!ch) return; restore(ch); ch.data.datasets.forEach((d, i) => ch.setDatasetVisibility(i, !st.hidden.has(d.label))); ch.update('none'); });
  }
  function toggle(brand, name) { const st = BR[brand].st(); if (st.hidden.has(name)) st.hidden.delete(name); else st.hidden.add(name); applyHidden(brand); syncPanel(brand); }
  function action(brand, a) {
    const b = BR[brand], st = b.st();
    if (a === 'fold') { folded[brand] = !folded[brand]; saveFold(); }
    else if (a === 'all') st.hidden.clear();
    else if (a === 'sell') { st.hidden.clear(); b.compute().forEach(m => { if (!(m.totalS > 0)) st.hidden.add(m.name); }); }
    applyHidden(brand); syncPanel(brand);
  }

  const fade = c => c.slice(0, 7) + '2e';
  function spotlightOn(ch, name, bar) {
    if (!ch) return;
    const sets = ch.data.datasets, idx = sets.findIndex(d => d.label === name);
    if (idx < 0 || !ch.isDatasetVisible(idx)) return;                  // nothing to highlight in this chart
    sets.forEach(d => {
      if (!d._base) return;
      if (d.label === name) { if (bar) d.backgroundColor = d._base.backgroundColor.slice(0, 7) + 'ff'; else d.borderWidth = 4; }
      else if (bar) d.backgroundColor = fade(d._base.backgroundColor);
      else { d.borderColor = fade(d._base.borderColor); d.backgroundColor = d._base.backgroundColor.slice(0, 7) + '05'; }
    });
    ch.update('none');
  }
  function spotlight(brand, name) {
    const b = BR[brand], i = lazy(b.inv), s = lazy(b.sell);
    if (i) restore(i); if (s) restore(s);
    spotlightOn(i, name, false); spotlightOn(s, name, true);
  }
  function clearSpot(brand) { const b = BR[brand]; [lazy(b.inv), lazy(b.sell)].forEach(ch => { if (ch) { restore(ch); ch.update('none'); } }); }

  function afterBuild(brand, kind) {                                    // runs after every chart rebuild
    const b = BR[brand], ch = lazy(kind === 'inv' ? b.inv : b.sell), st = b.st();
    if (ch) {
      ch.data.datasets.forEach((d, i) => {
        const c = colorFor(brand, d.label);                              // ONE colour per product, same in both charts
        if (kind === 'inv') { d.borderColor = c; d.backgroundColor = c + '15'; d._base = { borderColor: c, backgroundColor: c + '15', borderWidth: d.borderWidth }; }
        else { d.backgroundColor = c + 'cc'; d._base = { backgroundColor: c + 'cc' }; }
        ch.setDatasetVisibility(i, !st.hidden.has(d.label));
      });
      ch.update('none');
    }
    syncPanel(brand);
  }

  Object.keys(BR).forEach(brand => {
    const b = BR[brand];
    [['invFn', 'inv'], ['sellFn', 'sell']].forEach(([k, kind]) => {
      const orig = window[b[k]]; if (typeof orig !== 'function') return;
      window[b[k]] = function () {
        const r = orig.apply(this, arguments);
        try { afterBuild(brand, kind); } catch (e) { console.warn('[chart-models]', e && e.message); }
        return r;
      };
    });
    try { afterBuild(brand, 'inv'); afterBuild(brand, 'sell'); } catch (e) { console.warn('[chart-models]', e && e.message); }
  });
})();
