import { corsJson } from '../../_lib/data';
import { loadAutomation, saveAutomation, type AutomationSettings } from '../../_lib/automation';
import type { SettingsEnv } from '../../_lib/kv';

export const onRequestGet: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  return corsJson(request, await loadAutomation(env));
};

export const onRequestPut: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  const body = (await request.json()) as Partial<AutomationSettings>;
  return corsJson(request, await saveAutomation(env, body));
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
