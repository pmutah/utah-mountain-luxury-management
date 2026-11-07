import { hostDenied, hostOnly } from '../../_lib/auth';
import { runAutomation } from '../../_lib/automation';
import { corsJson } from '../../_lib/data';
import { storageReadPaused } from '../../_lib/kv-json';
import type { SettingsEnv } from '../../_lib/kv';

export const onRequestPost: PagesFunction<SettingsEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const origin = new URL(request.url).origin;
  /*
   * The run reads the ledger to write the monthly letter. A store at its read limit used to give it
   * default cleaning fees; now it raises, and an unhandled throw here would be a Cloudflare 1101 rather
   * than an answer. Refuse with a reason instead, and write nothing.
   */
  try {
    return corsJson(request, await runAutomation(env, origin));
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(
        request,
        { error: 'Saved bookings could not be read, so no letter was sent. Nothing was written over them.' },
        503,
      );
    }
    const message = err instanceof Error ? err.message : 'The automation failed';
    return corsJson(request, { error: message }, 500);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
