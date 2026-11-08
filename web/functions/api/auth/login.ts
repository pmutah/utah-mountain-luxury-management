import { corsJson } from '../../_lib/data';
import { authCookieHeader, isAuthConfigured } from '../../_lib/auth';
import { matchesMuseSecret } from '../../_lib/muse/auth';
import { allowlistSummary, emailAllowlist, isAllowedEmail } from '../../_lib/email-allowlist';
import { clearCookieHeader, emailCookieHeader, sessionSecret } from '../../_lib/email-session';
import { verifyGoogleSignIn } from '../../_lib/google-token';

type Env = {
  DASHBOARD_PASSWORD?: string;
  MUSE_BOT_SECRET?: string;
  SESSION_SECRET?: string;
  ALLOWED_EMAILS?: string;
  VITE_ALLOWED_EMAILS?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
};

/**
 * Sign in.
 *
 * Two ways in, and both end in a cookie the server can verify on its own:
 *
 * 1. **A Google ID token** (`{ credential }`) from the browser. It is verified against Google's keys,
 *    then the address must be on the allowlist. This is the way people will use.
 * 2. **The dashboard password** (`{ password }`), kept so an existing deployment does not break and
 *    so there is a way in if Google is unreachable.
 *
 * A body with neither is refused. The response never echoes the allowlist back.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: { credential?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }

  /* ------------------------------- Google sign-in ------------------------------- */
  const credential = typeof body.credential === 'string' ? body.credential.trim() : '';
  if (credential) {
    /*
     * Without a session secret there is nothing to sign the cookie with, so the sign-in could not be
     * remembered — accepting it would mean the next request looks signed out. Refusing with a reason
     * is better than a login that silently does not stick.
     */
    const secret = sessionSecret(env);
    if (!secret) {
      return corsJson(
        request,
        {
          error: 'Email sign-in is not configured on this deployment. SESSION_SECRET is missing.',
          code: 'not-configured',
        },
        503,
      );
    }
    const result = await verifyGoogleSignIn(credential, {
      clientId: env.GOOGLE_OAUTH_CLIENT_ID,
      env,
    });
    if (!result.ok) {
      const status = result.reason === 'not-configured' ? 503 : 401;
      /*
       * `not-allowed` is the one failure a person can fix themselves, so it has to say which account
       * was refused. Without the address the screen reads "Google is not allowing me" when Google
       * did its job and this dashboard declined the account — which is exactly the confusion this
       * caused on 2026-11-08, when the browser was signed in as a different address.
       */
      const refused = result.reason === 'not-allowed' ? result.refusedEmail ?? null : null;
      return corsJson(
        request,
        {
          error: refused
            ? `Signed in as ${refused}, which is not on this dashboard's allowlist. Use one of the approved addresses, or ask Brandon to add it.`
            : result.message,
          code: result.reason,
          ...(refused ? { email: refused } : {}),
          authenticated: false,
        },
        status,
      );
    }
    return corsJson(
      request,
      { authenticated: true, authRequired: true, email: result.person.email, name: result.person.name },
      200,
      { 'Set-Cookie': emailCookieHeader(result.person.email, secret) },
    );
  }

  /* --------------------------------- password --------------------------------- */
  if (!isAuthConfigured(env)) {
    // Reachable only on a deployment with no password. If email sign-in exists it is still required.
    if (sessionSecret(env)) {
      return corsJson(request, { error: 'Sign in with an approved email address.', code: 'sign-in' }, 401);
    }
    return corsJson(request, { authenticated: true, authRequired: false });
  }
  const password = typeof body.password === 'string' ? body.password : '';
  const ok = password === env.DASHBOARD_PASSWORD || matchesMuseSecret(password, env);
  if (!ok) {
    return corsJson(request, { error: 'Invalid password' }, 401);
  }
  return corsJson(request, { authenticated: true, authRequired: true }, 200, {
    'Set-Cookie': authCookieHeader(env.DASHBOARD_PASSWORD!, 'Lax'),
  });
};

/**
 * What the login screen needs to draw itself.
 *
 * It says whether an email list exists and how many addresses are on it. It never returns them: the
 * allowlist is not exactly secret, but publishing it tells anyone which address to phish.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  return corsJson(
    request,
    {
      emailSignIn: Boolean(sessionSecret(env)),
      passwordSignIn: isAuthConfigured(env),
      googleClientId: env.GOOGLE_OAUTH_CLIENT_ID?.trim() || null,
      summary: allowlistSummary(env),
      allowedCount: emailAllowlist(env).length,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

/** Sign out. */
export const onRequestDelete: PagesFunction<Env> = async ({ request }) =>
  corsJson(request, { ok: true }, 200, { 'Set-Cookie': clearCookieHeader() });

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);

export { isAllowedEmail };
