const COOKIE = 'wpm_auth';

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

export function tokenFor(password: string): string {
  return btoa(`wpm:${password}`).replace(/=+$/, '');
}

export function authCookieHeader(password: string): string {
  const maxAge = 60 * 60 * 24 * 30;
  return `${COOKIE}=${tokenFor(password)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function unauthorized(request: Request): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': request.headers.get('Origin') ?? '*',
    },
  });
}
