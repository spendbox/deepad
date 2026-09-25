// Event links are short and readable: dashpad.ng/tolu-and-dayo
// Used by both the browser (live checking) and the server (final check).

export const SLUG_MIN = 3;
export const SLUG_MAX = 40;

/** Words that are already pages on the site, so events can't use them. */
const RESERVED = new Set([
  'dashboard', 'login', 'logout', 'signup', 'admin', 'api', 'e', 'forgot-password', 'reset-password',
  'about', 'pricing', 'terms', 'privacy', 'help', 'support', 'contact', 'blog', 'dashpad', 'www',
  'static', 'public', 'images', 'assets', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'events', 'event', 'camera', 'lines',
]);

/** "Tolu & Dayo’s Wedding!" -> "tolu-and-dayos-wedding" */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
}

/** Returns a problem to show the planner, or null if the link is fine. */
export function slugProblem(slug: string): string | null {
  if (slug.length < SLUG_MIN) return `The link needs at least ${SLUG_MIN} letters or numbers.`;
  if (slug.length > SLUG_MAX) return `The link can be at most ${SLUG_MAX} characters.`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return 'Use only small letters, numbers and dashes.';
  if (RESERVED.has(slug)) return 'That link is reserved. Please choose another.';
  return null;
}
