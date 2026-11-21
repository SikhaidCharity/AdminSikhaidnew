// Razorpay for website donations. Server-only.
//   RAZORPAY_KEY_ID      the key id (public; the website's checkout uses it)
//   RAZORPAY_KEY_SECRET  the key secret (never leaves this server)
// Flow: the website asks for an order (the donation details are kept here with it), the donor pays in
// Razorpay's checkout, then the website sends back the payment id and signature. We check the signature
// AND ask Razorpay for the payment itself before recording anything as paid.
import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.razorpay.com/v1';

export const razorpayKeyId = () => String(process.env.RAZORPAY_KEY_ID || '').trim();
const secret = () => String(process.env.RAZORPAY_KEY_SECRET || '').trim();
export const razorpayReady = () => Boolean(razorpayKeyId() && secret());

export class PayError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${razorpayKeyId()}:${secret()}`).toString('base64')}`,
      ...(body && { 'Content-Type': 'application/json' }),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = data?.error?.description || `Razorpay answered ${res.status}`;
    console.error('Razorpay', method, path, res.status, why);
    throw new PayError(why, res.status >= 500 ? 502 : 400);
  }
  return data;
}

// amount is in the currency's smallest unit (paise, cents…).
export const createOrder = ({ amount, currency, receipt, notes }) =>
  call('POST', '/orders', { amount, currency, receipt: String(receipt).slice(0, 40), notes });

export const fetchPayment = (id) => call('GET', `/payments/${encodeURIComponent(id)}`);

export const orderPayments = (orderId) => call('GET', `/orders/${encodeURIComponent(orderId)}/payments`);

export const capturePayment = (id, amount, currency) =>
  call('POST', `/payments/${encodeURIComponent(id)}/capture`, { amount, currency });

// Razorpay signs "order_id|payment_id" with the key secret.
export function signatureValid(orderId, paymentId, signature) {
  const expected = Buffer.from(createHmac('sha256', secret()).update(`${orderId}|${paymentId}`).digest('hex'));
  const given = Buffer.from(String(signature || ''));
  return expected.length === given.length && timingSafeEqual(expected, given);
}
