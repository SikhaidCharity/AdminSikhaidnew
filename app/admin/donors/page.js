'use client';

import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/admin-api';
import {
  Badge, Field, LoadState, Modal, PageHead, Pager, Stats, Toast,
  downloadCsv, formatDate, inr, useCollection, usePaged, useToast,
} from '../_ui/shared';

// Every donor gets an account automatically when they donate: one per email (or phone).
export default function DonorsPage() {
  const { items, error, loading, reload, setItems } = useCollection('donors');
  const [adding, setAdding] = useState(false);
  const [toast, showToast] = useToast();
  const [query, setQuery] = useState('');
  const [perPage, setPerPage] = useState(25);
  const [open, setOpen] = useState(null);

  const all = useMemo(() => items || [], [items]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((d) => [d.name, d.email, d.phone, d.pan].join(' ').toLowerCase().includes(q));
  }, [all, query]);
  const { rows: pageRows, page, pageCount, setPage } = usePaged(rows, perPage);
  const total = all.reduce((sum, d) => sum + (Number(d.totalDonated) || 0), 0);
  const repeat = all.filter((d) => (d.donationCount || 0) > 1).length;
  const withLogin = all.filter((d) => d.hasPassword || d.google).length;

  const exportRows = () => {
    downloadCsv(
      'sikhaid-donors.csv',
      ['Name', 'Email', 'Phone', 'PAN', 'Address', 'Donations', 'Total Donated', 'First Donation', 'Last Donation', 'Login'],
      rows.map((d) => [d.name, d.email, d.phone, d.pan, d.address, d.donationCount, d.totalDonated,
        formatDate(d.firstDonationAt), formatDate(d.lastDonationAt), loginText(d)])
    );
  };

  return (
    <main className="adm-page">
      <PageHead title="Donors" subtitle="Every donor's account, made automatically from their donations. You can also add a donor by hand.">
        <button type="button" className="adm-btn adm-btn-primary" onClick={() => setAdding(true)}>+ Add Donor</button>
        <button type="button" className="adm-btn" onClick={reload}>Refresh</button>
        <button type="button" className="adm-btn" onClick={exportRows} disabled={rows.length === 0}>Export</button>
      </PageHead>

      <Stats
        items={[
          { label: 'Donors', value: all.length },
          { label: 'Total Donated', value: inr(total) },
          { label: 'Repeat Donors', value: repeat, hint: 'More than one donation' },
          { label: 'Can Sign In', value: withLogin, hint: 'Set a password or use Google' },
        ]}
      />

      <section className="adm-panel">
        <div className="adm-filters">
          <input type="search" aria-label="Search donors" placeholder="Search name, email, phone, PAN…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          <label className="adm-inline">
            Per page
            <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>

        <LoadState loading={loading} error={error} onRetry={reload} loadingText="Loading donors..." />
        {items && rows.length === 0 && <p className="adm-empty">No matching donors found</p>}

        {rows.length > 0 && (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Donor</th>
                  <th>Phone</th>
                  <th>PAN</th>
                  <th>Donations</th>
                  <th>Total</th>
                  <th>Last Donation</th>
                  <th>Login</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((d) => (
                  <tr key={d.id} className="adm-row-click" onClick={() => setOpen(d)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(d)}>
                    <td>
                      <b>{d.name || '—'}</b>
                      <small className="adm-sub">{d.email || 'No email'}</small>
                    </td>
                    <td className="adm-nowrap">{d.phone || '—'}</td>
                    <td className="adm-nowrap adm-small">{d.pan || '—'}</td>
                    <td>{d.donationCount || 0}</td>
                    <td className="adm-nowrap"><b>{inr(d.totalDonated)}</b></td>
                    <td className="adm-nowrap">{formatDate(d.lastDonationAt)}</td>
                    <td><Badge tone={d.hasPassword || d.google ? 'green' : 'grey'}>{loginText(d)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageCount={pageCount} total={rows.length} onPage={setPage} />
      </section>

      {open && <DonorDetails donor={open} onClose={() => setOpen(null)} />}
      {adding && (
        <AddDonorForm
          onCancel={() => setAdding(false)}
          onSaved={(donor) => {
            setAdding(false);
            setItems((current) => [donor, ...(current || [])]);
            showToast(`${donor.name} added`);
          }}
        />
      )}
      <Toast message={toast} />
    </main>
  );
}

function AddDonorForm({ onCancel, onSaved }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', pan: '', address: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSaved(await adminApi.addDonor(form));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Add Donor"
      onClose={onCancel}
      footer={
        <>
          {error && <span className="adm-error adm-foot-error" role="alert">{error}</span>}
          <button type="button" className="adm-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" form="donor-form" className="adm-btn adm-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Add Donor'}</button>
        </>
      }
    >
      <form id="donor-form" className="adm-form" onSubmit={save}>
        <p className="adm-hint">Add an email or a phone number (or both). If this person later donates on the website with the same email or phone, it joins this account.</p>
        <Field label="Full Name *"><input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <div className="adm-grid-2">
          <Field label="Email"><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Phone"><input type="tel" placeholder="98765 43210" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        </div>
        <Field label="PAN" hint="Needed for 80G certificates.">
          <input type="text" maxLength={10} placeholder="ABCDE1234F" value={form.pan} onChange={(e) => set('pan', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
        </Field>
        <Field label="Address"><textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
      </form>
    </Modal>
  );
}

const loginText = (d) =>
  [d.google && 'Google', d.hasPassword && 'Password'].filter(Boolean).join(' + ') || (d.source === 'manual' ? 'Added by admin' : 'Auto account');

function DonorDetails({ donor, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    adminApi.donorDetails(donor.id).then(
      (result) => live && setData(result),
      (e) => live && setError(e.message),
    );
    return () => { live = false; };
  }, [donor.id]);

  const d = data?.donor || donor;
  const donations = data?.donations || [];

  return (
    <Modal title={d.name || 'Donor'} onClose={onClose} wide footer={<button type="button" className="adm-btn" onClick={onClose}>Close</button>}>
      <dl className="adm-details adm-details-two">
        <Row label="Full Name" value={d.name} />
        <Row label="Email Address" value={d.email} />
        <Row label="Phone Number" value={d.phone} />
        <Row label="PAN Card Number" value={d.pan} />
        <Row label="Address" value={d.address} />
        <Row label="Sign-in" value={loginText(d)} />
        <Row label="Donations" value={String(d.donationCount || 0)} />
        <Row label="Total Donated" value={inr(d.totalDonated)} />
        <Row label="First Donation" value={formatDate(d.firstDonationAt, true)} />
        <Row label="Last Donation" value={formatDate(d.lastDonationAt, true)} />
        <Row label="Account Created" value={formatDate(d.createdAt, true)} />
      </dl>

      <h3 className="adm-h3">Donations</h3>
      {error && <p className="adm-error">{error}</p>}
      {!data && !error && <p className="adm-empty">Loading donations…</p>}
      {data && donations.length === 0 && <p className="adm-empty">No donations yet.</p>}
      {donations.length > 0 && (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Campaign</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Receipt / 80G</th>
              </tr>
            </thead>
            <tbody>
              {donations.map((x) => (
                <tr key={x.id}>
                  <td className="adm-nowrap">{formatDate(x.createdAt)}</td>
                  <td>
                    {x.cause}
                    <small className="adm-sub">{x.receiptNo}</small>
                  </td>
                  <td>{x.isMonthly ? 'Monthly' : 'One-time'}</td>
                  <td className="adm-nowrap"><b>{inr(x.grandTotal)}</b></td>
                  <td><a className="adm-btn adm-btn-small" href={adminApi.receipts.pdfUrl(x.id)}>PDF</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || '—'}</dd>
    </div>
  );
}
