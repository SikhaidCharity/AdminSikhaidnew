'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';
import { COLLECTION_SECTIONS, READ_ALSO, canUse, sectionForPath } from '@/lib/admin-sections';
import { clearLists, preloadLists } from './shared';

// The big lists, loaded in the background after sign-in (biggest first) so sections open instantly.
const PRELOAD = ['donations', 'donors', 'submissions', 'campaigns', 'certificates', 'blogs'];
// The signed-in user, remembered for this tab so a page reload doesn't wait on a sign-in check.
const ME_KEY = 'sikhaid-admin-me';
const rememberedMe = () => {
  try { return JSON.parse(sessionStorage.getItem(ME_KEY) || 'null'); } catch { return null; }
};

const AdminContext = createContext({ user: null, name: '', can: () => false, signOut: () => {}, setUser: () => {} });
export const useAdmin = () => useContext(AdminContext);

export default function AdminGate({ children }) {
  const pathname = usePathname();
  const [state, setState] = useState({ loading: true, user: null, configured: true });

  useEffect(() => {
    // Show the panel at once for a user already signed in on this tab; the server still checks every request.
    const remembered = rememberedMe();
    if (remembered) setState({ loading: false, user: remembered, configured: true });
    adminApi
      .me()
      .then((me) => setState({ loading: false, user: me.signedIn ? me.user : null, configured: me.configured }))
      .catch(() => setState((current) => (current.user ? current : { loading: false, user: null, configured: true })));
  }, []);

  const setUser = useCallback((user) => setState((current) => ({ ...current, user })), []);

  // Remember the user for this tab, and start loading the lists they can open.
  useEffect(() => {
    try {
      if (state.user) sessionStorage.setItem(ME_KEY, JSON.stringify(state.user));
      else if (!state.loading) sessionStorage.removeItem(ME_KEY);
    } catch {}
    if (!state.user) return;
    const user = state.user;
    const allowed = (name) => [...(COLLECTION_SECTIONS[name] || []), ...(READ_ALSO[name] || [])].some((s) => canUse(user, s));
    const start = () => preloadLists(PRELOAD.filter(allowed));
    const idle = window.requestIdleCallback ? window.requestIdleCallback(start, { timeout: 1200 }) : setTimeout(start, 300);
    return () => (window.cancelIdleCallback ? window.cancelIdleCallback(idle) : clearTimeout(idle));
  }, [state.user, state.loading]);

  const signOut = async () => {
    await adminApi.signOut();
    clearLists();
    setUser(null);
  };

  if (state.loading) return <div className="adm adm-center"><p className="adm-muted-light">Loading…</p></div>;

  if (!state.user) return <SignIn configured={state.configured} onSignedIn={setUser} />;

  return <SignedIn user={state.user} pathname={pathname} signOut={signOut} setUser={setUser}>{children}</SignedIn>;
}

// On phones every table row becomes a card. Each cell is labelled with its column name (copied
// from the table head), so columns that a user's access hides simply don't appear.
function labelTables(root) {
  root.querySelectorAll('table.adm-table').forEach((table) => {
    const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    table.querySelectorAll('tbody tr').forEach((tr) => {
      [...tr.children].forEach((td, i) => {
        const label = td.colSpan > 1 ? '' : heads[i] || '';
        if (td.getAttribute('data-label') !== label) td.setAttribute('data-label', label);
      });
    });
  });
}

function SignedIn({ user, pathname, signOut, setUser, children }) {
  const rootRef = useRef(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    let frame = 0;
    const run = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => labelTables(root)); };
    run();
    const observer = new MutationObserver(run);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  const can = (section) => canUse(user, section);
  const section = sectionForPath(pathname);
  const allowed = !section || section === 'account' || can(section);

  return (
    <AdminContext.Provider value={{ user, name: user.name, can, signOut, setUser }}>
      <div className="adm" ref={rootRef}>{allowed ? children : <NoAccess />}</div>
    </AdminContext.Provider>
  );
}

function NoAccess() {
  return (
    <main className="adm-page">
      <div className="adm-panel adm-panel-pad adm-noaccess">
        <h1>No access</h1>
        <p>Your account does not include this section. Ask an admin to add it from User Management.</p>
        <Link href="/admin" className="adm-btn adm-btn-primary">Back to Dashboard</Link>
      </div>
    </main>
  );
}

function SignIn({ configured, onSignedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const me = await adminApi.signIn(email, password);
      onSignedIn(me.user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="adm adm-center">
      <form className="adm-login" onSubmit={submit}>
        <h1>Admin Access</h1>
        <p>Sign in with your admin ID and password</p>
        {!configured && (
          <p className="adm-alert" role="alert">
            Add ADMIN_EMAIL and ADMIN_PASSWORD to the .env.local file to create the first admin account.
          </p>
        )}
        <label className="adm-field">
          Admin ID
          <input type="text" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="adm-field">
          Password
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="adm-error" role="alert">{error}</p>}
        <button className="adm-btn adm-btn-primary adm-btn-block" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Access Admin Panel'}
        </button>
        <small>For SikhAid team members only</small>
      </form>
    </div>
  );
}
