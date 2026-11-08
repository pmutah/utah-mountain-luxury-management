/**
 * The public URLs the app links to.
 *
 * Cloudflare Pages serves the built `index.html` at an extensionless path by *normalising* it: a
 * request for `/book` answers `308 -> /`, and `/book?house=river` becomes `/?house=river` — the path is
 * dropped and the guest lands on the dashboard login. `/book/` with the trailing slash serves the app
 * correctly. The `_redirects` rules that were meant to handle this are not applied on this project, and
 * `/index.html` itself 308s, so the fix cannot live there.
 *
 * Every link therefore carries the trailing slash. It is one function on purpose: the bug was that
 * these paths were written out by hand in a dozen files, so a fix in one place missed the rest.
 */

/** A house page, e.g. `/houses/ranch/`. */
export function housePagePath(house: string): string {
  return `/houses/${house}/`;
}

/** The house list, `/houses/`. */
export const HOUSES_PATH = '/houses/';

/**
 * The booking page with a query. The slash goes before the `?`, because the path is what Pages
 * normalises — `/book/?a=1` works and `/book?a=1` does not.
 */
export function bookPath(query = ''): string {
  const q = query.startsWith('?') ? query : query ? `?${query}` : '';
  return `/book/${q}`;
}

/**
 * Bring a legacy or malformed path into a form that serves. Used by the router so a link somebody
 * already sent — in an email, a text, or a bookmark — still lands on the page instead of the login.
 */
export function servedPath(pathname: string, search = ''): string {
  const bare = pathname.replace(/\/+$/, '') || '/';
  const q = search.startsWith('?') ? search : search ? `?${search}` : '';
  if (bare === '/book') return `/book/${q}`;
  if (bare === '/houses') return `/houses/${q}`;
  return `${pathname}${q}`;
}
