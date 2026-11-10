'use client';

import { useMemo, useState } from 'react';
import { getCampaignGallery, getCampaignStoryBlocks, getCampaignUpdates } from '@/lib/campaign-defaults';
import { adminApi } from '@/lib/admin-api';
import {
  Badge, ConfirmDelete, Field, LoadState, MediaInput, Modal, PageHead, Pager, Stats, Toast,
  SlugField, downloadCsv, formatDate, inr, slugify, useCollection, usePaged, useToast,
} from '../_ui/shared';

const STATUSES = ['Ongoing', 'Active emergency', 'Completed', 'Seasonal'];
const GROUPS = ['Emergency', 'Hunger', 'Healthcare', 'Women', 'Youth', 'Community'];
const TYPES = [['flood', 'Flood / disaster'], ['hunger', 'Hunger / langar'], ['health', 'Health'], ['youth', 'Youth'], ['community', 'Community']];
const DEFAULT_AMOUNTS = [701, 1701, 2701, 5701];
const STORY_PARTS = [1, 2, 3];

const emptyCampaign = () => ({
  title: '', subtitle: '', blurb: '', category: '', group: 'Emergency', type: 'flood', location: '',
  ctaText: 'Donate Now', donateMessage: '', donateHighlight: '', status: 'Ongoing', publishStatus: 'draft', urgent: false,
  raised: 0, goal: 100000, donors: 0, days: null, img: '', tone: '#3E5872',
  donationAmounts: DEFAULT_AMOUNTS, suggestedAmount: 1701, minAmount: 100,
  quote: '', quoteAuthor: '',
});

// The editor shows what the page currently displays, including the standard text and photos.
function toForm(campaign) {
  const isNew = !campaign.slug;
  const story = isNew ? {} : getCampaignStoryBlocks(campaign);
  const gallery = isNew ? [] : getCampaignGallery(campaign);
  const updates = isNew ? [] : getCampaignUpdates(campaign);
  return {
    ...campaign,
    donationAmounts: campaign.donationAmounts || DEFAULT_AMOUNTS,
    suggestedAmount: campaign.suggestedAmount ?? 1701,
    minAmount: campaign.minAmount ?? 100,
    ctaText: campaign.ctaText || 'Donate Now',
    publishStatus: campaign.publishStatus || 'published',
    story,
    gallery,
    updates,
    original: { story, gallery, updates },
  };
}

// Standard content is only saved once someone changes it, so the page keeps following its defaults.
function toRecord(form) {
  const { story, gallery, updates, original, ...rest } = form;
  const changed = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
  const record = {
    ...rest,
    raised: Number(form.raised) || 0,
    goal: Number(form.goal) || 0,
    donors: Number(form.donors) || 0,
    days: form.days === '' || form.days === null ? null : Number(form.days),
    donationAmounts: form.donationAmounts.map(Number),
    suggestedAmount: Number(form.suggestedAmount) || 0,
    minAmount: Number(form.minAmount) || 100,
  };
  if (changed(story, original.story)) record.storyOverride = story;
  if (changed(gallery, original.gallery)) record.gallery = gallery;
  if (changed(updates, original.updates)) {
    record.updates = updates.map((u) => ({ ...u, title: `Update - ${u.date}` }));
  }
  return record;
}

export default function CampaignsPage() {
  const { items, error, loading, reload, setItems } = useCollection('campaigns');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [publishFilter, setPublishFilter] = useState('all');
  const [sortBy, setSortBy] = useState('updatedAt');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [toast, showToast] = useToast();

  const all = useMemo(() => items || [], [items]);
  const publishOf = (c) => c.publishStatus || 'published';

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter(
        (c) =>
          (statusFilter === 'all' || c.status === statusFilter) &&
          (publishFilter === 'all' || publishOf(c) === publishFilter) &&
          (!q || `${c.title} ${c.category} ${c.location}`.toLowerCase().includes(q))
      )
      .sort((a, b) => new Date(b[sortBy] || 0) - new Date(a[sortBy] || 0));
  }, [all, query, statusFilter, publishFilter, sortBy]);

  const { rows: pageRows, page, pageCount, setPage } = usePaged(rows, 15);

  const onSaved = (saved, isNew) => {
    setItems((current) => (isNew ? [saved, ...current] : current.map((c) => (c.slug === saved.slug ? saved : c))));
    setEditing(null);
    showToast(publishOf(saved) === 'published' ? 'Campaign saved and live on this copy of the site' : 'Campaign saved as draft');
  };

  const exportRows = () => {
    downloadCsv(
      'sikhaid-campaigns.csv',
      ['Title', 'Category', 'Status', 'Publish Status', 'Raised', 'Goal', 'Donors', 'Updated'],
      rows.map((c) => [c.title, c.category, c.status, publishOf(c), c.raised, c.goal, c.donors, formatDate(c.updatedAt)])
    );
  };

  return (
    <main className="adm-page">
      <PageHead title="Campaign Management" subtitle="Add, edit or delete campaign pages and their donation cards.">
        <button type="button" className="adm-btn" onClick={exportRows} disabled={rows.length === 0}>Export CSV</button>
        <button type="button" className="adm-btn adm-btn-primary" onClick={() => setEditing(toForm(emptyCampaign()))}>New Campaign</button>
      </PageHead>

      <Stats
        items={[
          { label: 'Total Campaigns', value: all.length },
          { label: 'Ongoing', value: all.filter((c) => c.status !== 'Completed').length },
          { label: 'Completed', value: all.filter((c) => c.status === 'Completed').length },
          { label: 'Drafts', value: all.filter((c) => publishOf(c) === 'draft').length },
        ]}
      />

      <section className="adm-panel">
        <div className="adm-filters">
          <input type="search" aria-label="Search campaigns" placeholder="Search title, category, location…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          <select aria-label="Filter by status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="all">All Status</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select aria-label="Filter by publish status" value={publishFilter} onChange={(e) => { setPublishFilter(e.target.value); setPage(1); }}>
            <option value="all">All Publish Status</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
          <select aria-label="Sort by" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="updatedAt">Updated Date</option>
            <option value="createdAt">Created Date</option>
          </select>
        </div>

        <LoadState loading={loading} error={error} onRetry={reload} loadingText="Loading campaigns..." />
        {items && rows.length === 0 && <p className="adm-empty">No campaigns found.</p>}

        {rows.length > 0 && (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Raised</th>
                  <th>Status</th>
                  <th>Publish Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((c) => (
                  <tr key={c.slug}>
                    <td className="adm-title-cell">
                      <div className="adm-with-thumb">
                        {c.img && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.img} alt="" loading="lazy" />
                        )}
                        <b>{c.title}</b>
                      </div>
                    </td>
                    <td>{c.category}</td>
                    <td className="adm-nowrap">{inr(c.raised)}</td>
                    <td><Badge tone={c.status === 'Completed' ? 'grey' : c.urgent ? 'red' : 'blue'}>{c.status}</Badge></td>
                    <td><Badge tone={publishOf(c) === 'published' ? 'green' : 'grey'}>{publishOf(c) === 'published' ? 'Published' : 'Draft'}</Badge></td>
                    <td className="adm-nowrap">{formatDate(c.updatedAt)}</td>
                    <td className="adm-actions">
                      {publishOf(c) === 'published' && (
                        <a className="adm-btn adm-btn-small" href={`/campaigns/${c.slug}`} target="_blank" rel="noreferrer">View</a>
                      )}
                      <button type="button" className="adm-btn adm-btn-small" onClick={() => setEditing(toForm(c))}>Edit</button>
                      <button type="button" className="adm-btn adm-btn-small adm-btn-danger-line" onClick={() => setDeleting(c)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageCount={pageCount} total={rows.length} onPage={setPage} />
      </section>

      {editing && <CampaignForm initial={editing} onCancel={() => setEditing(null)} onSaved={onSaved} />}

      {deleting && (
        <ConfirmDelete
          title="Delete Campaign"
          name={deleting.title}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await adminApi.remove('campaigns', deleting.slug);
            setItems((current) => current.filter((c) => c.slug !== deleting.slug));
            setDeleting(null);
            showToast('Campaign deleted');
          }}
        />
      )}
      <Toast message={toast} />
    </main>
  );
}

function CampaignForm({ initial, onCancel, onSaved }) {
  const isNew = !initial.slug;
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  // While creating, the slug follows the title until someone edits it by hand.
  const [slugEdited, setSlugEdited] = useState(false);
  const setTitle = (title) =>
    setForm((current) => ({ ...current, title, ...(isNew && !slugEdited ? { slug: slugify(title) } : {}) }));
  const setStory = (field, value) => setForm((current) => ({ ...current, story: { ...current.story, [field]: value } }));
  const setAmount = (index, value) =>
    set('donationAmounts', form.donationAmounts.map((amount, i) => (i === index ? value.replace(/[^0-9]/g, '') : amount)));

  const save = async (e) => {
    e.preventDefault();
    const missing = [['Title', form.title], ['Short Description', form.blurb], ['Category', form.category], ['Location', form.location]]
      .filter(([, value]) => !String(value || '').trim())
      .map(([label]) => label);
    if (missing.length) {
      setError(`Please fill in: ${missing.join(', ')}.`);
      return;
    }
    if (form.donationAmounts.some((a) => Number(a) < Number(form.minAmount))) {
      setError('Each donation amount must be at least the minimum amount.');
      return;
    }
    if (!form.donationAmounts.map(Number).includes(Number(form.suggestedAmount))) {
      setError('Please choose the Suggested Amount again, because the amounts changed.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const record = toRecord(form);
      const saved = isNew ? await adminApi.create('campaigns', record) : await adminApi.update('campaigns', initial.slug, record);
      onSaved(saved, isNew);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title={isNew ? 'New Campaign' : `Edit: ${initial.title}`}
      onClose={onCancel}
      footer={
        <>
          {error && <span className="adm-error adm-foot-error" role="alert">{error}</span>}
          <button type="button" className="adm-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" form="campaign-form" className="adm-btn adm-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save Campaign'}</button>
        </>
      }
    >
      <form id="campaign-form" className="adm-form" onSubmit={save}>
        <Section title="Basic Information">
          <Field label="Title *"><input type="text" value={form.title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <SlugField
            value={form.slug}
            locked={!isNew}
            base="/campaigns/"
            onChange={(slug) => { setSlugEdited(true); set('slug', slug); }}
          />
          <Field label="Subtitle"><input type="text" value={form.subtitle || ''} onChange={(e) => set('subtitle', e.target.value)} /></Field>
          <Field label="Short Description *" hint="The top banner shows its first two sentences.">
            <textarea rows={3} value={form.blurb || ''} onChange={(e) => set('blurb', e.target.value)} />
          </Field>
          <div className="adm-grid-2">
            <Field label="Category *"><input type="text" value={form.category || ''} onChange={(e) => set('category', e.target.value)} /></Field>
            <Field label="Location *"><input type="text" value={form.location || ''} onChange={(e) => set('location', e.target.value)} /></Field>
            <Field label="Campaign Filter Group" hint="Which filter it appears under on the campaigns page.">
              <select value={form.group} onChange={(e) => set('group', e.target.value)}>
                {GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <Field label="Campaign Type" hint="Sets the standard text and photos used when none are added.">
              <select value={form.type} onChange={(e) => set('type', e.target.value)}>
                {TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </Field>
            <Field label="Status *">
              <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Publish Status *" hint="Drafts are hidden from the website.">
              <select value={form.publishStatus} onChange={(e) => set('publishStatus', e.target.value)}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </Field>
          </div>
          <label className="adm-check">
            <input type="checkbox" checked={Boolean(form.urgent)} onChange={(e) => set('urgent', e.target.checked)} />
            Mark as an emergency (red badge)
          </label>
          <MediaInput label="Main Campaign Image" value={form.img} onChange={(url) => set('img', url)} />
        </Section>

        <Section title="Donation Card" hint="What donors see when they press Donate on this campaign.">
          <div className="adm-grid-4">
            {form.donationAmounts.map((amount, index) => (
              <Field key={index} label={`Amount ${index + 1} (₹)`}>
                <input type="text" inputMode="numeric" value={amount} onChange={(e) => setAmount(index, e.target.value)} />
              </Field>
            ))}
          </div>
          <div className="adm-grid-2">
            <Field label="Suggested Amount" hint="Selected first and marked Suggested on the card.">
              <select value={form.suggestedAmount} onChange={(e) => set('suggestedAmount', Number(e.target.value))}>
                {form.donationAmounts.map((amount, index) => <option key={index} value={amount}>{inr(amount)}</option>)}
              </select>
            </Field>
            <Field label="Minimum Amount (₹)">
              <input type="text" inputMode="numeric" value={form.minAmount} onChange={(e) => set('minAmount', e.target.value.replace(/[^0-9]/g, ''))} />
            </Field>
            <Field label="CTA Button Text" hint="The main Donate button on the campaign page.">
              <input type="text" value={form.ctaText} onChange={(e) => set('ctaText', e.target.value)} />
            </Field>
            <Field label="Donate-Page Highlight Line" hint="Short bold line at the top of the card.">
              <input type="text" value={form.donateHighlight || ''} onChange={(e) => set('donateHighlight', e.target.value)} />
            </Field>
          </div>
          <Field label="Donate-Page Message" hint="Short message under the highlight line.">
            <textarea rows={2} value={form.donateMessage || ''} onChange={(e) => set('donateMessage', e.target.value)} />
          </Field>
        </Section>

        <Section title="Fundraising Progress">
          <div className="adm-grid-4">
            <Field label="Raised (₹)"><input type="number" min="0" value={form.raised} onChange={(e) => set('raised', e.target.value)} /></Field>
            <Field label="Goal (₹)"><input type="number" min="0" value={form.goal} onChange={(e) => set('goal', e.target.value)} /></Field>
            <Field label="Donors"><input type="number" min="0" value={form.donors} onChange={(e) => set('donors', e.target.value)} /></Field>
            <Field label="Days Left" hint="Blank if ongoing."><input type="number" min="0" value={form.days ?? ''} onChange={(e) => set('days', e.target.value)} /></Field>
          </div>
        </Section>

        <Section title="Full Description" hint={isNew ? 'Leave a part blank to use the standard text and photo for this campaign type.' : 'Three paragraphs, each followed by a photo card.'}>
          {STORY_PARTS.map((n) => (
            <div className="adm-repeat" key={n}>
              <h4>Part {n}</h4>
              <Field label={`Paragraph ${n}`}>
                <textarea rows={5} value={form.story[`p${n}`] || ''} onChange={(e) => setStory(`p${n}`, e.target.value)} />
              </Field>
              <MediaInput label={`Image ${n}`} value={form.story[`img${n}`]} onChange={(url) => setStory(`img${n}`, url)} />
              <div className="adm-grid-2">
                <Field label="Image Label"><input type="text" value={form.story[`img${n}Tag`] || ''} onChange={(e) => setStory(`img${n}Tag`, e.target.value)} /></Field>
                <Field label="Image Caption"><input type="text" value={form.story[`img${n}Caption`] || ''} onChange={(e) => setStory(`img${n}Caption`, e.target.value)} /></Field>
              </div>
            </div>
          ))}
        </Section>

        <Section title="Quote Card">
          <Field label="Quote"><textarea rows={2} value={form.quote || ''} onChange={(e) => set('quote', e.target.value)} /></Field>
          <Field label="Quote Author"><input type="text" value={form.quoteAuthor || ''} onChange={(e) => set('quoteAuthor', e.target.value)} /></Field>
        </Section>

        <Repeater
          title="Field Updates"
          hint="The newest update goes first."
          items={form.updates}
          blank={{ date: '', desc: '', img: '', verified: '' }}
          onChange={(list) => set('updates', list)}
          render={(item, update) => (
            <>
              <div className="adm-grid-2">
                <Field label="Date"><input type="text" placeholder="18 Oct" value={item.date || ''} onChange={(e) => update({ date: e.target.value })} /></Field>
                <Field label="Verified Label"><input type="text" value={item.verified || ''} onChange={(e) => update({ verified: e.target.value })} /></Field>
              </div>
              <Field label="What happened"><textarea rows={3} value={item.desc || ''} onChange={(e) => update({ desc: e.target.value })} /></Field>
              <MediaInput label="Image" value={item.img} onChange={(url) => update({ img: url })} />
            </>
          )}
        />

        <Repeater
          title="Gallery Images"
          hint={isNew ? 'Leave empty to use the standard photos for this campaign type.' : undefined}
          items={form.gallery}
          blank={{ src: '', caption: '', tag: '' }}
          onChange={(list) => set('gallery', list)}
          render={(item, update) => (
            <>
              <MediaInput label="Image" value={item.src} onChange={(url) => update({ src: url })} />
              <div className="adm-grid-2">
                <Field label="Label"><input type="text" value={item.tag || ''} onChange={(e) => update({ tag: e.target.value })} /></Field>
                <Field label="Caption"><input type="text" value={item.caption || ''} onChange={(e) => update({ caption: e.target.value })} /></Field>
              </div>
            </>
          )}
        />
      </form>
    </Modal>
  );
}

function Section({ title, hint, children }) {
  return (
    <fieldset className="adm-section">
      <legend>{title}</legend>
      {hint && <p className="adm-hint">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Repeater({ title, hint, items, blank, onChange, render }) {
  const replace = (index, patch) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const move = (index, direction) => {
    const next = items.slice();
    const [item] = next.splice(index, 1);
    next.splice(index + direction, 0, item);
    onChange(next);
  };
  return (
    <Section title={`${title} (${items.length})`} hint={hint}>
      {items.map((item, index) => (
        <div className="adm-repeat" key={index}>
          <div className="adm-repeat-bar">
            <h4>{index + 1}</h4>
            <div>
              <button type="button" className="adm-btn adm-btn-small" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up">↑</button>
              <button type="button" className="adm-btn adm-btn-small" disabled={index === items.length - 1} onClick={() => move(index, 1)} aria-label="Move down">↓</button>
              <button type="button" className="adm-btn adm-btn-small adm-btn-danger-line" onClick={() => onChange(items.filter((_, i) => i !== index))}>Remove</button>
            </div>
          </div>
          {render(item, (patch) => replace(index, patch))}
        </div>
      ))}
      <button type="button" className="adm-btn adm-btn-small" onClick={() => onChange([...items, { ...blank }])}>+ Add</button>
    </Section>
  );
}
