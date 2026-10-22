// PSI Dashboard - Deliveries (added 2026-10-22). Phase 2 of the Forecast plan.
// A "Deliveries" tab on every brand: the purchase-order lines that are on the way, kept by the deliveries owner (Avin Karadaky).
// Each line: model, PO number, quantity, original date, revised date, status, note. Delay = revised date - original date; a line whose
// date has passed but is still open is "overdue" and is NOT counted as coming (it needs a new date). The Supply Risk Board reads these
// lines (window.PSI_PIPELINE) to show the next arrival and its delay, and the Weekly Supply Report prints from the same data.
// Storage: one row per brand in the existing Supabase table incoming_stock (brand = samsung_pipeline / philips_pipeline / plocks_pipeline,
// data = {v, lines, meta}); the old Incoming boxes use the brand = samsung / philips / plocks rows and are not touched. Every save re-reads the
// row, applies the one change to the fresh copy and writes it back only if nobody else saved in between, so two people cannot overwrite each other.
// The old Weekly Forecast card reads these deliveries too, and its Incoming boxes are locked (see the section near the end of this file).
// To undo: remove this script tag (the board and the old card fall back to the old Incoming boxes, which are unchanged).
(function () {
  if (window.PSI_PIPELINE) return;
  const OWNER = 'Avin Karadaky', STALE_DAYS = 7;
  // What each department sees in the Weekly Supply Report: which sections, in what order, and a one-line focus. EDIT HERE to change a department's report.
  const DEPTS = {
    '': { sections: ['act', 'due', 'late', 'over'], focus: '' },
    'Sales': { sections: ['act', 'due', 'late'], focus: 'Models likely to run out, when stock comes back, and deliveries running late.' },
    'Finance': { sections: ['act', 'due', 'late', 'over'], focus: 'Orders to place, deliveries expected, late deliveries, and the stock tying up cash.' },
    'Executive': { sections: ['act', 'due', 'late', 'over'], focus: 'The full picture: what needs action, what is arriving, what is late and what is overstocked.' },
    'CS & Installation': { sections: ['late', 'due', 'act'], focus: 'Late deliveries and arrivals that affect units and parts for installs, and what is about to run out.' },
    'General Management': { sections: ['act', 'due', 'late', 'over'], focus: 'The full picture: what needs action, what is arriving, what is late and what is overstocked.' },
    'Marketing': { sections: ['over', 'due', 'act'], focus: 'Overstocked models to push, arrivals to plan around, and models to avoid promoting.' }
  };
  const DEPT_NAMES = ['Sales', 'Finance', 'Executive', 'CS & Installation', 'General Management', 'Marketing'];
  const ROW = { samsung: 'samsung_pipeline', philips: 'philips_pipeline', plocks: 'plocks_pipeline' };
  const CACHE_KEY = 'psi_pipeline_cache_v1', STATUSES = ['On Order', 'In Transit', 'Arrived', 'Cancelled'], OPEN = ['On Order', 'In Transit'];
  // <pure>
  const DAY = 86400000;
  const parseD = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const toIso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
  function isoWeek(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / DAY + 1) / 7); }
  const wkKey = d => 'W' + String(isoWeek(d)).padStart(2, '0');
  function info(line, today) {                                                     // what a line means today
    const due = parseD(line.due), rev = parseD(line.revised), eff = rev || due, open = OPEN.indexOf(line.status) >= 0;
    return { eff, due, open, delay: rev && due ? daysBetween(due, rev) : 0, overdue: !!(open && eff && daysBetween(today, eff) < 0), daysOut: eff ? daysBetween(today, eff) : null };
  }
  function arrivalsFrom(lines, today) {                                            // {model: {W47: qty}} for open, not overdue lines: the shape the board already reads
    const out = {};
    lines.forEach(l => { if (l.deleted) return; const i = info(l, today), q = +l.qty; if (!i.open || i.overdue || !i.eff || !(q > 0)) return; const o = out[l.model] = out[l.model] || {}, w = wkKey(i.eff); o[w] = (o[w] || 0) + q; });
    return out;
  }
  // </pure>
  const fmtDate = d => d ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '\u2014';
  const cfgs = {
    samsung: { name: 'Samsung Locks', letter: 'S', id: 'view-deliveries', cls: 'view', after: 'view-forecast', subnav: 'subnav-samsung', attr: 'data-view', view: 'deliveries', sw: 'switchView', box: 'brand-samsung', models: () => computeModels(getEntries()) },
    philips: { name: 'Philips Safes', letter: 'P', id: 'pview-pdeliveries', cls: 'pview', after: 'pview-pforecast', subnav: 'subnav-philips', attr: 'data-pview', view: 'pdeliveries', sw: 'switchPhilipsView', box: 'brand-philips', models: () => computePhilipsModels(phGetEntries()) },
    plocks: { name: 'Philips Locks', letter: 'L', id: 'plview-pldeliveries', cls: 'pview', after: 'plview-plforecast', subnav: 'subnav-plocks', attr: 'data-plview', view: 'pldeliveries', sw: 'switchPlocksView', box: 'brand-plocks', models: () => computePlocksModels(plGetEntries()) }
  };
  // ---------------- data layer ----------------
  const S = {}; Object.keys(ROW).forEach(k => { S[k] = { lines: [], meta: null, loaded: false, sig: null }; });
  const listeners = []; let offline = false;
  const notify = () => listeners.slice().forEach(f => { try { f(); } catch (e) { console.warn('[deliveries]', e && e.message); } });
  const who = () => { const e = document.querySelector('.rd-user span'); return (e && e.textContent.trim()) || 'Unknown'; };
  const rowUrl = k => SUPA_URL + '/rest/v1/incoming_stock?brand=eq.' + ROW[k];
  function adopt(k, data) {
    const lines = data && Array.isArray(data.lines) ? data.lines : [], meta = (data && data.meta) || null, sig = JSON.stringify([lines, meta]), changed = sig !== S[k].sig;
    S[k].lines = lines; S[k].meta = meta; S[k].loaded = true; S[k].sig = sig;
    if (changed) { try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); c[k] = { lines, meta }; localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) {} }
    return changed;
  }
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); Object.keys(c).forEach(k => { if (S[k] && c[k]) { S[k].lines = c[k].lines || []; S[k].meta = c[k].meta || null; } }); } catch (e) {}   // instant first paint; refreshed from the database straight after
  async function load(k) {
    if (offline) return;
    try { const r = await fetch(rowUrl(k) + '&select=data', { headers: SH }); if (!r.ok) throw new Error('HTTP ' + r.status); const rows = await r.json(); if (adopt(k, rows[0] && rows[0].data)) notify(); }
    catch (e) { console.warn('[deliveries] load ' + k + ':', e && e.message); }
  }
  async function mutate(k, fn, metaExtra) {
    if (offline) { S[k].lines = fn(S[k].lines.map(x => Object.assign({}, x))); S[k].meta = Object.assign({ updatedAt: new Date().toISOString(), updatedBy: who() }, metaExtra || {}); S[k].sig = null; notify(); return; }
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await fetch(rowUrl(k) + '&select=data,updated_at', { headers: SH }); if (!r.ok) throw new Error('Could not read the saved deliveries (HTTP ' + r.status + ').');
      const row = (await r.json())[0]; if (!row) throw new Error('The deliveries row is missing in the database.');
      const cur = row.data && Array.isArray(row.data.lines) ? row.data.lines : [], cutoff = Date.now() - 30 * DAY;
      const next = fn(cur.map(x => Object.assign({}, x))).filter(l => !(l.deleted && Date.parse(l.updatedAt) < cutoff));
      const now = new Date().toISOString(), data = { v: 1, lines: next, meta: Object.assign({ updatedAt: now, updatedBy: who() }, metaExtra || {}) };
      const p = await fetch(rowUrl(k) + '&updated_at=eq.' + encodeURIComponent(row.updated_at), { method: 'PATCH', headers: Object.assign({}, SH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: JSON.stringify({ data, updated_at: now }) });
      if (!p.ok) throw new Error('Could not save (HTTP ' + p.status + ').');
      const saved = await p.json(); if (saved.length === 1) { adopt(k, saved[0].data); notify(); return; }
    }
    throw new Error('Someone else saved at the same moment. Please try again.');
  }
  const newId = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const stamp = l => Object.assign(l, { updatedAt: new Date().toISOString(), updatedBy: who() });
  const save = (k, line) => mutate(k, lines => { const rec = stamp(Object.assign({}, line, { id: line.id || newId() })), i = lines.findIndex(x => x.id === rec.id); if (i >= 0) lines[i] = rec; else lines.push(rec); return lines; });
  const remove = (k, id) => mutate(k, lines => lines.map(x => x.id === id ? stamp(Object.assign({}, x, { deleted: true })) : x));
  const confirmList = (k, none) => mutate(k, lines => lines, none ? { confirmed: 'none' } : null);   // stamps the list as checked today without changing a line; 'none' records that nothing is on order
  const live = k => S[k].lines.filter(l => !l.deleted);
  const P = window.PSI_PIPELINE = {
    lines: k => live(k).map(l => Object.assign({}, l)), meta: k => S[k].meta, loaded: k => S[k].loaded, info: l => info(l, new Date()),
    arrivals: k => arrivalsFrom(S[k].lines, new Date()), models: k => new Set(live(k).map(l => l.model)), refresh: load, onChange: f => listeners.push(f),
    save, remove, confirmList, isoWeek, wkKey, fmtDate, parseD, daysBetween, who, openReport, setOffline: v => { offline = !!v; }, owner: OWNER, staleDays: STALE_DAYS, cfgs
  };
  // ---------------- styles ----------------
  const css = document.createElement('style'); css.id = 'psi-deliveries';
  css.textContent = `
  .dl-wrap { width: 100%; box-sizing: border-box; padding: 4px 0 40px; }
  .dl-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; margin-bottom: 4px; }
  .dl-title { display: flex; align-items: center; gap: 12px; }
  .dl-badge { width: 28px; height: 28px; border-radius: 8px; background: var(--rd-brand); color: #fff; font-weight: 700; display: flex; align-items: center; justify-content: center; font-size: 14px; }
  .dl-title h2 { margin: 0; font-size: 18px; font-weight: 600; color: var(--mac-text); }
  .dl-sub { font-size: 12.5px; color: var(--mac-text2); margin: 4px 0 12px; }
  .dl-btns { display: flex; gap: 8px; flex-wrap: wrap; }
  .dl-btn { font: inherit; font-size: 12.5px; font-weight: 600; padding: 7px 14px; border-radius: 8px; border: 1px solid var(--mac-border2); background: var(--mac-surface2); color: var(--mac-text); cursor: pointer; }
  .dl-btn:hover { background: color-mix(in srgb, var(--mac-text) 12%, var(--mac-surface2)); }
  .dl-btn.primary { background: var(--rd-brand); border-color: var(--rd-brand); color: #fff; }
  .dl-fresh { font-size: 12px; border-radius: 8px; padding: 7px 12px; margin-bottom: 12px; background: color-mix(in srgb, var(--mac-green) 12%, transparent); color: var(--mac-text); }
  .dl-fresh.stale { background: color-mix(in srgb, var(--mac-orange) 16%, transparent); }
  .dl-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
  .dl-kpi { background: var(--mac-surface); border: 1px solid var(--mac-border); border-radius: 12px; padding: 12px 14px; }
  .dl-kpi b { display: block; font-size: 22px; font-weight: 600; color: var(--mac-text); }
  .dl-kpi span { font-size: 11.5px; color: var(--mac-text2); }
  .dl-kpi.bad b { color: var(--mac-red); }
  .dl-tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 14px; margin-bottom: 10px; }
  .dl-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .dl-chip { font: inherit; font-size: 11.5px; font-weight: 600; width: 112px; padding: 4px 0; box-sizing: border-box; text-align: center; white-space: nowrap; border-radius: 999px; border: 1px solid transparent; cursor: pointer; background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--c); }
  .dl-chip.on { border-color: var(--c); }
  .dl-search { font: inherit; font-size: 12.5px; padding: 6px 10px; width: 220px; border-radius: 8px; border: 1px solid var(--mac-border2); background: var(--mac-surface2); color: var(--mac-text); }
  .dl-card { background: var(--mac-surface); border: 1px solid var(--mac-border); border-radius: 12px; padding: 4px 14px 8px; overflow-x: auto; }
  .dl-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .dl-table th { text-align: left; font-size: 11px; font-weight: 600; color: var(--mac-text2); padding: 10px 9px; border-bottom: 1px solid var(--mac-border2); white-space: nowrap; }
  .dl-table td { padding: 9px 9px; border-bottom: 1px solid var(--mac-border); color: var(--mac-text); white-space: nowrap; }
  .dl-table td.num, .dl-table th.num { text-align: right; }
  .dl-table td.note { max-width: 190px; overflow: hidden; text-overflow: ellipsis; color: var(--mac-text2); }
  .dl-table td.act { text-align: right; }
  .dl-name { font-weight: 600; }
  .dl-pill { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: color-mix(in srgb, var(--c) 18%, transparent); color: var(--c); margin-right: 4px; }
  .dl-bad { color: var(--mac-red); font-weight: 600; } .dl-good { color: var(--mac-green); font-weight: 600; } .dl-dim { color: var(--mac-text3); }
  .dl-link { font: inherit; font-size: 12px; font-weight: 600; background: none; border: 0; color: var(--rd-brand); cursor: pointer; padding: 2px 6px; }
  .dl-link.danger { color: var(--mac-red); }
  .dl-empty { text-align: center; color: var(--mac-text2); padding: 30px 10px; font-size: 13px; line-height: 1.6; }
  .dl-foot { font-size: 11px; color: var(--mac-text3); margin-top: 10px; line-height: 1.5; }
  .dl-modal-root { position: fixed; inset: 0; z-index: 99990; background: rgba(0,0,0,.55); display: flex; align-items: center; justify-content: center; padding: 16px; }
  .dl-modal { width: 460px; max-width: 100%; max-height: 92vh; overflow: auto; background: var(--mac-surface); border: 1px solid var(--mac-border2); border-radius: 14px; padding: 20px 22px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
  .dl-modal h3 { margin: 0 0 14px; font-size: 17px; font-weight: 600; color: var(--mac-text); }
  .dl-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 11px; }
  .dl-field label { font-size: 11.5px; font-weight: 600; color: var(--mac-text2); }
  .dl-field input, .dl-field select { font: inherit; font-size: 13px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--mac-border2); background: var(--mac-surface2); color: var(--mac-text); color-scheme: dark; }
  .dl-field small { font-size: 11px; color: var(--mac-text3); }
  .dl-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .dl-err { color: var(--mac-red); font-size: 12px; min-height: 16px; margin: 4px 0 8px; }
  .dl-modal-btns { display: flex; justify-content: flex-end; gap: 8px; }
  @media (max-width: 760px) { .dl-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .dl-search { width: 100%; } .dl-wrap { padding: 14px 12px 30px; } }
  /* five sub-tabs now: share the width on mid-size screens, and keep only the open tab's name on a phone */
  @media (max-width: 960px) { .sub-toolbar .seg-control button.seg-btn { flex: 1 1 0; min-width: 0; padding: 0 6px; } .sub-toolbar .seg-control { flex: 1 1 auto; min-width: 0; } }
  @media (max-width: 520px) { .sub-toolbar .seg-control button.seg-btn:not(.active) { font-size: 0; gap: 0; } .sub-toolbar .seg-control button.seg-btn.active { flex: 2.4 1 0; } }
  .psi-rep-root { position: fixed; inset: 0; z-index: 100000; background: rgba(0,0,0,.82); overflow: auto; }
  .psi-rep-bar { position: sticky; top: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; justify-content: center; padding: 10px 12px; background: #2c2c2e; color: #f5f5f7; font-size: 12.5px; }
  .psi-rep-bar select, .psi-rep-bar input { width: auto !important; max-width: 230px; font: inherit; font-size: 12.5px; padding: 5px 8px; border-radius: 6px; border: 1px solid #555; background: #3a3a3c; color: #f5f5f7; }
  .psi-rep-page { background: #fff; width: 210mm; max-width: calc(100% - 16px); min-height: 270mm; margin: 16px auto; padding: 13mm; box-sizing: border-box; font: 12px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; }
  .psi-rep-page { background: #fff !important; }
  .psi-rep-page * { color: #1d1d1f !important; background-color: transparent; }
  .psi-rep-page h1 { font-size: 20px; margin: 0 0 2px; } .psi-rep-page h2 { font-size: 13.5px; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 2px solid #1d1d1f; }
  .psi-rep-page .rp-sub { color: #555 !important; font-size: 11.5px; margin-bottom: 8px; }
  .psi-rep-page .rp-kpis { display: flex; gap: 8px; margin: 10px 0 0; } .psi-rep-page .rp-kpi { flex: 1; border: 1px solid #ccc; border-radius: 6px; padding: 6px 8px; } .psi-rep-page .rp-kpi b { display: block; font-size: 17px; }
  .psi-rep-page table { width: 100%; border-collapse: collapse; font-size: 11px; } .psi-rep-page th { text-align: left; background: #eee !important; padding: 4px 6px; border: 1px solid #ccc; } .psi-rep-page td { padding: 4px 6px; border: 1px solid #ccc; }
  .psi-rep-page .num { text-align: right; } .psi-rep-page .rp-red { color: #b3261e !important; font-weight: 700; } .psi-rep-page .rp-amber { color: #b26a00 !important; font-weight: 700; } .psi-rep-page .rp-none { color: #666 !important; font-style: italic; }
  .psi-rep-page .rp-foot { margin-top: 14px; font-size: 10.5px; color: #666 !important; }
  .rp-all > .psi-rep-page:not(.rp-export) { display: none !important; }
  @media print { body > *:not(.psi-rep-root) { display: none !important; } .psi-rep-root { position: static; background: none; overflow: visible; } .psi-rep-bar { display: none !important; } .psi-rep-page { margin: 0; width: auto; max-width: none; min-height: 0; padding: 0; } @page { size: A4; margin: 12mm; } .psi-rep-page.rp-export { break-after: page; page-break-after: always; } .psi-rep-page.rp-export:last-child { break-after: auto; page-break-after: auto; } }`;
  document.head.appendChild(css);
  // ---------------- helpers ----------------
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const STAT_COL = { 'On Order': 'var(--mac-text2)', 'In Transit': '#0a84ff', 'Arrived': 'var(--mac-green)', 'Cancelled': 'var(--mac-text3)' };
  const ui = { samsung: { chip: 'open', q: '' }, philips: { chip: 'open', q: '' }, plocks: { chip: 'open', q: '' } };
  const today = () => new Date();
  const ageText = (iso, t) => { const d = new Date(iso), n = daysBetween(d, t); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : n + ' days ago'; };
  function stats(k) {
    const t = today(), ls = live(k).map(l => ({ l, i: info(l, t) })), open = ls.filter(x => x.i.open);
    const units = a => a.reduce((s, x) => s + (+x.l.qty || 0), 0), delayed = open.filter(x => x.i.delay > 0), overdue = open.filter(x => x.i.overdue);
    return { ls, open, openUnits: units(open), next4: units(open.filter(x => !x.i.overdue && x.i.daysOut <= 28)), delayed, avgDelay: delayed.length ? Math.round(delayed.reduce((s, x) => s + x.i.delay, 0) / delayed.length) : 0, overdue };
  }
  // Samsung's tabs each carry their own brand header (badge, brand name, weeks line); Locks and Safes show one shared header above every tab. So on Samsung the Deliveries tab
  // borrows the very same block from the Weekly Entry tab, so it looks like the rest. Samsung's Forecast tab already has its own header: do NOT add one there.
  function refreshHeader(view) {
    if (!view) return; const old = view.querySelector(':scope > [data-dl-head]'); if (old) old.remove();
    const src = document.querySelector('#view-entry > .section-header > div'); if (!src) return;
    const h = document.createElement('div'); h.className = 'section-header'; h.setAttribute('data-dl-head', '1');
    const left = src.cloneNode(true); left.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
    const meta = document.getElementById('dashboardMeta'), sub = left.querySelector('.section-sub'); if (meta && sub && meta.textContent.trim()) sub.textContent = meta.textContent.trim();
    h.appendChild(left); view.insertBefore(h, view.firstChild);
  }
  // ---------------- the screen ----------------
  function render(k) {
    const c = cfgs[k], host = document.getElementById(c.id); if (!host) return;
    const brandCol = getComputedStyle(document.getElementById(c.box)).getPropertyValue('--rd-brand').trim(); if (brandCol) host.style.setProperty('--rd-brand', brandCol);
    host.textContent = ''; if (k === 'samsung') refreshHeader(host); const wrap = el('div', 'dl-wrap'), st = stats(k), t = today(), meta = S[k].meta;
    const head = el('div', 'dl-head'), title = el('div', 'dl-title'); title.appendChild(el('h2', null, 'Deliveries On Order')); head.appendChild(title);
    const btns = el('div', 'dl-btns'), add = el('button', 'dl-btn primary', '+ Add Delivery'), rep = el('button', 'dl-btn', 'Weekly Supply Report'); add.type = rep.type = 'button';
    const hasOpen = live(k).some(l => info(l, t).open), confLabel = hasOpen ? 'Confirm List Is Current' : 'Confirm Nothing On Order', conf = el('button', 'dl-btn', confLabel); conf.type = 'button';
    conf.title = hasOpen ? 'Stamps the list as checked today without changing any delivery' : 'Records that nothing is on order for this brand, so the board and the report say so instead of "no deliveries entered"';
    conf.addEventListener('click', async () => { conf.disabled = true; conf.textContent = 'Saving...'; try { await confirmList(k, !hasOpen); } catch (e) { alert(String(e && e.message || e)); conf.disabled = false; conf.textContent = confLabel; } });
    add.addEventListener('click', () => openModal(k, null)); rep.addEventListener('click', () => openReport(k)); btns.appendChild(conf); btns.appendChild(rep); btns.appendChild(add); head.appendChild(btns); wrap.appendChild(head);
    wrap.appendChild(el('div', 'dl-sub', 'Purchase-order lines on the way. Owner: ' + OWNER + '. The Supply Risk Board and the Weekly Supply Report use these dates.'));
    const age = meta && meta.updatedAt ? daysBetween(new Date(meta.updatedAt), t) : null, stale = age === null ? st.ls.length > 0 || true : age > STALE_DAYS;
    const fresh = el('div', 'dl-fresh' + (stale ? ' stale' : ''), meta && meta.confirmed === 'none' && !st.open.length ? 'Nothing is on order. Confirmed ' + ageText(meta.updatedAt, t) + ' (' + fmtDate(new Date(meta.updatedAt)) + ') by ' + (meta.updatedBy || 'Unknown') + (age > STALE_DAYS ? '. That was ' + age + ' days ago: confirm again, or add a delivery if one has been placed.' : '.') : age === null ? 'No deliveries have been saved yet. ' + OWNER + ' keeps this list; until it is filled in, the board treats every model as having nothing on order.' : 'Last updated ' + ageText(meta.updatedAt, t) + ' (' + fmtDate(new Date(meta.updatedAt)) + ') by ' + (meta.updatedBy || 'Unknown') + (age > STALE_DAYS ? '. It has not been updated for ' + age + ' days: check the dates with ' + OWNER + '.' : '.'));
    wrap.appendChild(fresh);
    const kp = el('div', 'dl-kpis'), tile = (n, label, bad) => { const d = el('div', 'dl-kpi' + (bad ? ' bad' : '')); d.appendChild(el('b', null, n)); d.appendChild(el('span', null, label)); kp.appendChild(d); };
    tile(String(st.open.length), 'Open Deliveries (' + st.openUnits.toLocaleString() + ' Units)'); tile(st.next4.toLocaleString(), 'Units Due In The Next 4 Weeks');
    tile(String(st.delayed.length), st.delayed.length ? 'Delayed (Average ' + st.avgDelay + ' Days Late)' : 'Delayed', st.delayed.length > 0); tile(String(st.overdue.length), 'Overdue: Date Passed, Not Arrived', st.overdue.length > 0); wrap.appendChild(kp);
    const tools = el('div', 'dl-tools'), chips = el('div', 'dl-chips'), q = el('input', 'dl-search'); q.type = 'search'; q.placeholder = 'Search Model Or PO...'; q.value = ui[k].q;
    const defs = [['open', 'Open', st.open.length, 'var(--mac-text)'], ['delayed', 'Delayed', st.delayed.length, 'var(--mac-red)'], ['overdue', 'Overdue', st.overdue.length, 'var(--mac-orange)'], ['arrived', 'Arrived', st.ls.filter(x => x.l.status === 'Arrived').length, 'var(--mac-green)'], ['all', 'All', st.ls.length, 'var(--mac-text2)']];
    const paint = () => chips.querySelectorAll('.dl-chip').forEach(b => b.classList.toggle('on', b.dataset.k === ui[k].chip));
    defs.forEach(([key, label, n, col]) => { const b = el('button', 'dl-chip', label + ' ' + n); b.type = 'button'; b.dataset.k = key; b.style.setProperty('--c', col); b.addEventListener('click', () => { ui[k].chip = key; paint(); rows(k); }); chips.appendChild(b); });
    q.addEventListener('input', () => { ui[k].q = q.value; rows(k); }); tools.appendChild(chips); tools.appendChild(q); wrap.appendChild(tools); paint();
    const card = el('div', 'dl-card'), tbl = el('table', 'dl-table'), th = el('thead'), hr = el('tr');
    [['Model', ''], ['PO Number', ''], ['Quantity', 'num'], ['Original Date', ''], ['Revised Date', ''], ['Delay', ''], ['Status', ''], ['Note', ''], ['', 'act']].forEach(([h, cls]) => hr.appendChild(el('th', cls, h)));
    th.appendChild(hr); tbl.appendChild(th); const tb = el('tbody'); tb.id = 'dl-body-' + k; tbl.appendChild(tb); card.appendChild(tbl); const empty = el('div', 'dl-empty'); empty.id = 'dl-empty-' + k; card.appendChild(empty); wrap.appendChild(card);
    wrap.appendChild(el('div', 'dl-foot', 'Delay is the revised date minus the original date. A delivery whose date has passed but is not marked Arrived is Overdue and is not counted as coming until its date is updated. Mark a delivery Arrived once its stock appears in the weekly inventory entry, so it is not counted twice.'));
    host.appendChild(wrap); rows(k);
  }
  function rows(k) {
    const tb = document.getElementById('dl-body-' + k), empty = document.getElementById('dl-empty-' + k); if (!tb) return; tb.textContent = '';
    const t = today(), f = ui[k], term = f.q.trim().toLowerCase(), items = live(k).map(l => ({ l, i: info(l, t) }));
    const keep = x => (f.chip === 'all' || (f.chip === 'open' && x.i.open) || (f.chip === 'delayed' && x.i.open && x.i.delay > 0) || (f.chip === 'overdue' && x.i.overdue) || (f.chip === 'arrived' && x.l.status === 'Arrived')) && (!term || (x.l.model + ' ' + (x.l.po || '')).toLowerCase().indexOf(term) >= 0);
    const list = items.filter(keep).sort((a, b) => (b.i.open - a.i.open) || ((a.i.eff || 0) - (b.i.eff || 0)));
    list.forEach(({ l, i }) => {
      const tr = el('tr'), td = (txt, cls) => { const d = el('td', cls || null, txt); tr.appendChild(d); return d; };
      td(l.model, 'dl-name'); td(l.po || '\u2014', l.po ? '' : 'dl-dim'); td((+l.qty || 0).toLocaleString(), 'num'); td(fmtDate(i.due)); td(l.revised ? fmtDate(parseD(l.revised)) : '\u2014', l.revised ? '' : 'dl-dim');
      td(!i.open || !i.delay ? '\u2014' : (i.delay > 0 ? '+' + i.delay + ' days' : (-i.delay) + ' days early'), !i.open || !i.delay ? 'dl-dim' : (i.delay > 0 ? 'dl-bad' : 'dl-good'));
      const sd = el('td'), pill = el('span', 'dl-pill', l.status); pill.style.setProperty('--c', STAT_COL[l.status] || 'var(--mac-text2)'); sd.appendChild(pill);
      if (i.overdue) { const o = el('span', 'dl-pill', 'Overdue'); o.style.setProperty('--c', 'var(--mac-red)'); o.title = 'The date has passed and it is not marked Arrived, so it is not counted as coming. Update the date or mark it Arrived.'; sd.appendChild(o); } tr.appendChild(sd);
      const n = td(l.note || '', 'note'); if (l.note) n.title = l.note;
      const a = el('td', 'act'), mk = (label, fn, cls) => { const b = el('button', 'dl-link' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.addEventListener('click', fn); a.appendChild(b); return b; };
      mk('Edit', () => openModal(k, l)); if (i.open) mk('Arrived', () => act(k, () => save(k, Object.assign({}, l, { status: 'Arrived', arrivedOn: toIso(t) }))));
      const rm = mk('Remove', () => { if (rm.dataset.sure) { act(k, () => remove(k, l.id)); } else { rm.dataset.sure = '1'; rm.textContent = 'Sure?'; setTimeout(() => { if (rm.isConnected) { delete rm.dataset.sure; rm.textContent = 'Remove'; } }, 3000); } }, 'danger'); tr.appendChild(a); tb.appendChild(tr);
    });
    empty.textContent = list.length ? '' : (live(k).length ? 'Nothing matches this filter.' : (S[k].meta && S[k].meta.confirmed === 'none' ? 'Nothing is on order for this brand (confirmed ' + fmtDate(new Date(S[k].meta.updatedAt)) + '). Add a delivery when one is placed.' : 'No deliveries entered yet. Click Add Delivery to enter the first purchase-order line. ' + OWNER + ' owns this list.'));
  }
  async function act(k, fn) { try { await fn(); } catch (e) { alert(String(e && e.message || e)); } }
  function openModal(k, line) {
    const c = cfgs[k], root = el('div', 'dl-modal-root'), m = el('div', 'dl-modal'), isNew = !line, l = Object.assign({ status: 'On Order', qty: '', po: '', due: '', revised: '', note: '', model: '' }, line || {});
    const close = () => root.remove(); root.addEventListener('mousedown', e => { if (e.target === root) close(); }); m.appendChild(el('h3', null, (isNew ? 'Add Delivery' : 'Edit Delivery') + ' \u2014 ' + c.name));
    const field = (label, input, hint) => { const d = el('div', 'dl-field'), lb = el('label', null, label); d.appendChild(lb); d.appendChild(input); if (hint) d.appendChild(el('small', null, hint)); return d; };
    const sel = el('select'); const names = c.models().map(x => x.name); if (l.model && names.indexOf(l.model) < 0) names.unshift(l.model);
    const ph = el('option', null, 'Choose A Model...'); ph.value = ''; sel.appendChild(ph); names.forEach(n => { const o = el('option', null, n); o.value = n; sel.appendChild(o); }); sel.value = l.model;
    const po = el('input'); po.type = 'text'; po.value = l.po || ''; po.placeholder = 'For Example PO-1234';
    const qty = el('input'); qty.type = 'number'; qty.min = '1'; qty.step = '1'; qty.value = l.qty || '';
    const due = el('input'); due.type = 'date'; due.value = l.due || ''; const rev = el('input'); rev.type = 'date'; rev.value = l.revised || '';
    const stt = el('select'); STATUSES.forEach(s => { const o = el('option', null, s); o.value = s; stt.appendChild(o); }); stt.value = l.status;
    const note = el('input'); note.type = 'text'; note.value = l.note || ''; note.placeholder = 'Optional';
    m.appendChild(field('Model', sel)); m.appendChild(field('PO Number', po));
    const r1 = el('div', 'dl-row2'); r1.appendChild(field('Quantity', qty)); r1.appendChild(field('Status', stt)); m.appendChild(r1);
    const r2 = el('div', 'dl-row2'); r2.appendChild(field('Original Date', due, 'The date first promised')); r2.appendChild(field('Revised Date', rev, 'Leave blank if it has not changed')); m.appendChild(r2);
    m.appendChild(field('Note', note)); const err = el('div', 'dl-err'); m.appendChild(err);
    const bt = el('div', 'dl-modal-btns'), cancel = el('button', 'dl-btn', 'Cancel'), ok = el('button', 'dl-btn primary', 'Save'); cancel.type = ok.type = 'button'; root.style.setProperty('--rd-brand', getComputedStyle(document.getElementById(c.box)).getPropertyValue('--rd-brand').trim() || '#0a84ff');
    cancel.addEventListener('click', close);
    ok.addEventListener('click', async () => {
      const q = parseInt(qty.value, 10); err.textContent = '';
      if (!sel.value) return void (err.textContent = 'Choose a model.'); if (!(q > 0)) return void (err.textContent = 'Enter a quantity of 1 or more.'); if (!due.value) return void (err.textContent = 'Enter the original date.');
      if (rev.value && !parseD(rev.value)) return void (err.textContent = 'The revised date is not valid.');
      ok.disabled = true; ok.textContent = 'Saving...';
      const rec = Object.assign({}, line || {}, { model: sel.value, po: po.value.trim(), qty: q, due: due.value, revised: rev.value || '', status: stt.value, note: note.value.trim() });
      if (rec.status === 'Arrived' && !rec.arrivedOn) rec.arrivedOn = toIso(today());
      try { await save(k, rec); close(); } catch (e) { err.textContent = String(e && e.message || e); ok.disabled = false; ok.textContent = 'Save'; }
    });
    bt.appendChild(cancel); bt.appendChild(ok); m.appendChild(bt); root.appendChild(m); document.body.appendChild(root); sel.focus();
  }
  // ---------------- the weekly supply report ----------------
  function reportData(scope) {
    const api = window.__srApi, ks = scope === 'all' ? ['samsung', 'philips', 'plocks'] : [scope], t = today(), d = { ks, t, week: wkKey(t), act: [], due: [], late: [], over: [], counts: { 'Order Now': 0, 'Expedite': 0, 'Watch': 0, 'Overstock': 0 }, open: 0, units: 0, latest: '', metas: [] };
    ks.forEach(k => {
      const res = api && api.getAnalysis(k), tag = scope === 'all' ? cfgs[k].name + ': ' : ''; const byName = {};
      if (res) { d.latest = res.latestLbl; res.list.forEach(a => { byName[a.name] = a; if (d.counts[a.action] != null) d.counts[a.action]++; });
        res.list.filter(a => a.action === 'Order Now' || a.action === 'Expedite').forEach(a => d.act.push({ name: tag + a.name, onHand: a.invNow, cover: a.cover, out: api.stockOutText(a, 'likely', res.latestNum), next: a.nextArr ? api.wkLabel(res.latestNum + a.nextArr.ahead) + ' (' + a.nextArr.qty + ')' : 'None', suggest: a.suggest, action: a.action }));
        res.list.filter(a => a.action === 'Overstock').sort((x, y) => y.invNow - x.invNow).forEach(a => d.over.push({ name: tag + a.name, onHand: a.invNow, cover: a.cover })); }
      live(k).forEach(l => { const i = info(l, t); if (!i.open) return; d.open++; d.units += +l.qty || 0; const a = byName[l.model], row = { name: tag + l.model, po: l.po || '', qty: +l.qty || 0, due: i.due, eff: i.eff, delay: i.delay, overdue: i.overdue };
        if (!i.overdue && i.daysOut <= 28) d.due.push(row);
        if (i.overdue || i.delay > 0) { row.impact = i.overdue ? 'Not counted: update the date or mark it Arrived' : (a && a.likely.firstShort !== null ? 'Runs out ' + api.stockOutText(a, 'likely', res.latestNum) + ', about ' + a.likely.empty + ' week' + (a.likely.empty === 1 ? '' : 's') + ' without stock' : 'Stock lasts until it arrives'); d.late.push(row); } });
      if (S[k].meta && S[k].meta.updatedAt) d.metas.push({ k, m: S[k].meta });
    });
    d.due.sort((a, b) => a.eff - b.eff); d.late.sort((a, b) => (b.overdue - a.overdue) || (b.delay - a.delay)); return d;
  }
  function reportText(d, dept) {
    const cfg = DEPTS[dept] || DEPTS[''], N = x => (x.cover == null ? 'n/a' : (x.cover >= 100 ? '100+' : Math.round(x.cover * 10) / 10)), L = [];
    L.push('WEEKLY SUPPLY REPORT' + (dept ? ' - ' + dept : ''), d.ks.map(k => cfgs[k].name).join(', ') + ' | ' + d.week + ' | Prepared ' + fmtDate(d.t) + (d.latest ? ' | Data through ' + d.latest : ''));
    if (cfg.focus) L.push('Focus: ' + cfg.focus);
    L.push('', 'Order Now ' + d.counts['Order Now'] + ' | Expedite ' + d.counts['Expedite'] + ' | Watch ' + d.counts['Watch'] + ' | Overstock ' + d.counts['Overstock'] + ' | Open deliveries ' + d.open + ' (' + d.units.toLocaleString() + ' units)', '');
    const parts = {
      act: () => { L.push('NEEDS ACTION NOW'); if (!d.act.length) L.push('  Nothing needs action.'); d.act.slice(0, 12).forEach(r => L.push('  ' + r.name + ': ' + r.onHand + ' on hand, ' + N(r) + ' wks cover, out ' + r.out + ', next arrival ' + r.next + (r.suggest > 0 ? ', suggest ordering ' + r.suggest : '') + ' [' + r.action + ']')); },
      due: () => { L.push('DELIVERIES DUE IN THE NEXT 4 WEEKS'); if (!d.due.length) L.push('  None entered.'); d.due.slice(0, 12).forEach(r => L.push('  ' + r.name + ' ' + (r.po ? r.po + ' ' : '') + ': ' + r.qty + ' units, ' + fmtDate(r.eff) + (r.delay > 0 ? ' (' + r.delay + ' days late)' : ''))); },
      late: () => { L.push('LATE OR OVERDUE DELIVERIES'); if (!d.late.length) L.push('  None.'); d.late.slice(0, 12).forEach(r => L.push('  ' + r.name + ' ' + (r.po ? r.po + ' ' : '') + ': ' + r.qty + ' units, ' + (r.overdue ? 'overdue (was ' + fmtDate(r.due) + ')' : r.delay + ' days late, now ' + fmtDate(r.eff)) + ' - ' + r.impact)); },
      over: () => { L.push('OVERSTOCK WATCH'); if (!d.over.length) L.push('  None.'); d.over.slice(0, 5).forEach(r => L.push('  ' + r.name + ': ' + r.onHand + ' on hand' + (r.cover == null ? '' : ', ' + N(r) + ' wks cover'))); }
    };
    cfg.sections.forEach(k => { parts[k](); L.push(''); });
    L.push('Deliveries owner: ' + OWNER + (d.metas.length ? '. Last updated ' + d.metas.map(x => cfgs[x.k].name + ' ' + fmtDate(new Date(x.m.updatedAt))).join(', ') : '. No deliveries saved yet') + '. Indicative only: built from the weekly history; arrivals count only what is entered on the Deliveries tab.');
    return L.join('\n');
  }
  function openReport(k0) {
    const old = document.querySelector('.psi-rep-root'); if (old) old.remove();
    let page = el('div', 'psi-rep-page'); const basePage = page, root = el('div', 'psi-rep-root'), bar = el('div', 'psi-rep-bar'); root.appendChild(bar); root.appendChild(page);
    const scope = el('select'); [['all', 'All Brands']].concat(Object.keys(cfgs).map(k => [k, cfgs[k].name])).forEach(([v, t]) => { const o = el('option', null, t); o.value = v; scope.appendChild(o); }); scope.value = k0 || 'all';
    const who2 = el('select'); [''].concat(DEPT_NAMES).forEach(n => { const o = el('option', null, n || 'All Departments'); o.value = n; who2.appendChild(o); }); try { who2.value = localStorage.getItem('psi_report_dept_v1') || ''; } catch (e) {} if (who2.selectedIndex < 0) who2.value = '';
    const mkb = (t, fn) => { const b = el('button', 'dl-btn', t); b.type = 'button'; b.addEventListener('click', fn); return b; };
    const lab = el('span', null, 'Scope:'); bar.appendChild(lab); bar.appendChild(scope); bar.appendChild(el('span', null, 'Department:')); bar.appendChild(who2);
    const copy = mkb('Copy As Text', async () => { try { await navigator.clipboard.writeText(root.classList.contains('rp-all') ? DEPT_NAMES.map(n => reportText(reportData(scope.value), n)).join('\n\n' + '='.repeat(60) + '\n\n') : reportText(reportData(scope.value), who2.value.trim())); copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy As Text'; }, 1800); } catch (e) { copy.textContent = 'Copy Failed'; } });
    const expBtn = mkb('Export All Departments', () => exportAll()), backBtn = mkb('Back To Single Report', () => leaveAll()); backBtn.style.display = 'none'; expBtn.title = 'Puts the six department reports on separate pages, ready to print or save as one PDF';
    bar.appendChild(copy); bar.appendChild(expBtn); bar.appendChild(backBtn); bar.appendChild(mkb('Print / Save As PDF', () => window.print())); bar.appendChild(mkb('Close', () => root.remove()));
    const table = (heads, body, numCols) => { const t = el('table'), h = el('tr'); heads.forEach((x, i) => h.appendChild(el('th', numCols.indexOf(i) >= 0 ? 'num' : null, x))); const th = el('thead'); th.appendChild(h); t.appendChild(th); const tb = el('tbody'); body.forEach(r => { const tr = el('tr'); r.forEach((c, i) => { const td = el('td', (numCols.indexOf(i) >= 0 ? 'num ' : '') + (c && c.cls ? c.cls : ''), c && c.t != null ? c.t : c); tr.appendChild(td); }); tb.appendChild(tr); }); t.appendChild(tb); return t; };
    const none = txt => el('div', 'rp-none', txt), more = (n, m) => n > m ? el('div', 'rp-sub', n - m + ' more in the dashboard.') : null;
    const caps = n => n <= 3 ? { act: 6, due: 4, late: 4, over: 4 } : { act: 4, due: 3, late: 3, over: 2 };   // fewer sections, more rows each; sized from a worst-case measurement so a full report stays on one A4 page
    const cov = r => r.cover == null ? '\u2014' : (r.cover >= 100 ? '100+' : String(Math.round(r.cover * 10) / 10));
    const secs = {
      act: (d, cap) => { page.appendChild(el('h2', null, 'Needs Action Now')); if (!d.act.length) { page.appendChild(none('Nothing needs action this week.')); return; } page.appendChild(table(['Model', 'On Hand', 'Cover (Wks)', 'Stock-Out', 'Next Arrival', 'Suggested Order', 'Action'], d.act.slice(0, cap).map(r => [r.name, String(r.onHand), cov(r), r.out, r.next, r.suggest > 0 ? String(r.suggest) : '\u2014', { t: r.action, cls: r.action === 'Order Now' ? 'rp-red' : 'rp-amber' }]), [1, 2, 5])); const mm = more(d.act.length, cap); if (mm) page.appendChild(mm); },
      due: (d, cap) => { page.appendChild(el('h2', null, 'Deliveries Due In The Next 4 Weeks')); if (!d.due.length) { page.appendChild(none('No deliveries are entered for the next 4 weeks.')); return; } page.appendChild(table(['Model', 'PO Number', 'Quantity', 'Due', 'Delay'], d.due.slice(0, cap).map(r => [r.name, r.po || '\u2014', String(r.qty), fmtDate(r.eff), r.delay > 0 ? { t: '+' + r.delay + ' days', cls: 'rp-red' } : '\u2014']), [2])); const mm = more(d.due.length, cap); if (mm) page.appendChild(mm); },
      late: (d, cap) => { page.appendChild(el('h2', null, 'Late Or Overdue Deliveries')); if (!d.late.length) { page.appendChild(none('No late or overdue deliveries.')); return; } page.appendChild(table(['Model', 'PO Number', 'Quantity', 'Was', 'Now', 'What It Means'], d.late.slice(0, cap).map(r => [r.name, r.po || '\u2014', String(r.qty), fmtDate(r.due), r.overdue ? { t: 'Overdue', cls: 'rp-red' } : { t: fmtDate(r.eff) + ' (+' + r.delay + ' d)', cls: 'rp-amber' }, r.impact]), [2])); const mm = more(d.late.length, cap); if (mm) page.appendChild(mm); },
      over: (d, cap) => { page.appendChild(el('h2', null, 'Overstock Watch')); if (!d.over.length) { page.appendChild(none('No overstocked models.')); return; } page.appendChild(table(['Model', 'On Hand', 'Cover (Wks)'], d.over.slice(0, cap).map(r => [r.name, String(r.onHand), cov(r)]), [1, 2])); const mm = more(d.over.length, cap); if (mm) page.appendChild(mm); }
    };
    const draw = () => {
      const d = reportData(scope.value), dept = who2.value, cfg = DEPTS[dept] || DEPTS[''], cap = caps(cfg.sections.length); page.textContent = '';
      page.appendChild(el('h1', null, 'Weekly Supply Report' + (dept ? ' \u2014 ' + dept : '')));
      page.appendChild(el('div', 'rp-sub', d.ks.map(x => cfgs[x].name).join(', ') + '  |  ' + d.week + '  |  Prepared ' + fmtDate(d.t) + (d.latest ? '  |  Data Through ' + d.latest : '')));
      if (cfg.focus) page.appendChild(el('div', 'rp-sub', 'Focus: ' + cfg.focus));
      const kp = el('div', 'rp-kpis'); [['Order Now', d.counts['Order Now']], ['Expedite', d.counts['Expedite']], ['Watch', d.counts['Watch']], ['Overstock', d.counts['Overstock']], ['Open Deliveries', d.open + ' (' + d.units.toLocaleString() + ')']].forEach(([l, v]) => { const x = el('div', 'rp-kpi'); x.appendChild(el('b', null, String(v))); x.appendChild(el('span', null, l)); kp.appendChild(x); }); page.appendChild(kp);
      cfg.sections.forEach(key => secs[key](d, cap[key]));
      page.appendChild(el('div', 'rp-foot', 'Deliveries owner: ' + OWNER + (d.metas.length ? '. Last updated ' + d.metas.map(x => cfgs[x.k].name + ' ' + fmtDate(new Date(x.m.updatedAt))).join(', ') : '. No deliveries have been saved yet') + '. Indicative only: built from the weekly history; arrivals count only what is entered on the Deliveries tab; overdue lines are not counted.'));
    };
    const exportPages = [];
    const leaveAll = quiet => { exportPages.splice(0).forEach(p => p.remove()); root.classList.remove('rp-all'); expBtn.style.display = ''; backBtn.style.display = 'none'; who2.disabled = false; page = basePage; if (!quiet) draw(); };
    const exportAll = () => {      // the six department reports, one per page: print once and save as a single PDF
      const keep = who2.value; leaveAll(true); root.classList.add('rp-all'); expBtn.style.display = 'none'; backBtn.style.display = ''; who2.disabled = true;
      DEPT_NAMES.forEach(dept => { const pg = el('div', 'psi-rep-page rp-export'); root.appendChild(pg); exportPages.push(pg); page = pg; who2.value = dept; draw(); });
      page = basePage; who2.value = keep; root.scrollTop = 0;
    };
    scope.addEventListener('change', () => { if (root.classList.contains('rp-all')) exportAll(); else draw(); }); who2.addEventListener('change', () => { try { localStorage.setItem('psi_report_dept_v1', who2.value); } catch (e) {} draw(); }); root.addEventListener('keydown', e => { if (e.key === 'Escape') root.remove(); });
    document.body.appendChild(root); draw();
  }
  // ---------------- install the tab on each brand ----------------
  const TRUCK = '<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>';
  Object.keys(cfgs).forEach(k => {
    try {
      const c = cfgs[k], bar = document.querySelector('#' + c.subnav + ' .seg-control'), anchor = document.getElementById(c.after) || document.getElementById(c.after.replace('forecast', 'history')), original = window[c.sw];
      if (!bar || !anchor || typeof original !== 'function' || document.getElementById(c.id)) return;
      const view = document.createElement('div'); view.id = c.id; view.className = c.cls; if (c.cls === 'pview') view.style.display = 'none'; view.style.paddingTop = '4px'; anchor.parentNode.insertBefore(view, anchor.nextSibling);
      const btn = document.createElement('button'); btn.className = 'seg-btn'; btn.setAttribute(c.attr, c.view);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ['viewBox:0 0 24 24', 'fill:none', 'stroke:currentColor', 'stroke-width:1.8', 'stroke-linecap:round', 'stroke-linejoin:round', 'aria-hidden:true'].forEach(a => { const p = a.split(':'); svg.setAttribute(p[0], p[1]); }); svg.innerHTML = TRUCK;
      btn.appendChild(svg); btn.appendChild(document.createTextNode('Deliveries')); btn.addEventListener('click', () => window[c.sw](c.view)); bar.appendChild(btn);
      window[c.sw] = function (name) {
        const r = original.apply(this, arguments);
        if (c.sw === 'switchPlocksView') view.style.display = name === c.view ? 'block' : 'none';   // Philips Locks' switcher only knows its own views
        if (name === c.view) setTimeout(() => { try { render(k); load(k); } catch (e) { console.warn('[deliveries] render', e && e.message); } }, 0);
        return r;
      };
    } catch (e) { console.warn('[deliveries] could not install for ' + k + ':', e && e.message); }
  });
  // ---------------- the old Weekly Forecast card reads the deliveries too ----------------
  // The card (and the Total chart in forecast-plus.js) read their Incoming figures from localStorage <brand>_incoming_v1. Those reads now get the deliveries merged in, and the
  // Incoming boxes are locked, so there is ONE place to enter arrivals: the Deliveries tab. Models with a delivery line use the lines; the old store itself is never changed
  // (writes to those three keys are ignored, because the merged view must never be saved back into it).
  const INC_KEYS = { samsung_incoming_v1: 'samsung', philips_incoming_v1: 'philips', plocks_incoming_v1: 'plocks' };
  const isInc = key => typeof key === 'string' && Object.prototype.hasOwnProperty.call(INC_KEYS, key);
  const origGet = Storage.prototype.getItem, origSet = Storage.prototype.setItem;
  Storage.prototype.getItem = function (key) {
    const v = origGet.apply(this, arguments);
    if (this !== window.localStorage || !isInc(key)) return v;
    try {
      const k = INC_KEYS[key], lines = live(k); if (!lines.length) return v;
      const arr = arrivalsFrom(S[k].lines, new Date()), merged = Object.assign({}, JSON.parse(v || '{}'));
      new Set(lines.map(l => l.model)).forEach(n => { merged[n] = arr[n] || {}; });
      return JSON.stringify(merged);
    } catch (e) { return v; }
  };
  Storage.prototype.setItem = function (key) { if (this === window.localStorage && isInc(key)) return; return origSet.apply(this, arguments); };
  function lockBoxes() {
    const t = new Date();
    document.querySelectorAll('.fc-incoming-input').forEach(i => {
      if (i.disabled) return; i.disabled = true; i.style.cursor = 'not-allowed'; i.style.opacity = i.value ? '1' : '0.45';
      const k = i.dataset.brand, ls = (k && S[k] ? live(k) : []).filter(l => { const f = info(l, t); return l.model === i.dataset.model && f.open && !f.overdue && f.eff && wkKey(f.eff) === i.dataset.week; });
      i.title = ls.length ? ls.map(l => (l.po || 'No PO') + ': ' + l.qty + ' (' + l.status + '), ' + fmtDate(parseD(l.revised || l.due))).join('\n') : 'Locked: incoming stock now comes from the Deliveries tab.';
    });
    document.querySelectorAll('.card *, [id$="orecastSection"] *').forEach(e => { if (e.children.length === 0 && /Enter expected incoming stock/.test(e.textContent)) e.textContent = '\uD83D\uDCE6 Incoming stock comes from the Deliveries tab and is read-only here. To change an arrival, edit its delivery on the Deliveries tab.'; });
  }
  ['renderForecast', 'renderPlocksForecast'].forEach(fn => { const o = window[fn]; if (typeof o !== 'function') return; window[fn] = function () { const r = o.apply(this, arguments); try { lockBoxes(); } catch (e) { console.warn('[deliveries] lock', e && e.message); } return r; }; });
  const FRENDER = { samsung: () => renderForecast(computeModels(getEntries()), 'samsung'), philips: () => renderForecast(computePhilipsModels(phGetEntries()), 'philips'), plocks: () => renderPlocksForecast(computePlocksModels(plGetEntries())) };
  const FVIEW = { samsung: 'view-forecast', philips: 'pview-pforecast', plocks: 'plview-plforecast' };
  listeners.push(() => Object.keys(FRENDER).forEach(k => { const v = document.getElementById(FVIEW[k]); if (v && v.offsetParent !== null) { try { FRENDER[k](); } catch (e) { console.warn('[deliveries] redraw forecast', e && e.message); } } }));
  listeners.push(() => Object.keys(cfgs).forEach(k => { const v = document.getElementById(cfgs[k].id); if (v && v.offsetParent !== null) render(k); }));
  try { if (localStorage.getItem('undefined')) localStorage.removeItem('undefined'); } catch (e) {}   // the page's old Incoming loader saves every row it does not know under the key "undefined"; clear that junk
  const clean = () => { try { localStorage.removeItem('undefined'); } catch (e) {} };   // the old loader re-creates it after every load
  const loadAll = () => { Object.keys(ROW).forEach(load); setTimeout(clean, 2500); }; loadAll(); setTimeout(loadAll, 4000);
})();
