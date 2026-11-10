'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '@/lib/admin-api';
import { ROLES, SECTIONS } from '@/lib/admin-sections';
import { useAdmin } from '../_ui/AdminGate';
import {
  Badge, ConfirmDelete, Field, LoadState, Modal, PageHead, Stats, Toast, formatDate, useToast,
} from '../_ui/shared';

const sectionLabel = Object.fromEntries(SECTIONS.map((s) => [s.key, s.label]));

export default function UsersPage() {
  const { user: me } = useAdmin();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // {} for a new user
  const [deleting, setDeleting] = useState(null);
  const [toast, showToast] = useToast();

  const load = useCallback(async () => {
    setError('');
    try {
      setUsers(await adminApi.users.list());
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    let current = true;
    adminApi.users
      .list()
      .then((data) => current && setUsers(data))
      .catch((e) => current && setError(e.message));
    return () => {
      current = false;
    };
  }, []);

  const replace = (saved) => setUsers((list) => {
    const exists = list.some((u) => u.id === saved.id);
    return exists ? list.map((u) => (u.id === saved.id ? saved : u)) : [...list, saved];
  });

  const toggleActive = async (u) => {
    try {
      replace(await adminApi.users.update(u.id, { active: !u.active }));
      showToast(u.active ? `${u.name} switched off` : `${u.name} switched on`);
    } catch (e) {
      showToast(e.message);
    }
  };

  const list = users || [];
  const locked = (u) => u.owner || u.id === me.id;

  return (
    <main className="adm-page">
      <PageHead title="User Management" subtitle="Give other people access to the admin panel: as a full admin, or only to the sections you choose.">
        <button type="button" className="adm-btn adm-btn-primary" onClick={() => setEditing({})}>+ Add User</button>
      </PageHead>

      <Stats
        items={[
          { label: 'Total Users', value: list.length },
          { label: 'Admins', value: list.filter((u) => u.role === 'admin').length },
          { label: 'Section Access', value: list.filter((u) => u.role === 'editor').length },
          { label: 'Switched Off', value: list.filter((u) => !u.active).length },
        ]}
      />

      <section className="adm-panel">
        <LoadState loading={!users && !error} error={error} onRetry={load} loadingText="Loading users..." />
        {users && (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Can Open</th>
                  <th>Status</th>
                  <th>Last Sign-in</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <b>{u.name}</b>
                      {u.id === me.id && <span className="adm-you"> (you)</span>}
                      <div className="adm-small">{u.email}</div>
                    </td>
                    <td>
                      {u.owner ? <Badge tone="orange">Super Admin</Badge>
                        : u.role === 'admin' ? <Badge tone="blue">Admin</Badge>
                          : <Badge tone="grey">Section Access</Badge>}
                    </td>
                    <td className="adm-access">
                      {u.role === 'admin' ? 'Everything, including users'
                        : u.sections.map((s) => sectionLabel[s]).filter(Boolean).join(', ')}
                    </td>
                    <td>{u.active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Switched off</Badge>}</td>
                    <td className="adm-nowrap">{u.lastLoginAt ? formatDate(u.lastLoginAt, true) : 'Never'}</td>
                    <td className="adm-actions">
                      {locked(u) ? (
                        <span className="adm-small">{u.id === me.id ? 'Edit in Settings' : 'Main account'}</span>
                      ) : (
                        <>
                          <button type="button" className="adm-btn adm-btn-small" onClick={() => setEditing(u)}>Edit</button>
                          <button type="button" className="adm-btn adm-btn-small" onClick={() => toggleActive(u)}>
                            {u.active ? 'Switch off' : 'Switch on'}
                          </button>
                          <button type="button" className="adm-btn adm-btn-small adm-btn-danger-line" onClick={() => setDeleting(u)}>Remove</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <UserModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            replace(saved);
            setEditing(null);
            showToast(isNew ? `${saved.name} can now sign in` : 'User updated');
          }}
        />
      )}

      {deleting && (
        <ConfirmDelete
          title="Remove User"
          name={`${deleting.name} (${deleting.email})`}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await adminApi.users.remove(deleting.id);
            setUsers((current) => current.filter((u) => u.id !== deleting.id));
            setDeleting(null);
            showToast('User removed');
          }}
        />
      )}
      <Toast message={toast} />
    </main>
  );
}

function UserModal({ initial, onClose, onSaved }) {
  const isNew = !initial.id;
  const [form, setForm] = useState({
    name: initial.name || '',
    email: initial.email || '',
    role: initial.role || 'editor',
    sections: initial.role === 'editor' ? initial.sections : [],
    password: '',
    active: initial.active !== false,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const toggleSection = (key) => set('sections', form.sections.includes(key)
    ? form.sections.filter((s) => s !== key)
    : [...form.sections, key]);
  const allTicked = form.sections.length === SECTIONS.length;

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (form.role === 'editor' && form.sections.length === 0) {
      setError('Tick at least one section this user can open.');
      return;
    }
    setBusy(true);
    try {
      const body = { ...form };
      if (!isNew && !body.password) delete body.password;
      const saved = isNew ? await adminApi.users.create(body) : await adminApi.users.update(initial.id, body);
      onSaved(saved, isNew);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={isNew ? 'Add User' : `Edit ${initial.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="adm-btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="user-form" className="adm-btn adm-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Add User' : 'Save Changes'}
          </button>
        </>
      }
    >
      <form id="user-form" className="adm-form" onSubmit={save}>
        <div className="adm-grid-2 adm-top">
          <Field label="Name"><input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Email ID *" hint="They sign in with this email.">
            <input type="email" required autoComplete="off" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
        </div>

        <Field
          label={isNew ? 'Password *' : 'New Password'}
          hint={isNew ? 'At least 8 characters. Share it with them privately; they can change it in Settings.' : 'Leave empty to keep their current password.'}
        >
          <input type="text" autoComplete="new-password" required={isNew} minLength={8} value={form.password} onChange={(e) => set('password', e.target.value)} />
        </Field>

        <div className="adm-field">
          <span>Access</span>
          <div className="adm-choice" role="radiogroup" aria-label="Access level">
            {Object.entries(ROLES).map(([key, role]) => (
              <button key={key} type="button" role="radio" aria-checked={form.role === key} onClick={() => set('role', key)}>
                {role.label}
              </button>
            ))}
          </div>
          <small>{ROLES[form.role].hint}</small>
        </div>

        {form.role === 'editor' && (
          <fieldset className="adm-perm">
            <legend>
              Sections they can open
              <button type="button" className="adm-btn adm-btn-small" onClick={() => set('sections', allTicked ? [] : SECTIONS.map((s) => s.key))}>
                {allTicked ? 'Clear all' : 'Select all'}
              </button>
            </legend>
            <div className="adm-perm-grid">
              {SECTIONS.map((s) => (
                <label key={s.key} className="adm-check">
                  <input type="checkbox" checked={form.sections.includes(s.key)} onChange={() => toggleSection(s.key)} />
                  {s.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <label className="adm-check">
          <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
          Account is active (can sign in)
        </label>
        {error && <p className="adm-error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
