// Read-only: what the live site has that the v2 copy doesn't have yet. Writes nothing.
// Usage: node scripts/check-live-gap.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const root = fileURLToPath(new URL('..', import.meta.url));
initializeApp({ credential: cert(JSON.parse(readFileSync(path.join(root, '.secrets', 'firebase-key.json'), 'utf8'))) });
const db = getFirestore();
const when = (d) => d.timestamp || d.firestoreTimestamp?.toDate?.().toISOString() || d.createdAt || '';

const v2ids = new Set((await db.collection('v2_donations').select().get()).docs.map((d) => d.id));
const subIds = new Set((await db.collection('v2_submissions').select().get()).docs.map((d) => d.id));
const mark = (await db.collection('v2_donations').where('receiptNo', '==', 'pay_TyRpVBJUHBGLJ8').get()).docs[0]?.data();
console.log('pay_TyRpVBJUHBGLJ8 in admin copy:', mark ? `${mark.createdAt}  ${mark.donor?.name}  Rs ${mark.grandTotal}` : 'not found');

const report = async (live, idOf, have) => {
  const docs = (await db.collection(live).get()).docs;
  const missing = docs.filter((d) => !have.has(idOf(d.id))).map((d) => ({ at: when(d.data()), total: Number(d.data().amount) || 0 }));
  missing.sort((a, b) => a.at.localeCompare(b.at));
  const sum = missing.reduce((s, x) => s + x.total, 0);
  console.log(`${live}: live ${docs.length}, not in admin ${missing.length}` + (missing.length ? `, Rs ${sum.toLocaleString('en-IN')}, ${missing[0].at.slice(0, 16)} → ${missing.at(-1).at.slice(0, 16)}` : ''));
};
await report('donations', (id) => id, v2ids);
await report('monthly_donation_intents', (id) => `monthly_${id}`, v2ids);
for (const [type, name] of [['contact', 'contact_submissions'], ['volunteer', 'volunteer_submissions'], ['csr', 'csr_submissions']]) {
  await report(name, (id) => `${type}_${id}`, subIds);
}
// Admin-side records made since the copy (would be lost by a full --force re-copy)
const own = (await db.collection('v2_donations').get()).docs.filter((d) => d.data().source !== 'live').length;
const ownSubs = (await db.collection('v2_submissions').get()).docs.filter((d) => d.data().source !== 'live').length;
console.log(`Made in the new admin/website since the copy: ${own} donations, ${ownSubs} form entries`);
