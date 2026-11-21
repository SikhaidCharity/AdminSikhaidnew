// Where the admin's files live. Private data stays in this app; site content is written into the website.
import path from 'node:path';

export function websiteDir() {
  const dir = process.env.WEBSITE_DIR;
  if (!dir) throw new Error('Set WEBSITE_DIR in .env.local to the website folder (see .env.example).');
  return path.resolve(dir);
}

export const websitePath = (...parts) => path.join(websiteDir(), ...parts);
// turbopackIgnore: these are data files read at run time (.local-data, .secrets), not code to bundle.
export const adminPath = (...parts) => path.join(/* turbopackIgnore: true */ process.cwd(), ...parts);

export const websiteOrigin = () => (process.env.WEBSITE_URL || 'http://localhost:3002').replace(/\/$/, '');

// Every address the public website is served from (the domain, and the Vercel address it had before).
// Browser requests from any of these may use the donor, payment and form APIs.
export const websiteOrigins = () =>
  [...new Set([websiteOrigin(), 'https://www.sikhaid.ngo', 'https://sikhaid.ngo', 'https://new-sikhaid-website.vercel.app'])];

// The origin to allow in the reply: the caller's, when it is one of the website's addresses.
export function allowedOrigin(request) {
  const origin = request?.headers?.get?.('origin');
  return origin && websiteOrigins().includes(origin) ? origin : websiteOrigin();
}

// Wraps a route handler so its reply allows the website address the request came from.
export function withSiteOrigin(handler) {
  return async (request, context) => {
    const response = await handler(request, context);
    response.headers.set('Access-Control-Allow-Origin', allowedOrigin(request));
    response.headers.set('Vary', 'Origin');
    return response;
  };
}
