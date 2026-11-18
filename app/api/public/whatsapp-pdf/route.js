// The donor's PDF for WhatsApp: GetGabs downloads it from this link and sends it to the donor.
// The link is signed and expires after 7 days (lib/certificates.js → pdfLink), so it can't be guessed.
import { pdfFromLink } from '@/lib/certificates';
import { isDisabled, notAvailable } from '@/lib/local-store';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (isDisabled()) return notAvailable();
  const file = await pdfFromLink(new URL(request.url).searchParams);
  if (!file) return new Response('This link is not valid or has expired.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  return new Response(file.bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${file.fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
