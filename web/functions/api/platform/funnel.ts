import { hostDenied, hostOnly } from '../../_lib/auth';
import { failSoft, jsonResponse } from '../../_lib/platform/http';
import { readFunnel, readFunnelWindow } from '../../_lib/platform/market-db';

type Env = { MARKET_DB?: unknown };

/**
 * Funnel counts. Host only, because the shape of the funnel is the business's own information.
 *
 * The step itself is recorded by `POST /api/funnel`, which is public and stores no identifying field.
 *
 * `?window=7` or `?window=30` answers the shape a host acts on: one figure per step, counted by **visit** rather than by row so a
 * reload is not a second guest, and the number of visits that picked dates and never sent the request. That last figure is what
 * an abandoned quote looks like on this site, and it needed no new event — the four steps already record it.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const days = Number(new URL(request.url).searchParams.get('window'));
    if (Number.isFinite(days) && days > 0 && days <= 365) {
      const since = new Date(Date.now() - Math.round(days) * 24 * 3_600_000);
      const window = await readFunnelWindow(env, since);
      return jsonResponse(request, {
        stored: window.ok,
        ...(window.ok ? { funnel: window.funnel } : { reason: window.reason }),
        days: Math.round(days),
        since: since.toISOString(),
        note: 'Counted by visit, not by row. No address, name, phone, or device is stored.',
      });
    }
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
