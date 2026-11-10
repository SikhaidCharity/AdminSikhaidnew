'use client';

import { useState } from 'react';
import { adminApi } from '@/lib/admin-api';
import { Field, LoadState, MediaInput, PageHead, Toast, useCollection, useToast } from '../_ui/shared';
import { CampaignOrderSection, ImpactSection, ProcessSection, ReliefSection, saveHomePart } from './HomeSections';

const TABS = [
  ['hero', 'Hero Background'],
  ['relief', 'Relief In Action'],
  ['campaigns', 'Our Campaigns'],
  ['process', 'Our Process'],
  ['impact', 'Our Impact'],
];

export default function HomePageAdmin() {
  const [tab, setTab] = useState('hero');
  const hero = useCollection('hero');
  const home = useCollection('home');
  const campaigns = useCollection('campaigns');
  const loading = hero.loading || home.loading || campaigns.loading;
  const error = hero.error || home.error || campaigns.error;
  const ready = hero.items && home.items && campaigns.items;

  const save = async (part) => {
    const stored = await saveHomePart(home.items, part);
    home.setItems(stored);
  };

  const props = { home: home.items, campaigns: campaigns.items, save };

  return (
    <main className="adm-page">
      <PageHead title="Home Page" subtitle="The hero at the top of the home page and the sections below it.">
        <a className="adm-btn" href="/" target="_blank" rel="noreferrer">View home page</a>
      </PageHead>

      <div className="adm-tabs" role="tablist" aria-label="Home page sections">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <LoadState
        loading={loading}
        error={error}
        onRetry={() => { hero.reload(); home.reload(); campaigns.reload(); }}
        loadingText="Loading home page..."
      />
      {ready && tab === 'hero' && <HeroForm initial={hero.items} />}
      {ready && tab === 'relief' && <ReliefSection {...props} />}
      {ready && tab === 'campaigns' && <CampaignOrderSection {...props} />}
      {ready && tab === 'process' && <ProcessSection {...props} />}
      {ready && tab === 'impact' && <ImpactSection {...props} />}
    </main>
  );
}

function HeroForm({ initial }) {
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const save = async (e) => {
    e.preventDefault();
    const data = {
      ...form,
      desktopImages: form.desktopImages.filter(Boolean),
      mobileImages: form.mobileImages.filter(Boolean),
    };
    const noMedia = data.mediaType === 'video' ? !data.videoUrl : data.desktopImages.length === 0;
    if (noMedia) {
      showToast(form.mediaType === 'video' ? 'Please add a video first.' : 'Please add at least one desktop image first.');
      return;
    }
    setBusy(true);
    try {
      const stored = await adminApi.saveAll('hero', data);
      setSaved(stored);
      setForm(stored);
      showToast('Hero saved. Check it on the home page.');
    } catch (err) {
      showToast(err.message);
    }
    setBusy(false);
  };

  return (
    <>
        <form className="adm-form adm-panel adm-panel-pad" onSubmit={save}>
          <fieldset className="adm-section">
            <legend>Background</legend>
            <div className="adm-choice" role="radiogroup" aria-label="Background type">
              {[['video', 'Video'], ['images', 'Image slideshow']].map(([id, label]) => (
                <button key={id} type="button" role="radio" aria-checked={form.mediaType === id} onClick={() => set('mediaType', id)}>
                  {label}
                </button>
              ))}
            </div>

            {form.mediaType === 'video' ? (
              <>
                <MediaInput video label="Video *" hint="MP4 or WebM. Keep it small so the page loads quickly." value={form.videoUrl} onChange={(url) => set('videoUrl', url)} />
                <MediaInput label="Poster Image" hint="Shown while the video loads." value={form.posterUrl} onChange={(url) => set('posterUrl', url)} />
                <label className="adm-check">
                  <input type="checkbox" checked={Boolean(form.showSoundButton)} onChange={(e) => set('showSoundButton', e.target.checked)} />
                  Show the sound on/off button
                </label>
              </>
            ) : (
              <>
                <ImageList title="Desktop slideshow order" addLabel="Add a desktop image" images={form.desktopImages} onChange={(list) => set('desktopImages', list)} />
                <ImageList title="Mobile slideshow order" addLabel="Add a mobile image" hint="If empty, phones show the desktop images." images={form.mobileImages} onChange={(list) => set('mobileImages', list)} />
                <Field label="Seconds per image">
                  <input type="number" min="2" max="30" value={form.slideSeconds} onChange={(e) => set('slideSeconds', Number(e.target.value))} />
                </Field>
              </>
            )}

            <Field label={`Dark shade strength: ${form.overlayOpacity}%`} hint="The dark blue shade over the background, which keeps the text readable.">
              <input type="range" min="0" max="100" value={form.overlayOpacity} onChange={(e) => set('overlayOpacity', Number(e.target.value))} />
            </Field>
          </fieldset>

          <fieldset className="adm-section">
            <legend>Text</legend>
            <Field label="Headline Line 1"><input type="text" value={form.line1} onChange={(e) => set('line1', e.target.value)} /></Field>
            <Field label="Headline Line 2"><input type="text" value={form.line2} onChange={(e) => set('line2', e.target.value)} /></Field>
            <Field label="Headline Link" hint="Where the headline goes when clicked, e.g. /campaigns/langar-sewa"><input type="text" value={form.titleLink || ''} onChange={(e) => set('titleLink', e.target.value)} /></Field>
            <div className="adm-grid-2">
              <Field label="Scroll Button Text"><input type="text" value={form.scrollText} onChange={(e) => set('scrollText', e.target.value)} /></Field>
              <Field label="Scroll Button Link"><input type="text" value={form.scrollLink} onChange={(e) => set('scrollLink', e.target.value)} /></Field>
            </div>
          </fieldset>

          <div className="adm-save-bar">
            {dirty && <span>You have unsaved changes</span>}
            <button type="button" className="adm-btn" disabled={!dirty} onClick={() => setForm(saved)}>Discard</button>
            <button type="submit" className="adm-btn adm-btn-primary" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save Hero'}</button>
          </div>
        </form>
      <Toast message={toast} />
    </>
  );
}

function ImageList({ title, addLabel, hint, images, onChange }) {
  const move = (index, direction) => {
    const next = images.slice();
    const [image] = next.splice(index, 1);
    next.splice(index + direction, 0, image);
    onChange(next);
  };
  return (
    <div className="adm-image-list">
      <h4>{title}</h4>
      {hint && <p className="adm-hint">{hint}</p>}
      {images.map((url, index) => (
        <div className="adm-image-row" key={index}>
          <MediaInput label={`Image ${index + 1}`} value={url} onChange={(next) => onChange(images.map((u, i) => (i === index ? next : u)))} />
          <div>
            <button type="button" className="adm-btn adm-btn-small" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up">↑</button>
            <button type="button" className="adm-btn adm-btn-small" disabled={index === images.length - 1} onClick={() => move(index, 1)} aria-label="Move down">↓</button>
            <button type="button" className="adm-btn adm-btn-small adm-btn-danger-line" onClick={() => onChange(images.filter((_, i) => i !== index))}>Delete</button>
          </div>
        </div>
      ))}
      <button type="button" className="adm-btn adm-btn-small adm-add" onClick={() => onChange([...images, ''])}>+ {addLabel}</button>
    </div>
  );
}
