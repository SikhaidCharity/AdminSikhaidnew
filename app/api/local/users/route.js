import { isDisabled, notAvailable } from '@/lib/local-store';
import { UserError, createUser, guard, listUsers } from '@/lib/admin-users';

// User Management: only full admins.
export async function GET(request) {
  if (isDisabled()) return notAvailable();
  const { response: denied } = await guard(request, ['users']);
  if (denied) return denied;
  return Response.json(await listUsers());
}

export async function POST(request) {
  if (isDisabled()) return notAvailable();
  const { user, response: denied } = await guard(request, ['users']);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  try {
    return Response.json(await createUser(user, body), { status: 201 });
  } catch (e) {
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
