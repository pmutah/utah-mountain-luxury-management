import { corsJson } from '../../../_lib/data';
import { dismissConstructionRecommendation } from '../../../_lib/construction/construction-store';
import type { ConstructionEnv } from '../../../_lib/construction/types';

export const onRequestPatch: PagesFunction<ConstructionEnv> = async ({ request, env, params }) => {
  const id = params.id as string;
  const body = (await request.json()) as { dismissed?: boolean };
  if (!body.dismissed) {
    return corsJson(request, { error: 'Set dismissed: true' }, 400);
  }
  const ok = await dismissConstructionRecommendation(env, id);
  if (!ok) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, { ok: true });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
