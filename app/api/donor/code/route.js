// Phone sign-in, step 1: send a 6-digit code to the donor's WhatsApp. Step 2 is /api/donor/session
// with { method: 'phone', phone, code }.
import { sendLoginCode } from '@/lib/donor-otp';
import { donorAction, json, preflight } from '@/lib/donor-http';
import { withSiteOrigin } from '@/lib/paths';

export const OPTIONS = preflight;

async function handlePOST(request) {
  const body = await request.json().catch(() => ({}));
  return donorAction(request, false, async () => json(await sendLoginCode(body.phone)));
}
export const POST = withSiteOrigin(handlePOST);
