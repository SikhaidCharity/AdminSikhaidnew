import { lastSync, quickSync, syncFromLive } from '@/lib/live-sync';
import { guard } from '@/lib/admin-users';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// When the admin's copy was last brought up to date with the live site.
export async function GET(request) {
  const { response: denied } = await guard(request, ['donations', 'monthly-donations', 'formsubmissions', 'donors']);
  if (denied) return denied;
  return Response.json({ last: await lastSync() });
}

// Open admin pages call this every few seconds (quick check); Donations → "Check everything" adds ?full=1.
export async function POST(request) {
  const { response: denied } = await guard(request, ['donations', 'monthly-donations', 'formsubmissions', 'donors']);
  if (denied) return denied;
  const full = new URL(request.url).searchParams.get('full') === '1';
  try {
    const result = full ? await syncFromLive() : await quickSync();
    return Response.json({ ...result, last: await lastSync() });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
