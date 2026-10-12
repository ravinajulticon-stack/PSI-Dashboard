// PSI Dashboard - duplicate-row guard for Supabase inserts
// Some device with an old local copy keeps re-sending already-saved rows (the same
// W04-W11 Philips Safes data was re-inserted again on 4, 7, 9, 11 and 12 Oct).
// This wraps supaInsert() so that a row is skipped when it is identical to the
// LATEST saved row for the same model + week (p, s, re, proj, i, date_range, month).
// Genuine corrections (any value different) still go through, and if the check
// cannot run for any reason the original insert runs untouched (fail-open), so a
// real entry can never be lost because of this guard.
(function () {
  const TABLES = ['samsung_entries', 'philips_entries', 'plocks_entries'];
  const FIELDS = ['p', 's', 're', 'proj', 'i', 'date_range', 'month'];
  const origInsert = window.supaInsert;
  if (typeof origInsert !== 'function') return;

  const norm = v => (v === null || v === undefined || v === '') ? '' : String(v);
  const same = (a, b) => FIELDS.every(f => norm(a[f]) === norm(b[f]));

  async function fetchExisting(table, weeks) {
    const list = weeks.map(encodeURIComponent).join(',');
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      let all = [], offset = 0;
      while (true) {
        const r = await fetch(
          `${SUPA_URL}/rest/v1/${table}?select=model,week,${FIELDS.join(',')},created_at&week=in.(${list})&order=created_at.asc`,
          { headers: { ...SH, 'Range-Unit': 'items', 'Range': `${offset}-${offset + 999}` }, signal: ctl.signal }
        );
        if (!r.ok) throw new Error('lookup failed ' + r.status);
        const rows = await r.json();
        if (!Array.isArray(rows)) throw new Error('lookup bad body');
        all = all.concat(rows);
        if (rows.length < 1000) break;
        offset += 1000;
        if (offset > 20000) break;
      }
      return all;
    } finally {
      clearTimeout(timer);
    }
  }

  window.supaInsert = async function (table, rows) {
    try {
      if (!TABLES.includes(table) || !Array.isArray(rows) || !rows.length) {
        return await origInsert(table, rows);
      }
      const weeks = [...new Set(rows.map(r => r.week))];
      const existing = await fetchExisting(table, weeks);
      // latest saved row per model + week (existing is ordered oldest -> newest)
      const latest = {};
      existing.forEach(r => { latest[r.model + '|' + r.week] = r; });
      const keep = [];
      rows.forEach(r => {
        const k = r.model + '|' + r.week;
        if (latest[k] && same(latest[k], r)) return; // identical to what is already saved
        keep.push(r);
        latest[k] = r; // also catches identical rows repeated inside one batch
      });
      const skipped = rows.length - keep.length;
      if (skipped) console.info(`[dedupe-guard] ${table}: skipped ${skipped} duplicate row(s), inserting ${keep.length}`);
      if (!keep.length) return true;
      return await origInsert(table, keep);
    } catch (e) {
      // fail-open: never lose a real entry because the guard could not check
      console.warn('[dedupe-guard] check failed, inserting as normal:', e && e.message);
      return await origInsert(table, rows);
    }
  };
})();
