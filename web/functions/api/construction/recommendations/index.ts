import { corsJson } from '../../../_lib/data';
import { loadConstructionRecommendations } from '../../../_lib/construction/construction-store';
import type { ConstructionEnv } from '../../../_lib/construction/types';

export const onRequestGet: PagesFunction<ConstructionEnv> = async ({ request, env }) => {
  const recommendations = (await loadConstructionRecommendations(env)).filter((r) => !r.dismissed);
  return corsJson(request, { recommendations });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
