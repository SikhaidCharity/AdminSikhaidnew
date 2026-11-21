// The signed-in donor sets or changes their password.
import { setPassword } from '@/lib/donors';
import { donorAction, json, preflight } from '@/lib/donor-http';
import { withSiteOrigin } from '@/lib/paths';

export const OPTIONS = preflight;

async function handlePOST(request) {
  const body = await request.json().catch(() => ({}));
  return donorAction(request, true, async (donor) => {
    await setPassword(donor, body.password);
    return json({ ok: true });
  });
}
export const POST = withSiteOrigin(handlePOST);
