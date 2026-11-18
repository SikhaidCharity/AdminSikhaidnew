import { lastSync, syncFromLive } from '@/lib/live-sync';
import { guard } from '@/lib/admin-users';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// When the admin's copy was last brought up to date with the live site.
export async function GET(request) {
  const { response: denied } = await guard(request, ['donations', 'monthly-donations']);
  if (denied) return denied;
  return Response.json({ last: await lastSync() });
}

// Donations page → "Get latest from live site".
export async function POST(request) {
  const { response: denied } = await guard(request, ['donations', 'monthly-donations']);
  if (denied) return denied;
  try {
    return Response.json(await syncFromLive());
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
