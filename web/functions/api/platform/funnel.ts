import { hostDenied, hostOnly } from '../../_lib/auth';
import { failSoft, jsonResponse } from '../../_lib/platform/http';
import { readFunnel } from '../../_lib/platform/market-db';

type Env = { MARKET_DB?: unknown };

/**
 * Funnel counts. Host only, because the shape of the funnel is the business's own information.
 *
 * The step itself is recorded by `POST /api/funnel`, which is public and stores no identifying field.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const counts = await readFunnel(env);
    return jsonResponse(request, {
      counts: counts.ok ? counts.rows : [],
      reason: counts.ok ? undefined : counts.reason,
      stored: counts.ok,
      note: 'Counts only. No address, name, phone, or device is stored.',
    });
  } catch (err) {
    return failSoft(request, err, 'Funnel counts');
  }
};
