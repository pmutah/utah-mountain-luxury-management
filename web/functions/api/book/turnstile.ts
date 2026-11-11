import { corsJson } from '../../_lib/data';
import { siteKeyFrom, turnstileState } from '../../_lib/platform/turnstile';

/**
 * What the booking page needs to know about the bot check.
 *
 * Public, because a guest has no account before they ask. It returns only the **site key**, which is public by design, and
 * whether a check is enforced. It never returns the secret.
 *
 * `enforced: false` is a real answer and the page shows it honestly: the form works, and nothing claims a bot check ran.
 */
export const onRequestGet: PagesFunction<{ TURNSTILE_SECRET?: string; TURNSTILE_SITE_KEY?: string }> = async ({ request, env }) => {
  const enforced = turnstileState(env) === 'configured';
  return corsJson(
    request,
    {
      siteKey: siteKeyFrom(env),
      enforced,
      action: 'book_request',
      note: enforced
        ? 'The booking form sends a Turnstile token and the server checks it.'
        : 'No Turnstile secret is configured, so the booking form records that no bot check ran.',
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};
