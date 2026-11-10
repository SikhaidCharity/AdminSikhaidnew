// Local-only data store for the admin panel: JSON files on this computer.
// Private files (.local-data/) live in this admin app; site content files live in the website folder.
// Replace this file (and lib/admin-api.js) when the panel moves to Firebase.
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
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

// The panel and its API exist only while running locally.
export const isDisabled = () => process.env.NODE_ENV === 'production';

export const isCollection = (name) => Object.hasOwn(FILES, name) && !PRIVATE.has(name);

const fileFor = (collection) =>
  FILES[collection].startsWith('.local-data/') ? adminPath(FILES[collection]) : websitePath(FILES[collection]);
const keyOf = (collection, item) => (collection === 'campaigns' ? item.slug : item.id);

export async function readCollection(collection) {
  try {
    return JSON.parse(await fs.readFile(fileFor(collection), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return SINGLETONS.has(collection) ? {} : [];
    throw e;
  }
}

async function writeCollection(collection, data) {
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
    const { data, result } = await update(current);
    await writeCollection(collection, data);
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
