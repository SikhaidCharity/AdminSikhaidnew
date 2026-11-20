// Donor sign-in: straight after a donation, with email + password, with Google, or with a WhatsApp code.
import { publicDonor, sessionFor, signInWithDonation, signInWithGoogle, signInWithPassword } from '@/lib/donors';
import { donorAction, json, preflight } from '@/lib/donor-http';
import { signInWithCode } from '@/lib/donor-otp';

export const OPTIONS = preflight;

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  return donorAction(request, false, async () => {
    let donor;
    if (body.method === 'donation') donor = await signInWithDonation(body.receiptNo, body.token);
    else if (body.method === 'google') donor = await signInWithGoogle(body.credential);
    else if (body.method === 'phone') donor = await signInWithCode(body.phone, body.code);
    else donor = await signInWithPassword(body.email, body.password);
    return json({ session: await sessionFor(donor.id), donor: publicDonor(donor) });
  });
}
