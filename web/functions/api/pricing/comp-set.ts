import { corsJson } from '../../_lib/data';
import { loadCompSet, addCompListing, removeCompListing } from '../../_lib/pricing-store';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  return corsJson(request, { comps: await loadCompSet(env) });
};

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const body = (await request.json()) as {
    platform: 'airbnb' | 'vrbo';
    url: string;
    label: string;
    propertyId?: 'ranch' | 'lindon' | 'both';
  };
  const comp = await addCompListing(env, body);
  return corsJson(request, comp, 201);
};

export const onRequestDelete: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return corsJson(request, { error: 'id required' }, 400);
  const ok = await removeCompListing(env, id);
  if (!ok) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, { ok: true });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
