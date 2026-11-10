import { afterDonation } from '@/lib/certificates';
import {
  ORDERED,
  SINGLETONS,
  cleanDonation,
  cleanSubmission,
  createItem,
  isCollection,
  isDisabled,
  notAvailable,
  readCollection,
  replaceCollection,
} from '@/lib/local-store';
import { guard, sectionsForCollection } from '@/lib/admin-users';
import { websiteOrigin } from '@/lib/paths';

// The website sends form entries and donations from its own address.
const cors = () => ({
  'Access-Control-Allow-Origin': websiteOrigin(),
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  Vary: 'Origin',
});

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors() });
}

// Signed in, and allowed to use a section this collection belongs to.
async function allowed(request, collection, write) {
  const { response } = await guard(request, sectionsForCollection(collection, { write }));
  return response;
}

export async function GET(request, { params }) {
  const { collection } = await params;
  if (isDisabled() || !isCollection(collection)) return notAvailable();
  const denied = await allowed(request, collection, false);
  if (denied) return denied;
  return Response.json(await readCollection(collection));
}

// Website visitors can only add a form entry or a donation record. Anything else needs sign-in.
const PUBLIC_CLEANERS = { submissions: cleanSubmission, donations: cleanDonation };

export async function POST(request, { params }) {
  const { collection } = await params;
  if (isDisabled() || !isCollection(collection) || SINGLETONS.has(collection)) return notAvailable();
  const body = await request.json().catch(() => null);

  const cleaner = PUBLIC_CLEANERS[collection];
  if (cleaner) {
    const record = cleaner(body);
    if (!record) return Response.json({ error: 'Invalid entry' }, { status: 400, headers: cors() });
    const saved = await createItem(collection, record);
    // Every donation gets a receipt; the minimum amount or more also gets an 80G certificate. A problem there must
    // never stop the donation from being recorded, so it runs on its own.
    if (collection === 'donations') {
      afterDonation(saved).catch((e) => console.error('Receipt / 80G failed:', e));
    }
    return Response.json({ id: saved.id }, { status: 201, headers: cors() });
  }

  const denied = await allowed(request, collection, true);
  if (denied) return denied;
  if (!body?.title && !body?.name) return Response.json({ error: 'A title or name is required.' }, { status: 400 });
  return Response.json(await createItem(collection, body), { status: 201 });
}

// Saves a single-record section, or the display order of an ordered list.
export async function PUT(request, { params }) {
  const { collection } = await params;
  if (isDisabled() || !(SINGLETONS.has(collection) || ORDERED.has(collection))) return notAvailable();
  const denied = await allowed(request, collection, true);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const validShape = SINGLETONS.has(collection) ? body && !Array.isArray(body) : Array.isArray(body);
  if (!validShape) return Response.json({ error: 'Invalid data' }, { status: 400 });
  return Response.json(await replaceCollection(collection, body));
}
