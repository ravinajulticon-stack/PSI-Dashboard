// PSI Dashboard - One-Off Sales (added 2026-10-26).
// A big sales week that was a one-off bulk or project order (for example two Locks models sold about 565 units each in W43, against a normal 3 a week)
// is NOT normal demand. A person marks it on the Supply Risk Board (open a model, "Unusually Big Sales Weeks"), and the board then leaves that week out of
// the demand estimate, the same way it already leaves out weeks when the shelf was empty. The sales figures themselves are NOT changed anywhere.
// Storage: one row per brand in the existing Supabase table incoming_stock (brand = samsung_oneoff / philips_oneoff / plocks_oneoff, data = {v, items, meta});
// items = [{id, model, week, note, by, at, deleted?}]. Every save re-reads the row, applies the one change to the fresh copy and writes it back only if
// nobody else saved in between (the same method as the Deliveries tab), so two people cannot overwrite each other.
// To undo: remove this script tag; the board then treats every week as normal demand again. Nothing else reads these rows.
(function () {
  if (window.PSI_ONEOFF) return;
  const ROW = { samsung: 'samsung_oneoff', philips: 'philips_oneoff', plocks: 'plocks_oneoff' };
  const CACHE_KEY = 'psi_oneoff_cache_v1', DAY = 86400000, DEFAULT_NOTE = 'One-off bulk or project order';
  const S = {}; Object.keys(ROW).forEach(k => { S[k] = { items: [], loaded: false, sig: null }; });
  const listeners = []; let offline = false;
  const notify = () => listeners.slice().forEach(f => { try { f(); } catch (e) { console.warn('[oneoff]', e && e.message); } });
  const who = () => { const e = document.querySelector('.rd-user span'); return (e && e.textContent.trim()) || 'Unknown'; };
  const rowUrl = k => SUPA_URL + '/rest/v1/incoming_stock?brand=eq.' + ROW[k];
  function adopt(k, data) {
    const items = data && Array.isArray(data.items) ? data.items : [], sig = JSON.stringify(items), changed = sig !== S[k].sig;
    S[k].items = items; S[k].loaded = true; S[k].sig = sig;
    if (changed) { try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); c[k] = items; localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch (e) {} }
    return changed;
  }
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); Object.keys(c).forEach(k => { if (S[k] && Array.isArray(c[k])) S[k].items = c[k]; }); } catch (e) {}   // instant first paint; refreshed from the database straight after
  async function load(k) {
    if (offline) return;
    try { const r = await fetch(rowUrl(k) + '&select=data', { headers: SH }); if (!r.ok) throw new Error('HTTP ' + r.status); const rows = await r.json(); if (adopt(k, rows[0] && rows[0].data)) notify(); }
    catch (e) { console.warn('[oneoff] load ' + k + ':', e && e.message); }
  }
  async function mutate(k, fn) {
    if (offline) { S[k].items = fn(S[k].items.map(x => Object.assign({}, x))); S[k].sig = null; notify(); return; }
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await fetch(rowUrl(k) + '&select=data,updated_at', { headers: SH }); if (!r.ok) throw new Error('Could not read the saved one-off weeks (HTTP ' + r.status + ').');
      const row = (await r.json())[0]; if (!row) throw new Error('The one-off row is missing in the database.');
      const cur = row.data && Array.isArray(row.data.items) ? row.data.items : [], cutoff = Date.now() - 30 * DAY;
      const next = fn(cur.map(x => Object.assign({}, x))).filter(x => !(x.deleted && Date.parse(x.at) < cutoff));
      const now = new Date().toISOString(), data = { v: 1, items: next, meta: { updatedAt: now, updatedBy: who() } };
      const p = await fetch(rowUrl(k) + '&updated_at=eq.' + encodeURIComponent(row.updated_at), { method: 'PATCH', headers: Object.assign({}, SH, { 'Content-Type': 'application/json', Prefer: 'return=representation' }), body: JSON.stringify({ data, updated_at: now }) });
      if (!p.ok) throw new Error('Could not save (HTTP ' + p.status + ').');
      const saved = await p.json(); if (saved.length === 1) { adopt(k, saved[0].data); notify(); return; }
    }
    throw new Error('Someone else saved at the same moment. Please try again.');
  }
  const newId = () => 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const live = k => S[k].items.filter(x => !x.deleted);
  const mark = (k, model, week, note) => mutate(k, items => { if (!items.some(x => !x.deleted && x.model === model && x.week === week)) items.push({ id: newId(), model, week, note: note || DEFAULT_NOTE, by: who(), at: new Date().toISOString() }); return items; });
  const unmark = (k, model, week) => mutate(k, items => items.map(x => (!x.deleted && x.model === model && x.week === week) ? Object.assign({}, x, { deleted: true, by: who(), at: new Date().toISOString() }) : x));
  window.PSI_ONEOFF = {
    items: k => live(k).map(x => Object.assign({}, x)), weeksFor: (k, model) => new Set(live(k).filter(x => x.model === model).map(x => x.week)),
    has: (k, model, week) => live(k).some(x => x.model === model && x.week === week), mark, unmark, refresh: load, loaded: k => S[k].loaded,
    onChange: f => listeners.push(f), setOffline: v => { offline = !!v; }, who
  };
  const loadAll = () => { Object.keys(ROW).forEach(load); }; loadAll(); setTimeout(loadAll, 4000);
})();
