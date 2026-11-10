'use client';

import { useMemo, useState } from 'react';
import { adminApi } from '@/lib/admin-api';
import { Field, MediaInput, Toast, useToast } from '../_ui/shared';

// One home-page section: its own Save button, saving only that part of the home page settings.
function SectionForm({ title, about, value, saved, onSave, children }) {
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await onSave();
      showToast(`${title} saved. Check it on the home page.`);
    } catch (err) {
      showToast(err.message);
    }
    setBusy(false);
  };

  return (
    <form className="adm-form adm-panel adm-panel-pad" onSubmit={submit}>
      <fieldset className="adm-section">
        <legend>{title}</legend>
        {about && <p className="adm-hint">{about}</p>}
        {children}
      </fieldset>
      <div className="adm-save-bar">
        {dirty && <span>You have unsaved changes</span>}
        <button type="submit" className="adm-btn adm-btn-primary" disabled={busy || !dirty}>{busy ? 'Saving…' : `Save ${title}`}</button>
      </div>
      <Toast message={toast} />
    </form>
  );
}

const moveItem = (list, index, direction) => {
  const next = list.slice();
  const [item] = next.splice(index, 1);
  next.splice(index + direction, 0, item);
  return next;
};

function OrderButtons({ index, length, onMove, onDelete, name }) {
  return (
    <div className="adm-row-buttons">
      <button type="button" className="adm-btn adm-btn-small" disabled={index === 0} onClick={() => onMove(index, -1)} aria-label={`Move ${name} up`}>↑</button>
      <button type="button" className="adm-btn adm-btn-small" disabled={index === length - 1} onClick={() => onMove(index, 1)} aria-label={`Move ${name} down`}>↓</button>
      {onDelete && <button type="button" className="adm-btn adm-btn-small adm-btn-danger-line" onClick={() => onDelete(index)}>Delete</button>}
    </div>
  );
}

// Relief In Action: pick exactly which three campaigns show in the red strip under the hero.
export function ReliefSection({ home, campaigns, save }) {
  const [picks, setPicks] = useState(() => [0, 1, 2].map((i) => home.reliefCampaigns?.[i] || ''));
  const options = campaigns.filter((c) => c.publishStatus !== 'draft');

  return (
    <SectionForm
      title="Relief In Action"
      about="The three campaigns in the red strip just under the hero. Choose one for each spot."
      value={picks}
      saved={[0, 1, 2].map((i) => home.reliefCampaigns?.[i] || '')}
      onSave={() => save({ reliefCampaigns: picks.filter(Boolean) })}
    >
      {picks.map((slug, i) => (
        <Field key={i} label={`Spot ${i + 1}`}>
          <select value={slug} onChange={(e) => setPicks(picks.map((p, j) => (j === i ? e.target.value : p)))}>
            <option value="">— Leave empty —</option>
            {options.map((c) => (
              <option key={c.slug} value={c.slug} disabled={picks.includes(c.slug) && c.slug !== slug}>
                {c.title}{c.status ? ` (${c.status})` : ''}
              </option>
            ))}
          </select>
        </Field>
      ))}
    </SectionForm>
  );
}

// Our Campaigns: the order the campaign cards appear in, first to last.
export function CampaignOrderSection({ home, campaigns, save }) {
  // Only campaigns the home page actually shows: published and not completed.
  const shown = useMemo(() => campaigns.filter((c) => c.publishStatus !== 'draft' && c.status !== 'Completed'), [campaigns]);
  const initial = useMemo(() => {
    const order = home.campaignOrder || [];
    const rank = (c) => (order.indexOf(c.slug) === -1 ? Number.MAX_SAFE_INTEGER : order.indexOf(c.slug));
    return [...shown].sort((a, b) => rank(a) - rank(b)).map((c) => c.slug);
  }, [home.campaignOrder, shown]);
  const [order, setOrder] = useState(initial);
  const titleOf = (slug) => shown.find((c) => c.slug === slug)?.title || slug;

  return (
    <SectionForm
      title="Our Campaigns"
      about="The campaign cards on the home page, first to last. Use the arrows to move a campaign. Completed and draft campaigns are not shown on the home page."
      value={order}
      saved={initial}
      onSave={() => save({ campaignOrder: order })}
    >
      <ol className="adm-order-list">
        {order.map((slug, i) => (
          <li key={slug}>
            <span className="adm-order-num">{i + 1}</span>
            <b>{titleOf(slug)}</b>
            <div className="adm-row-buttons">
              <button type="button" className="adm-btn adm-btn-small" disabled={i === 0} onClick={() => setOrder([slug, ...order.filter((s) => s !== slug)])}>Top</button>
              <OrderButtons index={i} length={order.length} name={titleOf(slug)} onMove={(index, dir) => setOrder(moveItem(order, index, dir))} />
            </div>
          </li>
        ))}
      </ol>
    </SectionForm>
  );
}

// Our Process: heading, intro and the step cards.
export function ProcessSection({ home, save }) {
  const [process, setProcess] = useState(home.process);
  const set = (field, value) => setProcess((p) => ({ ...p, [field]: value }));
  const setStep = (index, patch) => set('steps', process.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  return (
    <SectionForm
      title="Our Process"
      about="The “How We Respond To A Crisis” step cards. Cards are numbered automatically in this order."
      value={process}
      saved={home.process}
      onSave={() => save({ process: { ...process, steps: process.steps.filter((s) => s.title.trim()) } })}
    >
      <Field label="Heading"><input type="text" value={process.title} onChange={(e) => set('title', e.target.value)} /></Field>
      <Field label="Intro line"><textarea rows={2} value={process.intro} onChange={(e) => set('intro', e.target.value)} /></Field>

      {process.steps.map((step, i) => (
        <div className="adm-repeat" key={i}>
          <div className="adm-repeat-bar">
            <b>Step {i + 1}</b>
            <OrderButtons
              index={i}
              length={process.steps.length}
              name={`step ${i + 1}`}
              onMove={(index, dir) => set('steps', moveItem(process.steps, index, dir))}
              onDelete={(index) => set('steps', process.steps.filter((_, j) => j !== index))}
            />
          </div>
          <div className="adm-grid-2">
            <Field label="Title *"><input type="text" value={step.title} onChange={(e) => setStep(i, { title: e.target.value })} /></Field>
            <Field label="Time badge" hint="e.g. Within 2 Hours. Leave empty to hide."><input type="text" value={step.time} onChange={(e) => setStep(i, { time: e.target.value })} /></Field>
          </div>
          <Field label="Description"><textarea rows={2} value={step.description} onChange={(e) => setStep(i, { description: e.target.value })} /></Field>
          <Field label="Action line" hint="Shown after “Action:”. Leave empty to hide."><input type="text" value={step.action} onChange={(e) => setStep(i, { action: e.target.value })} /></Field>
        </div>
      ))}
      <button type="button" className="adm-btn adm-btn-small adm-add" onClick={() => set('steps', [...process.steps, { time: '', title: '', description: '', action: '' }])}>
        + Add step
      </button>
    </SectionForm>
  );
}

// Our Impact: the photo gallery and its filter buttons.
export function ImpactSection({ home, save }) {
  const [photos, setPhotos] = useState(home.impactPhotos || []);
  const setPhoto = (index, patch) => setPhotos(photos.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const categories = [...new Set(photos.map((p) => p.category).filter(Boolean))];

  return (
    <SectionForm
      title="Our Impact"
      about="The photo gallery near the bottom of the home page. The filter buttons are made from the categories you type."
      value={photos}
      saved={home.impactPhotos || []}
      onSave={() => save({ impactPhotos: photos.filter((p) => p.image) })}
    >
      <datalist id="impact-categories">
        {categories.map((c) => <option key={c} value={c} />)}
      </datalist>
      {photos.map((photo, i) => (
        <div className="adm-repeat" key={i}>
          <div className="adm-repeat-bar">
            <b>Photo {i + 1}</b>
            <OrderButtons
              index={i}
              length={photos.length}
              name={`photo ${i + 1}`}
              onMove={(index, dir) => setPhotos(moveItem(photos, index, dir))}
              onDelete={(index) => setPhotos(photos.filter((_, j) => j !== index))}
            />
          </div>
          <MediaInput label="Image *" value={photo.image} onChange={(url) => setPhoto(i, { image: url })} />
          <div className="adm-grid-2">
            <Field label="Caption"><input type="text" value={photo.caption} onChange={(e) => setPhoto(i, { caption: e.target.value })} /></Field>
            <Field label="Category"><input type="text" list="impact-categories" value={photo.category} onChange={(e) => setPhoto(i, { category: e.target.value })} /></Field>
          </div>
          <label className="adm-check">
            <input type="checkbox" checked={Boolean(photo.big)} onChange={(e) => setPhoto(i, { big: e.target.checked })} />
            Show as a big tile
          </label>
        </div>
      ))}
      <button type="button" className="adm-btn adm-btn-small adm-add" onClick={() => setPhotos([...photos, { image: '', caption: '', category: categories[0] || '', big: false }])}>
        + Add photo
      </button>
    </SectionForm>
  );
}

// Saves one part of the home page settings, keeping the other parts as they are.
export async function saveHomePart(current, part) {
  return adminApi.saveAll('home', { ...current, ...part });
}
