'use client';

import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/admin-api';
import {
  LiveSyncNote, LoadState, Modal, Notice, PageHead, Pager, Stats,
  downloadCsv, formatDate, inr, useCollection, useLiveSync, usePaged,
} from '../_ui/shared';

const PAID_MEDIUMS = /^(cpc|ppc|paid|paid_social|paid-social|display|ads?)$/i;

const UTM_FILTERS = [
  { id: 'all', label: 'All Traffic', test: () => true },
  { id: 'paid', label: 'All Paid Ads', test: (u) => PAID_MEDIUMS.test(u.utm_medium || '') },
  { id: 'instagram', label: 'Instagram (ig / social)', test: (u) => /^(ig|instagram)$/i.test(u.utm_source || '') },
  { id: 'google', label: 'Google Ads (google / cpc)', test: (u) => /google/i.test(u.utm_source || '') && PAID_MEDIUMS.test(u.utm_medium || '') },
  { id: 'facebook', label: 'Facebook Ads (fb / meta)', test: (u) => /^(fb|facebook|meta)$/i.test(u.utm_source || '') },
  { id: 'whatsapp', label: 'WhatsApp Outreach', test: (u) => /whatsapp|^wa$/i.test(u.utm_source || '') },
  { id: 'organic', label: 'Organic / Direct', test: (u) => !u.utm_source },
];

const DAY = 24 * 60 * 60 * 1000;
// "2026-11-18" for a donation's date, in the admin's own time zone (matches the date pickers).
const dayOf = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// "05:22 pm" for a donation's time, shown small under its date.
const timeOf = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

export default function DonationsPage() {
  const { items, error, loading, reload, setItems } = useCollection('donations');
  const [query, setQuery] = useState('');
  const [utmFilter, setUtmFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [perPage, setPerPage] = useState(25);
  const [open, setOpen] = useState(null);
  const [sending, setSending] = useState(null);
  const sync = useLiveSync(reload);

  const all = useMemo(() => items || [], [items]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filter = UTM_FILTERS.find((f) => f.id === utmFilter);
    return all.filter((d) => {
      if (!filter.test(d.utm || {})) return false;
      if (from || to) {
        const day = dayOf(d.createdAt);
        if (from && day < from) return false;
        if (to && day > to) return false;
      }
      if (!q) return true;
      const donor = d.donor || {};
      return [donor.name, donor.email, donor.phone, donor.pan, d.receiptNo, d.cause, d.razorpayPaymentId]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [all, query, utmFilter, from, to]);

  const { rows: pageRows, page, pageCount, setPage } = usePaged(rows, perPage);
  const sum = (list, field) => list.reduce((total, d) => total + (Number(d[field]) || 0), 0);
  const last30 = all.filter((d) => new Date(d.createdAt).getTime() >= new Date().getTime() - 30 * DAY);

  const exportRows = () => {
    downloadCsv(
      'sikhaid-donations.csv',
      ['Receipt', 'Date', 'Donor Name', 'Email', 'Phone', 'PAN', 'Campaign', 'Payment Type', 'To the cause', 'Support to SikhAid', 'Total', 'Payment ID', 'UTM Source', 'UTM Medium', 'UTM Campaign', 'UTM Term', 'UTM Content'],
      rows.map((d) => [
        d.receiptNo, formatDate(d.createdAt, true), d.donor?.name, d.donor?.email, d.donor?.phone, d.donor?.pan, d.cause,
        d.isMonthly ? 'Monthly Recurring' : 'One-Time Donation', d.amount, d.tipAmt, d.grandTotal, d.razorpayPaymentId,
        d.utm?.utm_source, d.utm?.utm_medium, d.utm?.utm_campaign, d.utm?.utm_term, d.utm?.utm_content,
      ])
    );
  };

  return (
    <main className="adm-page">
      <PageHead title="Donations & Leads" subtitle="Every donation from the live site and the new donation card.">
        <button type="button" className="adm-btn" onClick={sync.checkAll} disabled={sync.busy}>
          {sync.busy ? 'Checking…' : 'Check everything'}
        </button>
        <button type="button" className="adm-btn" onClick={reload}>Refresh</button>
        <button type="button" className="adm-btn" onClick={exportRows} disabled={rows.length === 0}>Export</button>
      </PageHead>

      <LiveSyncNote sync={sync} />

      <Stats
        items={[
          { label: 'Total Donations', value: all.length.toLocaleString('en-IN'), icon: 'heart' },
          { label: 'Total Amount', value: inr(sum(all, 'grandTotal')), icon: 'rupee' },
          { label: 'SikhAid Support Earned', value: inr(sum(all, 'tipAmt')), hint: 'Included in Total Amount', icon: 'support' },
          { label: 'Last 30 Days', value: inr(sum(last30, 'grandTotal')), icon: 'calendar' },
        ]}
      />

      <section className="adm-panel">
        <div className="adm-filters">
          <input type="search" aria-label="Search donations" placeholder="Search name, email, phone, PAN, receipt…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          <label className="adm-inline">
            UTM Filter
            <select value={utmFilter} onChange={(e) => { setUtmFilter(e.target.value); setPage(1); }}>
              {UTM_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </label>
          <div className="adm-inline adm-dates">
            Date
            <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            <span>to</span>
            <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
            {(from || to) && <button type="button" className="adm-link" onClick={() => { setFrom(''); setTo(''); setPage(1); }}>Clear</button>}
          </div>
          <label className="adm-inline">
            Per page
            <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>

        {items && (
          <p className="adm-summary">
            Filtered donations: <b>{rows.length}</b> · Filtered amount: <b>{inr(sum(rows, 'grandTotal'))}</b>
          </p>
        )}

        <LoadState loading={loading} error={error} onRetry={reload} loadingText="Loading donations..." />
        {items && rows.length === 0 && <p className="adm-empty">No matching donations found</p>}

        {rows.length > 0 && (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Date</th>
                  <th>Donor Name</th>
                  <th>Phone</th>
                  <th>Campaign / UTM</th>
                  <th>Amount</th>
                  <th>Payment ID</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((d) => (
                  <tr key={d.id}>
                    <td className="adm-nowrap adm-small">{d.receiptNo}</td>
                    <td className="adm-nowrap">{formatDate(d.createdAt)}<small className="adm-sub">{timeOf(d.createdAt)}</small></td>
                    <td><b>{d.donor?.name || '—'}</b></td>
                    <td className="adm-nowrap">{d.donor?.phone || '—'}</td>
                    <td>
                      {d.cause}
                      <small className="adm-sub">{d.utm?.utm_source ? `${d.utm.utm_source} / ${d.utm.utm_medium || '—'}` : 'Organic / Direct'}</small>
                    </td>
                    <td className="adm-nowrap">
                      <b>{inr(d.grandTotal)}</b>
                      {d.international && <small className="adm-sub">{d.currency} {Number(d.foreignTotal || 0).toLocaleString('en-IN')} · International</small>}
                      {d.isMonthly && <small className="adm-sub">Monthly</small>}
                    </td>
                    <td className="adm-small">{d.razorpayPaymentId || '—'}</td>
                    <td className="adm-actions">
                      <button type="button" className="adm-btn adm-btn-small" onClick={() => setOpen(d)}>Details</button>
                      <a className="adm-btn adm-btn-small" href={adminApi.receipts.pdfUrl(d.id)} title="Receipt, plus the 80G certificate for ₹2,000 or more">PDF</a>
                      <button type="button" className={`adm-btn adm-btn-small${d.whatsapp?.status === 'sent' ? ' adm-btn-sent' : ''}`} onClick={() => setSending(d)} title={whatsappText(d.whatsapp)}>
                        {d.whatsapp?.status === 'sent' ? 'Sent ✓' : 'Send'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageCount={pageCount} total={rows.length} onPage={setPage} />
      </section>

      {sending && (
        <SendModal
          donation={sending}
          onClose={() => setSending(null)}
          onSent={(d) => {
            setItems((list) => list.map((x) => (x.id === d.id ? d : x)));
            setOpen((o) => (o?.id === d.id ? d : o));
          }}
        />
      )}

      {open && (
        <Modal
          title="Donor Lead Profile & Attribution"
          onClose={() => setOpen(null)}
          footer={
            <>
              <button type="button" className="adm-btn" onClick={() => setOpen(null)}>Close Details</button>
              <button type="button" className="adm-btn" onClick={() => setSending(open)}>Send on WhatsApp</button>
              <a className="adm-btn adm-btn-primary" href={adminApi.receipts.pdfUrl(open.id)}>Download PDF</a>
            </>
          }
        >
          <dl className="adm-details adm-details-two">
            <Row label="Donation Amount" value={inr(open.grandTotal)} />
            <Row label="To the cause" value={inr(open.amount)} />
            <Row label="Support to SikhAid" value={inr(open.tipAmt)} />
            <Row label="Payment Type" value={open.isMonthly ? 'Monthly Recurring' : 'One-Time Donation'} />
            <Row label="Campaign" value={open.cause} />
            <Row label="Receipt" value={open.receiptNo} />
            <Row label="Sent on WhatsApp" value={whatsappText(open.whatsapp)} />
            <Row label="Full Name" value={open.donor?.name} />
            <Row label="Phone Number" value={open.donor?.phone} />
            <Row label="Email Address" value={open.donor?.email} />
            <Row label="PAN Card Number" value={open.donor?.pan} />
            <Row label="Address" value={open.donor?.address} />
            <Row label="Wants an account" value={open.optAccount ? 'Yes' : 'No'} />
            <Row label="WhatsApp updates" value={open.optWa ? 'Yes' : 'No'} />
            <Row label="UTM Source" value={open.utm?.utm_source} />
            <Row label="UTM Medium" value={open.utm?.utm_medium} />
            <Row label="Campaign Name" value={open.utm?.utm_campaign} />
            <Row label="UTM Term / Keywords" value={open.utm?.utm_term} />
            <Row label="UTM Content / Variant" value={open.utm?.utm_content} />
          </dl>
        </Modal>
      )}
    </main>
  );
}

const WA_TEXT = {
  sent: 'Sent',
  failed: 'Failed',
  'test-record': 'Not sent (test record)',
  'no-phone': 'Not sent (no phone number)',
  'not-configured': 'Not sent (WhatsApp not connected yet)',
};
const whatsappText = (wa) =>
  wa ? `${WA_TEXT[wa.status] || wa.status}${wa.included === 'receipt-and-80g' ? ': receipt + 80G' : wa.included === 'receipt' ? ': receipt' : ''}` : 'Not sent';

// Send the donor's PDF on WhatsApp: the receipt only, or the receipt with the 80G certificate.
// The choice starts on what the amount allows (80G for the minimum amount or more, with a PAN).
function SendModal({ donation, onClose, onSent }) {
  const [options, setOptions] = useState(null);
  const [include, setInclude] = useState('');
  const [state, setState] = useState({ busy: false, error: '', result: null });

  useEffect(() => {
    let current = true;
    adminApi.receipts.sendOptions(donation.id)
      .then((o) => { if (current) { setOptions(o); setInclude(o.suggested); } })
      .catch((e) => current && setState((s) => ({ ...s, error: e.message })));
    return () => { current = false; };
  }, [donation.id]);

  const send = async () => {
    setState({ busy: true, error: '', result: null });
    try {
      const updated = await adminApi.receipts.send(donation.id, include);
      onSent(updated);
      const wa = updated.whatsapp || {};
      if (wa.status === 'sent') setState({ busy: false, error: '', result: whatsappText(wa) });
      else setState({ busy: false, error: wa.error || whatsappText(wa), result: null });
    } catch (e) {
      setState({ busy: false, error: e.message, result: null });
    }
  };

  const blocked = options && (!options.whatsappReady || !options.phone);
  const pdfHref = `${adminApi.receipts.pdfUrl(donation.id, true)}${include === 'receipt' ? '&include=receipt' : ''}`;

  return (
    <Modal
      title="Send PDF on WhatsApp"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="adm-btn" onClick={onClose}>{state.result ? 'Done' : 'Cancel'}</button>
          {!state.result && (
            <button type="button" className="adm-btn adm-btn-primary" onClick={send} disabled={!options || blocked || state.busy}>
              {state.busy ? 'Sending…' : 'Send'}
            </button>
          )}
        </>
      }
    >
      <div className="adm-send">
        <p className="adm-send-who">
          <b>{donation.donor?.name || 'Donor'}</b> · {inr(donation.grandTotal)} · {donation.cause}
          <small className="adm-sub">To WhatsApp: {options ? (options.phone ? `+${options.phone}` : 'no phone number') : donation.donor?.phone || '—'}</small>
        </p>

        {!options && !state.error && <p className="adm-muted">Checking what can be sent…</p>}

        {options && (
          <>
            <div className="adm-send-options" role="radiogroup" aria-label="What to send">
              <label className={`adm-send-option${include === 'receipt' ? ' is-on' : ''}`}>
                <input type="radio" name="include" checked={include === 'receipt'} onChange={() => setInclude('receipt')} />
                <span><b>Receipt only</b><small>The donation receipt.</small></span>
              </label>
              <label className={`adm-send-option${include === 'receipt-and-80g' ? ' is-on' : ''}${options.can80g ? '' : ' is-off'}`}>
                <input type="radio" name="include" disabled={!options.can80g} checked={include === 'receipt-and-80g'} onChange={() => setInclude('receipt-and-80g')} />
                <span>
                  <b>Receipt + 80G certificate</b>
                  <small>{options.can80g ? `One PDF with both${options.certNo ? ` (${options.certNo})` : ''}. For ${inr(options.minAmount)} or more.` : options.no80g}</small>
                </span>
              </label>
            </div>
            {!options.whatsappReady && <p className="adm-notice">WhatsApp is not connected yet. Missing setting: {options.whatsappMissing.join(', ')}.</p>}
            {options.whatsappReady && !options.phone && <p className="adm-notice">This donation has no valid phone number.</p>}
            {donation.whatsapp?.status === 'sent' && !state.result && (
              <p className="adm-muted">Already sent {formatDate(donation.whatsapp.at, true)} ({whatsappText(donation.whatsapp)}). Sending again sends another copy.</p>
            )}
          </>
        )}

        {state.result && <p className="adm-ok" role="status">✓ {state.result} to +{options?.phone}</p>}
        {state.error && <p className="adm-error" role="alert">Not sent: {state.error}</p>}
        <a className="adm-link" href={pdfHref} target="_blank" rel="noreferrer">Preview the PDF</a>
      </div>
    </Modal>
  );
}

function Row({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || 'Not provided'}</dd>
    </div>
  );
}
