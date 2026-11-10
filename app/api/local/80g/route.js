import { cleanCertificateInput, createCertificate, getTrust, sendForCertificate, trustMissing, whatsappReady } from '@/lib/certificates';
import { isDisabled, notAvailable } from '@/lib/local-store';
import { guard } from '@/lib/admin-users';

// Status for the 80G page: is the trust set up, and is WhatsApp connected?
export async function GET(request) {
  if (isDisabled()) return notAvailable();
  const { response: denied } = await guard(request, ['80g']);
  if (denied) return denied;
  return Response.json({ trustMissing: trustMissing(await getTrust()), whatsappReady: whatsappReady() });
}

// Manual entry from the 80G admin page.
export async function POST(request) {
  if (isDisabled()) return notAvailable();
  const { response: denied } = await guard(request, ['80g']);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const fields = cleanCertificateInput(body);
  if (!fields.donor.name || fields.amount <= 0) {
    return Response.json({ error: 'Please add the donor name and an amount.' }, { status: 400 });
  }
  const cert = await createCertificate(fields, { source: 'manual' });
  const result = body.sendWhatsApp ? (await sendForCertificate(cert.id)).cert : cert;
  return Response.json(result, { status: 201 });
}
