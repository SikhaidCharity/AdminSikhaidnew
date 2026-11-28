// Meta Conversions API: tells Meta about every paid website donation from this server, so a donation
// still counts when the browser's Pixel can't fire (the donor left after paying in their UPI app, an
// ad blocker, iOS tracking limits). The website's Pixel (through GTM) sends the same "Purchase" with the
// same event id (the Razorpay payment id), so Meta counts it once.
// Env (Vercel → admin project):
//   META_CAPI_TOKEN        access token from Meta Events Manager → the Pixel → Settings → Conversions API.
//                          Without it nothing is sent.
//   META_PIXEL_ID          defaults to SikhAid's Pixel (the one in GTM-WN3VPN86).
//   META_TEST_EVENT_CODE   optional, to see events under Events Manager → Test events.
import { createHash } from 'node:crypto';

const PIXEL_ID = process.env.META_PIXEL_ID || '1039998462258315';
const API = 'https://graph.facebook.com/v21.0';
const SITE = 'https://www.sikhaid.ngo';

const sha = (value) => (value ? createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex') : undefined);
const clean = (value, max = 500) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// What the website sends with the donation, kept with the order (never in the donation record):
// Meta's browser id (_fbp), click id (_fbc), and the page the donor was on.
export function cleanTracking(body, request) {
  const t = body?.tracking || {};
  const fbp = /^fb\.\d\.\d+\.\d+$/.test(clean(t.fbp, 100)) ? clean(t.fbp, 100) : '';
  const fbc = /^fb\.\d\.\d+\.[\w-]+$/.test(clean(t.fbc, 300)) ? clean(t.fbc, 300) : '';
  let url = clean(t.url, 1000);
  try {
    if (new URL(url).hostname.replace(/^www\./, '') !== 'sikhaid.ngo') url = '';
  } catch (e) {
    url = '';
  }
  const ip = clean(request?.headers?.get?.('x-forwarded-for') || '', 100).split(',')[0].trim();
  const ua = clean(request?.headers?.get?.('user-agent') || '', 500);
  return { fbp, fbc, url, ip, ua };
}

const phoneDigits = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 10 ? `91${digits}` : digits.replace(/^0+/, '');
};

// Sends one "Purchase" for a paid donation. Never throws; returns what happened.
export async function sendPurchase(donation, tracking = {}) {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) return { sent: false, reason: 'no token' };
  if (!donation?.razorpayPaymentId || donation.test === true) return { sent: false, reason: 'skipped' };

  const donor = donation.donor || {};
  const [first, ...rest] = clean(donor.name, 200).split(/\s+/);
  const user = {
    em: donor.email ? [sha(donor.email)] : undefined,
    ph: phoneDigits(donor.phone) ? [sha(phoneDigits(donor.phone))] : undefined,
    fn: first ? [sha(first)] : undefined,
    ln: rest.length ? [sha(rest.join(' '))] : undefined,
    country: [sha(donation.international ? '' : 'in')].filter(Boolean),
    external_id: donation.donorId ? [sha(donation.donorId)] : undefined,
    client_ip_address: tracking.ip || undefined,
    client_user_agent: tracking.ua || undefined,
    fbp: tracking.fbp || undefined,
    fbc: tracking.fbc || undefined,
  };
  const event = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.parse(donation.createdAt || '') / 1000) || Math.floor(Date.now() / 1000),
    event_id: donation.razorpayPaymentId,
    action_source: 'website',
    event_source_url: tracking.url || (donation.causeSlug ? `${SITE}/campaigns/${donation.causeSlug}` : SITE),
    user_data: Object.fromEntries(Object.entries(user).filter(([, v]) => v !== undefined && (!Array.isArray(v) || v.length))),
    custom_data: {
      value: Number(donation.grandTotal) || 0,
      currency: 'INR',
      content_name: clean(donation.cause, 200),
      content_ids: donation.causeSlug ? [donation.causeSlug] : undefined,
      order_id: donation.razorpayPaymentId,
    },
  };
  const body = { data: [event], ...(process.env.META_TEST_EVENT_CODE && { test_event_code: process.env.META_TEST_EVENT_CODE }) };
  try {
    const res = await fetch(`${API}/${PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('Meta CAPI failed:', res.status, out?.error?.message);
      return { sent: false, reason: out?.error?.message || `HTTP ${res.status}` };
    }
    return { sent: true, received: out.events_received };
  } catch (e) {
    console.error('Meta CAPI failed:', e.message);
    return { sent: false, reason: e.message };
  }
}
