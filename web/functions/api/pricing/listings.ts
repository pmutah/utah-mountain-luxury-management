import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { loadListingConfig, saveListingConfig } from '../../_lib/pricing-store';
import { readOrRefuse } from '../../_lib/read-guard';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const read = await readOrRefuse(request, () => loadListingConfig(env), 'Saved listing settings');
  if (!read.ok) return read.response;
  return corsJson(request, read.value);
};

export const onRequestPut: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const body = (await request.json()) as Partial<Record<'ranch' | 'lindon' | 'river', unknown>>;
  /*
   * Every house is carried through, so this read has to succeed: building the merged config from a
   * default would erase whichever house the caller did not send. A paused store therefore refuses the
   * write rather than saving a partial board.
   */
  const read = await readOrRefuse(request, () => loadListingConfig(env), 'Saved listing settings');
  if (!read.ok) return read.response;
  const current = read.value;
  const merged = {
    ranch: { ...current.ranch, ...(typeof body.ranch === 'object' && body.ranch !== null ? body.ranch : {}) },
    lindon: { ...current.lindon, ...(typeof body.lindon === 'object' && body.lindon !== null ? body.lindon : {}) },
    river: { ...current.river, ...(typeof body.river === 'object' && body.river !== null ? body.river : {}) },
  };
  await saveListingConfig(env, merged);
  return corsJson(request, merged);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
