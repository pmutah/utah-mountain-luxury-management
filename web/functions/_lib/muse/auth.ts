export type MuseEnv = { MUSE_BOT_SECRET?: string; AMANDA_BOT_SECRET?: string };

export function museBotSecret(env: MuseEnv): string {
  return env.MUSE_BOT_SECRET?.trim() || env.AMANDA_BOT_SECRET?.trim() || '';
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
  const header =
    request.headers.get('x-muse-bot-secret')?.trim() ||
    request.headers.get('x-amanda-bot-secret')?.trim() ||
    '';
  return bearer || header;
}

export function matchesMuseSecret(provided: string, env: MuseEnv): boolean {
  if (!provided) return false;
  const muse = env.MUSE_BOT_SECRET?.trim() ?? '';
  const amanda = env.AMANDA_BOT_SECRET?.trim() ?? '';
  if (muse && safeEqual(provided, muse)) return true;
  if (amanda && safeEqual(provided, amanda)) return true;
  return false;
}

export function isMuseAuthorized(request: Request, env: MuseEnv): boolean {
  return matchesMuseSecret(providedMuseSecret(request), env);
}

export type CallingAgent = 'muse' | 'amanda' | 'co-host';

/** Who is calling, from the bearer secret. A path is only a fallback. */
export function callingAgent(request: Request | undefined, env: MuseEnv): CallingAgent {
  if (!request) return 'co-host';
  const provided = providedMuseSecret(request);
  const muse = env.MUSE_BOT_SECRET?.trim() ?? '';
  const amanda = env.AMANDA_BOT_SECRET?.trim() ?? '';
  const museHit = Boolean(muse && safeEqual(provided, muse));
  const amandaHit = Boolean(amanda && safeEqual(provided, amanda));
  if (museHit && amandaHit) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/amanda')) return 'amanda';
    if (path.startsWith('/api/muse')) return 'muse';
  }
  if (amandaHit) return 'amanda';
  if (museHit) return 'muse';
  if (!muse && !amanda) {
    const hinted = request.headers.get('x-agent-name')?.trim().toLowerCase();
    if (hinted === 'amanda' || hinted === 'muse' || hinted === 'co-host') return hinted;
  }
  const path = new URL(request.url).pathname;
  if (path.startsWith('/api/amanda/')) return 'amanda';
  if (path.startsWith('/api/muse/')) return 'muse';
  return 'co-host';
}

export function isPublicMusePath(pathname: string): boolean {
  return (
    pathname === '/api/muse/openapi' ||
    pathname === '/api/muse/openapi.json' ||
    pathname === '/api/muse/instructions' ||
    pathname === '/api/muse/enter' ||
    pathname === '/api/amanda/openapi' ||
    pathname === '/api/amanda/openapi.json' ||
    pathname === '/api/amanda/instructions' ||
    pathname === '/api/amanda/enter'
  );
}
