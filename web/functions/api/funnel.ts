import { failSoft, jsonResponse } from '../_lib/platform/http';
import { funnelIsValid, recordFunnel } from '../_lib/platform/market-db';

type Env = { MARKET_DB?: unknown };

/**
 * A funnel step from a public page: view, quote, checkout, paid.
 *
 * Public, because a guest is not signed in. It stores a step, a house, and an optional random visit id — never an
 * address, a name, or a phone — which is what the plan means by privacy-friendly analytics with no third-party
 * tracker. A bad step is refused, a day at its ceiling is refused, and an unreachable database says so instead of
 * claiming the step landed.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = (await request.json().catch(() => null)) as { step?: unknown; house?: unknown; visit?: unknown } | null;
    if (!body) return jsonResponse(request, { stored: false, reason: 'Send a JSON step.' }, 400);
    const input = {
      step: String(body.step ?? ''),
      house: String(body.house ?? ''),
      visit: typeof body.visit === 'string' ? body.visit : undefined,
    };
    if (!funnelIsValid(input)) {
      return jsonResponse(request, { stored: false, reason: 'That is not a step this page records.' }, 400);
    }
    const result = await recordFunnel(env, input);
    return jsonResponse(request, result, result.stored ? 202 : 409);
  } catch (err) {
    return failSoft(request, err, 'Funnel event');
  }
};
