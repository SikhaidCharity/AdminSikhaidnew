// Donor accounts. Every donation creates or updates its donor's account automatically: one per
// email address (or per phone number when no email was given). Donors sign in on the website
// straight after donating (with the donation's private download code), with a password they set,
// or with Google (when GOOGLE_CLIENT_ID is set). Server-only.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { findItem, findItems, getItem, putItem, tokenHash } from './local-store';
import { hashPassword, passwordMatches, sessionSecret } from './admin-users';

const clean = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const normEmail = (email) => {
  const e = clean(email).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : '';
};
const normPhone = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);

// The account a donor belongs to: the same email (or phone) always gives the same id.
export function donorIdFor(donor = {}) {
  const email = normEmail(donor.email);
  const phone = normPhone(donor.phone);
  const key = email ? `email:${email}` : phone.length === 10 ? `phone:${phone}` : '';
  return key ? `d_${createHash('sha256').update(key).digest('hex').slice(0, 20)}` : '';
}

const amountOf = (d) => Number(d.grandTotal) || Number(d.amount) || 0;

// What admins and the donor see. Passwords and Google links are kept elsewhere (donorAuth).
export const publicDonor = (d) => d && ({
  id: d.id,
  name: d.name || '',
  email: d.email || '',
  phone: d.phone || '',
  pan: d.pan || '',
  address: d.address || '',
  donationCount: d.donationCount || 0,
  totalDonated: d.totalDonated || 0,
  firstDonationAt: d.firstDonationAt || '',
  lastDonationAt: d.lastDonationAt || '',
  hasPassword: Boolean(d.hasPassword),
  google: Boolean(d.google),
  createdAt: d.createdAt || '',
  updatedAt: d.updatedAt || '',
});

// Adds a donation to its donor's account (creating the account the first time).
export async function recordDonation(donation) {
  const id = donation.donorId || donorIdFor(donation.donor);
  if (!id) return null;
  const now = new Date().toISOString();
  const at = donation.createdAt || now;
  const d = donation.donor || {};
  const existing = (await getItem('donors', id)) || null;
  const donor = {
    ...(existing || { id, createdAt: now, donationCount: 0, totalDonated: 0, firstDonationAt: at, source: 'donation' }),
    // The latest donation's details win, but an empty field never wipes a saved one.
    name: clean(d.name) || existing?.name || '',
    email: normEmail(d.email) || existing?.email || '',
    phone: normPhone(d.phone) || existing?.phone || '',
    pan: clean(d.pan, 10).toUpperCase() || existing?.pan || '',
    address: clean(d.address, 500) || existing?.address || '',
    updatedAt: now,
  };
  if (!existing?.donationIds?.includes(donation.id)) {
    donor.donationIds = [...(existing?.donationIds || []), donation.id].slice(-500);
    donor.donationCount = (existing?.donationCount || 0) + 1;
    donor.totalDonated = (existing?.totalDonated || 0) + amountOf(donation);
  }
  if (!donor.lastDonationAt || at > donor.lastDonationAt) donor.lastDonationAt = at;
  if (!donor.firstDonationAt || at < donor.firstDonationAt) donor.firstDonationAt = at;
  await putItem('donors', id, donor, donor.lastDonationAt);
  return donor;
}

export const donationsOf = (donorId) => findItems('donations', 'donorId', donorId);

// ── Sessions ─────────────────────────────────────────────────────────
// A signed token the website keeps and sends as "Authorization: Bearer ...". 30 days.
const SESSION_DAYS = 30;
const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = async (payload) => createHmac('sha256', `donor:${await sessionSecret()}`).update(payload).digest('base64url');

export async function sessionFor(donorId) {
  const payload = b64(JSON.stringify({ d: donorId, e: Date.now() + SESSION_DAYS * 864e5 }));
  return `${payload}.${await sign(payload)}`;
}

export async function donorFromRequest(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = await sign(payload);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
  if (!data?.d || !(data.e > Date.now())) return null;
  return getItem('donors', data.d);
}

// ── Signing in ───────────────────────────────────────────────────────
export class DonorError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const sameText = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Straight after donating: the donation's private download code proves it is this donor.
export async function signInWithDonation(receiptNo, token) {
  if (!receiptNo || !/^[a-f0-9]{32,64}$/.test(String(token || ''))) throw new DonorError('This link is not valid.', 401);
  let donation = null;
  for (let attempt = 0; attempt < 5 && !donation; attempt += 1) {
    donation = await findItem('donations', 'receiptNo', String(receiptNo));
    if (!donation) await pause(1500);
  }
  if (!donation?.downloadTokenHash || !sameText(donation.downloadTokenHash, tokenHash(token))) {
    throw new DonorError('This link is not valid.', 401);
  }
  let donor = donation.donorId ? await getItem('donors', donation.donorId) : null;
  if (!donor) donor = await recordDonation(donation);
  if (!donor) throw new DonorError('No account could be made for this donation.', 400);
  return donor;
}

const MIN_PASSWORD = 8;

export async function setPassword(donor, password) {
  if (String(password || '').length < MIN_PASSWORD) throw new DonorError(`The password needs at least ${MIN_PASSWORD} characters.`);
  const auth = (await getItem('donorAuth', donor.id)) || { id: donor.id };
  await putItem('donorAuth', donor.id, { ...auth, passwordHash: hashPassword(password), updatedAt: new Date().toISOString() });
  await putItem('donors', donor.id, { ...donor, hasPassword: true, updatedAt: new Date().toISOString() }, donor.lastDonationAt);
}

export async function signInWithPassword(email, password) {
  const id = donorIdFor({ email });
  const auth = id ? await getItem('donorAuth', id) : null;
  const ok = auth?.passwordHash && passwordMatches(password, auth.passwordHash);
  const donor = ok ? await getItem('donors', id) : null;
  if (!donor) throw new DonorError('Wrong email or password.', 401);
  return donor;
}

// Google: the website sends the ID token from "Sign in with Google"; Google confirms it here.
export const googleReady = () => Boolean(process.env.GOOGLE_CLIENT_ID);

export async function signInWithGoogle(credential) {
  if (!googleReady()) throw new DonorError('Google sign-in is not set up yet.', 400);
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(String(credential || ''))}`);
  const info = res.ok ? await res.json() : null;
  if (!info || info.aud !== process.env.GOOGLE_CLIENT_ID || String(info.email_verified) !== 'true' || !info.email) {
    throw new DonorError('Google could not confirm this account.', 401);
  }
  const email = normEmail(info.email);
  const id = donorIdFor({ email });
  const now = new Date().toISOString();
  let donor = await getItem('donors', id);
  if (!donor) {
    // Signed in with Google before ever donating: an empty account they can donate into.
    donor = { id, name: clean(info.name), email, phone: '', pan: '', address: '', donationCount: 0, totalDonated: 0, donationIds: [], firstDonationAt: '', lastDonationAt: '', createdAt: now, source: 'google' };
  }
  donor = { ...donor, google: true, name: donor.name || clean(info.name), updatedAt: now };
  await putItem('donors', id, donor, donor.lastDonationAt || now);
  const auth = (await getItem('donorAuth', id)) || { id };
  await putItem('donorAuth', id, { ...auth, googleSub: info.sub, updatedAt: now });
  return donor;
}

// The donor's own changes from the website's Profile tab. Email stays: it is the account itself.
export async function updateProfile(donor, input) {
  const next = {
    ...donor,
    name: clean(input?.name) || donor.name,
    phone: normPhone(input?.phone) || donor.phone,
    pan: clean(input?.pan, 10).toUpperCase(),
    address: clean(input?.address, 500),
    updatedAt: new Date().toISOString(),
  };
  if (next.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(next.pan)) throw new DonorError('Please enter a valid PAN (e.g. ABCDE1234F).');
  await putItem('donors', donor.id, next, next.lastDonationAt);
  return next;
}
