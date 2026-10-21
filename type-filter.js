// PSI Dashboard - Type filter (added 2026-10-21)
// Products carry a `type` (Philips Locks: Handle, Push Pull, Deadbolt, Door Bell; Philips Safes: their
// series, e.g. "2000 Series"), saved in the psi_models table (column `type`) and copied once from the
// Saleout dashboard by name. Samsung Locks has no types yet.
//  - A Type dropdown (called Series on Philips Safes) sits on the Model Summary card next to Filter and
//    Sort, with counts, plus Untyped. It narrows the Overview's cards, alerts, table AND both charts.
//    The Forecast tab is not affected (it has its own product picker).
//  - The dropdown stays hidden for a brand until at least one of its products has a type.
//  - Manage Models gets a Type selector per product, and Add New Model gets a Type field.
//  - Types are pulled from the database on load and on Refresh so every device agrees.
// To undo: remove this script tag (the column and values in psi_models are harmless).
(function () {
  const ORDER = ['Handle', 'Push Pull', 'Deadbolt', 'Rim', 'Door Bell'];
  const BR = {
    samsung: { label: 'Type', all: 'All Types', root: 'view-dashboard', getM: () => getModels(), saveM: m => saveModels(m), refresh: () => { if (typeof renderDashboard === 'function') renderDashboard(); },
      fns: ['renderMetrics', 'renderAlerts', 'renderTable', 'buildInvChart', 'buildSellChart'], form: { name: 'newModelName', region: 'newModelRegion', type: 'newModelType', save: 'saveNewModel' } },
    philips: { label: 'Series', all: 'All Series', root: 'pview-pdashboard', getM: () => phGetModels(), saveM: m => phSaveModels(m), refresh: () => { if (typeof renderPhilipsDashboard === 'function') renderPhilipsDashboard(); },
      fns: ['phRenderMetrics', 'phRenderAlerts', 'phRenderTable', 'phBuildInvChart', 'phBuildSellChart'], form: { name: 'philipsNewModelName', region: 'philipsNewModelRegion', type: 'philipsNewModelType', save: 'philipsSaveNewModel' } },
    plocks: { label: 'Type', all: 'All Types', root: 'plview-pldashboard', getM: () => plGetModels(), saveM: m => plSaveModels(m), refresh: () => { if (typeof renderPlocksDashboard === 'function') renderPlocksDashboard(); },
      fns: ['plRenderMetrics', 'plRenderAlerts', 'plRenderTable', 'plBuildInvChart', 'plBuildSellChart'], form: { name: 'plocksNewModelName', region: 'plocksNewModelRegion', type: 'plocksNewModelType', save: 'plocksSaveNewModel' } }
  };
  const sel = { samsung: '__all', philips: '__all', plocks: '__all' };      // '__all', '__none' (untyped) or a type name

  const css = document.createElement('style');
  css.textContent = [
    '.tf-select.on { border-color: var(--mac-accent); color: var(--mac-accent); font-weight: 600; }',
    '.tf-row-select { margin-left: auto; font-family: inherit; font-size: 11px; padding: 4px 6px; border: 1px solid var(--mac-border2); border-radius: 8px; background: var(--mac-surface2); color: var(--mac-text); max-width: 130px; }'
  ].join('\n');
  document.head.appendChild(css);

  const sortTypes = arr => arr.sort((a, b) => { const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b); if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); return a.localeCompare(b, undefined, { numeric: true }); });
  const typeMap = brand => new Map(BR[brand].getM().map(m => [m.name, (m.type || '').trim()]));
  function choices(brand) {
    const used = new Set(); BR[brand].getM().forEach(m => { if (m.type) used.add(m.type); });
    return sortTypes(Array.from(new Set((brand === 'philips' ? [] : ORDER).concat(Array.from(used)))));
  }
  function keep(brand, models) {
    const s = sel[brand]; if (s === '__all' || !Array.isArray(models)) return models;
    const tm = typeMap(brand);
    return models.filter(m => (s === '__none' ? !tm.get(m.name) : tm.get(m.name) === s));
  }

  // ---------- the dropdown on the Model Summary card ----------
  function syncControl(brand, models) {
    const b = BR[brand], root = document.getElementById(b.root), tools = root && root.querySelector('.ovl-tools');
    if (!tools || !Array.isArray(models)) return;
    const tm = typeMap(brand), counts = new Map(); let untyped = 0;
    models.forEach(m => { const t = tm.get(m.name); if (t) counts.set(t, (counts.get(t) || 0) + 1); else untyped++; });
    let grp = tools.querySelector('.tf-group');
    if (!counts.size) { if (grp) grp.style.display = 'none'; sel[brand] = '__all'; return; }
    if (!grp) {
      grp = document.createElement('div'); grp.className = 'ovl-group tf-group';
      grp.title = 'Narrows the cards, alerts, charts and table to one ' + b.label.toLowerCase();
      const lab = document.createElement('span'); lab.className = 'filter-label'; lab.textContent = b.label;
      const s = document.createElement('select'); s.className = 'week-range-select tf-select';
      s.addEventListener('change', () => { sel[brand] = s.value; b.refresh(); });
      grp.appendChild(lab); grp.appendChild(s); tools.appendChild(grp);
    }
    grp.style.display = '';
    const opts = [['__all', b.all + ' (' + models.length + ')']].concat(sortTypes(Array.from(counts.keys())).map(t => [t, t + ' (' + counts.get(t) + ')']));
    if (untyped) opts.push(['__none', 'Untyped (' + untyped + ')']);
    const s = grp.querySelector('select'), sig = JSON.stringify(opts);
    if (s.getAttribute('data-sig') !== sig) { s.textContent = ''; opts.forEach(o => { const op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; s.appendChild(op); }); s.setAttribute('data-sig', sig); }
    if (!opts.some(o => o[0] === sel[brand])) { sel[brand] = '__all'; setTimeout(b.refresh, 0); }   // the chosen type no longer exists
    s.value = sel[brand]; s.classList.toggle('on', sel[brand] !== '__all');
  }

  // ---------- narrow the Overview pieces (not the Forecast) ----------
  Object.keys(BR).forEach(brand => {
    const b = BR[brand];
    b.fns.forEach((name, i) => {
      const orig = window[name]; if (typeof orig !== 'function') return;
      window[name] = function (models) {
        const rest = Array.prototype.slice.call(arguments, 1);
        try { if (i === 2) syncControl(brand, models); } catch (e) { console.warn('[type-filter]', e && e.message); }
        let list = models; try { list = keep(brand, models); } catch (e) { list = models; }
        return orig.apply(this, [list].concat(rest));
      };
    });
  });

  // ---------- database: read, write ----------
  async function pullTypes(brand) {
    try {
      const r = await fetch(SUPA_URL + '/rest/v1/psi_models?select=name,type&brand=eq.' + brand, { headers: SH });
      if (!r.ok) return false;
      const remote = await r.json(), models = BR[brand].getM(), by = new Map(models.map(m => [m.name, m]));
      let changed = false;
      remote.forEach(rm => { const m = by.get(rm.name), t = rm.type || ''; if (m && (m.type || '') !== t) { m.type = t; changed = true; } });
      if (changed) BR[brand].saveM(models);
      return changed;
    } catch (e) { return false; }
  }
  function pullAll() { Object.keys(BR).forEach(k => pullTypes(k).then(ch => { if (ch) BR[k].refresh(); })); }
  window.addEventListener('load', () => setTimeout(pullAll, 2200));
  const origSync = window.forceSync;
  if (typeof origSync === 'function') window.forceSync = function () { const r = origSync.apply(this, arguments); pullAll(); return r; };

  async function patchType(brand, name, type, tries) {                // retries so a just-added product's row exists first
    try {
      const r = await fetch(SUPA_URL + '/rest/v1/psi_models?brand=eq.' + brand + '&name=eq.' + encodeURIComponent(name), { method: 'PATCH', headers: Object.assign({}, SH, { Prefer: 'return=representation' }), body: JSON.stringify({ type: type || null }) });
      const rows = r.ok ? await r.json() : null;
      if (rows && rows.length) return true;
      if (!r.ok && typeof showToast === 'function') { showToast('Type saved on this device only', 'error'); return false; }
    } catch (e) {}
    if (tries > 0) { setTimeout(() => patchType(brand, name, type, tries - 1), 2000); }
    return false;
  }
  function setType(brand, name, type, tries) {
    const b = BR[brand], models = b.getM(), m = models.find(x => x.name === name); if (!m) return;
    m.type = type || ''; b.saveM(models);
    patchType(brand, name, type, tries || 0); b.refresh();
  }

  // ---------- Manage Models: a Type selector on every row ----------
  function fillSelect(s, brand, cur) {
    s.textContent = '';
    [['', 'No Type']].concat(choices(brand).map(t => [t, t]), [['__new', 'Add New Type...']]).forEach(o => { const op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; s.appendChild(op); });
    if (cur && !Array.from(s.options).some(o => o.value === cur)) { const op = document.createElement('option'); op.value = cur; op.textContent = cur; s.insertBefore(op, s.lastChild); }
    s.value = cur || '';
  }
  function enhanceManage(brand) {
    const list = document.getElementById('manageModelsList-' + brand); if (!list) return;
    const by = new Map(BR[brand].getM().map(m => [m.name, m]));
    list.querySelectorAll('[data-toggle-archive]').forEach(btn => {
      const row = btn.parentElement; if (!row || row.querySelector('.tf-row-select')) return;
      const name = btn.getAttribute('data-toggle-archive'), cur = (by.get(name) && by.get(name).type) || '';
      const s = document.createElement('select'); s.className = 'tf-row-select'; s.title = 'Type'; fillSelect(s, brand, cur);
      s.addEventListener('change', () => {
        let v = s.value;
        if (v === '__new') { v = (window.prompt('New type name (for example Handle)') || '').trim(); if (!v) { s.value = cur; return; } }
        setType(brand, name, v);
        const l = document.getElementById('manageModelsList-' + brand); if (l) { l.querySelectorAll('.tf-row-select').forEach(x => x.remove()); enhanceManage(brand); }
      });
      row.insertBefore(s, btn);
    });
  }
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[id^="manageModelsBtn-"]'); if (!t) return;
    const brand = t.id.replace('manageModelsBtn-', '');
    setTimeout(() => {
      const list = document.getElementById('manageModelsList-' + brand); if (!list || !BR[brand]) return;
      enhanceManage(brand);
      if (!list.getAttribute('data-tf')) { list.setAttribute('data-tf', '1'); new MutationObserver(() => enhanceManage(brand)).observe(list, { childList: true }); }
    }, 0);
  });

  // ---------- Add New Model: a Type field ----------
  Object.keys(BR).forEach(brand => {
    const f = BR[brand].form, regionEl = document.getElementById(f.region), grp = regionEl && regionEl.closest('.form-group');
    if (grp && !document.getElementById(f.type)) {
      const g = document.createElement('div'); g.className = 'form-group'; g.style.margin = '0';
      const lab = document.createElement('label'); lab.textContent = 'Type';
      const s = document.createElement('select'); s.id = f.type; fillSelect(s, brand, '');
      s.addEventListener('focus', () => { if (s.value !== '__new') fillSelect(s, brand, s.value); });
      s.addEventListener('change', () => { if (s.value === '__new') { const v = (window.prompt('New type name (for example Handle)') || '').trim(); fillSelect(s, brand, v); } });
      g.appendChild(lab); g.appendChild(s); grp.insertAdjacentElement('afterend', g);
    }
    const prev = window[f.save]; if (typeof prev !== 'function') return;
    window[f.save] = function () {
      const nameEl = document.getElementById(f.name), name = nameEl ? nameEl.value.trim().toUpperCase() : '';
      const ts = document.getElementById(f.type), type = ts && ts.value !== '__new' ? ts.value : '';
      const existed = !!name && BR[brand].getM().some(m => m.name === name);
      const r = prev.apply(this, arguments);
      if (name && !existed && type && BR[brand].getM().some(m => m.name === name)) setType(brand, name, type, 4);
      if (ts) fillSelect(ts, brand, '');
      return r;
    };
  });
})();
