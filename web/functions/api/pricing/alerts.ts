import { corsJson } from '../../_lib/data';
import { loadPricingAlerts, dismissPricingAlert } from '../../_lib/pricing-store';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const alerts = (await loadPricingAlerts(env)).filter((a) => !a.dismissed);
  return corsJson(request, { alerts });
};

export const onRequestPatch: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const body = (await request.json()) as { id: string };
  if (!body.id) return corsJson(request, { error: 'id required' }, 400);
  const ok = await dismissPricingAlert(env, body.id);
  if (!ok) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, { ok: true });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
