'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/admin-api';
import {
  Badge, ConfirmDelete, Field, LoadState, MediaInput, Modal, Notice, PageHead, Pager, Stats, Toast,
  downloadCsv, formatDate, inr, useCollection, usePaged, useToast,
} from '../_ui/shared';

// What each WhatsApp status means, in plain words.
const WA_STATUS = {
  sent: ['Sent', 'green'],
  'not-sent': ['Not sent', 'grey'],
  failed: ['Failed', 'red'],
  'test-record': ['Test record, not sent', 'grey'],
  'trust-details-missing': ['Trust details missing', 'orange'],
  'needs-pan': ['Donor PAN needed', 'orange'],
  'no-phone': ['No phone number', 'orange'],
  'not-configured': ['WhatsApp not connected', 'orange'],
};

const PAYMENT_MODES = ['Online', 'UPI', 'Bank Transfer', 'Cheque', 'Cash'];

export default function CertificatesPage() {
  const [tab, setTab] = useState('certificates');
  const [status, setStatus] = useState(null);

  const loadStatus = useCallback(() => {
    adminApi.certificates.status().then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(loadStatus, [loadStatus]);

  return (
    <main className="adm-page">
      <PageHead
        title="80G Certificates"
        subtitle="Made automatically for every donation of the minimum amount or more, and sent to the donor on WhatsApp. You can also add one by hand."
      />

      <div className="adm-tabs" role="tablist" aria-label="80G sections">
        {[['certificates', 'Certificates'], ['trust', 'Trust Details']].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {status?.trustMissing?.length > 0 && (
        <Notice>
          Certificates can&apos;t be sent until the Trust Details are filled in. Missing: {status.trustMissing.join(', ')}.
        </Notice>
      )}
      {status && !status.whatsappReady && (
        <Notice>
          WhatsApp is not connected yet, so certificates are saved here but not sent. Add the WhatsApp details to .env.local to switch sending on.
        </Notice>
      )}

      {tab === 'certificates' ? <CertificateList /> : <TrustForm onSaved={loadStatus} />}
    </main>
  );
}

function CertificateList() {
  const { items, error, loading, reload, setItems } = useCollection('certificates');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [sending, setSending] = useState('');
  const [toast, showToast] = useToast();

  const all = useMemo(() => items || [], [items]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((c) => !q || `${c.certNo} ${c.donor.name} ${c.donor.pan} ${c.donor.phone} ${c.campaign}`.toLowerCase().includes(q))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [all, query]);
  const { rows: pageRows, page, pageCount, setPage } = usePaged(rows, 20);

  const replace = (cert) => setItems((current) => current.map((c) => (c.id === cert.id ? cert : c)));

  const send = async (cert) => {
    setSending(cert.id);
    try {
      const updated = await adminApi.certificates.send(cert.id);
      replace(updated);
      const [label] = WA_STATUS[updated.whatsapp?.status] || ['Done'];
      showToast(updated.whatsapp?.status === 'sent' ? 'Sent on WhatsApp' : `Not sent: ${label}`);
    } catch (e) {
      showToast(e.message);
    }
    setSending('');
  };

  const exportCsv = () =>
    downloadCsv(
      '80g-certificates.csv',
      ['Certificate No', 'Issued', 'Donor', 'PAN', 'Phone', 'Email', 'Amount', 'Donation Date', 'Payment Mode', 'Reference', 'Campaign', 'Source', 'WhatsApp'],
      rows.map((c) => [
        c.certNo, formatDate(c.createdAt), c.donor.name, c.donor.pan, c.donor.phone, c.donor.email, c.amount,
        formatDate(c.donationDate), c.paymentMode, c.paymentRef, c.campaign, c.source, WA_STATUS[c.whatsapp?.status]?.[0] || '',
      ])
    );

  const real = all.filter((c) => !c.test);

  return (
    <>
      <Stats
        items={[
          { label: 'Certificates', value: real.length, hint: all.length > real.length ? `${all.length - real.length} test records` : undefined },
          { label: 'Total Amount', value: inr(real.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)) },
          { label: 'Sent on WhatsApp', value: all.filter((c) => c.whatsapp?.status === 'sent').length },
          { label: 'Need Attention', value: real.filter((c) => !['sent', 'not-sent'].includes(c.whatsapp?.status)).length },
        ]}
      />

      <section className="adm-panel">
        <div className="adm-filters">
          <input type="search" aria-label="Search certificates" placeholder="Search name, PAN, phone, certificate no…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          <button type="button" className="adm-btn" onClick={exportCsv} disabled={rows.length === 0}>Export CSV</button>
          <button type="button" className="adm-btn adm-btn-primary" onClick={() => setEditing({})}>+ Manual Entry</button>
        </div>

        <LoadState loading={loading} error={error} onRetry={reload} loadingText="Loading certificates..." />

        {items && rows.length === 0 && (
          <div className="adm-empty"><p>{query ? 'No certificates match your search.' : 'No 80G certificates yet.'}</p></div>
        )}

        {rows.length > 0 && (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Certificate</th>
                  <th>Donor</th>
                  <th>Amount</th>
                  <th>Campaign</th>
                  <th>WhatsApp</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((c) => {
                  const [label, tone] = WA_STATUS[c.whatsapp?.status] || WA_STATUS['not-sent'];
                  return (
                    <tr key={c.id}>
                      <td className="adm-title-cell">
                        <b className="adm-nowrap">{c.certNo}</b>
                        <small className="adm-sub">
                          {formatDate(c.createdAt)} · {c.source === 'manual' ? 'Manual' : 'Auto'}
                          {c.test && <> · <span className="adm-test">Test</span></>}
                        </small>
                      </td>
                      <td>
                        <b>{c.donor.name}</b>
                        <small className="adm-sub">{c.donor.pan || 'No PAN'}{c.donor.phone ? ` · ${c.donor.phone}` : ''}</small>
                      </td>
                      <td className="adm-nowrap"><b>{inr(c.amount)}</b></td>
                      <td>{c.campaign}</td>
                      <td>
                        <Badge tone={tone}>{label}</Badge>
                        {c.whatsapp?.error && <small className="adm-sub" title={c.whatsapp.error}>{c.whatsapp.error.slice(0, 60)}</small>}
                      </td>
                      <td className="adm-actions">
                        <a className="adm-btn adm-btn-small" href={adminApi.certificates.pdfUrl(c.id, true)} target="_blank" rel="noreferrer">View</a>
                        <a className="adm-btn adm-btn-small" href={adminApi.certificates.pdfUrl(c.id)}>Download PDF</a>
                        <button type="button" className="adm-btn adm-btn-small" disabled={sending === c.id} onClick={() => send(c)}>
                          {sending === c.id ? 'Sending…' : c.whatsapp?.status === 'sent' ? 'Send again' : 'Send on WhatsApp'}
                        </button>
                        <button type="button" className="adm-btn adm-btn-small" onClick={() => setEditing(c)}>Edit</button>
                        <button type="button" className="adm-btn adm-btn-small adm-btn-danger-line" onClick={() => setDeleting(c)}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageCount={pageCount} total={rows.length} onPage={setPage} />
      </section>

      {editing && (
        <CertificateForm
          cert={editing}
          onCancel={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            setEditing(null);
            if (isNew) setItems((current) => [saved, ...current]);
            else replace(saved);
            showToast(isNew ? `Certificate ${saved.certNo} created` : 'Certificate updated');
          }}
        />
      )}

      {deleting && (
        <ConfirmDelete
          title="Delete Certificate"
          name={`${deleting.certNo} (${deleting.donor.name})`}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await adminApi.remove('certificates', deleting.id);
            setItems((current) => current.filter((c) => c.id !== deleting.id));
            setDeleting(null);
            showToast('Certificate deleted');
          }}
        />
      )}
      <Toast message={toast} />
    </>
  );
}

const toDateInput = (value) => {
  const d = value ? new Date(value) : new Date();
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};

function CertificateForm({ cert, onCancel, onSaved }) {
  const isNew = !cert.id;
  const [form, setForm] = useState(() => ({
    name: cert.donor?.name || '',
    pan: cert.donor?.pan || '',
    phone: cert.donor?.phone || '',
    email: cert.donor?.email || '',
    address: cert.donor?.address || '',
    amount: cert.amount ?? '',
    donationDate: toDateInput(cert.donationDate),
    paymentMode: cert.paymentMode || 'Online',
    paymentRef: cert.paymentRef || '',
    campaign: cert.campaign || 'General Fund',
    sendWhatsApp: isNew,
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !(Number(form.amount) > 0)) {
      setError('Please add the donor name and an amount.');
      return;
    }
    if (form.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan)) {
      setError('PAN should look like ABCDE1234F.');
      return;
    }
    const entry = {
      donor: { name: form.name, pan: form.pan, phone: form.phone, email: form.email, address: form.address },
      amount: Number(form.amount),
      donationDate: new Date(form.donationDate || Date.now()).toISOString(),
      paymentMode: form.paymentMode,
      paymentRef: form.paymentRef,
      campaign: form.campaign,
    };
    setBusy(true);
    setError('');
    try {
      const saved = isNew
        ? await adminApi.certificates.create({ ...entry, sendWhatsApp: form.sendWhatsApp })
        : await adminApi.update('certificates', cert.id, entry);
      onSaved(saved, isNew);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title={isNew ? 'Manual 80G Entry' : `Edit ${cert.certNo}`}
      onClose={onCancel}
      footer={
        <>
          {error && <span className="adm-error adm-foot-error" role="alert">{error}</span>}
          <button type="button" className="adm-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" form="cert-form" className="adm-btn adm-btn-primary" disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Create Certificate' : 'Save Changes'}
          </button>
        </>
      }
    >
      <form id="cert-form" className="adm-form" onSubmit={save}>
        {!isNew && <p className="adm-hint">The certificate number stays the same. Download the PDF again after saving to get the updated copy.</p>}
        <div className="adm-grid-2">
          <Field label="Donor Name *"><input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Donor PAN" hint="Needed for the donor to claim 80G.">
            <input type="text" maxLength={10} placeholder="ABCDE1234F" value={form.pan} onChange={(e) => set('pan', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
          </Field>
          <Field label="WhatsApp / Phone"><input type="tel" placeholder="98765 43210" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
        </div>
        <Field label="Donor Address"><textarea rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <div className="adm-grid-2">
          <Field label="Amount (Rs.) *"><input type="number" min="1" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
          <Field label="Donation Date *"><input type="date" value={form.donationDate} onChange={(e) => set('donationDate', e.target.value)} /></Field>
          <Field label="Payment Mode">
            <select value={form.paymentMode} onChange={(e) => set('paymentMode', e.target.value)}>
              {[...new Set([...PAYMENT_MODES, form.paymentMode])].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Payment Reference" hint="Transaction ID, cheque no. or receipt no."><input type="text" value={form.paymentRef} onChange={(e) => set('paymentRef', e.target.value)} /></Field>
        </div>
        <Field label="Donated Towards"><input type="text" value={form.campaign} onChange={(e) => set('campaign', e.target.value)} /></Field>
        {isNew && (
          <label className="adm-check">
            <input type="checkbox" checked={form.sendWhatsApp} onChange={(e) => set('sendWhatsApp', e.target.checked)} />
            Send the certificate to the donor on WhatsApp now
          </label>
        )}
      </form>
    </Modal>
  );
}

function TrustForm({ onSaved }) {
  const { items, error, loading, reload, setItems } = useCollection('trust80g');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();
  const current = form || items;
  const set = (field, value) => setForm((f) => ({ ...(f || items), [field]: value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const stored = await adminApi.saveAll('trust80g', { ...current, minAmount: Number(current.minAmount) || 2000, pan: String(current.pan || '').toUpperCase() });
      setItems(stored);
      setForm(null);
      onSaved();
      showToast('Trust details saved');
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
            <legend>Printed on every certificate</legend>
            <Field label="Trust Name"><input type="text" value={current.trustName} onChange={(e) => set('trustName', e.target.value)} /></Field>
            <Field label="Trust Address *"><textarea rows={2} value={current.address} onChange={(e) => set('address', e.target.value)} /></Field>
            <div className="adm-grid-2">
              <Field label="Trust PAN *"><input type="text" maxLength={10} value={current.pan} onChange={(e) => set('pan', e.target.value.toUpperCase())} /></Field>
              <Field label="80G Registration No. *" hint="The unique registration number from the Income Tax Department."><input type="text" value={current.registrationNo} onChange={(e) => set('registrationNo', e.target.value)} /></Field>
              <Field label="Registration Date"><input type="text" placeholder="e.g. 28 May 2021" value={current.registrationDate} onChange={(e) => set('registrationDate', e.target.value)} /></Field>
              <Field label="Valid For" hint="e.g. AY 2022-23 to AY 2026-27"><input type="text" value={current.validity} onChange={(e) => set('validity', e.target.value)} /></Field>
            </div>
            <Field label="Tax Note"><textarea rows={3} value={current.deductionNote} onChange={(e) => set('deductionNote', e.target.value)} /></Field>
          </fieldset>

          <fieldset className="adm-section">
            <legend>Signature</legend>
            <div className="adm-grid-2">
              <Field label="Signatory Name *"><input type="text" value={current.signatoryName} onChange={(e) => set('signatoryName', e.target.value)} /></Field>
              <Field label="Designation"><input type="text" value={current.signatoryTitle} onChange={(e) => set('signatoryTitle', e.target.value)} /></Field>
            </div>
            <MediaInput label="Signature Image" hint="PNG or JPG, ideally on a white or clear background." value={current.signatureImage} onChange={(url) => set('signatureImage', url)} />
          </fieldset>

          <fieldset className="adm-section">
            <legend>Automation</legend>
            <Field label="Minimum donation for a certificate (Rs.)">
              <input type="number" min="1" value={current.minAmount} onChange={(e) => set('minAmount', e.target.value)} />
            </Field>
            <label className="adm-check">
              <input type="checkbox" checked={Boolean(current.autoSendWhatsApp)} onChange={(e) => set('autoSendWhatsApp', e.target.checked)} />
              Send each new certificate to the donor on WhatsApp automatically
            </label>
          </fieldset>

          <div className="adm-save-bar">
            {form && <span>You have unsaved changes</span>}
            <button type="submit" className="adm-btn adm-btn-primary" disabled={busy || !form}>{busy ? 'Saving…' : 'Save Trust Details'}</button>
          </div>
        </form>
      )}
      <Toast message={toast} />
    </>
  );
}
