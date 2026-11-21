// Live "raised" and "donors" for every campaign, for the website.
// Each campaign's raised / donors in the admin are its starting totals (offline gifts and everything
// counted by hand). From the moment they were last set (statsFrom), every paid donation to that campaign
// is added on top, so the website's numbers move as soon as money arrives.
// Counted: paid one-time gifts and monthly charges, the part that goes to the cause (not the optional
// support to SikhAid). Not counted: monthly sign-ups (mandates) and anything unpaid.
import { readCollection } from './local-store';

const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const counts = (d) => d.paymentStatus !== 'mandate' && d.paymentStatus !== 'simulated' && d.paymentStatus !== 'failed';

export async function campaignStats() {
  const [campaigns, donations] = await Promise.all([readCollection('campaigns'), readCollection('donations')]);

  // Which campaign a donation belongs to: its address (current, earlier, or the live site's), else its title.
  const bySlug = new Map();
  const byTitle = new Map();
  for (const c of campaigns) {
    [c.slug, ...(c.previousSlugs || []), ...(c.liveSlugs || [])].filter(Boolean).forEach((s) => bySlug.set(s, c));
    byTitle.set(norm(c.title), c);
  }

  const stats = {};
  for (const c of campaigns) {
    stats[c.slug] = { raised: Number(c.raised) || 0, donors: Number(c.donors) || 0, online: 0, onlineDonors: 0, from: c.statsFrom || '' };
  }
  const seenDonors = {};
  for (const d of donations) {
    if (!counts(d)) continue;
    const c = bySlug.get(d.causeSlug) || byTitle.get(norm(d.cause));
    // Only payments after the starting totals were set; without a start date nothing is added.
    if (!c?.statsFrom || !(String(d.createdAt) > c.statsFrom)) continue;
    const s = stats[c.slug];
    const toCause = Number(d.amount) || Number(d.grandTotal) || 0;
    s.raised += toCause;
    s.online += toCause;
    const who = d.donorId || d.donor?.phone || d.donor?.email || d.id;
    (seenDonors[c.slug] ||= new Set());
    if (!seenDonors[c.slug].has(who)) {
      seenDonors[c.slug].add(who);
      s.donors += 1;
      s.onlineDonors += 1;
    }
  }
  for (const s of Object.values(stats)) s.raised = Math.round(s.raised);
  return { at: new Date().toISOString(), campaigns: stats };
}
