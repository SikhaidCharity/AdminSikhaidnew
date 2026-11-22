import { catchUpNext, catchUpStatus, whatsappReady } from '@/lib/certificates';
import { isDisabled, notAvailable } from '@/lib/local-store';
import { guard } from '@/lib/admin-users';

// Sending a few PDFs on WhatsApp takes a while.
export const maxDuration = 60;

// How many older donations still need their 80G certificate.
export async function GET(request) {
  if (isDisabled()) return notAvailable();
  const { response: denied } = await guard(request, ['80g']);
  if (denied) return denied;
  return Response.json(await catchUpStatus());
}

// Makes and sends the next few. Only when WhatsApp is connected, so certificates aren't made and left unsent.
export async function POST(request) {
  if (isDisabled()) return notAvailable();
  const { response: denied } = await guard(request, ['80g']);
  if (denied) return denied;
  if (!whatsappReady()) return Response.json({ error: 'WhatsApp is not connected on this server.' }, { status: 400 });
  return Response.json(await catchUpNext(5));
}
