import { corsJson } from '../../_lib/data';
import { authCookieHeader, isAuthConfigured } from '../../_lib/auth';

export const onRequestPost: PagesFunction<{ DASHBOARD_PASSWORD?: string }> = async ({ request, env }) => {
  if (!isAuthConfigured(env)) {
    return corsJson(request, { authenticated: true, authRequired: false });
  }
  const { password } = (await request.json()) as { password?: string };
  if (password !== env.DASHBOARD_PASSWORD) {
    return corsJson(request, { error: 'Invalid password' }, 401);
  }
  const headers = { 'Set-Cookie': authCookieHeader(env.DASHBOARD_PASSWORD!) };
  return corsJson(request, { authenticated: true, authRequired: true }, 200, headers);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
