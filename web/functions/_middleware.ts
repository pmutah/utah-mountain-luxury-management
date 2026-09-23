import { isAuthConfigured, isAuthenticated, unauthorized } from './_lib/auth';
import { isMuseAuthorized, isPublicMusePath } from './_lib/muse/auth';

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
    url.pathname === '/api/book' ||
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
