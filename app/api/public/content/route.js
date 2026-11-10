// The website's content (campaigns, blogs, home page, contact details...), read by the website
// when it builds. Only content the website already shows publicly; no form entries or donors.
import { PUBLIC_CONTENT, isDisabled, notAvailable, readCollection } from '@/lib/local-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (isDisabled()) return notAvailable();
  const entries = await Promise.all(PUBLIC_CONTENT.map(async (name) => [name, await readCollection(name)]));
  return Response.json(Object.fromEntries(entries), { headers: { 'Cache-Control': 'no-store' } });
}
