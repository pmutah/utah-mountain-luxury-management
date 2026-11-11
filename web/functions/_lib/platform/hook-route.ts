import { failSoft, jsonResponse, refuseIfLedgerUnreadable } from '../../_lib/platform/http';
import { verifyWebhook } from '../../_lib/platform/hooks';

type HookEnv = { HOOK_SECRET?: string; STRIPE_WEBHOOK_SECRET?: string; SETTINGS?: { get?: (key: string) => Promise<unknown> } };

function secretFor(provider: 'stripe' | 'hospitable' | 'seam', env: HookEnv): string | undefined {
  if (provider === 'stripe') return env.STRIPE_WEBHOOK_SECRET || env.HOOK_SECRET;
  return env.HOOK_SECRET;
}

export function hookHandler(provider: 'stripe' | 'hospitable' | 'seam') {
  const onRequestPost: PagesFunction<HookEnv> = async ({ request, env }) => {
    try {
      const body = await request.text();
      const signature = request.headers.get('stripe-signature') || request.headers.get('x-uml-signature');
      const verdict = await verifyWebhook({ secret: secretFor(provider, env), body, signature });
      if (!verdict.ok) {
        return jsonResponse(request, { error: verdict.reason, stored: false, touchedBooks: false, provider }, 401);
      }
      const paused = await refuseIfLedgerUnreadable(request, env);
      if (paused) return paused;
      return jsonResponse(
        request,
        {
          stored: false,
          touchedBooks: false,
          provider,
          reason: 'Accepted. Expenses, bookings, and receipts were not changed.',
        },
        202,
      );
    } catch (err) {
      return failSoft(request, err, 'Webhook');
    }
  };
  return onRequestPost;
}
