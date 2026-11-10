// Where the admin's files live. Private data stays in this app; site content is written into the website.
import path from 'node:path';

export function websiteDir() {
  const dir = process.env.WEBSITE_DIR;
  if (!dir) throw new Error('Set WEBSITE_DIR in .env.local to the website folder (see .env.example).');
  return path.resolve(dir);
}

export const websitePath = (...parts) => path.join(websiteDir(), ...parts);
export const adminPath = (...parts) => path.join(process.cwd(), ...parts);

export const websiteOrigin = () => (process.env.WEBSITE_URL || 'http://localhost:3002').replace(/\/$/, '');
