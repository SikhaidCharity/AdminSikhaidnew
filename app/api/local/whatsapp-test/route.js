import { sendTest } from '@/lib/certificates';
import { guard } from '@/lib/admin-users';

// 80G page → "Send test": a sample receipt (marked TEST RECORD) to one number. Nothing is saved.
export async function POST(request) {
  const { response: denied } = await guard(request, ['80g']);
  if (denied) return denied;
  const { phone, name } = await request.json().catch(() => ({}));
  try {
    return Response.json(await sendTest(phone, name));
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
