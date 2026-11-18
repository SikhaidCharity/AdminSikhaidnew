// Firestore side of lib/local-store.js. One document per entry in v2_<collection>, kept in
// order by a hidden _pos field; one-record sections live in v2_content/<name>.
import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { v2Collection, firestore } from './firebase';

const POS = Symbol('pos');
const docId = (value) => String(value || randomBytes(8).toString('hex')).replace(/\//g, '_').slice(0, 300);

export async function read(collection, singleton) {
  if (singleton) {
    const snap = await v2Collection('content').doc(collection).get();
    return snap.exists ? snap.get('data') || {} : {};
  }
  // Big lists (donations, donors) take seconds to read, so each server keeps its last read in
  // memory and uses it while the list's version number (bumped on every save) hasn't changed.
  const version = await versionOf(collection);
  const hit = cache.get(collection);
  if (hit && version !== null && hit.version === version) return copy(hit.items);
  const snap = await v2Collection(collection).orderBy('_pos').get();
  const items = snap.docs.map((doc) => {
    const { _pos, ...item } = doc.data();
    Object.defineProperty(item, POS, { value: _pos, enumerable: false });
    return item;
  });
  if (version !== null) cache.set(collection, { version, items });
  return copy(items);
}

// ── List cache ──
// v2_content/listVersions holds one number per list. Every save through this file (and the live
// sync, via changed()) adds one, so a server's cached copy is used only while nothing has changed.
const cache = globalThis.__sikhaidListCache || (globalThis.__sikhaidListCache = new Map());
const VERSIONS = () => v2Collection('content').doc('listVersions');

async function versionOf(collection) {
  try {
    const snap = await VERSIONS().get();
    return Number(snap.get(collection) || 0);
  } catch {
    return null; // can't tell, so don't use the cache
  }
}

// Marks a list as changed, so every server reads it fresh next time.
export async function changed(...collections) {
  collections.forEach((c) => cache.delete(c));
  const update = Object.fromEntries(collections.map((c) => [c, FieldValue.increment(1)]));
  await VERSIONS().set(update, { merge: true });
}

// Callers may edit what they get, so each gets its own copy (keeping the hidden position).
function copy(items) {
  return items.map((item) => {
    const c = structuredClone(item);
    Object.defineProperty(c, POS, { value: item[POS], enumerable: false });
    return c;
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
  if (ops.length) await changed(collection);
}

// Adds one entry at the top of the list without reading the rest.
export async function addFirst(collection, item, id) {
  await v2Collection(collection).doc(docId(id)).set({ ...item, _pos: -Date.now() });
  await changed(collection);
}

// The first entry whose field equals value, or null.
export async function findOne(collection, field, value) {
  const snap = await v2Collection(collection).where(field, '==', value).limit(1).get();
  if (snap.empty) return null;
  const { _pos, ...item } = snap.docs[0].data();
  return item;
}

// One entry by its id, or null.
export async function getById(collection, id) {
  const snap = await v2Collection(collection).doc(docId(id)).get();
  if (!snap.exists) return null;
  const { _pos, ...item } = snap.data();
  return item;
}

// Every entry whose field equals value, newest first.
export async function findAll(collection, field, value) {
  const snap = await v2Collection(collection).where(field, '==', value).get();
  return snap.docs
    .map((doc) => {
      const { _pos, ...item } = doc.data();
      return { item, pos: _pos ?? 0 };
    })
    .sort((a, b) => a.pos - b.pos)
    .map((x) => x.item);
}

// Saves one entry under a chosen id (replacing it), at the given list position.
export async function setById(collection, id, item, pos) {
  await v2Collection(collection).doc(docId(id)).set({ ...item, _pos: pos });
  await changed(collection);
}
