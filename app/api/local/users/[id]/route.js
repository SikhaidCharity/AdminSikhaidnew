import { isDisabled, notAvailable } from '@/lib/local-store';
import { UserError, deleteUser, guard, updateUser } from '@/lib/admin-users';

async function run(request, params, action) {
  if (isDisabled()) return notAvailable();
  const { user, response: denied } = await guard(request, ['users']);
  if (denied) return denied;
  const { id } = await params;
  try {
    return Response.json(await action(user, id));
  } catch (e) {
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function PUT(request, { params }) {
  const body = await request.json().catch(() => ({}));
  return run(request, params, (user, id) => updateUser(user, id, body));
}

export async function DELETE(request, { params }) {
  return run(request, params, (user, id) => deleteUser(user, id));
}
