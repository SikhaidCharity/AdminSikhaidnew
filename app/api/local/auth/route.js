import { NextResponse } from 'next/server';
import { isDisabled, notAvailable } from '@/lib/local-store';
import {
  SESSION_COOKIE,
  SESSION_HOURS,
  UserError,
  currentUser,
  isConfigured,
  publicUser,
  sessionFor,
  signIn,
} from '@/lib/admin-users';

const cookieOptions = { httpOnly: true, sameSite: 'strict', path: '/', maxAge: SESSION_HOURS * 3600 };

export async function GET(request) {
  if (isDisabled()) return notAvailable();
  const user = await currentUser(request);
  return Response.json({ signedIn: Boolean(user), user: user ? publicUser(user) : null, configured: await isConfigured() });
}

export async function POST(request) {
  if (isDisabled()) return notAvailable();
  const { email, password } = await request.json().catch(() => ({}));
  try {
    const user = await signIn(email || '', password || '');
    const response = NextResponse.json({ signedIn: true, user: publicUser(user) });
    response.cookies.set(SESSION_COOKIE, await sessionFor(user), cookieOptions);
    return response;
  } catch (e) {
    if (e instanceof UserError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export async function DELETE() {
  if (isDisabled()) return notAvailable();
  const response = NextResponse.json({ signedIn: false });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
