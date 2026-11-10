'use client';

import { useMemo, useRef, useState } from 'react';
import { adminApi } from '@/lib/admin-api';
import BlogContent from '@/components/BlogContent';
import { contentOf } from '@/lib/blog-format';
import {
  Badge, ConfirmDelete, Field, LoadState, MediaInput, Modal, PageHead, Pager, Stats, Toast,
  SlugField, formatDate, slugify, useCollection, usePaged, useToast,
} from '../_ui/shared';

const CATEGORIES = ['Volunteer stories', 'Food security', 'Education', 'Disaster relief', 'Healthcare'];

const emptyBlog = () => ({
  title: '', slug: '', category: CATEGORIES[0], author: 'SikhAid Team', status: 'draft', excerpt: '', image: '', content: '',
});

export default function BlogsPage() {
  const { items, error, loading, reload, setItems } = useCollection('blogs');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [toast, showToast] = useToast();

  const all = useMemo(() => items || [], [items]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((b) => (statusFilter === 'all' || b.status === statusFilter) && (!q || `${b.title} ${b.category} ${b.author}`.toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [all, query, statusFilter]);

  const { rows: pageRows, page, pageCount, setPage } = usePaged(rows, 15);

  const onSaved = (saved, isNew) => {
    setItems((current) => (isNew ? [saved, ...current] : current.map((b) => (b.id === saved.id ? saved : b))));
    setEditing(null);
    showToast(saved.status === 'published' ? 'Blog saved and published' : 'Blog saved as draft');
  };

  return (
    <main className="adm-page">
      <PageHead title="Blog Management" subtitle="Add, edit or delete the stories on the website.">
        <a className="adm-btn" href="/blog" target="_blank" rel="noreferrer">View blog page</a>
        <button type="button" className="adm-btn adm-btn-primary" onClick={() => setEditing(emptyBlog())}>New Blog</button>
      </PageHead>

      <Stats
        items={[
          { label: 'Total Blogs', value: all.length },
          { label: 'Published', value: all.filter((b) => b.status === 'published').length },
          { label: 'Drafts', value: all.filter((b) => b.status === 'draft').length },
        ]}
      />

      <section className="adm-panel">
        <div className="adm-filters">
          <input type="search" aria-label="Search blogs" placeholder="Search title, category, author…" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
          <select aria-label="Filter by status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="all">All Status</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </div>

        <LoadState loading={loading} error={error} onRetry={reload} loadingText="Loading blogs..." />

        {items && rows.length === 0 && (
          <div className="adm-empty">
            <p>No blogs found</p>
            <button type="button" className="adm-btn adm-btn-primary" onClick={() => setEditing(emptyBlog())}>Create Your First Blog</button>
          </div>
        )}

        {rows.length > 0 && (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Author</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((b) => (
                  <tr key={b.id}>
                    <td className="adm-title-cell">
                      <b>{b.title}</b>
                    </td>
                    <td>{b.category}</td>
                    <td>{b.author}</td>
                    <td>
                      <Badge tone={b.status === 'published' ? 'green' : 'grey'}>{b.status === 'published' ? 'Published' : 'Draft'}</Badge>
                    </td>
                    <td className="adm-nowrap">{formatDate(b.createdAt)}</td>
                    <td className="adm-actions">
                      {b.status === 'published' && (
                        <a className="adm-btn adm-btn-small" href={`/blog/${b.slug}`} target="_blank" rel="noreferrer">View</a>
                      )}
                      <button type="button" className="adm-btn adm-btn-small" onClick={() => setEditing(b)}>Edit</button>
                      <button type="button" className="adm-btn adm-btn-small adm-btn-danger-line" onClick={() => setDeleting(b)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageCount={pageCount} total={rows.length} onPage={setPage} />
      </section>

      {editing && <BlogForm blog={editing} onCancel={() => setEditing(null)} onSaved={onSaved} />}

      {deleting && (
        <ConfirmDelete
          title="Delete Blog"
          name={deleting.title}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            await adminApi.remove('blogs', deleting.id);
            setItems((current) => current.filter((b) => b.id !== deleting.id));
            setDeleting(null);
            showToast('Blog deleted');
          }}
        />
      )}
      <Toast message={toast} />
    </main>
  );
}

// Buttons that add simple marks to the Content box. The website turns them into headings, bold text and so on.
const TOOLS = [
  { label: 'Heading', wrap: (t) => `\n\n## ${t || 'Heading'}\n\n` },
  { label: 'Subheading', wrap: (t) => `\n\n### ${t || 'Subheading'}\n\n` },
  { label: 'Bold', wrap: (t) => `**${t || 'bold text'}**` },
  { label: 'Bullet list', wrap: (t) => `\n\n${(t || 'First point\nSecond point').split('\n').map((l) => `- ${l}`).join('\n')}\n\n` },
];

function BlogForm({ blog, onCancel, onSaved }) {
  const isNew = !blog.id;
  // Older posts were saved as blocks; the editor shows them as one piece of text.
  const [form, setForm] = useState(() => {
    const { blocks, readTime, featured, ...rest } = blog;
    return { ...rest, content: contentOf(blog) };
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const contentRef = useRef(null);

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  // While creating, the slug follows the title until someone edits it by hand.
  const [slugEdited, setSlugEdited] = useState(false);
  const setTitle = (title) =>
    setForm((current) => ({ ...current, title, ...(isNew && !slugEdited ? { slug: slugify(title) } : {}) }));

  // Wraps the selected words (or adds an example) at the cursor.
  const insert = (wrap) => {
    const box = contentRef.current;
    const start = box?.selectionStart ?? form.content.length;
    const end = box?.selectionEnd ?? form.content.length;
    const added = wrap(form.content.slice(start, end));
    const content = (form.content.slice(0, start) + added + form.content.slice(end)).replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
    set('content', content);
    requestAnimationFrame(() => box?.focus());
  };

  const addImage = async (file) => {
    if (!file) return;
    try {
      const { url } = await adminApi.upload(file);
      insert(() => `\n\n![](${url})\n\n`);
    } catch (err) {
      setError(err.message);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    const missing = [['Title', form.title], ['Category', form.category], ['Author', form.author], ['Excerpt', form.excerpt]]
      .filter(([, value]) => !String(value || '').trim())
      .map(([label]) => label);
    if (missing.length) {
      setError(`Please fill in: ${missing.join(', ')}.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = { ...form, title: form.title.trim(), content: form.content.trim() };
      const saved = isNew ? await adminApi.create('blogs', data) : await adminApi.update('blogs', blog.id, data);
      onSaved(saved, isNew);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title={isNew ? 'New Blog' : 'Edit Blog'}
      onClose={onCancel}
      footer={
        <>
          {error && <span className="adm-error adm-foot-error" role="alert">{error}</span>}
          <button type="button" className="adm-btn" onClick={onCancel}>Cancel</button>
          <button type="submit" form="blog-form" className="adm-btn adm-btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save Blog'}</button>
        </>
      }
    >
      <form id="blog-form" className="adm-form" onSubmit={save}>
        <Field label="Title *">
          <input type="text" value={form.title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <SlugField
          value={form.slug}
          locked={!isNew}
          base="/blog/"
          onChange={(slug) => { setSlugEdited(true); set('slug', slug); }}
        />
        <div className="adm-grid-2">
          <Field label="Category *">
            <input type="text" list="blog-categories" placeholder="e.g. Disaster relief" value={form.category} onChange={(e) => set('category', e.target.value)} />
            <datalist id="blog-categories">
              {CATEGORIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
          <Field label="Author *">
            <input type="text" value={form.author} onChange={(e) => set('author', e.target.value)} />
          </Field>
        </div>
        <Field label="Status *">
          <select value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="draft">Draft (only visible here)</option>
            <option value="published">Published (live on the website)</option>
          </select>
        </Field>
        <Field label="Excerpt *" hint="One or two lines shown on the blog card.">
          <textarea rows={2} value={form.excerpt} onChange={(e) => set('excerpt', e.target.value)} />
        </Field>
        <MediaInput label="Featured Image" value={form.image} onChange={(url) => set('image', url)} />

        <div className="adm-editor">
          <div className="adm-editor-bar">
            <span>Content</span>
            <div>
              {TOOLS.map((tool) => (
                <button key={tool.label} type="button" className="adm-btn adm-btn-small" disabled={preview} onClick={() => insert(tool.wrap)}>{tool.label}</button>
              ))}
              <label className={`adm-btn adm-btn-small${preview ? ' adm-disabled' : ''}`}>
                Image
                <input type="file" accept="image/*" hidden disabled={preview} onChange={(e) => { addImage(e.target.files[0]); e.target.value = ''; }} />
              </label>
              <button type="button" className="adm-btn adm-btn-small adm-btn-primary" onClick={() => setPreview((p) => !p)}>
                {preview ? 'Back to writing' : 'Preview'}
              </button>
            </div>
          </div>
          {preview ? (
            <div className="adm-editor-preview blog-post-body">
              {form.content.trim() ? <BlogContent content={form.content} /> : <p>Nothing written yet.</p>}
            </div>
          ) : (
            <textarea
              ref={contentRef}
              aria-label="Content"
              rows={14}
              placeholder="Write the blog here. Leave an empty line between paragraphs. Select words and press a button above to make them a heading, bold or a list."
              value={form.content}
              onChange={(e) => set('content', e.target.value)}
            />
          )}
        </div>
      </form>
    </Modal>
  );
}
