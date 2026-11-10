// The parts of the admin panel a user can be given access to. Shared by the pages and the API,
// so what a user sees and what the server allows always match.

export const SECTIONS = [
  { key: 'formsubmissions', label: 'Form Submissions', href: '/admin/formsubmissions' },
  { key: 'blogs', label: 'Blogs', href: '/admin/blogs' },
  { key: 'campaigns', label: 'Campaigns', href: '/admin/campaigns' },
  { key: 'donations', label: 'Donations', href: '/admin/donations' },
  { key: 'monthly-donations', label: 'Monthly Donations', href: '/admin/monthly-donations' },
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
  trust80g: ['80g'],
  site: ['settings'],
};
export const READ_ALSO = { campaigns: ['hero-bg'] };

export const isFullAdmin = (user) => user?.role === 'admin';

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
