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

async function run(request, params, action) {
  const { collection, id } = await params;
  if (isDisabled() || !isCollection(collection) || SINGLETONS.has(collection)) return notAvailable();
  const { response: denied } = await guard(request, sectionsForCollection(collection, { write: true }));
  if (denied) return denied;
  try {
    return Response.json(await action(collection, id));
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
