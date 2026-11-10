// Firestore side of lib/local-store.js. One document per entry in v2_<collection>, kept in
// order by a hidden _pos field; one-record sections live in v2_content/<name>.
import { randomBytes } from 'node:crypto';
import { v2Collection, firestore } from './firebase';

const POS = Symbol('pos');
const docId = (value) => String(value || randomBytes(8).toString('hex')).replace(/\//g, '_').slice(0, 300);

export async function read(collection, singleton) {
  if (singleton) {
    const snap = await v2Collection('content').doc(collection).get();
    return snap.exists ? snap.get('data') || {} : {};
  }
  const snap = await v2Collection(collection).orderBy('_pos').get();
  return snap.docs.map((doc) => {
    const { _pos, ...item } = doc.data();
    Object.defineProperty(item, POS, { value: _pos, enumerable: false });
    return item;
  });
}

// Saves only what changed between `before` (as read) and `data` (after the edit).
export async function write(collection, singleton, data, before, keyOf) {
  if (singleton) {
    await v2Collection('content').doc(collection).set({ data, updatedAt: new Date().toISOString() });
    return;
  }
  const ref = v2Collection(collection);
  const keyFor = (item) => docId(keyOf(item));
  const old = new Map((before || []).map((item) => [keyFor(item), item]));
  const keys = data.map(keyFor);
  const kept = keys.filter((k) => old.has(k));
  const keptBefore = [...old.keys()].filter((k) => keys.includes(k));
  const firstKept = keys.findIndex((k) => old.has(k));
  const addedOnlyAtFront = keys.every((k, i) => old.has(k) || firstKept === -1 || i < firstKept);
  const sameOrder = kept.length === keptBefore.length && kept.every((k, i) => k === keptBefore[i]);

  const positions = new Map();
  if (sameOrder && addedOnlyAtFront) {
    const existing = [...old.values()].map((item) => item[POS]).filter(Number.isFinite);
    const base = existing.length ? Math.min(...existing) : 0;
    const added = keys.filter((k) => !old.has(k));
    added.forEach((k, i) => positions.set(k, base - (added.length - i)));
    kept.forEach((k) => positions.set(k, old.get(k)[POS] ?? 0));
  } else {
    keys.forEach((k, i) => positions.set(k, i));
  }

  const ops = [];
  data.forEach((item, i) => {
    const k = keys[i];
    const previous = old.get(k);
    const pos = positions.get(k);
    if (!previous || previous[POS] !== pos || JSON.stringify(previous) !== JSON.stringify(item)) {
      ops.push((batch) => batch.set(ref.doc(k), { ...item, _pos: pos }));
    }
  });
  old.forEach((_, k) => {
    if (!keys.includes(k)) ops.push((batch) => batch.delete(ref.doc(k)));
  });
  for (let i = 0; i < ops.length; i += 400) {
    const batch = firestore().batch();
    ops.slice(i, i + 400).forEach((op) => op(batch));
    await batch.commit();
  }
}

// Adds one entry at the top of the list without reading the rest.
export async function addFirst(collection, item, id) {
  await v2Collection(collection).doc(docId(id)).set({ ...item, _pos: -Date.now() });
}
