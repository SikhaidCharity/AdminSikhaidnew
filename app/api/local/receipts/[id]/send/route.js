import { sendForDonation, sendOptions } from '@/lib/certificates';
import { getItem, isDisabled, notAvailable } from '@/lib/local-store';
import { guard, noAccess } from '@/lib/admin-users';
import { donationView, donationVisible, limitsDonations, redactDonation } from '@/lib/admin-sections';

const SECTIONS = ['donations', 'monthly-donations'];
// Sending needs the donor's details and amount (User Management → Donations view).
// It also has to be a donation from an ad source and campaign they may see.
const maySend = async (user, id) => {
  const view = donationView(user);
  if (!view.details || !view.amount) return false;
  if (!limitsDonations(view)) return true;
  const donation = await getItem('donations', id).catch(() => null);
  return !donation || donationVisible(donation, view);
};
const INCLUDE = new Set(['auto', 'receipt', 'receipt-and-80g']);

// What the Send window offers for this donation (receipt only, or receipt + 80G, and why not).
export async function GET(request, { params }) {
  if (isDisabled()) return notAvailable();
  const { user, response: denied } = await guard(request, SECTIONS);
  if (denied) return denied;
  const { id } = await params;
  if (!(await maySend(user, id))) return noAccess();
  const options = await sendOptions(id);
  return options ? Response.json(options) : notAvailable();
}

// "Send" on the donations pages: sends the PDF on WhatsApp. Returns the donation with what happened.
export async function POST(request, { params }) {
  if (isDisabled()) return notAvailable();
  const { user, response: denied } = await guard(request, SECTIONS);
  if (denied) return denied;
  const { id } = await params;
  if (!(await maySend(user, id))) return noAccess();
  const body = await request.json().catch(() => ({}));
  const include = INCLUDE.has(body.include) ? body.include : 'auto';
  const result = await sendForDonation(id, { include });
  return result ? Response.json(redactDonation(result.donation, donationView(user))) : notAvailable();
}
