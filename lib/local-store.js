// Data store for the admin panel.
// With a Firebase key (see lib/firebase.js) everything is saved in the v2_ collections of the
// shared Firebase project. Without one it falls back to JSON files on this computer:
// private files (.local-data/) in this admin app, site content files in the website folder.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { hasFirebase } from './firebase';
import * as remote from './firestore-store';
import { adminPath, websitePath } from './paths';

const FILES = {
  // Private: form entries and donor details. Git-ignored.
  submissions: '.local-data/submissions.json',
  donations: '.local-data/donations.json',
  certificates: '.local-data/certificates.json',
  // Admin accounts. Only lib/admin-users.js reads or changes this file.
  users: '.local-data/admin-users.json',
  // Site content: the public pages import these files directly.
  campaigns: 'lib/campaigns-data.json',
  blogs: 'lib/content/blogs.json',
  celebCards: 'lib/content/celeb-image-cards.json',
  celebBigCards: 'lib/content/celeb-big-cards.json',
  hero: 'lib/content/hero.json',
  home: 'lib/content/home.json',
  trust80g: 'lib/content/trust-80g.json',
  site: 'lib/content/site.json',
};

// Kept away from the general collection API.
const PRIVATE = new Set(['users']);

// Sections saved as one record rather than a list of entries.
export const SINGLETONS = new Set(['hero', 'home', 'trust80g', 'site']);
// Lists whose display order the admin can change.
export const ORDERED = new Set(['celebCards', 'celebBigCards']);

// Content the public website shows. Saving one of these refreshes the website.
export const PUBLIC_CONTENT = ['campaigns', 'blogs', 'celebCards', 'celebBigCards', 'hero', 'home', 'site'];

// Hosted, the panel needs the database: local files don't survive on a server.
export const isDisabled = () => process.env.NODE_ENV === 'production' && !hasFirebase();

export const isCollection = (name) => Object.hasOwn(FILES, name) && !PRIVATE.has(name);

const fileFor = (collection) =>
  FILES[collection].startsWith('.local-data/') ? adminPath(FILES[collection]) : websitePath(FILES[collection]);
const keyOf = (collection, item) => (collection === 'campaigns' ? item.slug : item.id);

export async function readCollection(collection) {
  if (hasFirebase()) return remote.read(collection, SINGLETONS.has(collection), (item) => keyOf(collection, item));
  return readFile(collection);
}

async function readFile(collection) {
  try {
    return JSON.parse(await fs.readFile(fileFor(collection), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return SINGLETONS.has(collection) ? {} : [];
    throw e;
  }
}

async function writeCollection(collection, data, before) {
  if (hasFirebase()) {
    await remote.write(collection, SINGLETONS.has(collection), data, before, (item) => keyOf(collection, item));
    await afterContentChange(collection, data);
    return;
  }
  return writeFile(collection, data);
}

async function writeFile(collection, data) {
  const file = fileFor(collection);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(temp, JSON.stringify(data, null, 2) + '\n');
  await fs.rename(temp, file);
}

// Changes to one file run one after another, so two quick saves can't overwrite each other.
const queues = new Map();
export function changeCollection(collection, update) {
  const previous = queues.get(collection) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const current = await readCollection(collection);
    const { data, result } = await update(structuredClone(current));
    await writeCollection(collection, data, current);
    return result;
  });
  queues.set(collection, next);
  return next;
}

export const slugify = (text) =>
  String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

export function createItem(collection, input) {
  // Website forms and donations: save just the new entry instead of re-reading the whole list.
  if (hasFirebase() && collection !== 'campaigns' && collection !== 'blogs') {
    const now = new Date().toISOString();
    const item = { ...input, id: randomBytes(8).toString('hex'), createdAt: now, updatedAt: now };
    return remote.addFirst(collection, item, item.id).then(() => item);
  }
  return changeCollection(collection, (items) => {
    const now = new Date().toISOString();
    const item = { ...input, createdAt: now, updatedAt: now };
    if (collection === 'campaigns' || collection === 'blogs') {
      const base = slugify(input.slug || input.title) || `item-${Date.now()}`;
      let slug = base;
      for (let n = 2; items.some((other) => other.slug === slug); n += 1) slug = `${base}-${n}`;
      item.slug = slug;
    }
    if (collection !== 'campaigns') item.id = item.slug || randomBytes(8).toString('hex');
    return { data: [item, ...items], result: item };
  });
}

// Adds an item whose fields depend on what is already saved (such as the next certificate number).
export function createItemWith(collection, makeItem) {
  return changeCollection(collection, (items) => {
    const now = new Date().toISOString();
    const item = { ...makeItem(items), id: randomBytes(8).toString('hex'), createdAt: now, updatedAt: now };
    return { data: [item, ...items], result: item };
  });
}

export function updateItem(collection, id, input) {
  return changeCollection(collection, (items) => {
    const index = items.findIndex((item) => keyOf(collection, item) === id);
    if (index === -1) throw new NotFound();
    const previous = items[index];
    // A saved page's address never changes, so links to it keep working.
    const item = {
      ...previous,
      ...input,
      id: previous.id,
      slug: previous.slug,
      createdAt: previous.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const data = items.slice();
    data[index] = item;
    return { data, result: item };
  });
}

export function deleteItem(collection, id) {
  return changeCollection(collection, (items) => {
    const data = items.filter((item) => keyOf(collection, item) !== id);
    if (data.length === items.length) throw new NotFound();
    return { data, result: { deleted: id } };
  });
}

export function replaceCollection(collection, data) {
  return changeCollection(collection, () => ({ data, result: data }));
}

export class NotFound extends Error {}

// One entry by a field's value (e.g. a donation by its receipt number), without reading the whole list.
export async function findItem(collection, field, value) {
  if (hasFirebase()) return remote.findOne(collection, field, value);
  return (await readFile(collection)).find((item) => item[field] === value) || null;
}

// After website content is saved to the database:
// - on this computer, also update the website folder's copy so the local website shows it at once;
// - hosted, ask Vercel to rebuild the website (WEBSITE_DEPLOY_HOOK), which pulls the new content.
async function afterContentChange(collection, data) {
  if (!PUBLIC_CONTENT.includes(collection)) return;
  const dir = process.env.WEBSITE_DIR;
  if (dir && existsSync(dir)) writeFile(collection, data).catch((e) => console.error('Website copy not updated:', e.message));
  const hook = process.env.WEBSITE_DEPLOY_HOOK;
  if (hook) {
    // Awaited: a hosted server may stop as soon as the response is sent.
    await fetch(hook, { method: 'POST', signal: AbortSignal.timeout(5000) })
      .catch((e) => console.error('Website rebuild not started:', e.message));
  }
}

// Fields a website visitor may send. Status, dates and ids are always set here.
const clean = (value, max = 4000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const cleanNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const SUBMISSION_TYPES = new Set(['contact', 'volunteer', 'csr', 'newsletter']);

export function cleanSubmission(body) {
  if (!SUBMISSION_TYPES.has(body?.type)) return null;
  const fields = {};
  Object.entries(body.fields || {}).forEach(([key, value]) => {
    const text = Array.isArray(value) ? value.map((v) => clean(v, 200)).join(', ') : clean(value);
    if (text) fields[clean(key, 60)] = text;
  });
  return { type: body.type, status: 'new', fields };
}

export const tokenHash = (token) => createHash('sha256').update(String(token)).digest('hex');

export function cleanDonation(body) {
  if (!body?.receiptNo) return null;
  const donor = body.donor || {};
  const utm = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((key) => {
    const value = clean(body.utm?.[key], 200);
    if (value) utm[key] = value;
  });
  return {
    receiptNo: clean(body.receiptNo, 60),
    amount: cleanNumber(body.amount),
    tipAmt: cleanNumber(body.tipAmt),
    grandTotal: cleanNumber(body.grandTotal),
    cause: clean(body.cause, 200),
    causeSlug: clean(body.causeSlug, 120),
    isMonthly: Boolean(body.isMonthly),
    paymentMethod: clean(body.paymentMethod, 20),
    donor: {
      name: clean(donor.name, 200),
      email: clean(donor.email, 200),
      phone: clean(donor.phone, 20),
      pan: clean(donor.pan, 10),
      address: clean(donor.address, 500),
    },
    optAccount: Boolean(body.optAccount),
    // The donor's private download code, made by the website; only its fingerprint is kept.
    downloadTokenHash: /^[a-f0-9]{32,64}$/.test(String(body.downloadToken || '')) ? tokenHash(body.downloadToken) : '',
    optWa: Boolean(body.optWa),
    utm,
    // Filled in by Razorpay later. Until then no money has actually moved.
    paymentStatus: 'simulated',
    razorpayPaymentId: '',
    razorpayOrderId: '',
    razorpaySubscriptionId: '',
    mandateStatus: body.isMonthly ? 'pending' : '',
  };
}

export const notAvailable = () => Response.json({ error: 'Not found' }, { status: 404 });
