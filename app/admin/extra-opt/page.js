'use client';

import { useMemo, useState } from 'react';
import {
  LoadState, PageHead, Pager, Stats, downloadCsv, formatDate, inr, useCollection, usePaged,
} from '../_ui/shared';
import { useAdmin } from '../_ui/AdminGate';
import { donationView } from '@/lib/admin-sections';
import { UTM_FILTERS } from '@/lib/utm-filters';
import { EXTRA_OFFERS } from '@/lib/extra-offers';

// Extra Opt: the "add one more" offer shown on Continue to Payment on the two A/B test pages.
// Langar Sewa offers a blanket (₹800 each); Mission Garmahat offers langar for 8 people (₹800 each).
// Every paid donation from those two campaigns records whether the donor opted in (and how many) or out.

const DAY = 24 * 60 * 60 * 1000;
const dayOf = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const QUICK_DAYS = [
  ['Today', 0, 0], ['Yesterday', 1, 1],
  ...[7, 10, 15, 20, 25, 30].map((n) => [`${n} days`, n - 1, 0]),
];
const sourceText = (utm) => (utm?.utm_source ? `${utm.utm_source} / ${utm.utm_medium || '—'}` : 'Organic / Direct');

export default function ExtraOptPage() {
  const { items, error, loading, reload } = useCollection('donations');
  const { user } = useAdmin();
  const view = donationView(user);
  const [offer, setOffer] = useState('all');
  const [choice, setChoice] = useState('all');
  const [utmFilter, setUtmFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [now] = useState(() => Date.now());

  // Paid donations that were shown the offer.
  const all = useMemo(() => (items || []).filter((d) => d.extra && d.paymentStatus === 'paid'), [items]);

  const rows = useMemo(() => {
    const filter = (view.utm && UTM_FILTERS.find((f) => f.id === utmFilter)) || UTM_FILTERS[0];
    return all
      .filter((d) => {
        if (offer !== 'all' && d.extra.offer !== offer) return false;
        if (choice === 'in' && !d.extra.accepted) return false;
        if (choice === 'out' && d.extra.accepted) return false;
        if (!filter.test(d.utm || {})) return false;
        const day = dayOf(d.createdAt);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [all, offer, choice, utmFilter, from, to, view.utm]);
  const { rows: pageRows, page, pageCount, setPage } = usePaged(rows, 25);

  const optedIn = rows.filter((d) => d.extra.accepted);
  const optedOut = rows.length - optedIn.length;
  const extraTotal = optedIn.reduce((s, d) => s + (Number(d.extra.amount) || 0), 0);
  const qtyOf = (kind) => optedIn.filter((d) => d.extra.offer === kind).reduce((s, d) => s + (Number(d.extra.qty) || 0), 0);
  const blankets = qtyOf('blanket');
  const langar = qtyOf('langar');
  const rate = rows.length ? Math.round((optedIn.length / rows.length) * 100) : 0;
  const reset = (fn) => (e) => { fn(e.target.value); setPage(1); };

  const exportRows = () => {
    const cols = [
      ['Date', (d) => formatDate(d.createdAt, true)],
      ['Donation from', (d) => d.cause],
      ['Page', (d) => d.causeSlug],
      ['Offer', (d) => EXTRA_OFFERS[d.extra.offer]?.label || d.extra.offer],
      ['Choice', (d) => (d.extra.accepted ? 'Opted in' : 'Opted out')],
      ['Quantity', (d) => d.extra.qty || 0],
      ...(view.amount ? [['Extra amount', (d) => d.extra.amount || 0], ['Donation total', (d) => d.grandTotal]] : []),
      ...(view.utm ? [['UTM source', (d) => d.utm?.utm_source || ''], ['UTM medium', (d) => d.utm?.utm_medium || ''], ['UTM campaign', (d) => d.utm?.utm_campaign || '']] : []),
    ];
    downloadCsv('sikhaid-extra-opt.csv', cols.map((c) => c[0]), rows.map((d) => cols.map((c) => c[1](d))));
  };

  return (
    <main className="adm-page">
      <PageHead
        title="Extra Opt"
        subtitle="The offer shown on Continue to Payment on the two test pages: a ₹800 blanket on /campaigns/langar-sewa-testing-1, and ₹800 langar for 8 people on /campaigns/mission-garmahat-testing-1. Paid donations only."
      >
        <button type="button" className="adm-btn" onClick={reload}>Refresh</button>
        <button type="button" className="adm-btn" onClick={exportRows} disabled={rows.length === 0}>Export</button>
      </PageHead>

      <Stats
        items={[
          { label: 'Opted In', value: optedIn.length.toLocaleString('en-IN'), hint: `${rate}% of ${rows.length.toLocaleString('en-IN')} shown the offer`, icon: 'heart' },
          { label: 'Opted Out', value: optedOut.toLocaleString('en-IN'), hint: 'Said no thanks', icon: 'support' },
          ...(view.amount ? [{ label: 'Extra Collected', value: inr(extraTotal), hint: 'From opt-ins', icon: 'rupee' }] : []),
          { label: 'Blankets · Langar', value: `${blankets} · ${langar}`, hint: `${blankets} blankets · langar for ${langar * 8} people`, icon: 'calendar' },
        ]}
      />

      <section className="adm-panel">
        <div className="adm-filters">
          <label className="adm-inline">
            Offer
            <select value={offer} onChange={reset(setOffer)}>
              <option value="all">Both offers</option>
              {Object.entries(EXTRA_OFFERS).map(([key, o]) => <option key={key} value={key}>{o.label} (on {o.fromLabel})</option>)}
            </select>
          </label>
          <label className="adm-inline">
            Choice
            <select value={choice} onChange={reset(setChoice)}>
              <option value="all">Opted in and out</option>
              <option value="in">Opted in</option>
              <option value="out">Opted out</option>
            </select>
          </label>
          {view.utm && (
            <label className="adm-inline">
              UTM Filter
              <select value={utmFilter} onChange={reset(setUtmFilter)}>
                {UTM_FILTERS.filter((f) => f.id === 'all' || !view.utmSources.length || view.utmSources.includes(f.id)).map((f) => (
                  <option key={f.id} value={f.id}>{f.id === 'all' && view.utmSources.length ? 'All my sources' : f.label}</option>
                ))}
              </select>
            </label>
          )}
          <div className="adm-inline adm-dates">
            Date
            <input type="date" aria-label="From date" value={from} max={to || undefined} onChange={reset(setFrom)} />
            <span>to</span>
            <input type="date" aria-label="To date" value={to} min={from || undefined} onChange={reset(setTo)} />
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
        </div>

        <LoadState loading={loading} error={error} onRetry={reload} loadingText="Loading..." />
        {items && rows.length === 0 && (
          <p className="adm-empty">
            {all.length === 0 ? 'No donations with the offer yet. They appear here once someone pays on one of the two test pages.' : 'Nothing matches these filters.'}
          </p>
        )}

        {rows.length > 0 && (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Donation from</th>
                  <th>Offer</th>
                  <th>Choice</th>
                  <th>Quantity</th>
                  {view.amount && <th>Extra amount</th>}
                  {view.amount && <th>Donation total</th>}
                  {view.utm && <th>UTM</th>}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((d) => (
                  <tr key={d.id}>
                    <td className="adm-nowrap">{formatDate(d.createdAt)}</td>
                    <td>{d.cause}<small className="adm-sub">{d.causeSlug}</small></td>
                    <td>{EXTRA_OFFERS[d.extra.offer]?.label || d.extra.offer}</td>
                    <td><b style={{ color: d.extra.accepted ? '#1e6b40' : '#5b617c' }}>{d.extra.accepted ? 'Opted in' : 'Opted out'}</b></td>
                    <td>{d.extra.accepted ? d.extra.qty : '—'}</td>
                    {view.amount && <td className="adm-nowrap">{d.extra.accepted ? inr(d.extra.amount) : '—'}</td>}
                    {view.amount && <td className="adm-nowrap">{inr(d.grandTotal)}</td>}
                    {view.utm && <td className="adm-small">{sourceText(d.utm)}{d.utm?.utm_campaign && <small className="adm-sub">{d.utm.utm_campaign}</small>}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageCount={pageCount} total={rows.length} onPage={setPage} />
      </section>
    </main>
  );
}
