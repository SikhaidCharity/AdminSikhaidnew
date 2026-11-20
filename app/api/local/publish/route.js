import { lastPublish, publishWebsite, websiteHookSet } from '@/lib/website-publish';
import { isDisabled, notAvailable } from '@/lib/local-store';
import { guard } from '@/lib/admin-users';

// The sections whose changes appear on the website.
const SECTIONS = ['campaigns', 'blogs', 'content', 'hero-bg', 'settings'];

// Whether the website rebuild is set up, and how the last one went.
export async function GET(request) {
  if (isDisabled()) return notAvailable();
  const { response: denied } = await guard(request, SECTIONS);
  if (denied) return denied;
  return Response.json({ hosted: Boolean(process.env.VERCEL), hookSet: websiteHookSet(), last: await lastPublish() });
}

// "Update website now".
export async function POST(request) {
  if (isDisabled()) return notAvailable();
  const { response: denied } = await guard(request, SECTIONS);
  if (denied) return denied;
  if (!process.env.VERCEL) return Response.json({ last: { at: new Date().toISOString(), ok: true, local: true } });
  return Response.json({ last: await publishWebsite('manual') });
}
