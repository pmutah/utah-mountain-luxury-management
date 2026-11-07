const COOKIE = 'wpm_auth';

import { isMuseAuthorized } from './muse/auth';
import { corsHeaders } from './data';

export function isAuthConfigured(env: { DASHBOARD_PASSWORD?: string }): boolean {
  return Boolean(env.DASHBOARD_PASSWORD && env.DASHBOARD_PASSWORD.length > 0);
}

export function isAuthenticated(request: Request, env: { DASHBOARD_PASSWORD?: string }): boolean {
  if (!isAuthConfigured(env)) return true;
  const cookie = request.headers.get('Cookie') ?? '';
  const match = cookie.match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!match) return false;
  return match[1] === tokenFor(env.DASHBOARD_PASSWORD!);
}

/** The env fields the host check reads. Only these are ever inspected. */
export type HostEnv = {
  DASHBOARD_PASSWORD?: string;
  MUSE_BOT_SECRET?: string;
  AMANDA_BOT_SECRET?: string;
};

/** Read one env field from an env object of any shape, without widening the caller's type. */
function field(env: unknown, key: keyof HostEnv): string | undefined {
  if (!env || typeof env !== 'object') return undefined;
  const value = (env as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * A host route may only run for a signed-in host, a Muse or Amanda bearer, or an agent secret.
 *
 * The old behaviour treated a missing password as "everyone is the host", which left the ledger,
 * the booking list, guest survey tokens, and the document vault readable by anyone who knew the
 * URL. A misconfigured deployment now refuses private reads instead of opening them.
 *
 * The bot bearer still works, because `dashboard_request` and every `/api/*` route are documented
 * to run under it, and a bot that cannot read the ledger is a bot that cannot do the job. A bearer
 * is checked before the password so a deployment with no password set is still usable by the bots
 * and still closed to the public.
 *
 * The env is taken as `unknown` on purpose: a route's env carries more than these three fields, and
 * narrowing the parameter to this type would reject every real env in the codebase.
 */
export function hostOnly(request: Request, env: unknown): boolean {
  const password = field(env, 'DASHBOARD_PASSWORD');
  const secrets = { MUSE_BOT_SECRET: field(env, 'MUSE_BOT_SECRET'), AMANDA_BOT_SECRET: field(env, 'AMANDA_BOT_SECRET') };
  if (isMuseAuthorized(request, secrets)) return true;
  if (!password || password.length === 0) return false;
  return isAuthenticated(request, { DASHBOARD_PASSWORD: password });
}

/** The reason a host route refused, so a caller can tell "sign in" from "this site is not protected yet". */
export function hostDeniedBody(env: unknown): { error: string; authRequired: boolean; code: string } {
  const password = field(env, 'DASHBOARD_PASSWORD');
  if (!password || password.length === 0) {
    return {
      error: 'This site has no dashboard password set, so private data stays closed. Set DASHBOARD_PASSWORD.',
      authRequired: false,
      code: 'not-configured',
    };
  }
  return { error: 'Unauthorized', authRequired: true, code: 'sign-in' };
}

export function tokenFor(password: string): string {
  return btoa(`wpm:${password}`).replace(/=+$/, '');
}

export function authCookieHeader(password: string, sameSite: 'Strict' | 'Lax' = 'Strict'): string {
  const maxAge = 60 * 60 * 24 * 30;
  return `${COOKIE}=${tokenFor(password)}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${maxAge}`;
}

export function unauthorized(request: Request): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request),
    },
  });
}

/** A 401 that says whether the caller should sign in or the deployment is unprotected. */
export function hostDenied(request: Request, env: unknown): Response {
  return new Response(JSON.stringify(hostDeniedBody(env)), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(request),
    },
  });
}
