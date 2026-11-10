import { pdfForDonation } from '@/lib/certificates';
import { isDisabled, notAvailable } from '@/lib/local-store';
import { guard } from '@/lib/admin-users';
import { pdfResponse } from '@/lib/pdf-response';

// The donor's PDF for a donation: the receipt, plus the 80G certificate when the amount qualifies.
export async function GET(request, { params }) {
  if (isDisabled()) return notAvailable();
  const { response: denied } = await guard(request, ['donations', 'monthly-donations']);
  if (denied) return denied;
  const { id } = await params;
  const file = await pdfForDonation(id);
  return file ? pdfResponse(request, file) : notAvailable();
}
