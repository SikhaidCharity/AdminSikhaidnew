'use client';

import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/admin-api';
import {
  LiveSyncNote, LoadState, Modal, Notice, PageHead, Pager, Stats,
  downloadCsv, formatDate, inr, useCollection, useLiveSync, usePaged,
} from '../_ui/shared';
import { useAdmin } from '../_ui/AdminGate';
import { donationView } from '@/lib/admin-sections';
import { UTM_FILTERS } from '@/lib/utm-filters';

const DAY = 24 * 60 * 60 * 1000;
// Quick date buttons: [label, first day back, last day back] (0 = today). "7 days" is today and the 6 before.
const QUICK_DAYS = [
  ['Today', 0, 0], ['Yesterday', 1, 1],
  ...[7, 10, 15, 20, 25, 30].map((n) => [`${n} days`, n - 1, 0]),
];
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

// Ad campaign names (utm_campaign) put together by what they are for: every Langar ad under Langar Sewa,
// every winter ad under Mission Garmahat, and so on. A name that fits none goes under Other.
const CAMPAIGN_GROUPS = [
  ['Langar Sewa', /langar/i],
  ['Mission Garmahat (Winter)', /winter|garm|gharam|blanket/i],
  ['Nepal Flood', /nepal/i],
  ['Bihar Flood', /bihar/i],
  ['Assam Flood', /assam/i],
  ['Punjab Flood', /punjab/i],
  ['No Spot', /no_?spot|nospot/i],
];
const campaignGroup = (name) => CAMPAIGN_GROUPS.find(([, re]) => re.test(name))?.[0] || 'Other';
// The pick is '' (all), 'g:<group>' (every ad name in that group) or 'c:<name>' (one ad name).
const campaignMatch = (d, pick) => {
  if (!pick) return true;
  const name = d.utm?.utm_campaign || '';
  if (!name) return false;
  return pick.startsWith('g:') ? campaignGroup(name) === pick.slice(2) : name === pick.slice(2);
};

export default function DonationsPage() {
  const { items, error, loading, reload, setItems } = useCollection('donations');
  const [query, setQuery] = useState('');
  const [utmFilter, setUtmFilter] = useState('all');
  // Campaign name (utm_campaign) and ad type (utm_medium: Video, VA, IMG…), both '' for all.
  const [utmCampaign, setUtmCampaign] = useState('');
  const [utmType, setUtmType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // When the page opened: the quick date buttons count back from it.
  const [now] = useState(() => Date.now());
  const [perPage, setPerPage] = useState(25);
  const [open, setOpen] = useState(null);
  const [sending, setSending] = useState(null);
  const sync = useLiveSync(reload);
  // What this user may see (User Management). The server also leaves out the hidden parts.
  const { user } = useAdmin();
  const view = donationView(user);
  const canSend = view.details && view.amount;

  // Monthly sign-ups (mandates) are listed under Monthly Donations, as in the live site's admin.
  const all = useMemo(() => (items || []).filter((d) => d.paymentStatus !== 'mandate'), [items]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filter = (view.utm && UTM_FILTERS.find((f) => f.id === utmFilter)) || UTM_FILTERS[0];
    return all.filter((d) => {
      if (!filter.test(d.utm || {})) return false;
      if (view.utm && !campaignMatch(d, utmCampaign)) return false;
      if (view.utm && utmType && (d.utm?.utm_medium || '') !== utmType) return false;
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
  }, [all, query, utmFilter, utmCampaign, utmType, from, to, view.utm]);

  const { rows: pageRows, page, pageCount, setPage } = usePaged(rows, perPage);
  const sum = (list, field) => list.reduce((total, d) => total + (Number(d[field]) || 0), 0);
  // The cards follow the filters: the chosen dates, ad source and search (and only this user's sources).
  const sourceRows = useMemo(() => {
    const filter = (view.utm && UTM_FILTERS.find((f) => f.id === utmFilter)) || UTM_FILTERS[0];
    return all.filter((d) => filter.test(d.utm || {})
      && (!view.utm || campaignMatch(d, utmCampaign))
      && (!view.utm || !utmType || (d.utm?.utm_medium || '') === utmType));
  }, [all, utmFilter, utmCampaign, utmType, view.utm]);
  // The names and types to choose from: only those in the donations this user can see within the chosen dates,
  // so a campaign that has ended drops out when its dates are not picked. Most donations first.
  const utmOptions = useMemo(() => {
    const filter = (view.utm && UTM_FILTERS.find((f) => f.id === utmFilter)) || UTM_FILTERS[0];
    const inDates = (d) => {
      if (!from && !to) return true;
      const day = dayOf(d.createdAt);
      return !(from && day < from) && !(to && day > to);
    };
    const base = all.filter((d) => filter.test(d.utm || {}) && inDates(d));
    const groups = new Map();
    base.forEach((d) => {
      const name = d.utm?.utm_campaign;
      if (!name || (utmType && (d.utm?.utm_medium || '') !== utmType)) return;
      const key = campaignGroup(name);
      const g = groups.get(key) || { n: 0, amount: 0, names: new Map() };
      g.n += 1;
      g.amount += Number(d.grandTotal) || 0;
      g.names.set(name, (g.names.get(name) || 0) + 1);
      groups.set(key, g);
    });
    const types = new Map();
    base.forEach((d) => {
      const type = d.utm?.utm_medium;
      if (type && campaignMatch(d, utmCampaign)) types.set(type, (types.get(type) || 0) + 1);
    });
    return {
      groups: [...groups].sort((x, y) => (x[0] === 'Other') - (y[0] === 'Other') || y[1].n - x[1].n)
        .map(([name, g]) => ({ name, n: g.n, amount: g.amount, names: [...g.names].sort((x, y) => y[1] - x[1]) })),
      types: [...types].sort((x, y) => y[1] - x[1]),
    };
  }, [all, utmFilter, utmCampaign, utmType, from, to, view.utm]);
  const campaignPicks = utmOptions.groups.flatMap((g) => [`g:${g.name}`, ...g.names.map(([v]) => `c:${v}`)]);
  const last30 = sourceRows.filter((d) => new Date(d.createdAt).getTime() >= new Date().getTime() - 30 * DAY);
  const filterName = [
    utmFilter !== 'all' ? UTM_FILTERS.find((f) => f.id === utmFilter)?.label : view.utmSources.length ? 'All my sources' : 'All sources',
    view.utm && utmType,
    view.utm && utmCampaign.slice(2),
  ].filter(Boolean).join(' · ');
  const dayText = (day) => formatDate(`${day}T12:00:00`);
  const period = from && to ? (from === to ? dayText(from) : `${dayText(from)} – ${dayText(to)}`) : from ? `From ${dayText(from)}` : to ? `Up to ${dayText(to)}` : 'All dates';

  // Only the columns this user may see.
  const exportRows = () => {
    const cols = [
      ...(view.details ? [['Receipt', (d) => d.receiptNo]] : []),
      ['Date', (d) => formatDate(d.createdAt, true)],
      ...(view.details ? [['Donor Name', (d) => d.donor?.name], ['Email', (d) => d.donor?.email], ['Phone', (d) => d.donor?.phone], ['PAN', (d) => d.donor?.pan]] : []),
      ['Campaign', (d) => d.cause],
      ['Payment Type', (d) => (d.isMonthly ? 'Monthly Recurring' : 'One-Time Donation')],
      ...(view.amount ? [['To the cause', (d) => d.amount], ['Support to SikhAid', (d) => d.tipAmt], ['Total', (d) => d.grandTotal]] : []),
      ...(view.details ? [['Payment ID', (d) => d.razorpayPaymentId]] : []),
      ...(view.utm
        ? [['UTM Source', (d) => d.utm?.utm_source], ['UTM Medium', (d) => d.utm?.utm_medium], ['UTM Campaign', (d) => d.utm?.utm_campaign], ['UTM Term', (d) => d.utm?.utm_term], ['UTM Content', (d) => d.utm?.utm_content]]
        : []),
    ];
    downloadCsv('sikhaid-donations.csv', cols.map((c) => c[0]), rows.map((d) => cols.map((c) => c[1](d))));
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
          { label: 'Total Donations', value: rows.length.toLocaleString('en-IN'), hint: `${period} · ${filterName}`, icon: 'heart' },
          ...(view.amount
            ? [
                { label: 'Total Amount', value: inr(sum(rows, 'grandTotal')), hint: `${period} · ${filterName}`, icon: 'rupee' },
                { label: 'SikhAid Support Earned', value: inr(sum(rows, 'tipAmt')), hint: 'Included in Total Amount', icon: 'support' },
                { label: 'Last 30 Days', value: inr(sum(last30, 'grandTotal')), hint: filterName, icon: 'calendar' },
              ]
            : [{ label: 'Last 30 Days', value: last30.length.toLocaleString('en-IN'), hint: `Donations · ${filterName}`, icon: 'calendar' }]),
        ]}
      />

      <section className="adm-panel">
        <div className="adm-filters">
          <input type="search" aria-label="Search donations" placeholder={view.details ? 'Search name, email, phone, PAN, receipt…' : 'Search campaign…'} value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          {view.utm && (
          <label className="adm-inline">
            UTM Filter
            <select value={utmFilter} onChange={(e) => { setUtmFilter(e.target.value); setPage(1); }}>
              {UTM_FILTERS.filter((f) => f.id === 'all' || !view.utmSources.length || view.utmSources.includes(f.id)).map((f) => (
                <option key={f.id} value={f.id}>{f.id === 'all' && view.utmSources.length ? 'All my sources' : f.label}</option>
              ))}
            </select>
          </label>
          )}
          {view.utm && (
          <label className="adm-inline">
            Campaign name
            <select className="adm-utm-pick" value={utmCampaign} onChange={(e) => { setUtmCampaign(e.target.value); setPage(1); }}>
              <option value="">All campaigns</option>
              {utmCampaign && !campaignPicks.includes(utmCampaign) && <option value={utmCampaign}>{utmCampaign.slice(2)} (0 in these dates)</option>}
              {utmOptions.groups.map((g) => <option key={g.name} value={`g:${g.name}`}>{g.name} ({g.n})</option>)}
            </select>
          </label>
          )}
          {view.utm && (
          <label className="adm-inline">
            Type
            <select value={utmType} onChange={(e) => { setUtmType(e.target.value); setPage(1); }}>
              <option value="">All types</option>
              {utmType && !utmOptions.types.some(([v]) => v === utmType) && <option value={utmType}>{utmType} (0)</option>}
              {utmOptions.types.map(([v, n]) => <option key={v} value={v}>{v} ({n})</option>)}
            </select>
          </label>
          )}
          <div className="adm-inline adm-dates">
            Date
            <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            <span>to</span>
            <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
            {(from || to) && <button type="button" className="adm-link" onClick={() => { setFrom(''); setTo(''); setPage(1); }}>Clear</button>}
          </div>
          <div className="adm-quick-days" role="group" aria-label="Quick dates">
            {QUICK_DAYS.map(([label, back, end]) => {
              const start = dayOf(new Date(now - back * DAY));
              const stop = dayOf(new Date(now - end * DAY));
              const on = from === start && to === stop;
              return (
                <button key={label} type="button" aria-pressed={on} onClick={() => { setFrom(on ? '' : start); setTo(on ? '' : stop); setPage(1); }}>
                  {label}
                </button>
              );
            })}
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
            Filtered donations: <b>{rows.length}</b>
            {view.amount && <> · Filtered amount: <b>{inr(sum(rows, 'grandTotal'))}</b></>}
          </p>
        )}

        {view.utm && utmOptions.groups.length > 0 && (
          // Every ad campaign put together by cause, for the chosen dates, ad source and type. Tap one to list it.
          <div className="adm-table-wrap adm-campaign-sum">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Campaign ({period})</th>
                  <th>Donations</th>
                  {view.amount && <th>Amount</th>}
                  <th>Ads</th>
                </tr>
              </thead>
              <tbody>
                {utmOptions.groups.map((g) => {
                  const on = utmCampaign === `g:${g.name}`;
                  return (
                    <tr key={g.name} className={on ? 'adm-row-on' : undefined}>
                      <td>
                        <button type="button" className="adm-link" aria-pressed={on} onClick={() => { setUtmCampaign(on ? '' : `g:${g.name}`); setPage(1); }}>
                          {g.name}
                        </button>
                      </td>
                      <td>{g.n.toLocaleString('en-IN')}</td>
                      {view.amount && <td><b>{inr(g.amount)}</b></td>}
                      <td title={g.names.map(([v]) => v).join('\n')}>{g.names.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <LoadState loading={loading} error={error} onRetry={reload} loadingText="Loading donations..." />
        {items && rows.length === 0 && <p className="adm-empty">No matching donations found</p>}

        {rows.length > 0 && (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  {view.details && <th>Receipt</th>}
                  <th>Date</th>
                  {view.details && <th>Donor Name</th>}
                  {view.details && <th>Phone</th>}
                  <th>{view.utm ? 'Campaign / UTM' : 'Campaign'}</th>
                  {view.amount && <th>Amount</th>}
                  {view.details && <th>Payment ID</th>}
                  {view.details && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((d) => (
                  <tr key={d.id}>
                    {view.details && <td className="adm-nowrap adm-small">{d.receiptNo}</td>}
                    <td className="adm-nowrap">{formatDate(d.createdAt)}<small className="adm-sub">{timeOf(d.createdAt)}</small>{d.test && <small className="adm-sub adm-test">Test payment</small>}</td>
                    {view.details && <td><b>{d.donor?.name || '—'}</b></td>}
                    {view.details && <td className="adm-nowrap">{d.donor?.phone || '—'}</td>}
                    <td>
                      {d.cause}
                      {view.utm && <small className="adm-sub">{d.utm?.utm_source ? `${d.utm.utm_source} / ${d.utm.utm_medium || '—'}` : 'Organic / Direct'}</small>}
                      {view.utm && d.utm?.utm_campaign && <small className="adm-sub" title="UTM campaign">{d.utm.utm_campaign}</small>}
                      {!view.amount && d.isMonthly && <small className="adm-sub">Monthly</small>}
                    </td>
                    {view.amount && <td className="adm-nowrap">
                      <b>{inr(d.grandTotal)}</b>
                      {d.international && <small className="adm-sub">{d.currency} {Number(d.foreignTotal || 0).toLocaleString('en-IN')} · International</small>}
                      {d.isMonthly && <small className="adm-sub">Monthly</small>}
                    </td>}
                    {view.details && <td className="adm-small">{d.razorpayPaymentId || '—'}</td>}
                    {view.details && <td className="adm-actions">
                      <button type="button" className="adm-btn adm-btn-small" onClick={() => setOpen(d)}>Details</button>
                      {canSend && (
                        <>
                          <a className="adm-btn adm-btn-small" href={adminApi.receipts.pdfUrl(d.id)} title="Receipt, plus the 80G certificate for ₹2,000 or more">PDF</a>
                          <button type="button" className={`adm-btn adm-btn-small${d.whatsapp?.status === 'sent' ? ' adm-btn-sent' : ''}`} onClick={() => setSending(d)} title={whatsappText(d.whatsapp)}>
                            {d.whatsapp?.status === 'sent' ? 'Sent ✓' : 'Send'}
                          </button>
                        </>
                      )}
                    </td>}
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

      {open && view.details && (
        <Modal
          title="Donor Lead Profile & Attribution"
          onClose={() => setOpen(null)}
          footer={
            <>
              <button type="button" className="adm-btn" onClick={() => setOpen(null)}>Close Details</button>
              {canSend && <button type="button" className="adm-btn" onClick={() => setSending(open)}>Send on WhatsApp</button>}
              {canSend && <a className="adm-btn adm-btn-primary" href={adminApi.receipts.pdfUrl(open.id)}>Download PDF</a>}
            </>
          }
        >
          <dl className="adm-details adm-details-two">
            {view.amount && <Row label="Donation Amount" value={inr(open.grandTotal)} />}
            {view.amount && <Row label="To the cause" value={inr(open.amount)} />}
            {view.amount && <Row label="Support to SikhAid" value={inr(open.tipAmt)} />}
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
            {view.utm && (
              <>
                <Row label="UTM Source" value={open.utm?.utm_source} />
                <Row label="UTM Medium" value={open.utm?.utm_medium} />
                <Row label="Campaign Name" value={open.utm?.utm_campaign} />
                <Row label="UTM Term / Keywords" value={open.utm?.utm_term} />
                <Row label="UTM Content / Variant" value={open.utm?.utm_content} />
              </>
            )}
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
