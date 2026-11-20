// Brings the admin's copy (v2_ collections) up to date with the live site (sikhaid.ngo).
// The live site's collections are only READ here; nothing is ever written to them.
// - Donations, monthly sign-ups and form entries that aren't in the copy yet are added.
// - Monthly sign-ups already in the copy get their latest status and payment count.
// - New donations are linked to donor accounts (Donors page).
// Records already in the copy, and anything made in the new admin, are never overwritten.
// Two ways to run:
// - quickSync(): every time an admin list loads and every few seconds while Donations, Monthly
//   Donations, Form Submissions or Donors is open. Reads only what the live site saved since the
//   last check (a few seconds of records), so a new payment shows up almost at once.
// - syncFromLive(): the full check, daily at 6 am IST (vercel.json cron → /api/cron/live-sync) and
//   from Donations → "Check everything". Catches anything the quick check could have missed.
// To see the gap without changing anything: node scripts/check-live-gap.mjs
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { firestore, hasFirebase, v2Collection } from './firebase';
import { recordDonation } from './donors';
import { changed } from './firestore-store';

const LIVE = new Set(['donations', 'monthly_donation_intents', 'contact_submissions', 'volunteer_submissions', 'csr_submissions']);
// Read-only access to one of the live site's collections.
// With `since` (milliseconds), only records saved after that moment.
const readLive = async (name, since) => {
  if (!LIVE.has(name)) throw new Error(`Not a live collection: ${name}`);
  let q = firestore().collection(name);
  if (since != null) q = q.where('firestoreTimestamp', '>', Timestamp.fromMillis(since));
  return (await q.get()).docs;
};

const str = (v) => (v === undefined || v === null ? '' : String(v));
const when = (d) => str(d.timestamp || d.firestoreTimestamp?.toDate?.().toISOString() || d.createdAt) || new Date(0).toISOString();
const docId = (v) => String(v).replace(/\//g, '_');
const MANDATE = { active: 'active', halted: 'paused', cancelled: 'cancelled', created: 'pending', authenticated: 'pending' };
const utmOf = (d) => Object.fromEntries(
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].filter((k) => d[k]).map((k) => [k, str(d[k])]),
);
const donorOf = (d) => ({ name: str(d.donorName), email: str(d.email), phone: str(d.phone), pan: str(d.panCard), address: '' });

// Same shapes as scripts/copy-live-to-v2.mjs.
function donationFrom(id, d) {
  const total = Number(d.amount) || 0;
  return {
    id,
    receiptNo: str(d.razorpayPaymentId || id),
    amount: Number(d.baseAmount ?? total) || 0,
    tipAmt: Number(d.supportAmount) || 0,
    grandTotal: total,
    cause: str(d.campaignTitle || d.sponsorshipTitle || 'General Fund'),
    causeSlug: str(d.campaignSlug),
    isMonthly: false,
    recurringCharge: Boolean(d.isRecurring),
    cycleNumber: d.cycleNumber,
    paymentMethod: 'razorpay',
    donor: donorOf(d),
    optAccount: false,
    optWa: false,
    utm: utmOf(d),
    paymentStatus: 'paid',
    razorpayPaymentId: str(d.razorpayPaymentId),
    razorpayOrderId: str(d.razorpayOrderId),
    razorpaySubscriptionId: str(d.razorpaySubscriptionId),
    mandateStatus: '',
    source: 'live',
    createdAt: when(d),
    updatedAt: when(d),
  };
}

const monthlyLive = (d) => ({
  paidCount: d.paidCount,
  razorpayPaymentId: str(d.lastPaymentId || d.firstPaymentId),
  mandateStatus: MANDATE[d.status] || 'pending',
  updatedAt: str(d.lastChargedAt) || when(d),
});

function monthlyFrom(id, d) {
  const total = Number(d.amount) || 0;
  return {
    id: `monthly_${id}`,
    receiptNo: str(d.razorpaySubscriptionId || id),
    amount: Number(d.baseAmount ?? total) || 0,
    tipAmt: Number(d.supportAmount) || 0,
    grandTotal: total,
    cause: str(d.campaignTitle || 'General Fund'),
    causeSlug: str(d.campaignSlug),
    isMonthly: true,
    paymentMethod: 'razorpay',
    donor: donorOf(d),
    optAccount: false,
    optWa: false,
    utm: utmOf(d),
    paymentStatus: 'mandate',
    razorpayOrderId: '',
    razorpaySubscriptionId: str(d.razorpaySubscriptionId),
    source: 'live',
    createdAt: when(d),
    ...monthlyLive(d),
  };
}

const FORMS = {
  contact: ['contact_submissions', (d) => ({
    Name: d.name, Email: d.email, Phone: d.phone, Subject: d.subject, Message: d.message,
  })],
  volunteer: ['volunteer_submissions', (d) => ({
    'Full Name': d.fullName, Email: d.email, Mobile: d.mobile, Gender: d.gender, Address: d.address,
    Opportunity: d.opportunity,
    Duration: [d.durationYears && `${d.durationYears} yr`, d.durationMonths && `${d.durationMonths} mo`].filter(Boolean).join(' '),
    'Start Date': d.startDate, About: d.about,
  })],
  csr: ['csr_submissions', (d) => ({
    'Company Name': d.companyName, 'Contact Person': d.contactPerson, Email: d.email, Phone: d.phone,
    'Company Size': d.companySize, Industry: d.industry, 'Budget Range': d.budgetRange,
    'Partnership Interest': Array.isArray(d.partnershipInterest) ? d.partnershipInterest.join(', ') : d.partnershipInterest,
    Message: d.message,
  })],
};

const idsOf = async (name) => new Set((await v2Collection(name).select().get()).docs.map((d) => d.id));
// Which of these ids the copy already has, reading only those records.
async function haveOf(name, ids) {
  if (!ids.length) return new Map();
  const refs = ids.map((id) => v2Collection(name).doc(docId(id)));
  const snaps = await firestore().getAll(...refs);
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s]));
}
// Newest first, mixed in by date with records made in the new admin.
const posOf = (item) => -Date.parse(item.createdAt || 0) || 0;
const millisOf = (doc) => doc.data().firestoreTimestamp?.toMillis?.() || 0;
// Records can reach the live database a little out of order, so each quick check looks back this far.
const OVERLAP = 10 * 60 * 1000;
const STATE = () => v2Collection('content').doc('liveSync');

async function write(ops) {
  const db = firestore();
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}

// Live records removed in the admin (test payments, deleted entries): the sync never copies them back.
const REMOVED = () => v2Collection('content').doc('liveSyncRemoved');
export async function markRemoved(ids) {
  if (!ids.length) return;
  await REMOVED().set({ ids: FieldValue.arrayUnion(...ids.map(docId)) }, { merge: true });
}

async function run(quick) {
  if (!hasFirebase()) throw new Error('Firebase is not set up.');
  const started = new Date().toISOString();
  const stateSnap = await STATE().get();
  const state = stateSnap.exists ? stateSnap.data() : {};
  const cursors = { ...(state.cursors || {}) };
  // A quick check needs a starting point; without one, do the full check.
  if (quick && !cursors.donations) quick = false;
  const since = (name) => (quick ? Math.max(0, (cursors[name] || 0) - OVERLAP) : undefined);
  const seen = (name, docs) => {
    docs.forEach((doc) => { cursors[name] = Math.max(cursors[name] || 0, millisOf(doc)); });
    return docs;
  };

  const ops = [];
  const newDonations = [];
  const removed = new Set(((await REMOVED().get()).data()?.ids) || []);

  // One-time donations
  const donationDocs = seen('donations', await readLive('donations', since('donations')));
  const haveDonations = quick ? await haveOf('donations', donationDocs.map((d) => d.id)) : await idsOf('donations');
  for (const doc of donationDocs) {
    if (haveDonations.has(docId(doc.id)) || removed.has(docId(doc.id))) continue;
    newDonations.push(donationFrom(doc.id, doc.data()));
  }

  // Monthly sign-ups: new ones, and the latest status of ones already copied.
  let monthlyUpdated = 0;
  let monthlyDocs = await readLive('monthly_donation_intents', since('monthly_donation_intents'));
  seen('monthly_donation_intents', monthlyDocs);
  if (quick) {
    // Charged since the last check (lastChargedAt is a date string on the live record).
    const chargedSince = new Date(Math.max(0, (cursors.monthlyCharged || 0) - OVERLAP)).toISOString();
    const charged = (await firestore().collection('monthly_donation_intents').where('lastChargedAt', '>', chargedSince).get()).docs;
    const known = new Set(monthlyDocs.map((d) => d.id));
    monthlyDocs = [...monthlyDocs, ...charged.filter((d) => !known.has(d.id))];
  }
  monthlyDocs.forEach((doc) => {
    const t = Date.parse(doc.data().lastChargedAt || '') || 0;
    cursors.monthlyCharged = Math.max(cursors.monthlyCharged || 0, t);
  });
  const existingMonthly = quick
    ? await haveOf('donations', monthlyDocs.map((d) => `monthly_${d.id}`))
    : new Map((await v2Collection('donations').where('isMonthly', '==', true).get()).docs.map((d) => [d.id, d]));
  for (const doc of monthlyDocs) {
    const old = existingMonthly.get(docId(`monthly_${doc.id}`));
    if (!old) {
      if (removed.has(docId(`monthly_${doc.id}`))) continue;
      newDonations.push(monthlyFrom(doc.id, doc.data()));
      continue;
    }
    const cur = old.data();
    if (cur.source !== 'live') continue;
    const fresh = monthlyLive(doc.data());
    const changed = Object.fromEntries(Object.entries(fresh).filter(([k, v]) => v !== undefined && cur[k] !== v));
    if (Object.keys(changed).length) {
      ops.push((b) => b.update(old.ref, changed));
      monthlyUpdated += 1;
    }
  }

  newDonations.forEach((item) => ops.push((b) => b.set(v2Collection('donations').doc(docId(item.id)), { ...item, _pos: posOf(item) })));

  // Form entries
  let newForms = 0;
  const haveAllForms = quick ? null : await idsOf('submissions');
  for (const [type, [name, fieldsOf]] of Object.entries(FORMS)) {
    const docs = seen(name, await readLive(name, since(name)));
    const have = haveAllForms || await haveOf('submissions', docs.map((d) => `${type}_${d.id}`));
    for (const doc of docs) {
      const id = `${type}_${doc.id}`;
      if (have.has(docId(id)) || removed.has(docId(id))) continue;
      const d = doc.data();
      const fields = Object.fromEntries(Object.entries(fieldsOf(d)).map(([k, v]) => [k, str(v)]).filter(([, v]) => v));
      const status = ['new', 'read', 'resolved'].includes(d.status) ? d.status : 'new';
      const item = { id, type, status, fields, source: 'live', createdAt: when(d), updatedAt: when(d) };
      ops.push((b) => b.set(v2Collection('submissions').doc(docId(id)), { ...item, _pos: posOf(item) }));
      newForms += 1;
    }
  }

  await write(ops);
  const touched = [newDonations.length || monthlyUpdated ? 'donations' : '', newForms ? 'submissions' : ''].filter(Boolean);
  if (touched.length) await changed(...touched);

  // Donor accounts for the new donations, oldest first so the newest details win.
  let linked = 0;
  for (const item of [...newDonations].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const donor = await recordDonation(item);
    if (donor) {
      await v2Collection('donations').doc(docId(item.id)).update({ donorId: donor.id });
      linked += 1;
    }
  }
  if (linked) await changed('donations');

  const result = {
    at: new Date().toISOString(),
    started,
    quick,
    newDonations: newDonations.length,
    newAmount: newDonations.reduce((s, x) => s + (Number(x.grandTotal) || 0), 0),
    monthlyUpdated,
    newForms,
    donorsLinked: linked,
  };
  const changedAnything = result.newDonations || result.monthlyUpdated || result.newForms;
  await STATE().set({
    data: result,
    cursors,
    checkedAt: result.at,
    // When the full check last ran, and when anything new last arrived.
    fullAt: quick ? state.fullAt || '' : result.at,
    lastNewAt: changedAnything ? result.at : state.lastNewAt || '',
    updatedAt: result.at,
  });
  return result;
}

export const syncFromLive = () => run(false);

// Shared by every request on this server: one check at a time, at most one every few seconds.
const QUICK_GAP = 8 * 1000;
let running = null;
let lastQuick = 0;
export async function quickSync() {
  if (running) return running;
  if (Date.now() - lastQuick < QUICK_GAP) return { skipped: true };
  lastQuick = Date.now();
  running = run(true).finally(() => { running = null; });
  return running;
}

export async function lastSync() {
  if (!hasFirebase()) return null;
  const snap = await STATE().get();
  if (!snap.exists) return null;
  const s = snap.data();
  return { ...s.data, checkedAt: s.checkedAt || s.data?.at, fullAt: s.fullAt || '', lastNewAt: s.lastNewAt || '' };
}
