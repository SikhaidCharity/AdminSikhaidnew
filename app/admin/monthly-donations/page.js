'use client';

import { useMemo, useState } from 'react';
import { adminApi } from '@/lib/admin-api';
import {
  Badge, LoadState, Notice, PageHead, Pager, Stats, Toast,
  downloadCsv, formatDate, inr, useCollection, usePaged, useToast,
} from '../_ui/shared';

const STATUS = {
  pending: ['Pending Setup', 'orange'],
  active: ['Active', 'green'],
  paused: ['Paused', 'blue'],
  cancelled: ['Cancelled', 'red'],
};

const nextDebit = (donation) => {
  if (donation.mandateStatus !== 'active') return null;
  const next = new Date(donation.createdAt);
  const today = new Date();
  while (next <= today) next.setMonth(next.getMonth() + 1);
  return next.toISOString();
};

export default function MonthlyDonationsPage() {
  const { items, error, loading, reload, setItems } = useCollection('donations');
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [toast, showToast] = useToast();

  const monthly = useMemo(() => (items || []).filter((d) => d.isMonthly), [items]);
  const statusOf = (d) => d.mandateStatus || 'pending';

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return monthly.filter((d) => {
      if (statusFilter !== 'all' && statusOf(d) !== statusFilter) return false;
      if (!q) return true;
      const donor = d.donor || {};
      return [donor.name, donor.email, donor.phone, donor.pan, d.cause, d.receiptNo].join(' ').toLowerCase().includes(q);
    });
  }, [monthly, statusFilter, query]);

  const { rows: pageRows, page, pageCount, setPage } = usePaged(rows, 25);
  const count = (status) => monthly.filter((d) => statusOf(d) === status).length;

  const changeStatus = async (donation, mandateStatus) => {
    try {
      const saved = await adminApi.update('donations', donation.id, { mandateStatus });
      setItems((current) => current.map((d) => (d.id === saved.id ? saved : d)));
      showToast(`Status changed to ${STATUS[mandateStatus][0]}`);
    } catch (e) {
      showToast(e.message);
    }
  };

  const exportRows = () => {
    downloadCsv(
      'sikhaid-monthly-donations.csv',
      ['Date', 'Donor', 'Email', 'Phone', 'PAN', 'Campaign', 'Amount per month', 'Status', 'Receipt', 'Next', 'Subscription ID'],
      rows.map((d) => [
        formatDate(d.createdAt), d.donor?.name, d.donor?.email, d.donor?.phone, d.donor?.pan, d.cause, d.grandTotal,
        STATUS[statusOf(d)][0], d.receiptNo, formatDate(nextDebit(d)), d.razorpaySubscriptionId,
      ])
    );
  };

  const hasFilters = statusFilter !== 'all' || query;

  return (
    <main className="adm-page">
      <PageHead title="Monthly Donations" subtitle="Donors who chose to give every month.">
        <button type="button" className="adm-btn" onClick={reload}>Refresh</button>
        <button type="button" className="adm-btn" onClick={exportRows} disabled={rows.length === 0}>Export CSV</button>
      </PageHead>

      <Notice>Test data only. Razorpay is not connected yet, so no monthly debit is set up. Changing a status here only updates this record.</Notice>

      <Stats
        items={[
          { label: 'Total Intents', value: monthly.length },
          { label: 'Pending Setup', value: count('pending') },
          { label: 'Active', value: count('active') },
          { label: 'Paused', value: count('paused') },
          { label: 'Cancelled', value: count('cancelled') },
        ]}
      />

      <section className="adm-panel">
        <div className="adm-filters">
          <input type="search" aria-label="Search monthly donations" placeholder="Search name, email, phone, PAN…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          <select aria-label="Filter by status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="all">All Statuses</option>
            {Object.entries(STATUS).map(([id, [label]]) => <option key={id} value={id}>{label}</option>)}
          </select>
          {hasFilters && (
            <button type="button" className="adm-btn" onClick={() => { setStatusFilter('all'); setQuery(''); }}>Clear filters</button>
          )}
        </div>

        <LoadState loading={loading} error={error} onRetry={reload} loadingText="Loading monthly donations..." />
        {items && rows.length === 0 && <p className="adm-empty">No monthly donation intents found.</p>}

        {rows.length > 0 && (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Donor</th>
                  <th>Contact</th>
                  <th>PAN</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>First Payment</th>
                  <th>Receipt</th>
                  <th>Next</th>
                  <th>Change Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((d) => {
                  const [label, tone] = STATUS[statusOf(d)];
                  return (
                    <tr key={d.id}>
                      <td className="adm-nowrap">{formatDate(d.createdAt)}</td>
                      <td>
                        <b>{d.donor?.name || '—'}</b>
                        <small className="adm-sub">{d.cause}</small>
                      </td>
                      <td>
                        {d.donor?.phone || '—'}
                        <small className="adm-sub">{d.donor?.email}</small>
                      </td>
                      <td className="adm-nowrap">{d.donor?.pan || '—'}</td>
                      <td className="adm-nowrap"><b>{inr(d.grandTotal)}</b><small className="adm-sub">per month</small></td>
                      <td><Badge tone={tone}>{label}</Badge></td>
                      <td className="adm-nowrap">{d.razorpayPaymentId ? formatDate(d.createdAt) : '—'}</td>
                      <td>
                        <a className="adm-btn adm-btn-small" href={adminApi.receipts.pdfUrl(d.id)}>PDF</a>
                      </td>
                      <td className="adm-nowrap">{formatDate(nextDebit(d))}</td>
                      <td>
                        <select aria-label={`Change status for ${d.donor?.name}`} value={statusOf(d)} onChange={(e) => changeStatus(d, e.target.value)}>
                          {Object.entries(STATUS).map(([id, [text]]) => <option key={id} value={id}>{text}</option>)}
                        </select>
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
      <Toast message={toast} />
    </main>
  );
}
