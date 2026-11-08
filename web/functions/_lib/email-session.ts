/**
 * A signed session cookie for an email sign-in.
 *
 * The old cookie was `btoa("wpm:" + DASHBOARD_PASSWORD)`. That is weak but not broken, because the
 * password is secret: to forge it you must know the password, and knowing it lets you sign in anyway.
 *
 * An **email is not a secret.** Anyone can read `pmutah@gmail.com` off this repo. So a cookie that is
 * just the email, base64'd, would let any visitor mint a valid session by hand. The cookie carries the
 * email *and* an HMAC over it, keyed by a server secret, and the check recomputes the HMAC before
 * trusting the address. Without the secret the cookie cannot be forged, and changing the email inside
 * it invalidates the signature.
 *
 *   <base64url(email)>.<base64url(issuedAt)>.<base64url(hmac)>
 *
 * The HMAC covers `email|issuedAt`, so an old cookie cannot be edited into a fresh one either.
 *
 * `node:crypto` is used rather than WebCrypto because the host guard is **synchronous** and is called
 * from 68 routes. Making it async to reach `crypto.subtle` would have meant editing every one of them
 * for no security gain; `createHmac` is available in the Workers runtime and keeps the guard sync.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'wpm_auth';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function b64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function fromB64url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('base64url');
}

/** Constant-time compare, so a wrong signature cannot be found one byte at a time. */
function sameSignature(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** The secret that signs the cookie. It must be set, or no email session can be trusted. */
export function sessionSecret(env: { SESSION_SECRET?: string }): string | undefined {
  const value = env.SESSION_SECRET?.trim();
  // A short secret is a weak one. Refusing is better than signing with "abc".
  return value && value.length >= 16 ? value : undefined;
}

/** Mint a cookie value for a verified, allowlisted email. */
export function signSession(email: string, secret: string, now = Date.now()): string {
  const issuedAt = String(Math.floor(now / 1000));
  const signature = sign(secret, `${email}|${issuedAt}`);
  return `${b64url(email)}.${b64url(issuedAt)}.${signature}`;
}

export type SessionCheck =
  | { ok: true; email: string }
  | { ok: false; reason: 'missing' | 'malformed' | 'bad-signature' | 'expired' };

/**
 * Read and verify the session cookie.
 *
 * Order matters: the signature is verified **before** the email is trusted, so nothing from an
 * unverified cookie is ever used to make a decision.
 */
export function readSession(
  request: Request,
  secret: string | undefined,
  now = Date.now(),
): SessionCheck {
  if (!secret) return { ok: false, reason: 'missing' };
  const cookie = request.headers.get('Cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!match) return { ok: false, reason: 'missing' };

  const parts = match[1]!.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [emailPart, issuedPart, signature] = parts as [string, string, string];

  let email: string;
  let issuedAt: string;
  try {
    email = fromB64url(emailPart);
    issuedAt = fromB64url(issuedPart);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!/^\d+$/.test(issuedAt) || !email.includes('@')) return { ok: false, reason: 'malformed' };

  const expected = sign(secret, `${email}|${issuedAt}`);
  if (!sameSignature(expected, signature)) return { ok: false, reason: 'bad-signature' };

  const age = Math.floor(now / 1000) - Number(issuedAt);
  // A cookie from the future is a clock problem or a forgery attempt; either way it is refused.
  if (age < 0 || age > MAX_AGE_SECONDS) return { ok: false, reason: 'expired' };

  return { ok: true, email };
}

/** The Set-Cookie header for a verified email. */
export function emailCookieHeader(email: string, secret: string, sameSite: 'Strict' | 'Lax' = 'Lax'): string {
  const value = signSession(email, secret);
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${MAX_AGE_SECONDS}`;
}

/** Remove the session. */
export function clearCookieHeader(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export { COOKIE as SESSION_COOKIE };
