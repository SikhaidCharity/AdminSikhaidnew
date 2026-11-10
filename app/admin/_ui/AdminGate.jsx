'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';
import { canUse, sectionForPath } from '@/lib/admin-sections';

const AdminContext = createContext({ user: null, name: '', can: () => false, signOut: () => {}, setUser: () => {} });
export const useAdmin = () => useContext(AdminContext);

export default function AdminGate({ children }) {
  const pathname = usePathname();
  const [state, setState] = useState({ loading: true, user: null, configured: true });

  useEffect(() => {
    adminApi
      .me()
      .then((me) => setState({ loading: false, user: me.signedIn ? me.user : null, configured: me.configured }))
      .catch(() => setState({ loading: false, user: null, configured: true }));
  }, []);

  const setUser = useCallback((user) => setState((current) => ({ ...current, user })), []);

  const signOut = async () => {
    await adminApi.signOut();
    setUser(null);
  };

  if (state.loading) return <div className="adm adm-center"><p className="adm-muted-light">Loading…</p></div>;

  if (!state.user) return <SignIn configured={state.configured} onSignedIn={setUser} />;

  const user = state.user;
  const can = (section) => canUse(user, section);
  const section = sectionForPath(pathname);
  const allowed = !section || section === 'account' || can(section);

  return (
    <AdminContext.Provider value={{ user, name: user.name, can, signOut, setUser }}>
      <div className="adm">{allowed ? children : <NoAccess />}</div>
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
        <small>Local test session, on this computer only</small>
      </form>
    </div>
  );
}
