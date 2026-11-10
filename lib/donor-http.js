// Shared bits for the donor API, which the website calls from the donor's browser.
import { websiteOrigin } from './paths';
import { DonorError, donorFromRequest } from './donors';
import { isDisabled } from './local-store';

export const cors = () => ({
  'Access-Control-Allow-Origin': websiteOrigin(),
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Expose-Headers': 'Content-Disposition',
  Vary: 'Origin',
});

export const json = (data, status = 200) => Response.json(data, { status, headers: cors() });

export const preflight = () => new Response(null, { status: 204, headers: cors() });

// Runs a donor API action; `needsDonor` requires a signed-in donor.
export async function donorAction(request, needsDonor, action) {
  if (isDisabled()) return json({ error: 'Not found' }, 404);
  try {
    let donor = null;
    if (needsDonor) {
      donor = await donorFromRequest(request);
      if (!donor) return json({ error: 'Please sign in again.' }, 401);
    }
    return await action(donor);
  } catch (e) {
    if (e instanceof DonorError) return json({ error: e.message }, e.status);
    console.error('Donor API failed:', e);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}
