import { corsJson } from '../../_lib/data';
import { isMuseAuthorized, museBotSecret } from '../../_lib/muse/auth';
import { isKnownMuseTool, listMuseTools, runMuseTool } from '../../_lib/muse/catalog';
import type { AgentEnv } from '../../_lib/agent/types';
import type { ConstructionEnv } from '../../_lib/construction/types';

type MusePagesEnv = AgentEnv & ConstructionEnv;

/** Tool results include the ledger. A cached copy would keep serving the row from before the last save. */
const NO_STORE = { 'Cache-Control': 'no-store' };

function requireMuse(request: Request, env: MusePagesEnv): Response | null {
  if (museBotSecret(env) && isMuseAuthorized(request, env)) return null;
  if (museBotSecret(env)) return corsJson(request, { error: 'Unauthorized' }, 401, NO_STORE);
  return corsJson(request, { error: 'Muse bot is not configured.' }, 503, NO_STORE);
}

export const onRequestGet: PagesFunction<MusePagesEnv> = async ({ request, env }) => {
  const denied = requireMuse(request, env);
  if (denied) return denied;
  const tools = listMuseTools();
  return corsJson(request, { ok: true, count: tools.length, tools }, 200, NO_STORE);
};

export const onRequestPost: PagesFunction<MusePagesEnv> = async ({ request, env }) => {
  const denied = requireMuse(request, env);
  if (denied) return denied;

  let body: { name?: string; tool?: string; arguments?: Record<string, unknown>; args?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON body.' }, 400, NO_STORE);
  }

  const name = String(body.name ?? body.tool ?? '').trim();
  if (!name) return corsJson(request, { error: 'name is required (tool name).' }, 400, NO_STORE);
  if (!isKnownMuseTool(name)) return corsJson(request, { error: `Unknown tool: ${name}` }, 400, NO_STORE);

  const args =
    body.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments)
      ? body.arguments
      : body.args && typeof body.args === 'object' && !Array.isArray(body.args)
        ? body.args
        : {};

  try {
    const result = await runMuseTool(env, name, args, request);
    return corsJson(request, result, 200, NO_STORE);
  } catch (e) {
    return corsJson(request, { error: e instanceof Error ? e.message : String(e) }, 400, NO_STORE);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
