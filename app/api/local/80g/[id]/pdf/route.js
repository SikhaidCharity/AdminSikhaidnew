import { pdfForCertificate } from '@/lib/certificates';
import { isDisabled, notAvailable } from '@/lib/local-store';
import { guard } from '@/lib/admin-users';
import { pdfResponse } from '@/lib/pdf-response';

// The donor's PDF for a certificate: receipt + 80G certificate.
export async function GET(request, { params }) {
  if (isDisabled()) return notAvailable();
  const { response: denied } = await guard(request, ['80g']);
  if (denied) return denied;
  const { id } = await params;
  const file = await pdfForCertificate(id);
  return file ? pdfResponse(request, file) : notAvailable();
}
