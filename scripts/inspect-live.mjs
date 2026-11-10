// Read-only: lists Firestore collections, document counts and field names. Writes nothing.
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
const key = JSON.parse(readFileSync(new URL('../.secrets/firebase-key.json', import.meta.url)));
initializeApp({ credential: cert(key), storageBucket: `${key.project_id}.firebasestorage.app` });
const db = getFirestore();
const shape = (v) => Array.isArray(v) ? 'array' : v === null ? 'null' : v?.toDate ? 'timestamp' : typeof v;
for (const col of await db.listCollections()) {
  const snap = await col.get();
  const fields = {};
  snap.docs.slice(0, 50).forEach(d => Object.entries(d.data()).forEach(([k, v]) => { fields[k] = shape(v); }));
  console.log(`\n## ${col.id}  (${snap.size} docs)  ids e.g. ${snap.docs.slice(0, 3).map(d => d.id).join(', ')}`);
  console.log('   ' + Object.entries(fields).map(([k, t]) => `${k}:${t}`).join('  '));
  for (const d of snap.docs.slice(0, 3)) {
    const subs = await d.ref.listCollections();
    if (subs.length) console.log(`   subcollections on ${d.id}: ${subs.map(s => s.id).join(', ')}`);
  }
}
const [files] = await getStorage().bucket().getFiles({ maxResults: 2000 });
const folders = {};
files.forEach(f => { const top = f.name.includes('/') ? f.name.split('/')[0] + '/' : '(root)'; folders[top] = (folders[top] || 0) + 1; });
console.log('\n## storage', folders);
