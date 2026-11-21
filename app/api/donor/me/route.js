// The signed-in donor's account: profile and every donation, newest first.
import { donationsOf, publicDonor, updateProfile } from '@/lib/donors';
import { getTrust } from '@/lib/certificates';
import { donorAction, json, preflight } from '@/lib/donor-http';
import { withSiteOrigin } from '@/lib/paths';

export const OPTIONS = preflight;
export const dynamic = 'force-dynamic';

const publicDonation = (d, min) => {
  const total = Number(d.grandTotal) || Number(d.amount) || 0;
  return {
    id: d.id,
    receiptNo: d.receiptNo,
    createdAt: d.createdAt,
    amount: Number(d.amount) || 0,
    tipAmt: Number(d.tipAmt) || 0,
    grandTotal: total,
    cause: d.cause || 'General Fund',
    causeSlug: d.causeSlug || '',
    isMonthly: Boolean(d.isMonthly),
    mandateStatus: d.mandateStatus || '',
    paymentId: d.razorpayPaymentId || '',
    test: d.paymentStatus === 'simulated',
    has80g: total >= min,
  };
};

async function handleGET(request) {
  return donorAction(request, true, async (donor) => {
    const min = Number((await getTrust()).minAmount) || 2000;
    const donations = (await donationsOf(donor.id)).map((d) => publicDonation(d, min));
    return json({ donor: publicDonor(donor), donations, min80g: min, googleReady: Boolean(process.env.GOOGLE_CLIENT_ID) });
  });
}

async function handlePUT(request) {
  const body = await request.json().catch(() => ({}));
  return donorAction(request, true, async (donor) => json({ donor: publicDonor(await updateProfile(donor, body)) }));
}
export const GET = withSiteOrigin(handleGET);
export const PUT = withSiteOrigin(handlePUT);
