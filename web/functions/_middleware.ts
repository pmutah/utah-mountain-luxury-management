import { isAuthConfigured, isAuthenticated, unauthorized } from './_lib/auth';
import { cronAuthorized, emailSessionValid, refuseReadOnly } from './_lib/roles';
import { isMuseAuthorized, isPublicMusePath } from './_lib/muse/auth';
import { SECURITY_HEADERS } from '../src/lib/platform/back-office';
import { staticCacheControl } from './_lib/static-cache';

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

/** A guest's forecast. The stay token is the credential, exactly as for the guide beside it. */
const STAY_CONDITIONS = /^\/api\/stay-guide\/[^/]+\/conditions\/?$/;

/**
 * Pages whose address is a credential, and which must never be indexed.
 *
 * A stay link, a cleaner's link, an owner's statement, a request status page, and an e-sign ceremony all carry a token in
 * the path. That token **is** the login — anyone holding the URL can open the page. A search engine that indexes one
 * publishes it, and the page carries a guest's name and dates, a door code, or an owner's share.
 *
 * `robots.txt` cannot do this job on its own. It is advisory, some crawlers ignore it, and it has no effect on a URL that
 * is already linked from somewhere else. The response header is the part that holds: `X-Robots-Tag: noindex, nofollow`
 * travels with the page itself.
 */
const PRIVATE_PAGES = [
  /^\/stay\//,
  /^\/clean\/(?!links?\/?$)/,
  /^\/owner\//,
  /^\/request\//,
  /^\/esign\//,
];

/** True when a path is one of the token-addressed pages. */
function isPrivatePage(pathname: string): boolean {
  return PRIVATE_PAGES.some((pattern) => pattern.test(pathname));
}

function withSecurity(response: Response, privatePage = false): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  /*
   * No index, no follow, and no archive. `noindex` keeps the page out of search results; `nofollow` keeps a crawler from
   * walking the other links on it; `noarchive` keeps a cached copy of a guest's stay from being served to a stranger
   * after the token is revoked.
   */
  if (privatePage) headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const onRequest: PagesFunction<{
  DASHBOARD_PASSWORD?: string;
  MUSE_BOT_SECRET?: string;
}> = async (context) => {
  const url = new URL(context.request.url);
  if (!url.pathname.startsWith('/api/')) {
    const response = withSecurity(await context.next(), isPrivatePage(url.pathname));
    const cache = response.status === 200 ? staticCacheControl(url.pathname) : null;
    if (cache) response.headers.set('Cache-Control', cache);
    return response;
  }
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
    /*
     * A guest's forecast. The stay token in the path is the whole credential, the same as the guide beside it, and the answer is
     * weather for a town — no name, no dates. Without this the guest page would need a host sign-in to show a snow forecast.
     */
    STAY_CONDITIONS.test(url.pathname) ||
    url.pathname === '/api/public/conditions' ||
    // One road-camera frame. The key resolves to a fixed UDOT id in canyon-cams.ts and nothing else.
    url.pathname === '/api/public/cam' ||
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
  /*
   * The worker cron.
   *
   * It holds `CRON_SECRET` as a bearer and no cookie, and it calls exactly one route: the morning run. The middleware is the first
   * gate, so without this the cron was refused 401 before the route could compare the secret. It is scoped to that one path so a
   * cron secret cannot reach the ledger, the receipts, or the guest surveys.
   */
  if (url.pathname === '/api/platform/daily' && cronAuthorized(context.request, context.env)) {
    return withSecurity(await context.next());
  }
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
  if (emailSessionValid(context.request, context.env)) {
    /*
     * A read-only account cannot write, on **any** route.
     *
     * `refuseReadOnly` existed and was called by one route — expense create — so an owner session could still PATCH or
     * delete an expense, add a booking, or change a rate. Asking every route to remember is how that happened once
     * already. The check belongs in the gate that runs first, where a route added next year is covered without knowing
     * about it. Reads pass through; only a method that changes something is refused.
     */
    const writes = !['GET', 'HEAD', 'OPTIONS'].includes(context.request.method.toUpperCase());
    if (writes) {
      const readOnly = refuseReadOnly(context.request, context.env, (_req, body, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }),
      );
      if (readOnly) return withSecurity(readOnly);
    }
    return withSecurity(await context.next());
  }
  return withSecurity(unauthorized(context.request));
};
