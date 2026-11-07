import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { loadCompSet, addCompListing, removeCompListing } from '../../_lib/pricing-store';
import { readOrRefuse } from '../../_lib/read-guard';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const read = await readOrRefuse(request, () => loadCompSet(env), 'Saved comps');
  if (!read.ok) return read.response;
  return corsJson(request, { comps: read.value });
};

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const body = (await request.json()) as {
    platform: 'airbnb' | 'vrbo';
    url: string;
    label: string;
    propertyId?: 'ranch' | 'lindon' | 'both';
    sleeps?: number;
    distanceMi?: number;
    area?: string;
    rating?: number;
    reviews?: number;
    guestFavorite?: boolean;
  };
  if (body.platform !== 'airbnb' && body.platform !== 'vrbo') {
    return corsJson(request, { error: 'platform has to be airbnb or vrbo' }, 400);
  }
  if (!/^https?:\/\//.test(body.url ?? '')) return corsJson(request, { error: 'A listing URL is required.' }, 400);
  if (!body.label?.trim()) return corsJson(request, { error: 'A label is required.' }, 400);
  const comp = await addCompListing(env, body);
  return corsJson(request, comp, 201);
};

export const onRequestDelete: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return corsJson(request, { error: 'id required' }, 400);
  const ok = await removeCompListing(env, id);
  if (!ok) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, { ok: true });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
