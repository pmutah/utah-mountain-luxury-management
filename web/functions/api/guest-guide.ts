import { corsJson } from '../_lib/data';
import { GUIDE_HOUSE_IDS, loadGuides, saveGuide, type GuideHouseId, type HouseGuide } from '../_lib/guest-guide';
import type { AgentEnv } from '../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  return corsJson(request, { guides: await loadGuides(env) }, 200, { 'Cache-Control': 'no-store' });
};

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  let body: { propertyId?: string; guide?: Partial<HouseGuide> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  if (!GUIDE_HOUSE_IDS.includes(body.propertyId as GuideHouseId) || !body.guide) {
    return corsJson(request, { error: 'propertyId (ranch|lindon|river) and guide required' }, 400);
  }
  if ('enabled' in body.guide) body.guide.enabled = body.guide.enabled === true;
  const guide = await saveGuide(env, body.propertyId as GuideHouseId, body.guide);
  return corsJson(request, { ok: true, guide });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
