// The parts of the admin panel a user can be given access to. Shared by the pages and the API,
// so what a user sees and what the server allows always match.

import { cleanUtmSources, fromSources } from './utm-filters';

export const SECTIONS = [
  { key: 'formsubmissions', label: 'Form Submissions', href: '/admin/formsubmissions' },
  { key: 'blogs', label: 'Blogs', href: '/admin/blogs' },
  { key: 'campaigns', label: 'Campaigns', href: '/admin/campaigns' },
  { key: 'donations', label: 'Donations', href: '/admin/donations' },
  { key: 'monthly-donations', label: 'Monthly Donations', href: '/admin/monthly-donations' },
  { key: 'donors', label: 'Donors', href: '/admin/donors' },
  { key: 'content', label: 'Celebrity Support', href: '/admin/content' },
  { key: 'hero-bg', label: 'Home Page', href: '/admin/hero-bg' },
  { key: '80g', label: '80G', href: '/admin/80g' },
  { key: 'settings', label: 'Project Details', href: '/admin/settings' },
];

export const SECTION_KEYS = SECTIONS.map((s) => s.key);

export const ROLES = {
  admin: { label: 'Admin', hint: 'Full access to every section, including User Management' },
  editor: { label: 'Section Access', hint: 'Only the sections you tick below' },
};

// Which sections may use each data collection. A collection listed under READ_ALSO
// can be viewed (not changed) from those extra sections, e.g. the Home Page picks campaigns.
export const COLLECTION_SECTIONS = {
  submissions: ['formsubmissions'],
  blogs: ['blogs'],
  campaigns: ['campaigns'],
  donations: ['donations', 'monthly-donations'],
  celebCards: ['content'],
  celebBigCards: ['content'],
  hero: ['hero-bg'],
  home: ['hero-bg'],
  certificates: ['80g'],
  donors: ['donors'],
  trust80g: ['80g'],
  site: ['settings'],
};
export const READ_ALSO = { campaigns: ['hero-bg', '80g'] };

export const isFullAdmin = (user) => user?.role === 'admin';

// What a Section Access user may see inside Donations and Monthly Donations. Full admins see everything.
// Users saved before these options existed see everything too, until they are edited.
export const DONATION_VIEW = [
  { key: 'details', label: 'Donation details', hint: 'Donor name, phone, email, PAN, address, receipt and payment numbers, the Details window, and PDF / Send' },
  { key: 'amount', label: 'Donation amount', hint: 'Amounts and totals' },
  { key: 'utm', label: 'UTM (ad source)', hint: 'UTM filter and the source / medium / campaign of each donation' },
];
export const FULL_DONATION_VIEW = Object.fromEntries(DONATION_VIEW.map((v) => [v.key, true]));

// utmSources: the ad sources whose donations they may see (UTM_SOURCES ids); empty means all.
export function donationView(user) {
  if (!user) return { details: false, amount: false, utm: false, utmSources: [] };
  if (isFullAdmin(user) || !user.donationView) return { ...FULL_DONATION_VIEW, utmSources: [] };
  return {
    ...Object.fromEntries(DONATION_VIEW.map((v) => [v.key, user.donationView[v.key] !== false])),
    utmSources: cleanUtmSources(user.donationView.utmSources),
  };
}

// Whether this user may see this donation at all (by where it came from).
export const donationVisible = (d, view) => fromSources(d, view.utmSources);

// A donation with the parts this user may not see taken out.
export function redactDonation(d, view) {
  if (view.details && view.amount && view.utm) return d;
  const out = { ...d };
  // Without "Donation details" only what is needed to count and filter is kept: no name, contact,
  // receipt or payment numbers. Everything not listed here is left out.
  if (!view.details) {
    const keep = ['id', 'createdAt', 'cause', 'causeSlug', 'isMonthly', 'paymentStatus', 'mandateStatus', 'international', 'currency',
      'amount', 'grandTotal', 'tipAmt', 'foreignTotal', 'foreignAmount', 'utm'];
    Object.keys(out).forEach((k) => { if (!keep.includes(k)) delete out[k]; });
    out.paid = Boolean(d.razorpayPaymentId); // for "First Payment" on Monthly Donations, without the number
  }
  if (!view.amount) {
    ['amount', 'grandTotal', 'tipAmt', 'foreignTotal', 'foreignAmount'].forEach((k) => delete out[k]);
  }
  if (!view.utm) delete out.utm;
  return out;
}

export function canUse(user, section) {
  if (!user) return false;
  if (isFullAdmin(user)) return true;
  if (section === 'users') return false;
  return Array.isArray(user.sections) && user.sections.includes(section);
}

export const canUseAny = (user, sections) => sections.some((s) => canUse(user, s));

// The section a page under /admin belongs to. "account" is everyone's own Settings page.
export function sectionForPath(pathname) {
  const part = String(pathname || '').replace(/^\/admin\/?/, '').split('/')[0];
  if (!part) return null;
  if (part === 'users') return 'users';
  if (part === 'settings') return 'account';
  return SECTION_KEYS.includes(part) ? part : null;
}
