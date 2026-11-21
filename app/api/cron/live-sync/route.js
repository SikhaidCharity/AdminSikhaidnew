import { syncFromLive } from '@/lib/live-sync';
import { sweepOpenOrders } from '@/lib/donation-payments';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// Daily run by Vercel Cron (vercel.json). With CRON_SECRET set on Vercel, only Vercel's own call
// (which carries that secret) is accepted. Without it, only calls marked as Vercel Cron are.
// The sync only adds missing records to the admin's copy, so an extra run does no harm.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const ok = secret
    ? request.headers.get('authorization') === `Bearer ${secret}`
    : (request.headers.get('user-agent') || '').startsWith('vercel-cron/');
  if (!ok) return Response.json({ error: 'Not allowed' }, { status: 401 });
  try {
    const [result, sweep] = await Promise.all([syncFromLive(), sweepOpenOrders().catch((e) => ({ error: e.message }))]);
    return Response.json({ ...result, sweep });
  } catch (err) {
    console.error('live sync failed', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
