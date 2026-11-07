import { hostDenied, hostOnly } from '../../../_lib/auth';
import { corsJson } from '../../../_lib/data';
import { loadConstructionRecommendations } from '../../../_lib/construction/construction-store';
import { readOrRefuse } from '../../../_lib/read-guard';
import type { ConstructionEnv } from '../../../_lib/construction/types';

export const onRequestGet: PagesFunction<ConstructionEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const read = await readOrRefuse(request, () => loadConstructionRecommendations(env), 'Saved construction recommendations');
  if (!read.ok) return read.response;
  return corsJson(request, { recommendations: read.value.filter((r) => !r.dismissed) });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
