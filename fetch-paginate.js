// PSI Dashboard - remove the 1,000-row ceiling on entries tables
// Supabase returns at most 1,000 rows per request no matter what `limit=` asks for, so
// once a table passes 1,000 rows the newest rows silently stop reaching the dashboard.
// The sync (and the manual Refresh) ask for `limit=10000` in one request. This wraps
// fetch() so that exactly those requests are fetched in pages of 1,000 and joined back
// into one complete list. If anything goes wrong it falls back to the original request
// (fail-open), which is what the dashboard did before.
(function () {
  const realFetch = window.fetch.bind(window);
  const ENTRIES = /\/rest\/v1\/(samsung_entries|philips_entries|plocks_entries)\?/;
  const PAGE = () => window.__psiPageSize || 1000; // __psiPageSize is for testing only

  function headersToObject(h) {
    if (!h) return {};
    if (typeof h.forEach === 'function' && !Array.isArray(h)) { const o = {}; h.forEach((v, k) => { o[k] = v; }); return o; }
    return Object.assign({}, h);
  }

  async function fetchAllPages(url, init) {
    // stable paging: break created_at ties (rows saved in one batch share a timestamp) with id
    let u = url.replace(/([?&])limit=\d+&?/, '$1').replace(/[?&]$/, '');
    if (/[?&]order=/.test(u)) u = u.replace(/([?&]order=[^&]*)/, '$1,id.asc');
    else u += (u.includes('?') ? '&' : '?') + 'order=id.asc';
    const base = headersToObject(init && init.headers);
    let all = [], offset = 0, total = null;
    for (let guard = 0; guard < 200; guard++) {
      const r = await realFetch(u, Object.assign({}, init, {
        method: 'GET',
        headers: Object.assign({}, base, { 'Range-Unit': 'items', 'Range': `${offset}-${offset + PAGE() - 1}`, 'Prefer': 'count=exact' })
      }));
      if (r.status === 416) break; // asked past the end
      if (!r.ok) throw new Error('page failed ' + r.status);
      const rows = await r.json();
      if (!Array.isArray(rows)) throw new Error('page not a list');
      all = all.concat(rows);
      const cr = r.headers.get('content-range') || '';
      const t = parseInt(cr.split('/')[1], 10);
      if (!isNaN(t)) total = t;
      offset += rows.length;
      if (rows.length === 0) break;
      if (total !== null ? offset >= total : rows.length < PAGE()) break;
    }
    return new Response(JSON.stringify(all), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  window.fetch = async function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const h = headersToObject(init && init.headers);
      const hasRange = Object.keys(h).some(k => k.toLowerCase() === 'range');
      if (method === 'GET' && ENTRIES.test(url) && /[?&]limit=\d{4,}/.test(url) && !hasRange) {
        return await fetchAllPages(url, init);
      }
    } catch (e) {
      console.warn('[fetch-paginate] falling back to a normal request:', e && e.message);
    }
    return realFetch(input, init);
  };
})();
