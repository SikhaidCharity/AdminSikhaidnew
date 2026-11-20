// Removes test and fake records from the admin's copy (v2_ collections only; the live site is never touched).
// Live-site records removed here are noted so the live sync doesn't copy them back.
//   node scripts/remove-test-data.mjs           list what would be removed
//   node scripts/remove-test-data.mjs --write   remove it
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const WRITE = process.argv.includes('--write');
initializeApp({ credential: cert(JSON.parse(readFileSync(new URL('../.secrets/firebase-key.json', import.meta.url), 'utf8'))) });
const db = getFirestore();
const all = async (c) => (await db.collection(`v2_${c}`).get()).docs.map((d) => ({ _ref: d.ref, _id: d.id, ...d.data() }));

const TEST_NAME = /(^|[\s_])(test|testing)($|[\s_])|diagnostic test|test donor/i;
const TEST_MESSAGE = /^\s*(test(\s+test)*|this is a test message\.?)\s*$/i;

const donations = await all('donations');
const goneDonations = donations.filter((d) => d.paymentStatus === 'simulated' || TEST_NAME.test(d.donor?.name || ''));
const goneIds = new Set(goneDonations.map((d) => d.id || d._id));

const certificates = await all('certificates');

const donors = await all('donors');
const goneDonors = donors.filter((d) =>
  TEST_NAME.test(d.name || '') ||
  ((d.donationIds || []).length > 0 && d.donationIds.every((id) => goneIds.has(id))));
const goneDonorIds = new Set(goneDonors.map((d) => d._id));
// Donors who keep an account but lose a test donation: fix their totals.
const fixDonors = donors.filter((d) => !goneDonorIds.has(d._id) && (d.donationIds || []).some((id) => goneIds.has(id)));

const submissions = await all('submissions');
const goneSubs = submissions.filter((s) => TEST_MESSAGE.test(s.fields?.Message || ''));

const rupees = (list) => list.reduce((n, d) => n + (Number(d.grandTotal) || 0), 0);
console.log(`Donations: ${goneDonations.length} (₹${rupees(goneDonations).toLocaleString('en-IN')})`);
goneDonations.forEach((d) => console.log(`  ${d.createdAt?.slice(0, 10)}  ₹${d.grandTotal}  ${d.paymentStatus}  ${d.donor?.name}  ${d.source || ''}`));
console.log(`80G certificates: ${certificates.length}`);
certificates.forEach((c) => console.log(`  ${c.certNo}  ${c.donor?.name}  ₹${c.amount}`));
console.log(`Donor accounts: ${goneDonors.length}`);
goneDonors.forEach((d) => console.log(`  ${d.name || '(no name)'}  ${d.email || ''}  ${d.phone || ''}  donations ${d.donationCount || 0}`));
console.log(`Donor accounts that only lose a test donation: ${fixDonors.length}`);
fixDonors.forEach((d) => console.log(`  ${d.name}  ${d.phone || d.email}`));
console.log(`Form messages: ${goneSubs.length}`);
goneSubs.forEach((s) => console.log(`  ${s.type}  ${s.fields?.Name}  "${s.fields?.Message}"`));

if (!WRITE) {
  console.log('\nDry run. Run with --write to remove.');
  process.exit(0);
}

const ops = [];
goneDonations.forEach((d) => ops.push((b) => b.delete(d._ref)));
certificates.forEach((c) => ops.push((b) => b.delete(c._ref)));
goneDonors.forEach((d) => {
  ops.push((b) => b.delete(d._ref));
  ops.push((b) => b.delete(db.collection('v2_donorAuth').doc(d._id)));
});
fixDonors.forEach((d) => {
  const keep = d.donationIds.filter((id) => !goneIds.has(id));
  const lost = goneDonations.filter((x) => d.donationIds.includes(x.id || x._id));
  ops.push((b) => b.update(d._ref, {
    donationIds: keep,
    donationCount: Math.max(0, (d.donationCount || 0) - lost.length),
    totalDonated: Math.max(0, (d.totalDonated || 0) - rupees(lost)),
  }));
});
goneSubs.forEach((s) => ops.push((b) => b.delete(s._ref)));
for (let i = 0; i < ops.length; i += 400) {
  const batch = db.batch();
  ops.slice(i, i + 400).forEach((op) => op(batch));
  await batch.commit();
}

const liveIds = [...goneDonations, ...goneSubs].filter((x) => x.source === 'live').map((x) => x._id);
if (liveIds.length) await db.collection('v2_content').doc('liveSyncRemoved').set({ ids: FieldValue.arrayUnion(...liveIds) }, { merge: true });
await db.collection('v2_content').doc('listVersions').set(
  Object.fromEntries(['donations', 'certificates', 'donors', 'submissions'].map((c) => [c, FieldValue.increment(1)])),
  { merge: true },
);
console.log(`\nRemoved. ${liveIds.length} live-site records noted so the sync skips them.`);
