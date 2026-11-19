// Copies the live site's blogs into the admin (v2_blogs). The live `blogs` collection is only read.
// Blogs already in the admin (same slug or title) are left alone, so this can be run again safely.
//   node scripts/copy-live-blogs.mjs            show what would be copied
//   node scripts/copy-live-blogs.mjs --write    copy them
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const WRITE = process.argv.includes('--write');
initializeApp({ credential: cert(JSON.parse(readFileSync(new URL('../.secrets/firebase-key.json', import.meta.url), 'utf8'))) });
const db = getFirestore();

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…' };
const decode = (s) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m);

// Inline HTML → the admin's text marks: **bold**, links keep their words, everything else plain.
const inline = (html) =>
  decode(
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (m, t, x) => {
        const text = x.replace(/<[^>]+>/g, '').trim();
        return text ? `**${text}**` : '';
      })
      .replace(/<[^>]+>/g, '')
  ).replace(/\s+/g, ' ').trim();

const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// HTML article → the admin's Content box (## heading, ### subheading, - list item, blank line between paragraphs).
function toContent(html, title) {
  const out = [];
  const re = /<(h1|h2|h3|h4|p|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>|<(ul|ol)\b[^>]*>|<\/(ul|ol)>/gi;
  let m;
  let inList = false;
  while ((m = re.exec(html))) {
    if (m[3]) { inList = true; continue; }
    if (m[4]) { inList = false; out.push(''); continue; }
    const tag = m[1].toLowerCase();
    const text = inline(m[2]).replace(/^\*\*(.*)\*\*$/, '$1');
    if (!text) continue;
    if (tag === 'li') { out.push(`- ${inline(m[2])}`); continue; }
    if (inList) { out.push(''); inList = false; }
    // The article's own top heading repeats the title, which the page already shows.
    if ((tag === 'h1' || tag === 'h2') && norm(text) === norm(title) && out.every((l) => !l.trim())) continue;
    if (tag === 'h1' || tag === 'h2') out.push(`## ${text}`, '');
    else if (tag === 'h3' || tag === 'h4') out.push(`### ${text}`, '');
    else out.push(inline(m[2]), '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const tidy = (s) => String(s || '').replace(/\s+/g, ' ').trim();
// Only direct image addresses work as a cover (an ibb.co page link is not an image).
const coverOf = (url) => (/^https:\/\/i\.ibb\.co\/|\.(png|jpe?g|webp|gif)(\?|$)/i.test(url || '') ? url : '');

const live = (await db.collection('blogs').get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const have = (await db.collection('v2_blogs').get()).docs.map((d) => d.data());
const haveSlugs = new Set(have.map((b) => b.slug));
const haveTitles = new Set(have.map((b) => norm(b.title)));

const toCopy = live.filter((b) => !haveSlugs.has(b.slug) && !haveTitles.has(norm(b.title)));
const blogs = toCopy.map((b) => {
  const createdAt = b.publishedAt || b.createdAt;
  return {
    id: b.slug,
    slug: b.slug,
    title: tidy(b.title),
    category: tidy(b.category) || 'SikhAid',
    author: tidy(b.author) || 'SikhAid Team',
    status: b.publishStatus === 'published' ? 'published' : 'draft',
    excerpt: tidy(b.excerpt),
    image: coverOf(b.image),
    content: toContent(b.content || '', b.title),
    createdAt,
    updatedAt: b.updatedAt || createdAt,
    source: 'live-site',
    liveId: b.id,
    _pos: -Date.parse(createdAt),
  };
});

console.log(`Live blogs: ${live.length} · already in admin: ${live.length - toCopy.length} · to copy: ${blogs.length}`);
for (const b of blogs) console.log(` - ${b.createdAt.slice(0, 10)}  ${b.status}  ${b.image ? 'img' : '   '}  ${b.content.length}ch  ${b.title}`);
const sample = blogs.find((b) => b.content.includes('- ')) || blogs[0];
if (sample) console.log(`\n--- Sample content (${sample.title}) ---\n${sample.content.slice(0, 900)}\n---`);

if (!WRITE) {
  console.log('\nDry run. Run with --write to copy.');
  process.exit(0);
}
for (let i = 0; i < blogs.length; i += 400) {
  const batch = db.batch();
  for (const { id, ...b } of blogs.slice(i, i + 400)) batch.set(db.collection('v2_blogs').doc(id), { id, ...b });
  await batch.commit();
}
// So the admin and website read the list fresh.
await db.collection('v2_content').doc('listVersions').set({ blogs: FieldValue.increment(1) }, { merge: true });
console.log(`\nCopied ${blogs.length} blogs into v2_blogs.`);
