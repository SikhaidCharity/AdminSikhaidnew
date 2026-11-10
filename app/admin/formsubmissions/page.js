'use client';

import { useMemo, useState } from 'react';
import { adminApi } from '@/lib/admin-api';
import {
  Badge, ConfirmDelete, LoadState, Modal, PageHead, Pager, Stats, Toast,
  downloadCsv, formatDate, useCollection, usePaged, useToast,
} from '../_ui/shared';

const TABS = [
  {
    id: 'contact',
    label: 'Contact Inquiries',
    nameField: 'Name',
    columns: ['Email', 'Phone', 'Subject'],
    fields: ['Name', 'Email', 'Phone', 'Subject', 'Message'],
  },
  {
    id: 'volunteer',
    label: 'Volunteer Applications',
    nameField: 'Full Name',
    columns: ['Email', 'Mobile', 'Opportunity'],
    fields: ['Full Name', 'Email', 'Mobile', 'Gender', 'Address', 'Opportunity', 'Duration', 'Experience', 'Start Date', 'About'],
  },
  {
    id: 'csr',
    label: 'CSR Partnerships',
    nameField: 'Company Name',
    columns: ['Contact Person', 'Email', 'Budget Range'],
    fields: ['Company Name', 'Contact Person', 'Email', 'Phone', 'Company Size', 'Industry', 'Budget Range', 'Partnership Interest', 'Message'],
  },
  {
    id: 'newsletter',
    label: 'Newsletter',
    nameField: 'Email',
    columns: [],
    fields: ['Email'],
  },
];

const STATUS = { new: ['New', 'orange'], read: ['Read', 'blue'], resolved: ['Resolved', 'green'] };
const PER_PAGE = 15;

export default function FormSubmissionsPage() {
  const { items, error, loading, reload, setItems } = useCollection('submissions');
  const [tabId, setTabId] = useState('contact');
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [toast, showToast] = useToast();

  const tab = TABS.find((t) => t.id === tabId);
  const all = useMemo(() => items || [], [items]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter(
      (s) =>
        s.type === tabId &&
        (statusFilter === 'all' || s.status === statusFilter) &&
        (!q || Object.values(s.fields || {}).join(' ').toLowerCase().includes(q))
    );
  }, [all, tabId, statusFilter, query]);

  const { rows: pageRows, page, pageCount, setPage } = usePaged(rows, PER_PAGE);
  const open = all.find((s) => s.id === openId);

  const setStatus = async (submission, status) => {
    try {
      const saved = await adminApi.update('submissions', submission.id, { status });
      setItems((current) => current.map((s) => (s.id === saved.id ? saved : s)));
      showToast(`Marked as ${STATUS[status][0]}`);
    } catch (e) {
      showToast(e.message);
    }
  };

  const openEntry = (submission) => {
    setOpenId(submission.id);
    if (submission.status === 'new') setStatus(submission, 'read');
  };

  const exportRows = () => {
    downloadCsv(
      `sikhaid-${tabId}-submissions.csv`,
      ['Status', 'Submitted On', ...tab.fields],
      rows.map((s) => [STATUS[s.status]?.[0], formatDate(s.createdAt, true), ...tab.fields.map((f) => s.fields?.[f] || '')])
    );
  };

  const count = (type, status) => all.filter((s) => s.type === type && (!status || s.status === status)).length;

  return (
    <main className="adm-page">
      <PageHead title="Form Submissions" subtitle="Everything visitors send through the website's forms.">
        <button type="button" className="adm-btn" onClick={reload}>Refresh</button>
        <button type="button" className="adm-btn" onClick={exportRows} disabled={rows.length === 0}>Export CSV</button>
      </PageHead>

      <Stats
        items={[
          { label: 'Total', value: count(tabId) },
          { label: 'New', value: count(tabId, 'new') },
          { label: 'Read', value: count(tabId, 'read') },
          { label: 'Resolved', value: count(tabId, 'resolved') },
        ]}
      />

      <div className="adm-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tabId === t.id}
            onClick={() => {
              setTabId(t.id);
              setPage(1);
            }}
          >
            {t.label} <span>{count(t.id)}</span>
          </button>
        ))}
      </div>

      <section className="adm-panel">
        <div className="adm-filters">
          <input type="search" aria-label="Search submissions" placeholder="Search…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          <select aria-label="Filter by status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="all">All Status</option>
            <option value="new">New Only</option>
            <option value="read">Read Only</option>
            <option value="resolved">Resolved Only</option>
          </select>
        </div>

        <LoadState loading={loading} error={error} onRetry={reload} loadingText="Loading submissions..." />

        {items && rows.length === 0 && <p className="adm-empty">No {tab.label.toLowerCase()} yet.</p>}

        {rows.length > 0 && (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Date</th>
                  <th>{tab.nameField}</th>
                  {tab.columns.map((c) => <th key={c}>{c}</th>)}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => (
                  <tr key={s.id} className={s.status === 'new' ? 'adm-row-new' : ''}>
                    <td><Badge tone={STATUS[s.status]?.[1]}>{STATUS[s.status]?.[0]}</Badge></td>
                    <td className="adm-nowrap">{formatDate(s.createdAt)}</td>
                    <td><b>{s.fields?.[tab.nameField] || '—'}</b></td>
                    {tab.columns.map((c) => <td key={c}>{s.fields?.[c] || '—'}</td>)}
                    <td className="adm-actions">
                      <button type="button" className="adm-btn adm-btn-small" onClick={() => openEntry(s)}>View</button>
                      <button type="button" className="adm-btn adm-btn-small adm-btn-danger-line" onClick={() => setDeleting(s)}>Delete</button>
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
          title={tab.label}
          onClose={() => setOpenId(null)}
          footer={
            <>
              {open.status !== 'read' && (
                <button type="button" className="adm-btn" onClick={() => setStatus(open, 'read')}>Mark as Read</button>
              )}
              {open.status !== 'resolved' && (
                <button type="button" className="adm-btn adm-btn-primary" onClick={() => setStatus(open, 'resolved')}>Mark as Resolved</button>
              )}
            </>
          }
        >
          <dl className="adm-details">
            {tab.fields.filter((f) => open.fields?.[f]).map((f) => (
              <div key={f}>
                <dt>{f}</dt>
                <dd>{open.fields[f]}</dd>
              </div>
            ))}
            <div>
              <dt>Submitted On</dt>
              <dd>{formatDate(open.createdAt, true)}</dd>
            </div>
          </dl>
        </Modal>
      )}

      {deleting && (
        <ConfirmDelete
          title="Delete Submission"
          name={deleting.fields?.[tab.nameField] || 'this entry'}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await adminApi.remove('submissions', deleting.id);
            setItems((current) => current.filter((s) => s.id !== deleting.id));
            setDeleting(null);
            showToast('Submission deleted');
          }}
        />
      )}
      <Toast message={toast} />
    </main>
  );
}
