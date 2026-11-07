import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { loadExtraCleaningFees, saveExtraCleaningFees, type SettingsEnv } from '../../_lib/kv';
import { storageReadPaused } from '../../_lib/kv-json';

export const onRequestPut: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const body = (await request.json()) as Record<string, number | string>;
  /*
   * The current fees have to be read before they can be merged and saved. If that read fails, saving
   * the defaults would overwrite the real fees with stand-in numbers, so the write is refused.
   */
  let current;
  try {
    current = await loadExtraCleaningFees(env);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(
        request,
        { error: 'The saved fees could not be read, so nothing was written over them. Try again shortly.' },
        503,
      );
    }
    throw err;
  }
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
