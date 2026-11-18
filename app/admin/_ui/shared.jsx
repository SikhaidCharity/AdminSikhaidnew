'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';

// Lists already loaded in this browser tab, so going back to a page shows it at once
// while the fresh copy loads.
const listCache = new Map();

export function useCollection(name) {
  const [items, setItemsState] = useState(() => listCache.get(name) ?? null);
  const [error, setError] = useState('');
  const setItems = useCallback((next) => {
    setItemsState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      if (value) listCache.set(name, value);
      return value;
    });
  }, [name]);

  const reload = useCallback(async () => {
    setError('');
    try {
      setItems(await adminApi.list(name));
    } catch (e) {
      setError(e.message);
    }
  }, [name, setItems]);

  useEffect(() => {
    let current = true;
    adminApi
      .list(name)
      .then((data) => current && setItems(data))
      .catch((e) => current && setError(e.message));
    return () => {
      current = false;
    };
  }, [name, setItems]);

  return { items, error, reload, setItems, loading: items === null && !error };
}

export const formatDate = (iso, withTime = false) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const options = { day: '2-digit', month: 'short', year: 'numeric' };
  if (withTime) Object.assign(options, { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleString('en-IN', options);
};

export const inr = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

// A leading = + - @ would run as a formula when the file opens in Excel.
const csvCell = (value) => {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export function downloadCsv(filename, headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function PageHead({ title, subtitle, children }) {
  return (
    <header className="adm-head">
      <Link href="/admin" className="adm-back">← Back to Dashboard</Link>
      <div className="adm-head-row">
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {children && <div className="adm-head-actions">{children}</div>}
      </div>
    </header>
  );
}

// Stat cards, colour-coded in turn (navy, green, purple, orange) with a coloured left border.
// An item can set `tone` to pick a colour and `icon` (see STAT_ICONS) for a faint picture.
const TONES = ['navy', 'green', 'purple', 'orange'];
const STAT_ICONS = {
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  rupee: <path d="M7 5h10M7 9h10M9 5c4 0 6 1.6 6 4s-2 4-6 4H8l7 7" />,
  support: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 11l2 2 4-4" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  users: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c3 0 6 1.8 6 5" /></>,
  repeat: <path d="M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3" />,
};
export function Stats({ items }) {
  return (
    <div className="adm-stats">
      {items.map((item, i) => (
        <div className={`adm-stat tone-${item.tone || TONES[i % TONES.length]}`} key={item.label}>
          <span>{item.label}</span>
          <b>{item.value}</b>
          {item.hint && <small>{item.hint}</small>}
          {item.icon && STAT_ICONS[item.icon] && (
            <svg className="adm-stat-icon" viewBox="0 0 24 24" aria-hidden="true">{STAT_ICONS[item.icon]}</svg>
          )}
        </div>
      ))}
    </div>
  );
}

export function Notice({ children }) {
  return <p className="adm-notice">{children}</p>;
}

export function LoadState({ loading, error, onRetry, loadingText }) {
  if (loading) return <p className="adm-empty">{loadingText}</p>;
  if (error) {
    return (
      <div className="adm-empty" role="alert">
        <p>{error}</p>
        <button type="button" className="adm-btn" onClick={onRetry}>Try again</button>
      </div>
    );
  }
  return null;
}

export function Badge({ tone = 'grey', children }) {
  return <span className={`adm-badge adm-badge-${tone}`}>{children}</span>;
}

export function Pager({ page, pageCount, total, onPage }) {
  if (total === 0) return null;
  return (
    <div className="adm-pager">
      <span>Page {page} of {pageCount} · {total} {total === 1 ? 'entry' : 'entries'}</span>
      <div>
        <button type="button" className="adm-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
        <button type="button" className="adm-btn" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

export function usePaged(rows, perPage) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(page, pageCount);
  return {
    page: current,
    pageCount,
    setPage,
    rows: rows.slice((current - 1) * perPage, current * perPage),
  };
}

export function Modal({ title, onClose, children, footer, wide }) {
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="adm-modal-back">
      <div className={`adm-modal ${wide ? 'adm-modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="adm-x" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="adm-modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDelete({ title, name, onCancel, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="adm-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="adm-btn adm-btn-danger" disabled={busy} onClick={confirm}>
            {busy ? 'Deleting…' : 'Confirm Delete'}
          </button>
        </>
      }
    >
      <p>Delete <b>{name}</b>? This cannot be undone.</p>
      {error && <p className="adm-error" role="alert">{error}</p>}
    </Modal>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="adm-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

// Same rule the server uses (lib/local-store.js), so the preview matches the saved address.
export const slugify = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

// Fills itself from the title while creating. Once saved, the address stays fixed so shared links keep working.
export function SlugField({ value, locked, base, onChange }) {
  return (
    <label className="adm-field">
      <span>Slug</span>
      <input
        type="text"
        value={value || ''}
        readOnly={locked}
        placeholder="auto-generated-from-title"
        onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-/, '').slice(0, 80))}
      />
      <small>
        {locked ? 'The page address is fixed once created, so shared links keep working.' : 'Auto-generated from title. You can edit it.'}
        {' '}Preview: <code>{base}{value || 'your-title'}</code>
      </small>
    </label>
  );
}

// Paste a link or upload a file. The saved value is always a plain URL.
export function MediaInput({ label, value, onChange, hint, video = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const { url } = await adminApi.upload(file);
      onChange(url);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  };

  return (
    <div className="adm-field adm-media">
      <span>{label}</span>
      <div className="adm-media-row">
        {value && !video && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="adm-thumb" />
        )}
        {value && video && <video src={value} className="adm-thumb" muted playsInline preload="metadata" />}
        <div className="adm-media-inputs">
          <input
            type="text"
            aria-label={`${label} link`}
            placeholder="Paste a link, or upload a file"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="adm-media-actions">
            <label className="adm-btn adm-btn-small">
              {busy ? 'Uploading…' : 'Upload'}
              <input
                type="file"
                className="adm-file"
                accept={video ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp,image/avif,image/gif'}
                disabled={busy}
                onChange={upload}
              />
            </label>
            {value && (
              <button type="button" className="adm-btn adm-btn-small" onClick={() => onChange('')}>Remove</button>
            )}
          </div>
        </div>
      </div>
      {hint && <small>{hint}</small>}
      {error && <small className="adm-error" role="alert">{error}</small>}
    </div>
  );
}

export function Toast({ message }) {
  if (!message) return null;
  return <div className="adm-toast" role="status">{message}</div>;
}

export function useToast() {
  const [message, setMessage] = useState('');
  const timer = useRef(null);
  const show = useCallback((text) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 2600);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [message, show];
}

// "Donated Towards": General Fund plus every campaign by name. A saved value that is no longer
// a campaign (an older entry) stays in the list so it isn't lost.
export function CampaignSelect({ value, onChange, label = 'Donated Towards' }) {
  const { items, error } = useCollection('campaigns');
  const names = (items || [])
    .filter((c) => c.publishStatus !== 'draft')
    .sort((a, b) => Number(a.status === 'Completed') - Number(b.status === 'Completed'))
    .map((c) => ({ title: c.title, done: c.status === 'Completed' }));
  const known = ['General Fund', ...names.map((n) => n.title)];
  return (
    <Field label={label} hint={error ? 'Campaign list could not load. Showing General Fund only.' : undefined}>
      <select value={value || 'General Fund'} onChange={(e) => onChange(e.target.value)}>
        <option value="General Fund">General Fund</option>
        {names.map((n) => (
          <option key={n.title} value={n.title}>{n.title}{n.done ? ' (completed)' : ''}</option>
        ))}
        {value && !known.includes(value) && <option value={value}>{value}</option>}
        {!items && !error && <option disabled>Loading campaigns…</option>}
      </select>
    </Field>
  );
}

// Keeps a page in step with the live site: checks for new payments and form entries every
// 15 seconds while the page is open and visible, and calls onNew() when something arrived.
export function useLiveSync(onNew) {
  const [state, setState] = useState({ last: null, busy: false, message: '' });
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  useEffect(() => {
    let stop = false;
    adminApi.liveSync.last().then(({ last }) => !stop && setState((s) => ({ ...s, last }))).catch(() => {});
    const tick = async () => {
      if (document.hidden) return;
      try {
        const r = await adminApi.liveSync.run();
        if (stop) return;
        if (r.last) setState((s) => ({ ...s, last: r.last }));
        if (r.newDonations || r.newForms || r.monthlyUpdated) onNewRef.current?.(r);
      } catch {}
    };
    const first = setTimeout(tick, 1500);
    const timer = setInterval(tick, 15000);
    const onShow = () => !document.hidden && tick();
    document.addEventListener('visibilitychange', onShow);
    return () => { stop = true; clearTimeout(first); clearInterval(timer); document.removeEventListener('visibilitychange', onShow); };
  }, []);

  // The full check (Donations → "Check everything").
  const checkAll = async () => {
    setState((s) => ({ ...s, busy: true, message: '' }));
    try {
      const r = await adminApi.liveSync.run(true);
      const message = r.newDonations || r.newForms || r.monthlyUpdated
        ? `Added ${r.newDonations} donation${r.newDonations === 1 ? '' : 's'} (${inr(r.newAmount)}), ${r.newForms} form entr${r.newForms === 1 ? 'y' : 'ies'}; updated ${r.monthlyUpdated} monthly.`
        : 'Everything is already here.';
      setState({ last: r.last || r, busy: false, message });
      onNewRef.current?.(r);
    } catch (err) {
      setState((s) => ({ ...s, busy: false, message: err.message }));
    }
  };
  return { ...state, checkAll };
}

const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
export function LiveSyncNote({ sync, what = 'Donations' }) {
  const checked = sync.last?.checkedAt || sync.last?.at;
  return (
    <Notice>
      {what} from the live site (sikhaid.ngo) appear here automatically within seconds of being made.
      {checked ? ` Last checked ${formatDate(checked)} ${clock(checked)}.` : ''}
      {sync.message ? ` ${sync.message}` : ''}
    </Notice>
  );
}
