import {
  NotFound,
  SINGLETONS,
  deleteItem,
  isCollection,
  isDisabled,
  notAvailable,
  updateItem,
} from '@/lib/local-store';
import { guard, sectionsForCollection } from '@/lib/admin-users';
import { donationView, redactDonation } from '@/lib/admin-sections';

async function run(request, params, action) {
  const { collection, id } = await params;
  if (isDisabled() || !isCollection(collection) || SINGLETONS.has(collection)) return notAvailable();
  const { user, response: denied } = await guard(request, sectionsForCollection(collection, { write: true }));
  if (denied) return denied;
  try {
    const result = await action(collection, id);
    // A changed donation comes back with only what this user may see.
    if (collection === 'donations' && result?.id) return Response.json(redactDonation(result, donationView(user)));
    return Response.json(result);
  } catch (e) {
    if (e instanceof NotFound) return notAvailable();
    throw e;
  }
}

export async function PUT(request, { params }) {
  const body = await request.json().catch(() => ({}));
  return run(request, params, (collection, id) => updateItem(collection, id, body));
}

export async function DELETE(request, { params }) {
  return run(request, params, (collection, id) => deleteItem(collection, id));
}
