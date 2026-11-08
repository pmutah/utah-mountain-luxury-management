import { hostDenied, hostOnly } from '../../../_lib/auth';
import { corsJson } from '../../../_lib/data';
import { readJsonBody } from '../../../_lib/json-body';
import { dismissConstructionRecommendation } from '../../../_lib/construction/construction-store';
import type { ConstructionEnv } from '../../../_lib/construction/types';

export const onRequestPatch: PagesFunction<ConstructionEnv> = async ({ request, env, params }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const id = params.id as string;
  const parsed = await readJsonBody<{ dismissed?: boolean }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!body.dismissed) {
    return corsJson(request, { error: 'Set dismissed: true' }, 400);
  }
  const ok = await dismissConstructionRecommendation(env, id);
  if (!ok) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, { ok: true });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
