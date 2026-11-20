// Getting admin changes onto the website. The website reads its content (campaigns, blogs, home page…)
// from this admin when it is built, so after a save we ask Vercel to rebuild it, using the website
// project's Deploy Hook (WEBSITE_DEPLOY_HOOK). The rebuild takes about two minutes.
// Every attempt is recorded in v2_content/websitePublish, so the admin can show whether it worked.
import { hasFirebase, v2Collection } from './firebase';

const record = () => v2Collection('content').doc('websitePublish');
const hookUrl = () => String(process.env.WEBSITE_DEPLOY_HOOK || '').trim();

export const websiteHookSet = () => /^https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\//.test(hookUrl());

export async function lastPublish() {
  if (!hasFirebase()) return null;
  try {
    return (await record().get()).data() || null;
  } catch {
    return null;
  }
}

async function save(result) {
  if (!hasFirebase()) return;
  await record().set(result).catch((e) => console.error('Website update not recorded:', e.message));
}

// Asks Vercel to rebuild the website. `what` says what changed ("campaigns", "blogs", "manual"…).
export async function publishWebsite(what) {
  const at = new Date().toISOString();
  if (!hookUrl()) {
    const result = { at, what, ok: false, error: 'WEBSITE_DEPLOY_HOOK is not set on this admin’s Vercel project.' };
    await save(result);
    return result;
  }
  if (!websiteHookSet()) {
    const result = { at, what, ok: false, error: 'WEBSITE_DEPLOY_HOOK is not a Vercel Deploy Hook address.' };
    await save(result);
    return result;
  }
  let result;
  try {
    // Awaited: a hosted server may stop as soon as the response is sent.
    const res = await fetch(hookUrl(), { method: 'POST', signal: AbortSignal.timeout(8000) });
    const body = await res.json().catch(() => ({}));
    result = res.ok
      ? { at, what, ok: true, job: body?.job?.id || '' }
      : { at, what, ok: false, error: `Vercel answered ${res.status}${body?.error?.message ? `: ${body.error.message}` : ''}` };
  } catch (e) {
    result = { at, what, ok: false, error: `Vercel could not be reached: ${e.message}` };
  }
  await save(result);
  return result;
}
