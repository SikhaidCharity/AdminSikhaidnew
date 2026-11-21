// The signed-in donor's PDF for one of their donations: receipt, plus 80G certificate when it qualifies.
import { pdfForDonationRecord } from '@/lib/certificates';
import { getItem } from '@/lib/local-store';
import { cors, donorAction, json, preflight } from '@/lib/donor-http';
import { withSiteOrigin } from '@/lib/paths';

export const OPTIONS = preflight;

async function handleGET(request) {
  const id = new URL(request.url).searchParams.get('donation') || '';
  return donorAction(request, true, async (donor) => {
    const donation = id ? await getItem('donations', id) : null;
    if (!donation || donation.donorId !== donor.id) return json({ error: 'Not found' }, 404);
    const { bytes, fileName } = await pdfForDonationRecord(donation);
    return new Response(bytes, {
      headers: { ...cors(), 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${fileName}"`, 'Cache-Control': 'no-store' },
    });
  });
}
export const GET = withSiteOrigin(handleGET);
