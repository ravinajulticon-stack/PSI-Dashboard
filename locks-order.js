// PSI Dashboard - Philips Locks products always list in the order of the source sheet (added 2026-11-17)
// The Locks product list came out in the order products were added, so Weekly Entry, Full History, the
// Overview's Model sort and the other lists did not match the source sheet. This puts the list in the
// sheet's order at the one place every screen reads it from (plLoadModels). Models that are not named
// here (a newly added model, or an archived one) stay at the end in their current order. Nothing is
// written to storage or the database; to undo it, remove this script tag. It also lets long model
// names wrap in the three bulk entry forms instead of being cut off with "...".
(function () {
  'use strict';
  if (window.__locksOrderInstalled) return;
  window.__locksOrderInstalled = true;

  const ORDER = [
    '7300-5HB-BLACK', '7300-5HB-BLACK (WIFI)', '7300-5HB-COPPER',
    'DDL709-FVP-7HWS-BLACK', 'DDL709-FVP-7HWS-COPPER', 'DDL702-8HWS-BLACK', 'DDL230X-1HWP-BLACK',
    'DDA270X-2TXS3', 'DDL615-5HBS', 'DDL720-MVP-17HWS', 'DDL801-5HBS-GREY',
    'DDL902-MFVP-11HWS-BLACK', 'DDL902-MFVP-11HWS-GOLD', 'DDL210S-1H-BLACK', 'DDL210S-1H-NICKEL', 'DDL610-5HBS',
    // Newly Monitored (Dashboard), in the sheet's order
    'DDL611-18HBS', 'DDL611S-5HBS', '7300-5HWS-COPPER (WIFI)', 'DDL220X-1HW-BLACK',
    'DDL702-FVP-7HWS', 'DDL720-5HWS', '9300-5HBGS'
  ];
  const POS = new Map(ORDER.map((n, i) => [n, i]));

  function reorder(list) {                                    // stable: named models by position, the rest after them
    if (!Array.isArray(list)) return list;
    return list
      .map((m, i) => ({ m: m, k: (m && POS.has(m.name)) ? POS.get(m.name) : 1e6 + i }))
      .sort((a, b) => a.k - b.k)
      .map(x => x.m);
  }

  const prev = window.plLoadModels;
  if (typeof prev === 'function') {
    window.plLoadModels = function () {
      const r = prev.apply(this, arguments);
      try { return reorder(r); } catch (e) { return r; }      // anything odd: keep the original order
    };
  }

  const css = document.createElement('style');
  css.id = 'psi-locks-order';
  css.textContent = [
    '#bulkFields > div > span:first-child, #philipsBulkFields > div > span:first-child, #plocksBulkFields > div > span:first-child',
    '{ white-space: normal !important; overflow: visible !important; text-overflow: clip !important; overflow-wrap: break-word; line-height: 1.25; }'
  ].join(' ');
  document.head.appendChild(css);

  function redraw() {                                         // lists that were drawn before this script ran
    ['plRenderDashboard', 'plRenderRecentHistory'].forEach(fn => {
      try { if (typeof window[fn] === 'function') window[fn](); } catch (e) { console.warn('locks-order: ' + fn + ': ' + e.message); }
    });
  }
  redraw();
  window.addEventListener('load', () => setTimeout(redraw, 400));

  window.__locksOrder = { reorder: reorder, order: ORDER.slice() };
})();
