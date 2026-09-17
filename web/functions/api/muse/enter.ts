import { authCookieHeader, isAuthConfigured } from '../../_lib/auth';
import { matchesMuseSecret, providedMuseSecret } from '../../_lib/muse/auth';

function safeNext(raw: string | null): string {
  const next = (raw ?? '/').trim() || '/';
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

export const onRequestGet: PagesFunction<{
  DASHBOARD_PASSWORD?: string;
  MUSE_BOT_SECRET?: string;
}> = async ({ request, env }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('token')?.trim() || providedMuseSecret(request);
  if (!matchesMuseSecret(token, env)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const next = safeNext(url.searchParams.get('next'));
  const headers = new Headers({
    Location: new URL(next, url.origin).toString(),
    'Cache-Control': 'no-store',
  });
  if (isAuthConfigured(env)) {
    headers.set('Set-Cookie', authCookieHeader(env.DASHBOARD_PASSWORD!, 'Lax'));
  }
  return new Response(null, { status: 302, headers });
};
