// One-off: builds the new site's separate copy (v2_ collections) in the shared Firebase project.
//   - Donations, monthly donations and form entries are READ from the live site's collections
//     and copied, reshaped for the new admin. The live collections are never written to.
//   - Website content (campaigns, blogs, home page...) comes from the new website's JSON files.
//   - Admin accounts come from this app's .local-data/admin-users.json.
// Usage: node scripts/copy-live-to-v2.mjs [--force]   (--force overwrites an existing copy)
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const root = fileURLToPath(new URL('..', import.meta.url));
const env = Object.fromEntries(
  readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const websiteDir = env.WEBSITE_DIR;
const key = JSON.parse(readFileSync(path.join(root, '.secrets', 'firebase-key.json'), 'utf8'));
initializeApp({ credential: cert(key) });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

const live = (name) => db.collection(name); // read only
const v2 = (name) => {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(name);
  return db.collection('v2_' + name);
};

if (!process.argv.includes('--force')) {
  const existing = await v2('donations').limit(1).get();
  if (!existing.empty) {
    console.log('A v2 copy already exists. Run with --force to overwrite it.');
    process.exit(1);
  }
}

const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const str = (v) => (v === undefined || v === null ? '' : String(v));
const when = (d) => d.timestamp || d.firestoreTimestamp?.toDate?.().toISOString() || d.createdAt || new Date(0).toISOString();
const docId = (v) => String(v).replace(/\//g, '_');

async function save(name, items, keyOf = (x) => x.id) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = db.batch();
    items.slice(i, i + 400).forEach((item, j) => batch.set(v2(name).doc(docId(keyOf(item))), { ...item, _pos: i + j }));
    await batch.commit();
  }
  console.log(`v2_${name}: ${items.length}`);
}

// ── Donations (one-time and monthly charges) ──
const MANDATE = { active: 'active', halted: 'paused', cancelled: 'cancelled', created: 'pending', authenticated: 'pending' };
const utmOf = (d) => Object.fromEntries(
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].filter((k) => d[k]).map((k) => [k, str(d[k])]),
);
const donor = (d) => ({ name: str(d.donorName), email: str(d.email), phone: str(d.phone), pan: str(d.panCard), address: '' });

const donations = (await live('donations').get()).docs.map((doc) => {
  const d = doc.data();
  const total = Number(d.amount) || 0;
  return {
    id: doc.id,
    receiptNo: str(d.razorpayPaymentId || doc.id),
    amount: Number(d.baseAmount ?? total) || 0,
    tipAmt: Number(d.supportAmount) || 0,
    grandTotal: total,
    cause: str(d.campaignTitle || d.sponsorshipTitle || 'General Fund'),
    causeSlug: str(d.campaignSlug),
    isMonthly: false,
    recurringCharge: Boolean(d.isRecurring),
    cycleNumber: d.cycleNumber,
    paymentMethod: 'razorpay',
    donor: donor(d),
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
});

// Monthly sign-ups (one per donor) show on the Monthly Donations page.
const monthly = (await live('monthly_donation_intents').get()).docs.map((doc) => {
  const d = doc.data();
  const total = Number(d.amount) || 0;
  return {
    id: `monthly_${doc.id}`,
    receiptNo: str(d.razorpaySubscriptionId || doc.id),
    amount: Number(d.baseAmount ?? total) || 0,
    tipAmt: Number(d.supportAmount) || 0,
    grandTotal: total,
    cause: str(d.campaignTitle || 'General Fund'),
    causeSlug: str(d.campaignSlug),
    isMonthly: true,
    paymentMethod: 'razorpay',
    donor: donor(d),
    optAccount: false,
    optWa: false,
    utm: utmOf(d),
    paymentStatus: 'mandate',
    paidCount: d.paidCount,
    razorpayPaymentId: str(d.lastPaymentId || d.firstPaymentId),
    razorpayOrderId: '',
    razorpaySubscriptionId: str(d.razorpaySubscriptionId),
    mandateStatus: MANDATE[d.status] || 'pending',
    source: 'live',
    createdAt: when(d),
    updatedAt: str(d.lastChargedAt) || when(d),
  };
});

const allDonations = [...donations, ...monthly].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
await save('donations', allDonations);

// ── Form entries ──
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
const submissions = [];
for (const [type, [name, fieldsOf]] of Object.entries(FORMS)) {
  (await live(name).get()).docs.forEach((doc) => {
    const d = doc.data();
    const fields = Object.fromEntries(Object.entries(fieldsOf(d)).map(([k, v]) => [k, str(v)]).filter(([, v]) => v));
    const status = ['new', 'read', 'resolved'].includes(d.status) ? d.status : 'new';
    submissions.push({ id: `${type}_${doc.id}`, type, status, fields, source: 'live', createdAt: when(d), updatedAt: when(d) });
  });
}
submissions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
await save('submissions', submissions);

// ── Website content (the new website's current files) ──
const site = (file) => path.join(websiteDir, file);
await save('campaigns', json(site('lib/campaigns-data.json')), (x) => x.slug);
await save('blogs', json(site('lib/content/blogs.json')));
await save('celebCards', json(site('lib/content/celeb-image-cards.json')));
await save('celebBigCards', json(site('lib/content/celeb-big-cards.json')));
for (const [name, file] of [['hero', 'hero.json'], ['home', 'home.json'], ['site', 'site.json'], ['trust80g', 'trust-80g.json']]) {
  const f = site(`lib/content/${file}`);
  if (!existsSync(f)) continue;
  await v2('content').doc(name).set({ data: json(f), updatedAt: new Date().toISOString() });
  console.log(`v2_content/${name}`);
}

// ── Admin accounts ──
const usersFile = path.join(root, '.local-data', 'admin-users.json');
if (existsSync(usersFile)) await save('users', json(usersFile));

console.log('Done. The live collections were only read.');
