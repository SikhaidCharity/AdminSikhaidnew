// The website's live campaign totals (lib/campaign-stats.js). Public: only totals, no donor details.
// Cached for 30 seconds at the edge, so a busy campaign page doesn't read the database on every visit.
import { campaignStats } from '@/lib/campaign-stats';
import { isDisabled, notAvailable } from '@/lib/local-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (isDisabled()) return notAvailable();
  return Response.json(await campaignStats(), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120',
    },
  });
}
