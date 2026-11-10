import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isDisabled, notAvailable } from '@/lib/local-store';
import { websitePath } from '@/lib/paths';
import { UPLOAD_SECTIONS, guard } from '@/lib/admin-users';

const MB = 1024 * 1024;
// SVG is left out on purpose: it can carry scripts.
const ALLOWED = {
  'image/jpeg': { ext: 'jpg', max: 15 * MB },
  'image/png': { ext: 'png', max: 15 * MB },
  'image/webp': { ext: 'webp', max: 15 * MB },
  'image/avif': { ext: 'avif', max: 15 * MB },
  'image/gif': { ext: 'gif', max: 15 * MB },
  'video/mp4': { ext: 'mp4', max: 300 * MB },
  'video/webm': { ext: 'webm', max: 300 * MB },
};

export async function POST(request) {
  if (isDisabled()) return notAvailable();
  const { response: denied } = await guard(request, UPLOAD_SECTIONS);
  if (denied) return denied;

  const form = await request.formData();
  const file = form.get('file');
  const rule = file && typeof file !== 'string' ? ALLOWED[file.type] : null;
  if (!rule) {
    return Response.json({ error: 'Please choose a JPG, PNG, WebP, GIF, MP4 or WebM file.' }, { status: 400 });
  }
  if (file.size > rule.max) {
    return Response.json({ error: `That file is too large. The limit is ${rule.max / MB} MB.` }, { status: 400 });
  }

  const name = `${Date.now()}-${randomBytes(4).toString('hex')}.${rule.ext}`;
  // Saved into the website, which serves them at /uploads/...
  const folder = websitePath('public', 'uploads');
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, name), Buffer.from(await file.arrayBuffer()));
  return Response.json({ url: `/uploads/${name}` });
}
