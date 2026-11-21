// Website donation, step 1: make the Razorpay order (see lib/donation-payments.js).
import { startPayment } from '@/lib/donation-payments';
import { PayError } from '@/lib/razorpay';
import { json, preflight } from '@/lib/donor-http';
import { withSiteOrigin } from '@/lib/paths';
import { isDisabled } from '@/lib/local-store';

export const OPTIONS = preflight;

async function handlePOST(request) {
  if (isDisabled()) return json({ error: 'Not found' }, 404);
  const body = await request.json().catch(() => null);
  try {
    return json(await startPayment(body));
  } catch (e) {
    if (e instanceof PayError) return json({ error: e.message }, e.status);
    console.error('Payment order failed:', e);
    return json({ error: 'Payment could not be started. Please try again.' }, 500);
  }
}
export const POST = withSiteOrigin(handlePOST);
