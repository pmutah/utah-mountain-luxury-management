export type MuseEnv = { MUSE_BOT_SECRET?: string };

export function museBotSecret(env: MuseEnv): string {
  return env.MUSE_BOT_SECRET?.trim() ?? '';
}

function safeEqual(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

export function providedMuseSecret(request: Request): string {
  const auth = request.headers.get('authorization')?.trim() || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const header = request.headers.get('x-muse-bot-secret')?.trim() || '';
  return bearer || header;
}

export function matchesMuseSecret(provided: string, env: MuseEnv): boolean {
  const expected = museBotSecret(env);
  return Boolean(expected && provided && safeEqual(provided, expected));
}

export function isMuseAuthorized(request: Request, env: MuseEnv): boolean {
  return matchesMuseSecret(providedMuseSecret(request), env);
}

export function isPublicMusePath(pathname: string): boolean {
  return (
    pathname === '/api/muse/openapi' ||
    pathname === '/api/muse/openapi.json' ||
    pathname === '/api/muse/instructions' ||
    pathname === '/api/muse/enter'
  );
}
