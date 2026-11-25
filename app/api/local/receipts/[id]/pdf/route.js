import { pdfForDonation } from '@/lib/certificates';
import { getItem, isDisabled, notAvailable } from '@/lib/local-store';
import { guard, noAccess } from '@/lib/admin-users';
import { canUse, donationView, donationVisible, limitsDonations } from '@/lib/admin-sections';
import { pdfResponse } from '@/lib/pdf-response';

// The donor's PDF for a donation: the receipt, plus the 80G certificate when the amount qualifies.
export async function GET(request, { params }) {
  if (isDisabled()) return notAvailable();
  const { user, response: denied } = await guard(request, ['donations', 'monthly-donations', 'donors']);
  if (denied) return denied;
  // The PDF shows the donor's details and amount: only for users who may see both (or open Donors).
  const view = donationView(user);
  if (!canUse(user, 'donors') && !(view.details && view.amount)) return noAccess();
  const { id } = await params;
  // Nor for a donation from an ad source or campaign they may not see.
  if (!canUse(user, 'donors') && limitsDonations(view)) {
    const donation = await getItem('donations', id).catch(() => null);
    if (donation && !donationVisible(donation, view)) return noAccess();
  }
  const receiptOnly = new URL(request.url).searchParams.get('include') === 'receipt';
  const file = await pdfForDonation(id, { withCertificate: !receiptOnly });
  return file ? pdfResponse(request, file) : notAvailable();
}
