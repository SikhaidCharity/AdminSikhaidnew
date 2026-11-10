'use client';

import { useState } from 'react';
import { adminApi } from '@/lib/admin-api';
import { useAdmin } from '../_ui/AdminGate';
import { Field, LoadState, PageHead, Toast, useCollection, useToast } from '../_ui/shared';

export default function SettingsPage() {
  const { can } = useAdmin();
  const [toast, showToast] = useToast();

  return (
    <main className="adm-page">
      <PageHead title="Settings" subtitle="Your sign-in details and the organisation's contact details shown on the website." />
      <div className="adm-settings">
        <AccountForm showToast={showToast} />
        {can('settings') && <ProjectForm showToast={showToast} />}
      </div>
      <Toast message={toast} />
    </main>
  );
}

function AccountForm({ showToast }) {
  const { user, setUser } = useAdmin();
  const blank = { name: user.name, email: user.email, currentPassword: '', newPassword: '', confirmPassword: '' };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const changingLogin = form.email.trim().toLowerCase() !== user.email || Boolean(form.newPassword);
  const dirty = form.name !== user.name || changingLogin;

  const save = async (e) => {
    e.preventDefault();
    setError('');
    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const updated = await adminApi.updateAccount({
        name: form.name,
        email: form.email,
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setUser(updated);
      setForm({ ...blank, name: updated.name, email: updated.email });
      showToast(changingLogin ? 'Sign-in details updated' : 'Account saved');
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <form className="adm-form adm-panel adm-panel-pad" onSubmit={save}>
      <fieldset className="adm-section">
        <legend>My Account</legend>
        <div className="adm-grid-2 adm-top">
          <Field label="Display Name"><input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Admin ID (email)" hint="You sign in with this.">
            <input type="email" autoComplete="username" required value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="adm-section">
        <legend>Change Password</legend>
        <div className="adm-grid-2 adm-top">
          <Field label="New Password" hint="At least 8 characters. Leave empty to keep your current one.">
            <input type="password" autoComplete="new-password" minLength={8} value={form.newPassword} onChange={(e) => set('newPassword', e.target.value)} />
          </Field>
          <Field label="Confirm New Password">
            <input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} />
          </Field>
        </div>
        {changingLogin && (
          <Field label="Current Password *" hint="Needed to change your ID or password. Other devices will be signed out.">
            <input type="password" autoComplete="current-password" required value={form.currentPassword} onChange={(e) => set('currentPassword', e.target.value)} />
          </Field>
        )}
      </fieldset>

      {error && <p className="adm-error" role="alert">{error}</p>}
      <div className="adm-save-bar">
        {dirty && <span>You have unsaved changes</span>}
        <button type="submit" className="adm-btn adm-btn-primary" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save Account'}</button>
      </div>
    </form>
  );
}

const PROJECT_FIELDS = [
  ['orgName', 'Organisation Name'],
  ['email', 'Contact Email', 'Shown in the footer, Contact, Press and CSR pages.'],
  ['phone', 'Phone / Helpline', 'Written the way visitors should see it, e.g. +91 98513 41234'],
  ['whatsapp', 'WhatsApp Number', 'With country code, digits only, e.g. 919851341234'],
];
const SOCIAL_FIELDS = [
  ['instagram', 'Instagram Link'],
  ['facebook', 'Facebook Link'],
  ['linkedin', 'LinkedIn Link'],
];

function ProjectForm({ showToast }) {
  const { items, error, loading, reload, setItems } = useCollection('site');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const current = form || items;
  const set = (field, value) => setForm((f) => ({ ...(f || items), [field]: value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const clean = Object.fromEntries(Object.entries(current).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
      clean.whatsapp = String(clean.whatsapp || '').replace(/\D/g, '');
      setItems(await adminApi.saveAll('site', clean));
      setForm(null);
      showToast('Project details saved');
    } catch (err) {
      showToast(err.message);
    }
    setBusy(false);
  };

  return (
    <>
      <LoadState loading={loading} error={error} onRetry={reload} loadingText="Loading..." />
      {current && (
        <form className="adm-form adm-panel adm-panel-pad" onSubmit={save}>
          <fieldset className="adm-section">
            <legend>Project Details</legend>
            <div className="adm-grid-2 adm-top">
              {PROJECT_FIELDS.map(([key, label, hint]) => (
                <Field key={key} label={label} hint={hint}>
                  <input type="text" value={current[key] || ''} onChange={(e) => set(key, e.target.value)} />
                </Field>
              ))}
            </div>
            <Field label="Address"><textarea rows={2} value={current.address || ''} onChange={(e) => set('address', e.target.value)} /></Field>
            <Field label="Footer Tagline"><textarea rows={3} value={current.tagline || ''} onChange={(e) => set('tagline', e.target.value)} /></Field>
          </fieldset>

          <fieldset className="adm-section">
            <legend>Social Media</legend>
            <div className="adm-grid-3">
              {SOCIAL_FIELDS.map(([key, label]) => (
                <Field key={key} label={label}>
                  <input type="url" placeholder="https://" value={current[key] || ''} onChange={(e) => set(key, e.target.value)} />
                </Field>
              ))}
            </div>
          </fieldset>

          <div className="adm-save-bar">
            {form && <span>You have unsaved changes</span>}
            <button type="submit" className="adm-btn adm-btn-primary" disabled={busy || !form}>{busy ? 'Saving…' : 'Save Project Details'}</button>
          </div>
        </form>
      )}
    </>
  );
}
