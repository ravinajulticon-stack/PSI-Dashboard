// ══════════════════════════════════════════════════════════
// PSI Dashboard — Real sign-in gate (Supabase Auth)
// Loaded LAST (after every other script). Blocks the dashboard
// behind a full-screen overlay until the visitor signs in with
// a real Supabase Auth session — not a client-side password
// check. The actual protection comes from the RLS policy
// change (applied separately, after this gate is verified
// working) that revokes `anon` access and requires
// `authenticated` on samsung_entries / philips_entries /
// plocks_entries / psi_models.
//
// No password is ever typed by anyone other than the person
// using the dashboard themselves: this gate has its own
// Sign Up form (POST /auth/v1/signup) so the account owner
// creates their own login directly, the same way signing up
// for any site works.
// ══════════════════════════════════════════════════════════
(function () {
  const SESSION_KEY = 'ddl_psi_session';

  // ── 1. Inject CSS ──
  const style = document.createElement('style');
  style.textContent = `
#psiGate { position: fixed; inset: 0; z-index: 99999; background: var(--mac-bg);
  display: flex; align-items: center; justify-content: center; }
#psiGate .card { width: 340px; background: var(--mac-surface); border: 1px solid var(--mac-border);
  border-radius: 16px; padding: 28px; box-shadow: var(--mac-shadow-lg, 0 8px 40px rgba(0,0,0,0.14)); }
#psiGate h1 { font-family: var(--font); font-size: 18px; font-weight: 700; color: var(--mac-text); margin: 0 0 4px; }
#psiGate p.sub { font-family: var(--font); font-size: 12px; color: var(--mac-text2); margin: 0 0 20px; }
#psiGate label { font-family: var(--font); font-size: 11px; font-weight: 600; color: var(--mac-text2); display: block; margin: 12px 0 5px; }
#psiGate input { width: 100%; font-family: var(--font); font-size: 13px; padding: 9px 11px; border-radius: 8px;
  border: 1px solid var(--mac-border2); background: var(--mac-surface2); color: var(--mac-text); outline: none; box-sizing: border-box; }
#psiGate input:focus { border-color: var(--mac-accent); }
#psiGate button.primary { width: 100%; margin-top: 18px; padding: 10px; border-radius: 8px; border: none;
  background: var(--mac-accent); color: #fff; font-family: var(--font); font-size: 13px; font-weight: 600; cursor: pointer; }
#psiGate button.primary:disabled { opacity: 0.5; cursor: default; }
#psiGate button.link { display: block; width: 100%; margin-top: 12px; background: none; border: none;
  color: var(--mac-accent); font-family: var(--font); font-size: 12px; cursor: pointer; padding: 4px; }
#psiGate .msg { font-family: var(--font); font-size: 12px; margin-top: 12px; padding: 8px 10px; border-radius: 8px; display: none; }
#psiGate .msg.error { display: block; background: var(--mac-red-bg); color: var(--mac-red); }
#psiGate .msg.ok { display: block; background: var(--mac-green-bg); color: var(--mac-green); }
#psiSignOutBtn { font-family: var(--font); font-size: 11px;
  font-weight: 600; padding: 5px 12px; border-radius: 20px; cursor: pointer; border: 1px solid var(--mac-border2);
  background: var(--mac-surface2); color: var(--mac-text2); margin-right: 8px; }
`;
  document.head.appendChild(style);

  // ── 2. Build the gate overlay (hidden until we know there's no valid session) ──
  const gate = document.createElement('div');
  gate.id = 'psiGate';
  gate.innerHTML = `
    <div class="card">
      <h1 id="psiGateTitle">Sign in</h1>
      <p class="sub" id="psiGateSub">PSI Dashboard — Samsung Locks, Philips Safes, Philips Locks</p>
      <label>Email</label>
      <input type="email" id="psiEmail" autocomplete="email" placeholder="you@example.com">
      <label>Password</label>
      <input type="password" id="psiPassword" autocomplete="current-password" placeholder="••••••••">
      <button class="primary" id="psiSubmitBtn">Sign In</button>
      <button class="link" id="psiToggleModeBtn">Need an account? Sign up</button>
      <div class="msg" id="psiMsg"></div>
    </div>`;

  let mode = 'signin'; // or 'signup'

  function showApp() {
    gate.remove();
    if (!document.getElementById('psiSignOutBtn')) {
      const btn = document.createElement('button');
      btn.id = 'psiSignOutBtn';
      btn.textContent = 'Sign out';
      btn.addEventListener('click', signOut);
      const brandRight = document.querySelector('.brand-right');
      if (brandRight) {
        brandRight.insertBefore(btn, brandRight.firstChild);
      } else {
        // Fallback if the header markup ever changes shape.
        btn.style.position = 'fixed';
        btn.style.top = '58px';
        btn.style.right = '14px';
        btn.style.zIndex = '9000';
        document.body.appendChild(btn);
      }
    }
  }

  function hideApp() {
    document.body.appendChild(gate);
  }

  function setMsg(text, kind) {
    const el = document.getElementById('psiMsg');
    el.textContent = text;
    el.className = 'msg ' + (kind || '');
  }

  function applySession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    SH.Authorization = 'Bearer ' + session.access_token;
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    SH.Authorization = 'Bearer ' + SUPA_KEY;
  }

  function signOut() {
    clearSession();
    location.reload();
  }

  async function refreshDashboards() {
    // Re-run every sync/refresh path now that SH has a real user token,
    // so the dashboard shows real data immediately after signing in.
    if (typeof forceSync === 'function') { try { forceSync(); } catch (e) {} }
    if (typeof renderDashboard === 'function') { try { renderDashboard(); } catch (e) {} }
    if (typeof renderPhilipsDashboard === 'function') { try { renderPhilipsDashboard(); } catch (e) {} }
    if (typeof renderPlocksDashboard === 'function') { try { renderPlocksDashboard(); } catch (e) {} }
  }

  async function trySignIn(email, password) {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error_description || data.msg || 'Sign in failed.');
    return data; // { access_token, refresh_token, expires_at, ... }
  }

  async function trySignUp(email, password) {
    const r = await fetch(`${SUPA_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error_description || data.msg || 'Sign up failed.');
    return data;
  }

  async function tryRefreshToken(refresh_token) {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token })
    });
    if (!r.ok) return null;
    return await r.json();
  }

  function wireGateEvents() {
    document.getElementById('psiToggleModeBtn').addEventListener('click', () => {
      mode = mode === 'signin' ? 'signup' : 'signin';
      document.getElementById('psiGateTitle').textContent = mode === 'signin' ? 'Sign in' : 'Create account';
      document.getElementById('psiSubmitBtn').textContent = mode === 'signin' ? 'Sign In' : 'Sign Up';
      document.getElementById('psiToggleModeBtn').textContent = mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in';
      setMsg('', '');
    });

    document.getElementById('psiSubmitBtn').addEventListener('click', async () => {
      const email = document.getElementById('psiEmail').value.trim();
      const password = document.getElementById('psiPassword').value;
      if (!email || !password) { setMsg('Enter an email and password.', 'error'); return; }
      const btn = document.getElementById('psiSubmitBtn');
      btn.disabled = true;
      setMsg('', '');
      try {
        if (mode === 'signin') {
          const session = await trySignIn(email, password);
          applySession(session);
          showApp();
          refreshDashboards();
        } else {
          const result = await trySignUp(email, password);
          if (result.access_token) {
            // Email confirmation is off — signed in immediately.
            applySession(result);
            showApp();
            refreshDashboards();
          } else {
            setMsg('Account created — check your email to confirm, then sign in.', 'ok');
            mode = 'signin';
            document.getElementById('psiGateTitle').textContent = 'Sign in';
            document.getElementById('psiSubmitBtn').textContent = 'Sign In';
            document.getElementById('psiToggleModeBtn').textContent = 'Need an account? Sign up';
          }
        }
      } catch (e) {
        setMsg(e.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('psiPassword').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('psiSubmitBtn').click();
    });
  }

  // ── 3. Decide: show the app immediately (valid session) or show the gate ──
  async function init() {
    hideApp();
    wireGateEvents();

    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) return; // gate stays up, waiting for sign in

    let session;
    try { session = JSON.parse(stored); } catch (e) { clearSession(); return; }

    const expiresAt = (session.expires_at || 0) * 1000;
    if (Date.now() < expiresAt - 30000) {
      // Still valid.
      applySession(session);
      showApp();
      return;
    }

    // Expired — try to refresh silently before falling back to the gate.
    const refreshed = await tryRefreshToken(session.refresh_token);
    if (refreshed && refreshed.access_token) {
      applySession(refreshed);
      showApp();
    } else {
      clearSession();
      // gate stays up
    }
  }

  init();
})();
