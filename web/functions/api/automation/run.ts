import { runAutomation } from '../../_lib/automation';
import { corsJson } from '../../_lib/data';
import type { SettingsEnv } from '../../_lib/kv';

export const onRequestPost: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  const origin = new URL(request.url).origin;
  return corsJson(request, await runAutomation(env, origin));
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
