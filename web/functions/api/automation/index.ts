import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { loadAutomation, saveAutomation, type AutomationSettings } from '../../_lib/automation';
import { readOrRefuse } from '../../_lib/read-guard';
import type { SettingsEnv } from '../../_lib/kv';

export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const read = await readOrRefuse(request, () => loadAutomation(env), 'Saved automation settings');
  if (!read.ok) return read.response;
  return corsJson(request, read.value);
};

export const onRequestPut: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const body = (await request.json()) as Partial<AutomationSettings>;
  const read = await readOrRefuse(request, () => saveAutomation(env, body), 'Saved automation settings');
  if (!read.ok) return read.response;
  return corsJson(request, read.value);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
