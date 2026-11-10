import { sendForDonation } from '@/lib/certificates';
import { isDisabled, notAvailable } from '@/lib/local-store';
import { guard } from '@/lib/admin-users';

// "Send on WhatsApp" on the donations pages. Returns the donation with what happened.
export async function POST(request, { params }) {
  if (isDisabled()) return notAvailable();
  const { response: denied } = await guard(request, ['donations', 'monthly-donations']);
  if (denied) return denied;
  const { id } = await params;
  const result = await sendForDonation(id);
  return result ? Response.json(result.donation) : notAvailable();
}
