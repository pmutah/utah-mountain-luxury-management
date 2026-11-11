/**
 * Turnstile on the public forms.
 *
 * The plan asks for Turnstile on public forms. The account cannot create the widget yet — the Wrangler OAuth token has no
 * `Account.Turnstile:Edit` scope — so this module is written to behave correctly in all three states:
 *
 *   1. **No secret configured.** Verification is *not* enforced, and the route says so. This is the state today. It is not
 *      silently open: `turnstileState` reports `unconfigured`, and the health route names it.
 *   2. **Secret configured, token missing or bad.** The request is refused with a reason. This is the state on the day the
 *      secret is added, before the page is updated.
 *   3. **Secret configured, token good.** `success`, the expected action, and the expected hostname all have to match.
 *
 * The failure mode that matters is treating "no secret" as "verified". It never does: it reports unconfigured instead, so a
 * deployment cannot mistake an unprotected form for a protected one.
 */

export type TurnstileEnv = { TURNSTILE_SECRET?: string; TURNSTILE_HOSTNAMES?: string };

export type TurnstileState = 'unconfigured' | 'configured';

export function turnstileState(env: unknown): TurnstileState {
  const secret = (env as TurnstileEnv | null)?.TURNSTILE_SECRET;
  return typeof secret === 'string' && secret.trim().length > 0 ? 'configured' : 'unconfigured';
}

/** The site key is public. A missing one means the widget cannot be drawn, which is not the same as "not enforced". */
export function siteKeyFrom(env: unknown): string | null {
  const key = (env as { TURNSTILE_SITE_KEY?: string } | null)?.TURNSTILE_SITE_KEY;
  return typeof key === 'string' && key.trim().length > 0 ? key.trim() : null;
}

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false }
  | { ok: false; reason: string };

/**
 * Check a token, if this deployment has a secret.
 *
 * A deployment with no secret **does not verify** and says so. That is deliberate: a form that silently accepted everything
 * while claiming to be protected would be worse than one that admits the protection is not on yet. The caller decides what
 * to do with `skipped`; the booking route records it and still accepts a guest's request, because refusing every guest
 * until a key exists would break the site rather than protect it.
 */
export async function verifyTurnstile(input: {
  env: unknown;
  token: unknown;
  action: string;
  remoteIp?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<TurnstileResult> {
  if (turnstileState(input.env) === 'unconfigured') {
    return { ok: true, skipped: true, reason: 'Turnstile is not configured on this deployment, so nothing was verified.' };
  }
  const secret = (input.env as TurnstileEnv).TURNSTILE_SECRET!.trim();
  const token = typeof input.token === 'string' ? input.token.trim() : '';
  if (!token || token.length > 2048) return { ok: false, reason: 'A Turnstile token is required.' };

  const expectedHosts = new Set(
    ((input.env as TurnstileEnv).TURNSTILE_HOSTNAMES ?? '')
      .split(',')
      .map((host) => host.trim())
      .filter(Boolean),
  );

  const body = new URLSearchParams({ secret, response: token });
  if (input.remoteIp) body.set('remoteip', input.remoteIp);

  const doFetch = input.fetchImpl ?? fetch;
  let payload: { success?: boolean; action?: string; hostname?: string; 'error-codes'?: string[] };
  try {
    const res = await doFetch(VERIFY_URL, { method: 'POST', body });
    payload = (await res.json()) as typeof payload;
  } catch {
    // A network failure is a refusal, not a pass. A form open on a failed check is not a protected form.
    return { ok: false, reason: 'The bot check could not be completed. Send the form again.' };
  }

  if (payload.success !== true) {
    return { ok: false, reason: 'The bot check did not pass. Send the form again.' };
  }
  if (payload.action !== input.action) {
    return { ok: false, reason: 'The bot check was for a different form.' };
  }
  // Only when a hostname list is configured: an empty list cannot approve a host, but it must not lock out a deployment
  // that has not set one either. When it is set, the value has to match exactly.
  if (expectedHosts.size > 0 && !expectedHosts.has(payload.hostname ?? '')) {
    return { ok: false, reason: 'The bot check came from an address this site does not serve.' };
  }
  return { ok: true, skipped: false };
}
