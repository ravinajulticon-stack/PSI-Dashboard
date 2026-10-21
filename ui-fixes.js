// PSI Dashboard - fixes for three problems found in the full function check
//
// 1) The red x (Delete) never did anything. In the original code the confirm button clears the
//    pending action before it runs it, so confirming a delete is a silent no-op. Fixed by
//    replacing the button's click handler with one that runs the action first.
// 2) A delete only ever removed the entry from the current browser, never from Supabase, so it
//    came back on the next refresh and stayed on every other device. Now the delete is sent to
//    Supabase too. Safety: only entries that already exist in Supabase (have an id) can be
//    deleted, only one at a time, and a failure is reported instead of hidden.
// 3) The Overview chart week range could get stuck on the first (short) list of weeks a device
//    drew, for example Philips Safes stuck on W04-W11. The selectors now follow the newest week
//    unless the user picks a week themselves.
//
// 4) The sign-in screen's "Need an account? Sign up" link is hidden: self sign-up is switched
//    off in Supabase (2026-10-21), so the link could only lead to an error.
//
// "Clear All" is deliberately kept switched off: with the confirm fixed it would wipe this
// browser's copy and bring back the built-in sample data that causes duplicate rows.
(function () {
  const BRANDS = [
    { save: 'saveEntries',   del: 'deleteEntry',   get: () => getEntries(),   key: 'psi_v2_entries',          table: 'samsung_entries' },
    { save: 'phSaveEntries', del: 'phDeleteEntry', get: () => phGetEntries(), key: 'philips_psi_v2_entries',  table: 'philips_entries' },
    { save: 'plSaveEntries', del: 'plDeleteEntry', get: () => plGetEntries(), key: 'plocks_psi_v2_entries',   table: 'plocks_entries' }
  ];
  const toast = (msg, type) => { try { showToast(msg, type); } catch (e) { /* ignore */ } };

  // ── 1) Make the confirm button run the pending action ──
  const ok = document.getElementById('confirmOk');
  if (ok && ok.parentNode) {
    const fresh = ok.cloneNode(true); // a clone has none of the old (broken) click handlers
    ok.parentNode.replaceChild(fresh, ok);
    fresh.addEventListener('click', () => {
      const action = confirmCb;   // take the action BEFORE closing the dialog clears it
      closeConfirm();
      if (typeof action === 'function') action();
    });
  }

  // ── 2) Send deletes to Supabase ──
  async function deleteFromDb(table, ids) {
    try {
      const list = ids.map(id => `"${id}"`).join(',');
      const r = await fetch(`${SUPA_URL}/rest/v1/${table}?id=in.(${list})`, {
        method: 'DELETE', headers: { ...SH, 'Prefer': 'return=representation' }
      });
      if (!r.ok) return false;
      const rows = await r.json();
      return Array.isArray(rows) && rows.length === ids.length;
    } catch (e) { return false; }
  }

  BRANDS.forEach(b => {
    // 2a) an entry that has not reached Supabase yet cannot be deleted from there: ask to refresh first
    const origDel = window[b.del];
    if (typeof origDel === 'function') {
      window[b.del] = function (idx) {
        const e = b.get()[idx];
        if (e && !e._id) { toast('This entry has not synced yet. Press Refresh, then delete it.', 'warning'); return; }
        return origDel.apply(this, arguments);
      };
    }
    // 2b) when a save drops an entry that has an id, remove it from Supabase as well
    const origSave = window[b.save];
    if (typeof origSave === 'function') {
      window[b.save] = function (entries) {
        let removed = [];
        try {
          const prev = JSON.parse(localStorage.getItem(b.key) || '[]');
          const keep = new Set((entries || []).map(e => e._id).filter(Boolean));
          removed = prev.filter(e => e._id && !keep.has(e._id)).map(e => e._id);
        } catch (e) { removed = []; }
        const result = origSave.apply(this, arguments);
        if (removed.length > 0 && removed.length <= 3) {
          deleteFromDb(b.table, removed).then(done => {
            if (!done) toast('Removed here, but the cloud copy could not be deleted. Press Refresh to restore it and try again.', 'error');
          });
        } else if (removed.length > 3) {
          console.warn('[ui-fixes] ignored a save that dropped ' + removed.length + ' entries (safety limit is 3)');
        }
        return result;
      };
    }
  });

  // ── Keep "Clear All" off ──
  const clearOff = () => toast('Clear All is turned off. Your entries are stored in the cloud and shared across devices.', 'warning');
  window.confirmClearAll = clearOff;
  window.philipsConfirmClearAll = clearOff;
  window.plocksConfirmClearAll = clearOff;

  // ── 3) Week range follows the newest week unless the user chose one ──
  const touched = {};
  [['chartWeekFrom', 'chartWeekTo'], ['philipsChartWeekFrom', 'philipsChartWeekTo'], ['plocksChartWeekFrom', 'plocksChartWeekTo']].forEach(pair => {
    pair.forEach((id, k) => {
      const el = document.getElementById(id);
      if (!el) return;
      // a real click by the user is "trusted"; changes made by the dashboard itself are not
      el.addEventListener('change', e => { if (e.isTrusted) touched[id] = true; });
      new MutationObserver(() => {
        if (touched[id] || !el.options.length) return;
        const want = k === 0 ? el.options[0].value : el.options[el.options.length - 1].value;
        if (el.value !== want) { el.value = want; el.dispatchEvent(new Event('change')); }
      }).observe(el, { childList: true });
    });
  });

  // ── 4) Hide the dead "Sign up" link on the sign-in screen ──
  // A style rule (not a DOM edit) so it applies whenever the sign-in screen is built.
  const hideSignUp = document.createElement('style');
  hideSignUp.textContent = '#psiToggleModeBtn { display: none !important; }';
  document.head.appendChild(hideSignUp);
})();
