// Donor sign-in with a phone number: a 6-digit code sent on WhatsApp (GetGabs, Authentication template
// "sikhaid_login_code"), then checked here. Server-only.
//   GETGABS_OTP_TEMPLATE       the template's name (default sikhaid_login_code)
//   GETGABS_OTP_TEMPLATE_LANG  its language (default en_US)
// Limits: a code lasts 10 minutes and allows 5 tries; a number gets at most 3 codes per 15 minutes
// and 10 per day, with 30 seconds between them.
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { v2Collection } from './firebase';
import { sessionSecret } from './admin-users';
import { whatsappNumber, whatsappMissing } from './certificates';
import { DonorError, donorIdFor } from './donors';
import { findItems, getItem, putItem } from './local-store';

const GETGABS_SEND = 'https://app.getgabs.com/whatsappbusiness/send-templated-message';
const CODE_MINUTES = 10;
const MAX_TRIES = 5;
const GAP_SECONDS = 30;
const WINDOW_MINUTES = 15;
const PER_WINDOW = 3;
const PER_DAY = 10;
// All numbers together, so the form can't be used to message many strangers.
const SITE_PER_HOUR = 150;

const record = (to) => v2Collection('donorOtp').doc(to);
const hashOf = async (to, code) => createHash('sha256').update(`otp:${to}:${code}:${await sessionSecret()}`).digest('hex');
const tenDigits = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);

async function deliverCode(to, code) {
  const missing = whatsappMissing().filter((k) => k !== 'GETGABS_TEMPLATE' && k !== 'ADMIN_PUBLIC_URL');
  if (missing.length) throw new DonorError('Phone sign-in is not available right now. Please use email or Google.', 503);
  const res = await fetch(GETGABS_SEND, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: process.env.GETGABS_API_KEY,
      sender: process.env.GETGABS_SENDER,
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: process.env.GETGABS_OTP_TEMPLATE || 'sikhaid_login_code',
        language: { code: process.env.GETGABS_OTP_TEMPLATE_LANG || 'en_US' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          // The "Copy code" button carries the code too.
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
        ],
      },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.messages?.[0]?.id) {
    console.error('Login code not sent:', JSON.stringify(data?.error || data).slice(0, 300));
    throw new DonorError('We could not send a code to this WhatsApp number. Check the number and try again.', 502);
  }
}

// Sends a new code to the number. Returns where it went (masked) so the page can say so.
export async function sendLoginCode(phone) {
  const to = whatsappNumber(phone);
  if (!to || tenDigits(to).length < 10) throw new DonorError('Enter a valid mobile number.');
  const now = Date.now();
  const saved = (await record(to).get()).data() || {};
  const sends = (saved.sends || []).filter((t) => now - t < 864e5);
  if (sends.length && now - sends[sends.length - 1] < GAP_SECONDS * 1000) {
    throw new DonorError('Please wait a few seconds before asking for another code.', 429);
  }
  if (sends.filter((t) => now - t < WINDOW_MINUTES * 60000).length >= PER_WINDOW || sends.length >= PER_DAY) {
    throw new DonorError('Too many codes for this number. Please try again later, or use email or Google.', 429);
  }
  const site = v2Collection('donorOtp').doc('_all');
  const hour = Math.floor(now / 3600000);
  const total = (await site.get()).data() || {};
  const used = total.hour === hour ? total.count || 0 : 0;
  if (used >= SITE_PER_HOUR) throw new DonorError('Phone sign-in is busy right now. Please try again shortly, or use email or Google.', 429);
  await site.set({ hour, count: used + 1 });

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await deliverCode(to, code);
  await record(to).set({ codeHash: await hashOf(to, code), expiresAt: now + CODE_MINUTES * 60000, tries: 0, sends: [...sends, now] });
  return { to: `+${to.slice(0, -10)} ${'•'.repeat(6)}${to.slice(-4)}` };
}

// The donor account for a phone number: the one with the most giving if several share it,
// or a new empty account (like signing in with Google before ever donating).
async function donorForPhone(to) {
  const phone = tenDigits(to);
  const matches = await findItems('donors', 'phone', phone);
  if (matches.length) {
    return matches.sort((a, b) => (b.donationCount || 0) - (a.donationCount || 0) || String(b.lastDonationAt).localeCompare(String(a.lastDonationAt)))[0];
  }
  const id = donorIdFor({ phone });
  const existing = await getItem('donors', id);
  if (existing) return existing;
  const now = new Date().toISOString();
  const donor = { id, name: '', email: '', phone, pan: '', address: '', donationCount: 0, totalDonated: 0, donationIds: [], firstDonationAt: '', lastDonationAt: '', createdAt: now, updatedAt: now, source: 'phone' };
  await putItem('donors', id, donor, now);
  return donor;
}

// Checks the code; on success returns the donor to sign in.
export async function signInWithCode(phone, code) {
  const to = whatsappNumber(phone);
  const clean = String(code || '').replace(/\D/g, '');
  if (!to || clean.length !== 6) throw new DonorError('Enter the 6-digit code from WhatsApp.');
  const ref = record(to);
  const saved = (await ref.get()).data();
  if (!saved?.codeHash || !(saved.expiresAt > Date.now())) throw new DonorError('This code has expired. Ask for a new one.', 401);
  if ((saved.tries || 0) >= MAX_TRIES) throw new DonorError('Too many wrong tries. Ask for a new code.', 429);
  const expected = Buffer.from(saved.codeHash);
  const given = Buffer.from(await hashOf(to, clean));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await ref.set({ ...saved, tries: (saved.tries || 0) + 1 });
    throw new DonorError('That code is not right. Check WhatsApp and try again.', 401);
  }
  // Used once only.
  await ref.set({ ...saved, codeHash: '', expiresAt: 0 });
  const donor = await donorForPhone(to);
  if (!donor.phoneVerified) {
    donor.phoneVerified = true;
    await putItem('donors', donor.id, { ...donor, updatedAt: new Date().toISOString() }, donor.lastDonationAt || donor.createdAt);
  }
  return donor;
}
