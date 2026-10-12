// PSI Dashboard - keep the sign-in token fresh (companion to auth-gate.js)
// Supabase access tokens last 1 hour. Without renewal, an open tab keeps saving to the
// browser, but every background send to Supabase is rejected (expired token) with no
// visible error, so entries never reach the database.
// All tabs in one browser share a single stored login, and refresh tokens are single-use,
// so tabs must cooperate: renewals are serialised with a lock, and every tab always adopts
// the newest token held in storage (another tab may have renewed it) before doing anything.
(function () {
  const SESSION_KEY = 'ddl_psi_session';
  const readSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; } };
  const msLeftOf = s => (s && s.expires_at ? s.expires_at * 1000 - Date.now() : -1);

  // Use the newest valid token in storage (it may have been renewed by another tab).
  function adoptStored() {
    const s = readSession();
    if (s && s.access_token && msLeftOf(s) > 0 && SH.Authorization !== 'Bearer ' + s.access_token) {
      SH.Authorization = 'Bearer ' + s.access_token;
    }
    return s;
  }

  async function doRenew() {
    const s = adoptStored();
    if (!s) return; // signed out, or the sign-in screen is showing
    if (msLeftOf(s) > 10 * 60 * 1000) return; // plenty of time left; this tab now uses the fresh token
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    if (r.ok) {
      const fresh = await r.json();
      if (fresh.access_token) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(fresh));
        SH.Authorization = 'Bearer ' + fresh.access_token;
      }
      return;
    }
    // Renewal failed. Another tab may have just renewed, so look in storage again.
    const s2 = adoptStored();
    if (!s2 || msLeftOf(s2) <= 0) {
      // Truly expired and cannot be renewed: back to the sign-in screen instead of failing silently.
      localStorage.removeItem(SESSION_KEY);
      location.reload();
    }
  }

  async function renewIfNeeded() {
    try {
      if (navigator.locks && navigator.locks.request) await navigator.locks.request('psi-auth-renew', doRenew);
      else await doRenew();
    } catch (e) { /* offline: try again next tick */ }
  }

  setInterval(renewIfNeeded, 60 * 1000);
  // Timers pause while a laptop sleeps, so also check the moment the tab is used again.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renewIfNeeded(); });
  window.addEventListener('focus', renewIfNeeded);
  // Fires when ANOTHER tab changes the stored login: adopt it straight away.
  window.addEventListener('storage', e => { if (e.key === SESSION_KEY) adoptStored(); });
  renewIfNeeded();
})();
