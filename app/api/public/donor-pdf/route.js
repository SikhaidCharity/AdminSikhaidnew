// The donor's own PDF (receipt, plus the 80G certificate when the amount qualifies), opened from the
// website's thank-you page. Needs the receipt number and the donation's private download code.
import { pdfForDonor } from '@/lib/certificates';
import { isDisabled, notAvailable } from '@/lib/local-store';
import { pdfResponse } from '@/lib/pdf-response';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (isDisabled()) return notAvailable();
  const params = new URL(request.url).searchParams;
  const file = await pdfForDonor(params.get('receipt'), params.get('t'));
  if (!file) {
    return new Response('This download link is not valid. Please contact SikhAid for your 80G certificate.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return pdfResponse(request, file);
}
