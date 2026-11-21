// Website donation, step 2: confirm the payment with Razorpay, then record the donation as paid.
import { after } from 'next/server';
import { afterPaid, confirmPayment } from '@/lib/donation-payments';
import { PayError } from '@/lib/razorpay';
import { json, preflight } from '@/lib/donor-http';
import { isDisabled } from '@/lib/local-store';

export const OPTIONS = preflight;
export const maxDuration = 60;

export async function POST(request) {
  if (isDisabled()) return json({ error: 'Not found' }, 404);
  const body = await request.json().catch(() => ({}));
  try {
    const { donation, isNew } = await confirmPayment(body);
    // Receipt on WhatsApp and the 80G certificate, once the donor has their answer (first time only).
    if (isNew) after(() => afterPaid(donation));
    return json({ receiptNo: donation.receiptNo, paymentId: donation.razorpayPaymentId, amount: donation.grandTotal });
  } catch (e) {
    if (e instanceof PayError) return json({ error: e.message }, e.status);
    console.error('Payment confirmation failed:', e);
    return json({ error: 'We could not confirm the payment. Please contact us if money was taken.' }, 500);
  }
}
