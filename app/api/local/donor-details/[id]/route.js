// One donor's account and all their donations, for Admin → Donors.
import { donationsOf, publicDonor } from '@/lib/donors';
import { getItem, isDisabled, notAvailable } from '@/lib/local-store';
import { guard } from '@/lib/admin-users';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  if (isDisabled()) return notAvailable();
  const { response: denied } = await guard(request, ['donors']);
  if (denied) return denied;
  const { id } = await params;
  const donor = await getItem('donors', id);
  if (!donor) return notAvailable();
  return Response.json({ donor: publicDonor(donor), donations: await donationsOf(id) });
}
