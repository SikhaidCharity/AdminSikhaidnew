// One-off: makes a donor account for every donation in the v2 copy and links each donation to it
// (v2_donors, donations' donorId). Same rules as lib/donors.js: one account per email, or per phone.
// Usage: node scripts/build-donor-accounts.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const root = fileURLToPath(new URL('..', import.meta.url));
initializeApp({ credential: cert(JSON.parse(readFileSync(path.join(root, '.secrets', 'firebase-key.json'), 'utf8'))) });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

const normEmail = (e) => { const v = String(e || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : ''; };
const normPhone = (p) => String(p || '').replace(/\D/g, '').slice(-10);
const idFor = (d = {}) => {
  const email = normEmail(d.email);
  const phone = normPhone(d.phone);
  const key = email ? `email:${email}` : phone.length === 10 ? `phone:${phone}` : '';
  return key ? `d_${createHash('sha256').update(key).digest('hex').slice(0, 20)}` : '';
};

const snap = await db.collection('v2_donations').get();
const donors = new Map();
const links = [];
snap.docs.forEach((doc) => {
  const d = doc.data();
  const id = idFor(d.donor);
  if (!id) return;
  if (d.donorId !== id) links.push([doc.ref, id]);
  const at = d.createdAt || '';
  const total = Number(d.grandTotal) || Number(d.amount) || 0;
  const x = donors.get(id) || { id, name: '', email: '', phone: '', pan: '', address: '', donationIds: [], donationCount: 0, totalDonated: 0, firstDonationAt: at, lastDonationAt: at, source: 'donation' };
  x.donationIds.push(doc.id);
  x.donationCount += 1;
  x.totalDonated += total;
  if (at && (!x.firstDonationAt || at < x.firstDonationAt)) x.firstDonationAt = at;
  if (at && at >= (x.lastDonationAt || '')) {
    // Newest donation's details win; empty fields never wipe saved ones.
    x.lastDonationAt = at;
    x.name = String(d.donor?.name || '').trim() || x.name;
    x.email = normEmail(d.donor?.email) || x.email;
    x.phone = normPhone(d.donor?.phone) || x.phone;
    x.pan = String(d.donor?.pan || '').trim().toUpperCase() || x.pan;
    x.address = String(d.donor?.address || '').trim() || x.address;
  } else {
    x.name = x.name || String(d.donor?.name || '').trim();
    x.email = x.email || normEmail(d.donor?.email);
    x.phone = x.phone || normPhone(d.donor?.phone);
    x.pan = x.pan || String(d.donor?.pan || '').trim().toUpperCase();
    x.address = x.address || String(d.donor?.address || '').trim();
  }
  donors.set(id, x);
});

const now = new Date().toISOString();
const existing = new Map((await db.collection('v2_donors').get()).docs.map((d) => [d.id, d.data()]));
const ops = [];
donors.forEach((x, id) => {
  const old = existing.get(id) || {};
  ops.push((b) => b.set(db.collection('v2_donors').doc(id), {
    ...old, ...x, donationIds: x.donationIds.slice(-500), createdAt: old.createdAt || x.firstDonationAt || now, updatedAt: now,
    hasPassword: Boolean(old.hasPassword), google: Boolean(old.google), _pos: -Date.parse(x.lastDonationAt || 0) || 0,
  }));
});
links.forEach(([ref, id]) => ops.push((b) => b.update(ref, { donorId: id })));
for (let i = 0; i < ops.length; i += 400) {
  const b = db.batch();
  ops.slice(i, i + 400).forEach((op) => op(b));
  await b.commit();
}
console.log(`donations read: ${snap.size}, donor accounts: ${donors.size}, donations linked: ${links.length}`);
