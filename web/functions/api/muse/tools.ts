import { corsJson } from '../../_lib/data';
import { isMuseAuthorized, museBotSecret } from '../../_lib/muse/auth';
import { isKnownMuseTool, listMuseTools, runMuseTool } from '../../_lib/muse/catalog';
import type { AgentEnv } from '../../_lib/agent/types';
import type { ConstructionEnv } from '../../_lib/construction/types';

type MusePagesEnv = AgentEnv & ConstructionEnv;

function requireMuse(request: Request, env: MusePagesEnv): Response | null {
  if (museBotSecret(env) && isMuseAuthorized(request, env)) return null;
  if (museBotSecret(env)) return corsJson(request, { error: 'Unauthorized' }, 401);
  return corsJson(request, { error: 'Muse bot is not configured.' }, 503);
}

export const onRequestGet: PagesFunction<MusePagesEnv> = async ({ request, env }) => {
  const denied = requireMuse(request, env);
  if (denied) return denied;
  const tools = listMuseTools();
  return corsJson(request, { ok: true, count: tools.length, tools });
};

export const onRequestPost: PagesFunction<MusePagesEnv> = async ({ request, env }) => {
  const denied = requireMuse(request, env);
  if (denied) return denied;

  let body: { name?: string; tool?: string; arguments?: Record<string, unknown>; args?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON body.' }, 400);
  }

  const name = String(body.name ?? body.tool ?? '').trim();
  if (!name) return corsJson(request, { error: 'name is required (tool name).' }, 400);
  if (!isKnownMuseTool(name)) return corsJson(request, { error: `Unknown tool: ${name}` }, 400);

  const args =
    body.arguments && typeof body.arguments === 'object' && !Array.isArray(body.arguments)
      ? body.arguments
      : body.args && typeof body.args === 'object' && !Array.isArray(body.args)
        ? body.args
        : {};

  try {
    const result = await runMuseTool(env, name, args, request);
    return corsJson(request, result);
  } catch (e) {
    return corsJson(request, { error: e instanceof Error ? e.message : String(e) }, 400);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
