import { corsJson } from '../../_lib/data';
import { loadExtraCleaningFees, saveExtraCleaningFees, type SettingsEnv } from '../../_lib/kv';

export const onRequestPut: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  const body = (await request.json()) as Record<string, number | string>;
  const current = await loadExtraCleaningFees(env);
  const next: Record<string, number> = { ...current };
  for (const [key, val] of Object.entries(body)) {
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) delete next[key];
    else next[key] = num;
  }
  const saved = await saveExtraCleaningFees(env, next);
  return corsJson(request, saved);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
