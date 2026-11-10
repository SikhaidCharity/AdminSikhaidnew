import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// The public website, where uploaded images and site assets are served from.
const WEBSITE_URL = (process.env.WEBSITE_URL || 'http://localhost:3002').replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: { root: here },
  async rewrites() {
    return {
      // Anything the admin app does not have itself (e.g. /uploads/..., site images used in previews)
      // is fetched from the website, so previews look the same as on the site.
      fallback: [{ source: '/:path*', destination: `${WEBSITE_URL}/:path*` }],
    };
  },
};

export default nextConfig;
