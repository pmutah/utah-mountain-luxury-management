import { corsJson } from '../../_lib/data';
import { loadListingConfig, saveListingConfig } from '../../_lib/pricing-store';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  return corsJson(request, await loadListingConfig(env));
};

export const onRequestPut: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const body = (await request.json()) as Record<'ranch' | 'lindon', unknown>;
  const current = await loadListingConfig(env);
  const merged = {
    ranch: { ...current.ranch, ...(body.ranch as object) },
    lindon: { ...current.lindon, ...(body.lindon as object) },
  };
  await saveListingConfig(env, merged);
  return corsJson(request, merged);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
