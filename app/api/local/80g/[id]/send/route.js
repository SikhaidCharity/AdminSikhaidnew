import { sendForCertificate } from '@/lib/certificates';
import { isDisabled, notAvailable } from '@/lib/local-store';
import { guard } from '@/lib/admin-users';

// "Send on WhatsApp" on the 80G page. Returns the certificate with what happened.
export async function POST(request, { params }) {
  if (isDisabled()) return notAvailable();
  const { response: denied } = await guard(request, ['80g']);
  if (denied) return denied;
  const { id } = await params;
  const result = await sendForCertificate(id);
  return result ? Response.json(result.cert) : notAvailable();
}
