// Admin → Donors → Add Donor.
import { DonorError, addDonorManually } from '@/lib/donors';
import { isDisabled, notAvailable } from '@/lib/local-store';
import { guard } from '@/lib/admin-users';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (isDisabled()) return notAvailable();
  const { response: denied } = await guard(request, ['donors']);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  try {
    return Response.json(await addDonorManually(body), { status: 201 });
  } catch (e) {
    if (e instanceof DonorError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
