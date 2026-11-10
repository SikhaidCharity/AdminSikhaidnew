// Sends a PDF to the browser: opened in a tab with ?view=1, otherwise downloaded.
export function pdfResponse(request, { bytes, fileName }) {
  const view = new URL(request.url).searchParams.get('view') === '1';
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${view ? 'inline' : 'attachment'}; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
