import { hostDenied, hostOnly } from '../../_lib/auth';
import { morningBlockers } from '../../../src/lib/platform/feature-catalog';
import { stripeReadiness, CHECKOUT_HOLD_MINUTES, cutoverReady } from '../../../src/lib/platform/guest-ops';
import { failSoft, jsonResponse } from '../../_lib/platform/http';

/** The morning list. What is built, and what is waiting on a key. Nothing here is a secret. */
export const onRequestGet: PagesFunction<{ STRIPE_SECRET_KEY?: string }> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const stripe = stripeReadiness(env);
    return jsonResponse(request, {
      blockers: morningBlockers(),
      stripe: { ready: stripe.ready, mode: stripe.mode, charges: stripe.charges, reason: stripe.reason },
      checkoutHoldMinutes: CHECKOUT_HOLD_MINUTES,
      checkoutArmed: false,
      cutoverReady: cutoverReady(),
      send: false,
      bulkDelete: false,
    });
  } catch (err) {
    return failSoft(request, err, 'Platform status');
  }
};
