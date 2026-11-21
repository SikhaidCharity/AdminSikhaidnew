// Paying for a website donation with Razorpay (see lib/razorpay.js). Server-only.
// 1. startPayment: the website sends the donation; it is checked, kept here with a new Razorpay order
//    (v2_payOrders, status "open"), and the order goes back to the website's checkout.
// 2. confirmPayment: after paying, the website sends the order id, payment id and signature. The
//    signature is checked, Razorpay is asked for the payment (right order, right amount, captured), and
//    only then is the donation saved as paid, linked to the donor's account, and the receipt / 80G sent.
// 3. sweepOpenOrders: if the donor paid but closed the page before step 2, this finds the payment at
//    Razorpay and records it anyway. It runs with the admin's live check and the daily job.
// The same payment is only ever recorded once.
import { v2Collection } from './firebase';
import { afterDonation } from './certificates';
import { donorIdFor, recordDonation } from './donors';
import { cleanDonation, findItem, putItem } from './local-store';
import {
  PayError, capturePayment, createOrder, fetchPayment, orderPayments, razorpayKeyId, razorpayReady, signatureValid,
} from './razorpay';

const orders = () => v2Collection('payOrders');
const MAX_INR = 1000000; // ₹10 lakh per donation through the website
const MINOR = 100; // paise, cents, fils…
const SWEEP_AFTER_MS = 5 * 60000; // give the donor's own page 5 minutes first
const GIVE_UP_AFTER_MS = 3 * 864e5;

export async function startPayment(body) {
  if (!razorpayReady()) throw new PayError('Online payment is not available right now. Please try again shortly.', 503);
  const donation = cleanDonation(body);
  if (!donation) throw new PayError('Some donation details are missing.');
  if (donation.isMonthly) throw new PayError('Monthly giving is set up on its own page.');
  if (!donation.donor.name || !(donation.donor.phone || donation.donor.email)) throw new PayError('Please add your name and mobile number.');

  const intl = donation.international;
  const currency = intl ? donation.currency : 'INR';
  const total = intl ? donation.foreignTotal : donation.grandTotal;
  if (!(total >= 1)) throw new PayError('Please enter an amount.');
  if (donation.grandTotal > MAX_INR) throw new PayError('For gifts above ₹10,00,000 please contact us directly.');
  const amount = Math.round(total * MINOR);

  const order = await createOrder({
    amount,
    currency,
    receipt: `web-${Date.now()}`,
    notes: {
      source: 'new-website',
      cause: donation.cause.slice(0, 200),
      name: donation.donor.name.slice(0, 200),
      phone: donation.donor.phone,
      email: donation.donor.email.slice(0, 200),
    },
  });
  await orders().doc(order.id).set({ status: 'open', donation, amount, currency, createdAt: new Date().toISOString() });
  return { orderId: order.id, keyId: razorpayKeyId(), amount, currency };
}

// Saves a checked, captured payment as a paid donation. Returns { donation, isNew }.
async function recordPaid(orderId, saved, payment) {
  const existing = await findItem('donations', 'razorpayPaymentId', payment.id);
  if (existing) return { donation: existing, isNew: false };
  const now = new Date().toISOString();
  const donation = {
    ...saved.donation,
    id: payment.id,
    receiptNo: payment.id,
    paymentStatus: 'paid',
    paymentMethod: payment.method || saved.donation.paymentMethod || '',
    razorpayPaymentId: payment.id,
    razorpayOrderId: orderId,
    source: 'website',
    createdAt: now,
    updatedAt: now,
  };
  donation.donorId = donorIdFor(donation.donor);
  await putItem('donations', donation.id, donation, now);
  await orders().doc(orderId).set({ ...saved, status: 'paid', paidWith: payment.id, paidAt: now });
  await recordDonation(donation).catch((e) => console.error('Donor account not updated:', e));
  return { donation, isNew: true };
}

// Razorpay's own record must match the order we made; capture it if the account doesn't auto-capture.
async function checkedPayment(orderId, saved, payment) {
  if (payment.order_id !== orderId || payment.amount !== saved.amount || payment.currency !== saved.currency) {
    throw new PayError('This payment does not match the donation.', 400);
  }
  if (payment.status === 'authorized') return capturePayment(payment.id, saved.amount, saved.currency);
  return payment;
}

export async function confirmPayment({ orderId, paymentId, signature }) {
  if (!razorpayReady()) throw new PayError('Online payment is not available right now.', 503);
  if (!orderId || !paymentId || !signatureValid(orderId, paymentId, signature)) {
    throw new PayError('We could not confirm this payment. If money was taken, it will be refunded automatically.', 400);
  }
  const existing = await findItem('donations', 'razorpayPaymentId', paymentId);
  if (existing) return { donation: existing, isNew: false };

  const saved = (await orders().doc(orderId).get()).data();
  if (!saved) throw new PayError('This payment does not match a donation started on our website.', 404);
  const payment = await checkedPayment(orderId, saved, await fetchPayment(paymentId));
  if (payment.status !== 'captured') throw new PayError('The payment has not gone through yet.', 402);
  return recordPaid(orderId, saved, payment);
}

// Orders still open after a few minutes: ask Razorpay whether they were paid, and record those.
export async function sweepOpenOrders() {
  if (!razorpayReady()) return { checked: 0, recorded: 0 };
  const now = Date.now();
  const open = (await orders().where('status', '==', 'open').get()).docs
    .filter((d) => now - Date.parse(d.data().createdAt || 0) > SWEEP_AFTER_MS);
  let recorded = 0;
  for (const doc of open) {
    const saved = doc.data();
    try {
      const payments = (await orderPayments(doc.id)).items || [];
      const paid = payments.find((p) => p.status === 'captured') || payments.find((p) => p.status === 'authorized');
      if (paid) {
        const payment = await checkedPayment(doc.id, saved, paid);
        if (payment.status === 'captured') {
          const { donation, isNew } = await recordPaid(doc.id, saved, payment);
          if (isNew) {
            recorded += 1;
            await afterPaid(donation);
          }
          continue;
        }
      }
      if (now - Date.parse(saved.createdAt || 0) > GIVE_UP_AFTER_MS) await doc.ref.update({ status: 'abandoned' });
    } catch (e) {
      console.error('Open order check failed', doc.id, e.message);
    }
  }
  return { checked: open.length, recorded };
}

// The receipt and 80G (WhatsApp) for a just-paid donation.
export const afterPaid = (donation) => afterDonation(donation).catch((e) => console.error('Receipt / 80G failed:', e));
