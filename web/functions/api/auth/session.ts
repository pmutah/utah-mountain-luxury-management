import { corsJson } from '../../_lib/data';
import { isAuthConfigured, isAuthenticated } from '../../_lib/auth';

/**
 * The session probe. It has to answer the login gate, so it cannot itself require a login.
 * When no password is set the dashboard is open, and that is reported plainly rather than
 * pretending the caller is a signed-in host.
 */
export const onRequestGet: PagesFunction<{ DASHBOARD_PASSWORD?: string }> = async ({ request, env }) => {
  const authRequired = isAuthConfigured(env);
  return corsJson(request, {
    authenticated: isAuthenticated(request, env),
    authRequired,
    /** True when the deployment has no password. Every host route is open in that state. */
    open: !authRequired,
  });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
