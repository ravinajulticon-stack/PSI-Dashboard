// PSI Dashboard - Period filter: quarter buttons + dated From / To (added 2026-10-21)
// A "Period" bar at the top of each brand's Overview: Q1 Q2 Q3 Q4 All, then From and To weeks labelled with
// their start date (for example "W14 - 30 Mar 26"). Quarters are calendar quarters by week number
// (Q1 W01-W13, Q2 W14-W26, Q3 W27-W39, Q4 W40-W52), the same idea as the Saleout dashboard.
// How it works: it REUSES the two existing week pickers (same ids, same handlers) and moves them into the
// new bar. The pickers' To week decides the "as at" week:
//  - charts: start at From, end at To (the existing behaviour);
//  - cards, alerts, Model Summary table, charts and the row-detail pop-up: recalculated as if the data ended
//    at the later of From and To, i.e. the numbers as they stood then. Products with no data by then are left out.
//    "Total Sell-Out" therefore still means the last 8 weeks up to that week, not the whole period.
//  - the Forecast tab always uses the latest data.
// With the range at its full extent nothing is recalculated, so the normal view is exactly as before.
// To undo: remove this script tag.
(function () {
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const Q = { 1: [1, 13], 2: [14, 26], 3: [27, 39], 4: [40, 53] };
  const BR = {
    samsung: { root: 'view-dashboard', from: 'chartWeekFrom', to: 'chartWeekTo', getFn: 'getEntries', compute: 'computeModels', openFn: 'openModal',
      refresh: () => { if (typeof renderDashboard === 'function') renderDashboard(); }, fns: ['renderMetrics', 'renderAlerts', 'renderTable', 'buildInvChart', 'buildSellChart'] },
    philips: { root: 'pview-pdashboard', from: 'philipsChartWeekFrom', to: 'philipsChartWeekTo', getFn: 'phGetEntries', compute: 'computePhilipsModels', openFn: 'phOpenModal',
      refresh: () => { if (typeof renderPhilipsDashboard === 'function') renderPhilipsDashboard(); }, fns: ['phRenderMetrics', 'phRenderAlerts', 'phRenderTable', 'phBuildInvChart', 'phBuildSellChart'] },
    plocks: { root: 'plview-pldashboard', from: 'plocksChartWeekFrom', to: 'plocksChartWeekTo', getFn: 'plGetEntries', compute: 'computePlocksModels', openFn: 'plOpenModal',
      refresh: () => { if (typeof renderPlocksDashboard === 'function') renderPlocksDashboard(); }, fns: ['plRenderMetrics', 'plRenderAlerts', 'plRenderTable', 'plBuildInvChart', 'plBuildSellChart'] }
  };
  const realGet = {}; Object.keys(BR).forEach(k => { realGet[k] = window[BR[k].getFn]; });
  const el = id => document.getElementById(id);
  const wk = w => parseInt(String(w).replace(/\D/g, ''), 10) || 0;
  let busy = false;

  const css = document.createElement('style');
  css.textContent = [
    '.per-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 12px; background: var(--mac-surface); border: 1px solid var(--mac-border); border-radius: 8px; margin-bottom: 14px; }',
    '.per-bar.on { border-color: var(--mac-accent); }',
    '.per-q { display: flex; gap: 4px; margin-right: 6px; }',
    '.per-q .filter-btn[disabled] { opacity: .4; cursor: not-allowed; }',
    '.per-note { flex-basis: 100%; display: none; font-size: 11px; color: var(--mac-text3); line-height: 1.5; }',
    '.per-bar.on .per-note { display: block; }',
    '.per-note .filter-btn { margin-left: 8px; }'
  ].join('\n');
  document.head.appendChild(css);

  // ---------- week labels with start dates ----------
  function labelMap(brand) {
    const map = {};
    try {
      realGet[brand]().forEach(e => {
        if (map[e.week]) return;
        const m = String(e.dateRange || '').split('~')[0].match(/^(\d{1,2})\/(\d{1,2})/), y = String(e.month || '').match(/^(\d{4})/);
        if (m && y) map[e.week] = e.week + ' \u00b7 ' + parseInt(m[2], 10) + ' ' + MON[parseInt(m[1], 10) - 1] + ' ' + y[1].slice(2);
      });
    } catch (e) {}
    return map;
  }
  function relabel(brand) {
    const b = BR[brand], map = labelMap(brand);
    [el(b.from), el(b.to)].forEach(s => { if (s) Array.from(s.options).forEach(o => { const l = map[o.value]; if (l && o.textContent !== l) o.textContent = l; }); });
  }
  const weeksOf = brand => { const t = el(BR[brand].to); return t ? Array.from(t.options).map(o => o.value) : []; };

  // ---------- the "as at" week (null = latest, nothing to recalculate) ----------
  function asAt(brand) {
    const b = BR[brand], f = el(b.from), t = el(b.to);
    if (!f || !t || !t.options.length) return null;
    const ws = weeksOf(brand), at = Math.max(wk(f.value), wk(t.value));
    if (at >= wk(ws[ws.length - 1])) return null;
    return ws.find(w => wk(w) === at) || null;
  }
  function asAtModels(brand, week) {
    const lim = wk(week), b = BR[brand];
    const list = window[b.compute](realGet[brand]().filter(e => wk(e.week) <= lim));
    return list.filter(m => (m.s || []).some(v => v != null) || (m.inv || []).some(v => v != null));   // not launched yet = left out
  }

  // ---------- the bar ----------
  function setRange(brand, from, to) {
    const b = BR[brand], f = el(b.from), t = el(b.to); if (!f || !t) return;
    busy = true;
    try { f.value = from; t.value = to; f.dispatchEvent(new Event('change')); t.dispatchEvent(new Event('change')); } finally { busy = false; }
    b.refresh(); syncBar(brand);
  }
  function pickQuarter(brand, q) {
    const ws = weeksOf(brand); if (!ws.length) return;
    let from = ws[0], to = ws[ws.length - 1];
    if (q) { const sub = ws.filter(w => wk(w) >= Q[q][0] && wk(w) <= Q[q][1]); if (!sub.length) return; from = sub[0]; to = sub[sub.length - 1]; }
    setRange(brand, from, to);
  }
  function syncBar(brand) {
    const b = BR[brand], root = el(b.root), bar = root && root.querySelector('.per-bar'); if (!bar) return;
    relabel(brand);
    const ws = weeksOf(brand), f = el(b.from), t = el(b.to);
    if (!ws.length || !f || !t) return;
    bar.querySelectorAll('[data-per-q]').forEach(btn => {
      const q = parseInt(btn.getAttribute('data-per-q'), 10); let want;
      if (q) { const sub = ws.filter(w => wk(w) >= Q[q][0] && wk(w) <= Q[q][1]); btn.disabled = !sub.length; want = sub.length ? [sub[0], sub[sub.length - 1]] : null; }
      else want = [ws[0], ws[ws.length - 1]];
      btn.classList.toggle('active', !!want && f.value === want[0] && t.value === want[1]);
    });
    const at = asAt(brand), map = labelMap(brand);
    bar.classList.toggle('on', !!at);
    const note = bar.querySelector('.per-note'), txt = note.querySelector('span');
    if (at) txt.textContent = 'Showing the numbers as at ' + (map[at] || at) + '. Cards, alerts, charts, table and row details all follow it; the Forecast tab always uses the latest data.';
  }
  function buildBar(brand) {
    const b = BR[brand], root = el(b.root); if (!root || root.querySelector('.per-bar')) return;
    const top = root.querySelector('.filter-bar'), f = el(b.from), t = el(b.to); if (!top || !f || !t) return;
    const oldGroup = f.parentElement, bar = document.createElement('div'); bar.className = 'per-bar';
    const lab = txt => { const s = document.createElement('span'); s.className = 'filter-label'; s.textContent = txt; return s; };
    const q = document.createElement('div'); q.className = 'per-q';
    [['Q1', 1], ['Q2', 2], ['Q3', 3], ['Q4', 4], ['All', 0]].forEach(([txt, n]) => {
      const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'filter-btn'; btn.textContent = txt; btn.setAttribute('data-per-q', String(n));
      btn.addEventListener('click', () => pickQuarter(brand, n)); q.appendChild(btn);
    });
    bar.appendChild(lab('Period')); bar.appendChild(q); bar.appendChild(lab('From')); bar.appendChild(f); bar.appendChild(lab('to')); bar.appendChild(t);
    const note = document.createElement('div'); note.className = 'per-note';
    const sp = document.createElement('span'); note.appendChild(sp);
    const back = document.createElement('button'); back.type = 'button'; back.className = 'filter-btn'; back.textContent = 'Back To Latest'; back.addEventListener('click', () => pickQuarter(brand, 0));
    note.appendChild(back); bar.appendChild(note);
    top.insertAdjacentElement('beforebegin', bar);
    if (oldGroup && oldGroup.classList.contains('ovl-group')) oldGroup.remove();                 // the old "Weeks" label and dash
    const head = root.querySelector('.ovl-charts-head');
    if (head && !head.querySelector('.per-hint')) { const h = lab('Following The Period Above'); h.classList.add('per-hint'); head.appendChild(h); }
    [f, t].forEach(s => {
      s.addEventListener('change', () => { if (!busy) { BR[brand].refresh(); syncBar(brand); } });
      new MutationObserver(() => relabel(brand)).observe(s, { childList: true });
    });
    relabel(brand); syncBar(brand);
  }

  // ---------- recalculate the Overview pieces as at the chosen week ----------
  Object.keys(BR).forEach(brand => {
    const b = BR[brand];
    b.fns.forEach((name, i) => {
      const orig = window[name]; if (typeof orig !== 'function') return;
      window[name] = function (models) {
        let list = models, rest = Array.prototype.slice.call(arguments, 1);
        try {
          const at = asAt(brand);
          if (at) {
            list = asAtModels(brand, at);
            if (i === 0 || i >= 3) rest = [(list[0] && list[0].allWeeks) || rest[0]].concat(rest.slice(1));   // metrics and charts take the week list second
          }
        } catch (e) { list = models; console.warn('[period-filter]', e && e.message); }
        const out = orig.apply(this, [list].concat(rest));
        if (i === 2) { try { syncBar(brand); } catch (e) {} }
        return out;
      };
    });
    const openOrig = window[b.openFn];                                                          // the row-detail pop-up reads entries itself
    if (typeof openOrig === 'function') window[b.openFn] = function () {
      let at = null; try { at = asAt(brand); } catch (e) {}
      if (!at) return openOrig.apply(this, arguments);
      const swapped = window[b.getFn], lim = wk(at);
      window[b.getFn] = () => realGet[brand]().filter(e => wk(e.week) <= lim);
      try { return openOrig.apply(this, arguments); } finally { window[b.getFn] = swapped; }
    };
    buildBar(brand);
  });
})();
