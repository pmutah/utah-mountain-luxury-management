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
 * `node:crypto` was the obvious choice and it passed every local test — then the deploy failed with
 * `No such module "node:crypto"`, because this runtime has no Node built-ins unless `nodejs_compat` is
 * enabled. Rather than change module resolution for all 98 routes to fix one file, the algorithm is in
 * `sha256.ts`, which is checked against Node's own implementation in the tests.
 */
import { hmacSha256 } from './sha256';

const COOKIE = 'wpm_auth';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const encoder = new TextEncoder();

/*
 * Base64url **without `Buffer`**.
 *
 * This file used `Buffer.from(...)`, which does not exist in the Workers runtime at this compatibility date (verified on a
 * running Pages runtime: `hasBuffer: false`, and the call threw `ReferenceError: Buffer is not defined`). The bundler does not
 * report it, so every email sign-in threw inside `hostOnly`, which treats a throw as "not authenticated" and answers 401.
 *
 * The effect in production was that **Google sign-in never worked**: the login screen offered it, the Google token verified,
 * the cookie was issued — and then every request carrying it was refused. The password path kept working, which is why this
 * survived unnoticed: there is always another way in.
 *
 * `btoa`/`atob` are present, so they do the encoding. Strings are converted to bytes by `TextEncoder` first, because `btoa`
 * throws on any character above U+00FF and an email address is not guaranteed to be ASCII.
 */
function bytesToB64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64url(value: string): string {
  return bytesToB64url(encoder.encode(value));
}

function fromB64url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function sign(secret: string, payload: string): string {
  return bytesToB64url(hmacSha256(encoder.encode(secret), encoder.encode(payload)));
}

/** Constant-time compare, so a wrong signature cannot be found one byte at a time. */
function sameSignature(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
