import { isAuthConfigured, isAuthenticated, unauthorized } from './_lib/auth';

export const onRequest: PagesFunction<{ DASHBOARD_PASSWORD?: string }> = async (context) => {
  const url = new URL(context.request.url);
  if (!url.pathname.startsWith('/api/')) return context.next();
  if (
    url.pathname.startsWith('/api/auth/') ||
    url.pathname.startsWith('/api/stay-preferences/') ||
    url.pathname === '/health' ||
    context.request.method === 'OPTIONS'
  ) {
    return context.next();
  }
  if (!isAuthConfigured(context.env)) return context.next();
  if (isAuthenticated(context.request, context.env)) return context.next();
  return unauthorized(context.request);
};
