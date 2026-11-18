import { sendForDonation, sendOptions } from '@/lib/certificates';
import { isDisabled, notAvailable } from '@/lib/local-store';
import { guard } from '@/lib/admin-users';

const SECTIONS = ['donations', 'monthly-donations'];
const INCLUDE = new Set(['auto', 'receipt', 'receipt-and-80g']);

// What the Send window offers for this donation (receipt only, or receipt + 80G, and why not).
export async function GET(request, { params }) {
  if (isDisabled()) return notAvailable();
  const { response: denied } = await guard(request, SECTIONS);
  if (denied) return denied;
  const { id } = await params;
  const options = await sendOptions(id);
  return options ? Response.json(options) : notAvailable();
}

// "Send" on the donations pages: sends the PDF on WhatsApp. Returns the donation with what happened.
export async function POST(request, { params }) {
  if (isDisabled()) return notAvailable();
  const { response: denied } = await guard(request, SECTIONS);
  if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const include = INCLUDE.has(body.include) ? body.include : 'auto';
  const result = await sendForDonation(id, { include });
  return result ? Response.json(result.donation) : notAvailable();
}
