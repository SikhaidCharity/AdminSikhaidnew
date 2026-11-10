'use client';

import { useMemo, useState } from 'react';
import { adminApi } from '@/lib/admin-api';
import {
  Badge, ConfirmDelete, Field, LoadState, MediaInput, Modal, PageHead, Stats, Toast,
  useCollection, useToast,
} from '../_ui/shared';

// The "Support From" section on the home page has two parts, each with its own entries.
const SECTIONS = [
  {
    collection: 'celebCards',
    tab: 'Image Cards',
    single: 'Image Card',
    about: 'The small square cards in the 3×3 grid on the left.',
  },
  {
    collection: 'celebBigCards',
    tab: 'Big Cards',
    single: 'Big Card',
    about: 'The large slides on the right that change every 5 seconds.',
  },
];

export default function CelebritySupportPage() {
  const [tab, setTab] = useState(SECTIONS[0].collection);
  const section = SECTIONS.find((s) => s.collection === tab);

  return (
    <main className="adm-page">
      <PageHead title="Celebrity Support" subtitle="Celebrities and personalities who have supported SikhAid, shown in the &quot;Support From&quot; section on the home page.">
        <a className="adm-btn" href="/#support-from" target="_blank" rel="noreferrer">View on home page</a>
      </PageHead>

      <div className="adm-tabs" role="tablist" aria-label="Celebrity Support sections">
        {SECTIONS.map((s) => (
          <button
            key={s.collection}
            type="button"
            role="tab"
            aria-selected={tab === s.collection}
            className={`adm-tab${tab === s.collection ? ' adm-tab-on' : ''}`}
            onClick={() => setTab(s.collection)}
          >
            {s.tab}
          </button>
        ))}
      </div>

      {/* key resets the list when switching tabs */}
      <CardList key={section.collection} section={section} />
    </main>
  );
}

function CardList({ section }) {
  const { collection, single, about } = section;
  const { items, error, loading, reload, setItems } = useCollection(collection);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [toast, showToast] = useToast();
  const all = useMemo(() => items || [], [items]);

  const saveOrder = async (next) => {
    setItems(next);
    try {
      await adminApi.saveAll(collection, next);
    } catch (e) {
      showToast(e.message);
      reload();
    }
  };

  const move = (index, direction) => {
    const next = all.slice();
    const [card] = next.splice(index, 1);
    next.splice(index + direction, 0, card);
    saveOrder(next);
  };

  return (
    <>
      <Stats
        items={[
          { label: `Total ${section.tab}`, value: all.length },
          { label: 'Shown', value: all.filter((c) => c.active).length },
          { label: 'Hidden', value: all.filter((c) => !c.active).length },
        ]}
      />

      <section className="adm-panel">
        <div className="adm-panel-head">
          <p className="adm-muted">{about}</p>
          <button type="button" className="adm-btn adm-btn-primary" onClick={() => setEditing({ name: '', image: '', active: true })}>
            + Add {single}
          </button>
        </div>

        <LoadState loading={loading} error={error} onRetry={reload} loadingText="Loading..." />

        {items && all.length === 0 && (
          <div className="adm-empty"><p>No {section.tab.toLowerCase()} yet</p></div>
        )}

        {all.length > 0 && (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Image</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {all.map((c, index) => (
                  <tr key={c.id}>
                    <td className="adm-actions">
                      <button type="button" className="adm-btn adm-btn-small" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move ${c.name} up`}>↑</button>
                      <button type="button" className="adm-btn adm-btn-small" disabled={index === all.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${c.name} down`}>↓</button>
                    </td>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <td><img className={`adm-card-thumb${collection === 'celebBigCards' ? ' adm-card-big' : ''}`} src={c.image} alt="" loading="lazy" /></td>
                    <td><b>{c.name}</b></td>
                    <td><Badge tone={c.active ? 'green' : 'grey'}>{c.active ? 'Shown' : 'Hidden'}</Badge></td>
                    <td className="adm-actions">
                      <button type="button" className="adm-btn adm-btn-small" onClick={() => setEditing(c)}>Edit</button>
                      <button type="button" className="adm-btn adm-btn-small adm-btn-danger-line" onClick={() => setDeleting(c)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <CardForm
          card={editing}
          collection={collection}
          single={single}
          onCancel={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            setEditing(null);
            showToast('Saved');
            // A new card goes at the end, not the start.
            if (isNew) saveOrder([...all, saved]);
            else setItems((current) => current.map((c) => (c.id === saved.id ? saved : c)));
          }}
        />
      )}

      {deleting && (
        <ConfirmDelete
          title={`Delete ${single}`}
          name={deleting.name}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await adminApi.remove(collection, deleting.id);
            setItems((current) => current.filter((c) => c.id !== deleting.id));
            setDeleting(null);
            showToast('Deleted');
          }}
        />
      )}
      <Toast message={toast} />
    </>
  );
}

function CardForm({ card, collection, single, onCancel, onSaved }) {
  const isNew = !card.id;
  const [form, setForm] = useState(card);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.image) {
      setError('Please add a name and an image.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = isNew ? await adminApi.create(collection, form) : await adminApi.update(collection, card.id, form);
      onSaved(saved, isNew);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={isNew ? `Add ${single}` : `Edit ${single}`}
      onClose={onCancel}
      footer={
        <>
          {error && <span className="adm-error adm-foot-error" role="alert">{error}</span>}
          <button type="button" className="adm-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" form="card-form" className="adm-btn adm-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </>
      }
    >
      <form id="card-form" className="adm-form" onSubmit={save}>
        <Field label="Name *" hint="Who is in the picture. Used as the image description for screen readers.">
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <MediaInput
          label={`${single} Image *`}
          hint={collection === 'celebBigCards' ? 'Tall portrait image works best.' : 'Square image works best.'}
          value={form.image}
          onChange={(url) => set('image', url)}
        />
        <label className="adm-check">
          <input type="checkbox" checked={Boolean(form.active)} onChange={(e) => set('active', e.target.checked)} />
          Show on the website
        </label>
      </form>
    </Modal>
  );
}
