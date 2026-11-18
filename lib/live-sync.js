// Brings the admin's copy (v2_ collections) up to date with the live site (sikhaid.ngo).
// The live site's collections are only READ here; nothing is ever written to them.
// - Donations, monthly sign-ups and form entries that aren't in the copy yet are added.
// - Monthly sign-ups already in the copy get their latest status and payment count.
// - New donations are linked to donor accounts (Donors page).
// Records already in the copy, and anything made in the new admin, are never overwritten.
// Runs daily (vercel.json cron → /api/cron/live-sync) and from Donations → "Get latest from live site".
// To see the gap without changing anything: node scripts/check-live-gap.mjs
import { firestore, hasFirebase, v2Collection } from './firebase';
import { recordDonation } from './donors';

const LIVE = new Set(['donations', 'monthly_donation_intents', 'contact_submissions', 'volunteer_submissions', 'csr_submissions']);
// Read-only access to one of the live site's collections.
const readLive = async (name) => {
  if (!LIVE.has(name)) throw new Error(`Not a live collection: ${name}`);
  return (await firestore().collection(name).get()).docs;
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
// Newest first, mixed in by date with records made in the new admin.
const posOf = (item) => -Date.parse(item.createdAt || 0) || 0;

async function write(ops) {
  const db = firestore();
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}

export async function syncFromLive() {
  if (!hasFirebase()) throw new Error('Firebase is not set up.');
  const started = new Date().toISOString();
  const haveDonations = await idsOf('donations');
  const haveSubmissions = await idsOf('submissions');
  const ops = [];
  const newDonations = [];

  for (const doc of await readLive('donations')) {
    if (haveDonations.has(docId(doc.id))) continue;
    newDonations.push(donationFrom(doc.id, doc.data()));
  }

  let monthlyUpdated = 0;
  const monthlyDocs = await readLive('monthly_donation_intents');
  const existingMonthly = new Map(
    (await v2Collection('donations').where('isMonthly', '==', true).get()).docs.map((d) => [d.id, d]),
  );
  for (const doc of monthlyDocs) {
    const id = docId(`monthly_${doc.id}`);
    const old = existingMonthly.get(id);
    if (!old) {
      newDonations.push(monthlyFrom(doc.id, doc.data()));
      continue;
    }
    if (old.data().source !== 'live') continue;
    const fresh = monthlyLive(doc.data());
    const cur = old.data();
    const changed = Object.fromEntries(Object.entries(fresh).filter(([k, v]) => v !== undefined && cur[k] !== v));
    if (Object.keys(changed).length) {
      ops.push((b) => b.update(old.ref, changed));
      monthlyUpdated += 1;
    }
  }

  newDonations.forEach((item) => ops.push((b) => b.set(v2Collection('donations').doc(docId(item.id)), { ...item, _pos: posOf(item) })));

  let newForms = 0;
  for (const [type, [name, fieldsOf]] of Object.entries(FORMS)) {
    for (const doc of await readLive(name)) {
      const id = `${type}_${doc.id}`;
      if (haveSubmissions.has(docId(id))) continue;
      const d = doc.data();
      const fields = Object.fromEntries(Object.entries(fieldsOf(d)).map(([k, v]) => [k, str(v)]).filter(([, v]) => v));
      const status = ['new', 'read', 'resolved'].includes(d.status) ? d.status : 'new';
      const item = { id, type, status, fields, source: 'live', createdAt: when(d), updatedAt: when(d) };
      ops.push((b) => b.set(v2Collection('submissions').doc(docId(id)), { ...item, _pos: posOf(item) }));
      newForms += 1;
    }
  }

  await write(ops);

  // Donor accounts for the new donations, oldest first so the newest details win.
  let linked = 0;
  for (const item of [...newDonations].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const donor = await recordDonation(item);
    if (donor) {
      await v2Collection('donations').doc(docId(item.id)).update({ donorId: donor.id });
      linked += 1;
    }
  }

  const amount = newDonations.reduce((s, x) => s + (Number(x.grandTotal) || 0), 0);
  const result = {
    at: new Date().toISOString(),
    started,
    newDonations: newDonations.length,
    newAmount: amount,
    monthlyUpdated,
    newForms,
    donorsLinked: linked,
  };
  await v2Collection('content').doc('liveSync').set({ data: result, updatedAt: result.at });
  return result;
}

export async function lastSync() {
  if (!hasFirebase()) return null;
  const snap = await v2Collection('content').doc('liveSync').get();
  return snap.exists ? snap.data().data : null;
}
