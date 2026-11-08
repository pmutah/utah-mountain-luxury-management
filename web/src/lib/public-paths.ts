import { STAY_LINK_KEYS } from './stay-link';

﻿/**
 * The public URLs the app links to.
 *
 * Cloudflare Pages serves the built `index.html` at an extensionless path by *normalising* it: a
 * request for `/book` answers `308 -> /`, and `/book?house=river` becomes `/?house=river` â€” the path is
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
 * normalises â€” `/book/?a=1` works and `/book?a=1` does not.
 */
export function bookPath(query = ''): string {
  const q = query.startsWith('?') ? query : query ? `?${query}` : '';
  return `/book/${q}`;
}

/**
 * Bring a legacy or malformed path into a form that serves. Used by the router so a link somebody
 * already sent â€” in an email, a text, or a bookmark â€” still lands on the page instead of the login.
 */
export function servedPath(pathname: string, search = ''): string {
  const bare = pathname.replace(/\/+$/, '') || '/';
  const q = search.startsWith('?') ? search : search ? `?${search}` : '';
  if (bare === '/book') return `/book/${q}`;
  if (bare === '/houses') return `/houses/${q}`;
  return `${pathname}${q}`;
}

/**
 * Where a redirected link actually ended up.
 *
 * A 308 from the host rewrites `/book?house=river` into `/?house=river` â€” the query is kept and the path
 * is thrown away. So a quote link emailed before the paths were fixed arrives at the *dashboard root*
 * with booking parameters, and would otherwise show a login form to a guest.
 *
 * This recognises that shape and points it at the booking page. It is deliberately narrow: only the
 * root path, and only when a parameter that the booking page actually reads is present. A bare `/` is
 * still the dashboard.
 */
export function rescueLegacyLink(pathname: string, search: string): string | null {
  const bare = pathname.replace(/\/+$/, '') || '/';
  if (bare !== '/') return null;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  /*
   * The keys come from the stay-link parser, not from a second hand-written list. The first version of
   * this had its own list and was already wrong â€” it missed `leave` and `event`, and carried an
   * `arrival` key that nothing reads â€” so a rescued link with an arrival time still fell through to the
   * dashboard.
   */
  const looksLikeBooking = STAY_LINK_KEYS.some((key) => params.has(key));
  const q = search && !search.startsWith('?') ? `?${search}` : search;
  return looksLikeBooking ? `/book/${q}` : null;
}

