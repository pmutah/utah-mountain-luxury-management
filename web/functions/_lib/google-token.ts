/**
 * Prove a Google sign-in, then check the address against the allowlist.
 *
 * The DMS does this with Firebase ID tokens and Google's securetoken JWKS. This app is on Cloudflare
 * Pages with Google Identity Services, so the credential the browser hands back is a **Google ID
 * token (JWT)** instead. The security properties that matter are the same, and each one is checked
 * here rather than assumed:
 *
 * 1. **The signature is Google's.** Verified against Google's published keys, fetched by `jose` and
 *    cached. A token whose payload merely *looks* right is worthless — anyone can base64 anything.
 * 2. **The audience is this app.** Without this, a token minted for any other Google client could be
 *    replayed here. This is the check people most often skip.
 * 3. **The issuer is Google.** `accounts.google.com`, either spelling Google uses.
 * 4. **The address is verified.** Google sets `email_verified`; an unverified address can be claimed
 *    by whoever typed it, so it is refused.
 * 5. **It has not expired.**
 *
 * Only after all five does the allowlist mean anything.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { emailAllowlist, isAllowedEmail, normalizeEmail } from './email-allowlist';

/** Google's published signing keys. `jose` caches these between requests. */
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export type VerifiedEmail = {
  email: string;
  /** Google's stable subject id. Not used for authorisation; useful for a log line. */
  subject: string;
  name: string | null;
};

export type VerifyFailure =
  | 'not-configured'
  | 'missing-token'
  | 'bad-token'
  | 'unverified-email'
  | 'not-allowed';

export type VerifyResult =
  | { ok: true; person: VerifiedEmail }
  /** `refusedEmail` is set only for `not-allowed`: the address Google vouched for but we declined. */
  | { ok: false; reason: VerifyFailure; message: string; refusedEmail?: string };

/**
 * Verify a Google ID token and require an allowlisted, verified email.
 *
 * `clientId` is the OAuth client the token was minted for. A route that cannot name one refuses,
 * because accepting a token without checking its audience is accepting a token from anywhere.
 */
export async function verifyGoogleSignIn(
  token: string,
  input: { clientId: string | undefined; env: { ALLOWED_EMAILS?: string; VITE_ALLOWED_EMAILS?: string } },
): Promise<VerifyResult> {
  const clientId = input.clientId?.trim();
  if (!clientId) {
    return {
      ok: false,
      reason: 'not-configured',
      message: 'Google sign-in is not configured on this deployment, so no one can sign in.',
    };
  }
  const credential = token.trim();
  if (!credential) {
    return { ok: false, reason: 'missing-token', message: 'Sign in with Google to continue.' };
  }

  let claims;
  try {
    const verified = await jwtVerify(credential, GOOGLE_JWKS, {
      issuer: ISSUERS,
      audience: clientId,
    });
    claims = verified.payload;
  } catch {
    /*
     * One message for every failure — expired, wrong audience, wrong issuer, bad signature. Naming
     * which one would tell an attacker how close they are, and the person who should see detail is
     * the host reading the server log, not the caller.
     */
    return { ok: false, reason: 'bad-token', message: 'That sign-in could not be verified. Try again.' };
  }

  const email = normalizeEmail(typeof claims.email === 'string' ? claims.email : '');
  if (!email) {
    return { ok: false, reason: 'bad-token', message: 'That Google account has no email address.' };
  }
  if (claims.email_verified === false) {
    return {
      ok: false,
      reason: 'unverified-email',
      message: 'That Google address is not verified, so it cannot be used here.',
    };
  }
  if (!isAllowedEmail(email, emailAllowlist(input.env))) {
    // The same wording the DMS uses, so the login screen can key off it. The refused address comes
    // back with it: that is the one detail that tells a person to switch accounts rather than
    // conclude Google is broken.
    return {
      ok: false,
      reason: 'not-allowed',
      message: 'That email address does not have access to this dashboard.',
      refusedEmail: email,
    };
  }

  return {
    ok: true,
    person: {
      email,
      subject: typeof claims.sub === 'string' ? claims.sub : '',
      name: typeof claims.name === 'string' ? claims.name : null,
    },
  };
}
