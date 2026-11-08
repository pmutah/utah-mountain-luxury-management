/**
 * Who may use the dashboard, by email address.
 *
 * This is the same shape as the Performance Motors DMS allowlist (`staffAllowlist.ts` there):
 * a comma-separated env list, normalised the same way, with a bootstrap default so a misconfigured
 * deployment is not a locked-out one — and with the bot identities always allowed so the agents keep
 * working when the env list has not been updated to include them.
 *
 * The list is the *policy*. It is not the proof: an email on this list means nothing unless the caller
 * proved they control that mailbox, which is why every request also verifies a Google-signed token
 * (see `google-token.ts`). Anything that reads this module alone is trusting a caller's claim.
 */

/**
 * Used only when no allowlist is configured, so the household is never locked out by a missing env
 * var. These are the three addresses Brandon named for dashboard access.
 */
const BOOTSTRAP_EMAILS = ['pmutah@gmail.com', 'stephlouw@gmail.com', 'utahviper@hotmail.com'] as const;

/**
 * Bot identities. These are accounts you control, not addresses a stranger can claim, and they are
 * always allowed so the agents do not break when the env list is edited.
 */
export const BOT_EMAILS: readonly string[] = ['muse-dms@pmutah.com', 'barbara-dms@pmutah.com'];

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/** Parse a comma, semicolon, or whitespace separated list into unique lower-case addresses. */
export function parseEmailList(raw: string | null | undefined): string[] {
  const parts = (raw ?? '')
    .split(/[,;\s]+/)
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);
  return [...new Set(parts)];
}

/**
 * The allowlist for API checks.
 *
 * `ALLOWED_EMAILS` is the server value. `VITE_ALLOWED_EMAILS` is accepted as a fallback because this
 * app already uses Vite-prefixed public vars, and it is *not* the security boundary — a public list is
 * only ever used to shape the login screen.
 */
export function emailAllowlist(env: { ALLOWED_EMAILS?: string; VITE_ALLOWED_EMAILS?: string }): string[] {
  const fromServer = parseEmailList(env.ALLOWED_EMAILS);
  if (fromServer.length > 0) return fromServer;
  const fromPublic = parseEmailList(env.VITE_ALLOWED_EMAILS);
  if (fromPublic.length > 0) return fromPublic;
  return [...BOOTSTRAP_EMAILS];
}

/** Whether this address may use the dashboard at all. Case and stray spaces do not matter. */
export function isAllowedEmail(
  email: string | null | undefined,
  allowlist: readonly string[],
): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return allowlist.includes(normalized) || BOT_EMAILS.includes(normalized);
}

/** True when this build has a real allowlist rather than the bootstrap default. */
export function allowlistConfigured(env: { ALLOWED_EMAILS?: string; VITE_ALLOWED_EMAILS?: string }): boolean {
  return parseEmailList(env.ALLOWED_EMAILS).length > 0 || parseEmailList(env.VITE_ALLOWED_EMAILS).length > 0;
}

/** A short label for the login screen. It names no other address. */
export function allowlistSummary(env: { ALLOWED_EMAILS?: string; VITE_ALLOWED_EMAILS?: string }): string {
  const count = emailAllowlist(env).length;
  const noun = count === 1 ? 'email address has' : 'email addresses have';
  if (!allowlistConfigured(env)) {
    /*
     * The bootstrap list is a real allowlist, not an empty one — saying "only the owner" while three
     * addresses work was wrong and would mislead whoever reads the login screen.
     */
    return `No email list is set on this deployment, so the ${count} built-in ${noun} access.`;
  }
  return `${count} ${noun} access to this dashboard.`;
}
