import { corsJson } from '../../_lib/data';
import { isAuthConfigured, isAuthenticated } from '../../_lib/auth';

export const onRequestGet: PagesFunction<{ DASHBOARD_PASSWORD?: string }> = async ({ request, env }) => {
  const authRequired = isAuthConfigured(env);
  return corsJson(request, {
    authenticated: isAuthenticated(request, env),
    authRequired,
  });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
