import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { readJsonBody } from '../../_lib/json-body';
import { loadPricingAlerts, dismissPricingAlert } from '../../_lib/pricing-store';
import { readOrRefuse } from '../../_lib/read-guard';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const read = await readOrRefuse(request, () => loadPricingAlerts(env), 'Saved pricing alerts');
  if (!read.ok) return read.response;
  return corsJson(request, { alerts: read.value.filter((a) => !a.dismissed) });
};

export const onRequestPatch: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const parsed = await readJsonBody<{ id: string }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  if (!body.id) return corsJson(request, { error: 'id required' }, 400);
  const saved = await readOrRefuse(request, () => dismissPricingAlert(env, body.id), 'Saved pricing alerts');
  if (!saved.ok) return saved.response;
  if (!saved.value) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, { ok: true });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
