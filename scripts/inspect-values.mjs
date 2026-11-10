// Read-only: distinct values of a few status fields.
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: cert(JSON.parse(readFileSync(new URL('../.secrets/firebase-key.json', import.meta.url)))) });
const db = getFirestore();
const count = async (col, field) => { const c = {}; (await db.collection(col).select(field).get()).docs.forEach(d => { const v = String(d.get(field)); c[v] = (c[v] || 0) + 1; }); console.log(col, field, c); };
await count('contact_submissions', 'status'); await count('volunteer_submissions', 'status');
await count('monthly_donation_intents', 'status'); await count('donations', 'isRecurring');
const v = (await db.collection('volunteer_submissions').limit(1).get()).docs[0].data(); console.log(Object.keys(v));
const dn = (await db.collection('donations').where('isRecurring','==',true).limit(1).get()).docs[0]?.data(); console.log(dn && Object.keys(dn));
