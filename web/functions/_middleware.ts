import { isAuthConfigured, isAuthenticated, unauthorized } from './_lib/auth';
import { emailSessionValid } from './_lib/roles';
import { isMuseAuthorized, isPublicMusePath } from './_lib/muse/auth';
import { SECURITY_HEADERS } from '../src/lib/platform/back-office';

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
const PUBLIC_BOOK = new Set([
  '/api/book',
  '/api/book/',
  '/api/book/availability',
  '/api/book/quote',
  '/api/book/quote/',
  '/api/book/turnstile',
]);

/** A guest's own request page. The token is the credential. */
const BOOK_REQUEST_PAGE = /^\/api\/book\/request\/[^/]+\/?$/;

function withSecurity(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const onRequest: PagesFunction<{
  DASHBOARD_PASSWORD?: string;
  MUSE_BOT_SECRET?: string;
}> = async (context) => {
  const url = new URL(context.request.url);
  if (!url.pathname.startsWith('/api/')) return withSecurity(await context.next());
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
    url.pathname.startsWith('/api/hooks/') ||
    url.pathname === '/api/funnel' ||
    BOOK_REQUEST_PAGE.test(url.pathname) ||
    OWNER_PAGE.test(url.pathname) ||
    CLEAN_PAGE.test(url.pathname) ||
    url.pathname === '/api/agent/map' ||
    isPublicMusePath(url.pathname) ||
    url.pathname === '/health' ||
    context.request.method === 'OPTIONS'
  ) {
    return withSecurity(await context.next());
  }
  if (isMuseAuthorized(context.request, context.env)) return withSecurity(await context.next());
  if (!isAuthConfigured(context.env)) return withSecurity(await context.next());
  if (isAuthenticated(context.request, context.env)) return withSecurity(await context.next());
  /*
   * An emailed session counts as a way in here too.
   *
   * This is the second half of the reason Google sign-in never worked in production. The middleware is the **first** gate on
   * every `/api/*` request, and it only ever asked `isAuthenticated`, which reads the password cookie. A caller holding a
   * perfectly good emailed session was refused 401 by the middleware, so `hostOnly` — which does understand the session — was
   * never reached. The login screen offered Google sign-in, the token verified, the cookie was set, and the very next request
   * was denied.
   *
   * `emailSessionValid` verifies the signature and the allowlist exactly as `hostOnly` does, so this is not a widening of
   * access: it is the same check, in the gate that runs first.
   */
  if (emailSessionValid(context.request, context.env)) return withSecurity(await context.next());
  return withSecurity(unauthorized(context.request));
};
