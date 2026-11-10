'use client';

import { useMemo, useState } from 'react';
import { adminApi } from '@/lib/admin-api';
import {
  LoadState, Modal, Notice, PageHead, Pager, Stats,
  downloadCsv, formatDate, inr, useCollection, usePaged,
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

export default function DonationsPage() {
  const { items, error, loading, reload, setItems } = useCollection('donations');
  const [query, setQuery] = useState('');
  const [utmFilter, setUtmFilter] = useState('all');
  const [perPage, setPerPage] = useState(25);
  const [open, setOpen] = useState(null);

  const all = useMemo(() => items || [], [items]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filter = UTM_FILTERS.find((f) => f.id === utmFilter);
    return all.filter((d) => {
      if (!filter.test(d.utm || {})) return false;
      if (!q) return true;
      const donor = d.donor || {};
      return [donor.name, donor.email, donor.phone, donor.pan, d.receiptNo, d.cause, d.razorpayPaymentId]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [all, query, utmFilter]);

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
      <PageHead title="Donations & Leads" subtitle="Every donation made through the donation card.">
        <button type="button" className="adm-btn" onClick={reload}>Refresh</button>
        <button type="button" className="adm-btn" onClick={exportRows} disabled={rows.length === 0}>Export</button>
      </PageHead>

      <Notice>Test data only. Razorpay is not connected yet, so no money is collected and Payment ID stays empty.</Notice>

      <Stats
        items={[
          { label: 'Total Donations', value: all.length },
          { label: 'Total Amount', value: inr(sum(all, 'grandTotal')) },
          { label: 'SikhAid Support Earned', value: inr(sum(all, 'tipAmt')), hint: 'Included in Total Amount' },
          { label: 'Last 30 Days', value: inr(sum(last30, 'grandTotal')) },
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
                    <td className="adm-nowrap">{formatDate(d.createdAt)}</td>
                    <td><b>{d.donor?.name || '—'}</b></td>
                    <td className="adm-nowrap">{d.donor?.phone || '—'}</td>
                    <td>
                      {d.cause}
                      <small className="adm-sub">{d.utm?.utm_source ? `${d.utm.utm_source} / ${d.utm.utm_medium || '—'}` : 'Organic / Direct'}</small>
                    </td>
                    <td className="adm-nowrap">
                      <b>{inr(d.grandTotal)}</b>
                      {d.isMonthly && <small className="adm-sub">Monthly</small>}
                    </td>
                    <td className="adm-small">{d.razorpayPaymentId || '—'}</td>
                    <td className="adm-actions">
                      <button type="button" className="adm-btn adm-btn-small" onClick={() => setOpen(d)}>Details</button>
                      <a className="adm-btn adm-btn-small" href={adminApi.receipts.pdfUrl(d.id)} title="Receipt, plus the 80G certificate for ₹2,000 or more">PDF</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageCount={pageCount} total={rows.length} onPage={setPage} />
      </section>

      {open && (
        <Modal
          title="Donor Lead Profile & Attribution"
          onClose={() => setOpen(null)}
          footer={
            <>
              <button type="button" className="adm-btn" onClick={() => setOpen(null)}>Close Details</button>
              <SendButton donation={open} onSent={(d) => { setOpen(d); setItems((all) => all.map((x) => (x.id === d.id ? d : x))); }} />
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

function SendButton({ donation, onSent }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="adm-btn"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          onSent(await adminApi.receipts.send(donation.id));
        } catch {}
        setBusy(false);
      }}
    >
      {busy ? 'Sending…' : 'Send on WhatsApp'}
    </button>
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
