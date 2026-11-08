import { isAuthConfigured, isAuthenticated, unauthorized } from './_lib/auth';
import { isMuseAuthorized, isPublicMusePath } from './_lib/muse/auth';

/**
 * An owner portal page. `owner/links` is the host route that mints these, so it must not match: the
 * token is 32 hex characters and `links` is not.
 */
const OWNER_PAGE = /^\/api\/owner\/[a-f0-9]{32}\/?$/;

/**
 * A cleaner page. The named routes under this prefix — `links`, `photos`, `photo`, `progress` — are
 * host routes; a cleaner's token is a random string that is none of those words.
 */
const CLEAN_PAGE = /^\/api\/clean\/(?!links\/?$|photos\/?$|photo\/?$|progress\/?$)[A-Za-z0-9_-]{6,}\/?$/;

/**
 * The public booking routes, named one by one.
 *
 * This used to be `startsWith('/api/book')`, which let every booking route past the outer gate —
 * including `requests`, `accept`, `decline`, and `holds`. Those check the host themselves, so nothing
 * was exposed, but the middleware is supposed to be the first gate and it was waving through the
 * host's own booking desk.
 */
const PUBLIC_BOOK = new Set(['/api/book', '/api/book/', '/api/book/availability']);

/** A guest's own request page. The token is the credential. */
const BOOK_REQUEST_PAGE = /^\/api\/book\/request\/[^/]+\/?$/;

export const onRequest: PagesFunction<{
  DASHBOARD_PASSWORD?: string;
  MUSE_BOT_SECRET?: string;
}> = async (context) => {
  const url = new URL(context.request.url);
  if (!url.pathname.startsWith('/api/')) return context.next();
  if (
    url.pathname.startsWith('/api/auth/') ||
    url.pathname.startsWith('/api/stay-preferences/') ||
    url.pathname.startsWith('/api/stay-guide/') ||
    url.pathname.startsWith('/api/esign/sign/') ||
    /*
     * The token in the path is the whole credential on these, so the middleware must not demand a host
     * password. Without this the owner portal, a cleaner link, and a guest's request page all answered
     * 401 — the token was never even looked at.
     *
     * These match the token's shape rather than the whole prefix: `/api/owner/` would also let
     * `/api/owner/links` through, which is the host route that MINTS links. A test caught that.
     */
    PUBLIC_BOOK.has(url.pathname) ||
    BOOK_REQUEST_PAGE.test(url.pathname) ||
    OWNER_PAGE.test(url.pathname) ||
    CLEAN_PAGE.test(url.pathname) ||
    url.pathname === '/api/agent/map' ||
    isPublicMusePath(url.pathname) ||
    url.pathname === '/health' ||
    context.request.method === 'OPTIONS'
  ) {
    return context.next();
  }
  if (isMuseAuthorized(context.request, context.env)) return context.next();
  if (!isAuthConfigured(context.env)) return context.next();
  if (isAuthenticated(context.request, context.env)) return context.next();
  return unauthorized(context.request);
};
