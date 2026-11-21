// Where a donation came from, by its UTM tags. Same rules as the live site's admin, so both show the
// same numbers. Used by the Donations page filter and by User Management (which sources a user may see).
// Paid = the donation came with any UTM source, medium or campaign tag.
const low = (v) => String(v || '').toLowerCase().trim();
const utmParts = (u = {}) => ({ p: low(u.utm_source), l: low(u.utm_medium), m: low(u.utm_campaign) });
const isPaid = (u) => { const { p, l, m } = utmParts(u); return Boolean(p || l || m); };

export const UTM_FILTERS = [
  { id: 'all', label: 'All Traffic', test: () => true },
  { id: 'paid', label: 'All Paid Ads', test: isPaid },
  { id: 'organic', label: 'Organic / Direct', test: (u) => !isPaid(u) },
  { id: 'instagram', label: 'Instagram (ig / social)', test: (u) => { const { p, l, m } = utmParts(u); return p === 'ig' || p.startsWith('ig_') || p.endsWith('_ig') || p.includes('instagram') || l.includes('instagram') || m.startsWith('ig_') || m.includes('instagram'); } },
  { id: 'google', label: 'Google Ads (google / cpc)', test: (u) => { const { p, l, m } = utmParts(u); return p.includes('google') || p.includes('g_ads') || p === 'cpc' || l.includes('cpc') || l.includes('search') || l.includes('google') || m.includes('google') || m.includes('g_ads') || m.includes('search_ads'); } },
  { id: 'facebook', label: 'Facebook Ads (fb / meta)', test: (u) => { const { p, l, m } = utmParts(u); return p === 'fb' || p.startsWith('fb_') || p.endsWith('_fb') || p.includes('facebook') || p.includes('meta') || l.includes('facebook') || m.startsWith('fb_') || m.includes('facebook'); } },
  { id: 'whatsapp', label: 'WhatsApp Outreach', test: (u) => { const { p, l, m } = utmParts(u); return p === 'wa' || p.startsWith('wa_') || p.endsWith('_wa') || p.includes('whatsapp') || l.includes('whatsapp') || m.startsWith('wa_') || m.includes('whatsapp'); } },
];

// The sources that can be given to a user (everything except "All Traffic").
export const UTM_SOURCES = UTM_FILTERS.filter((f) => f.id !== 'all');
const SOURCE_IDS = new Set(UTM_SOURCES.map((f) => f.id));
export const cleanUtmSources = (list) => (Array.isArray(list) ? [...new Set(list.filter((id) => SOURCE_IDS.has(id)))] : []);

// True when the donation came from one of these sources (an empty list means every source).
export function fromSources(donation, sources) {
  if (!sources?.length) return true;
  return UTM_SOURCES.some((f) => sources.includes(f.id) && f.test(donation.utm || {}));
}
