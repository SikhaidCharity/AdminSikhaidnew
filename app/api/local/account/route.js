import { NextResponse } from 'next/server';
import { isDisabled, notAvailable } from '@/lib/local-store';
import { SESSION_COOKIE, SESSION_HOURS, UserError, guard, publicUser, sessionFor, updateOwnAccount } from '@/lib/admin-users';

// Settings → My Account: any signed-in user can change their own name, ID and password.
export async function PUT(request) {
  if (isDisabled()) return notAvailable();
  const { user, response: denied } = await guard(request);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  try {
    const updated = await updateOwnAccount(user, body);
    const response = NextResponse.json(publicUser(updated));
    // Keeps this browser signed in after the ID or password changes.
    response.cookies.set(SESSION_COOKIE, await sessionFor(updated), {
      httpOnly: true, sameSite: 'strict', path: '/', maxAge: SESSION_HOURS * 3600,
    });
    return response;
  } catch (e) {
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
