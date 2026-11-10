// Connection to the shared Firebase project. The admin only ever uses collections and files
// starting with "v2" — a separate copy — so the current live website's data is never touched.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

export const PREFIX = 'v2_';
export const STORAGE_FOLDER = 'v2/';

function loadKey() {
  // On Vercel: the key file's contents, base64-encoded, in FIREBASE_SERVICE_ACCOUNT_BASE64.
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (encoded) return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  // On this computer: the downloaded key file in the private .secrets folder.
  const file = path.join(process.cwd(), '.secrets', 'firebase-key.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  return null;
}

let key;
const getKey = () => (key === undefined ? (key = loadKey()) : key);

export const hasFirebase = () => Boolean(getKey());

function app() {
  if (!getApps().length) {
    const k = getKey();
    if (!k) throw new Error('Firebase is not set up (see .env.example).');
    initializeApp({
      credential: cert(k),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${k.project_id}.firebasestorage.app`,
    });
  }
  return getApps()[0];
}

// Every collection name passes through here, so code can't reach the live site's collections.
export function v2Collection(name) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Bad collection name: ${name}`);
  return firestore().collection(PREFIX + name);
}

// The database connection is shared by every page of the app, so its settings are applied once
// for the whole process (a flag per file would try again from each page and fail).
export function firestore() {
  const db = getFirestore(app());
  if (!globalThis.__sikhaidFirestoreConfigured) {
    try {
      db.settings({ ignoreUndefinedProperties: true });
    } catch {
      // Already in use with its settings applied.
    }
    globalThis.__sikhaidFirestoreConfigured = true;
  }
  return db;
}

export function v2File(name) {
  return getStorage(app()).bucket().file(STORAGE_FOLDER + name);
}

export const bucketName = () => getStorage(app()).bucket().name;
