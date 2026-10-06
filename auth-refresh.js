// PSI Dashboard — keep the sign-in token fresh (companion to auth-gate.js)
// Supabase access tokens last 1 hour. Without renewal, an open tab keeps saving
// to the browser, but every background send to Supabase is rejected (expired
// token) with no visible error, so entries never reach the database.
(function () {
  const SESSION_KEY = 'ddl_psi_session';
  let renewing = false;
  async function renewIfNeeded() {
    if (renewing) return;
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return; // signed out, or the gate is showing
    let session;
    try { session = JSON.parse(stored); } catch (e) { return; }
    const msLeft = (session.expires_at || 0) * 1000 - Date.now();
    if (msLeft > 10 * 60 * 1000) return; // plenty of time left
    renewing = true;
    try {
      const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      if (r.ok) {
        const fresh = await r.json();
        if (fresh.access_token) {
          localStorage.setItem(SESSION_KEY, JSON.stringify(fresh));
          SH.Authorization = 'Bearer ' + fresh.access_token;
        }
      } else if (msLeft <= 0) {
        // Token is dead and cannot be renewed: send the user back to the sign-in
        // screen instead of letting saves fail without any warning.
        localStorage.removeItem(SESSION_KEY);
        location.reload();
      }
    } catch (e) { /* offline: try again next tick */ }
    finally { renewing = false; }
  }
  setInterval(renewIfNeeded, 60 * 1000);
  // Timers pause while a laptop sleeps, so also check the moment the tab is used again.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renewIfNeeded(); });
  window.addEventListener('focus', renewIfNeeded);
  renewIfNeeded();
})();
