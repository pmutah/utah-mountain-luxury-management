import { corsJson } from '../../_lib/data';
import { authCookieHeader, isAuthConfigured } from '../../_lib/auth';
import { matchesMuseSecret } from '../../_lib/muse/auth';

export const onRequestPost: PagesFunction<{
  DASHBOARD_PASSWORD?: string;
  MUSE_BOT_SECRET?: string;
}> = async ({ request, env }) => {
  if (!isAuthConfigured(env)) {
    return corsJson(request, { authenticated: true, authRequired: false });
  }
  const { password } = (await request.json()) as { password?: string };
  const ok = password === env.DASHBOARD_PASSWORD || matchesMuseSecret(password ?? '', env);
  if (!ok) {
    return corsJson(request, { error: 'Invalid password' }, 401);
  }
  const headers = { 'Set-Cookie': authCookieHeader(env.DASHBOARD_PASSWORD!, 'Lax') };
  return corsJson(request, { authenticated: true, authRequired: true }, 200, headers);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
