import { corsJson } from '../../_lib/data';
import { isAuthConfigured } from '../../_lib/auth';
import { emailAllowlist, isAllowedEmail } from '../../_lib/email-allowlist';
import { readSession, sessionSecret } from '../../_lib/email-session';
import { isMuseAuthorized } from '../../_lib/muse/auth';
import { roleFor } from '../../_lib/roles';

type Env = {
  DASHBOARD_PASSWORD?: string;
  MUSE_BOT_SECRET?: string;
  AMANDA_BOT_SECRET?: string;
  SESSION_SECRET?: string;
  ALLOWED_EMAILS?: string;
  VITE_ALLOWED_EMAILS?: string;
  ROLE_EMAILS?: string;
};

/**
 * The session probe. It has to answer the login gate, so it cannot itself require a login.
 *
 * It knows about both ways in. Reporting only the password would have said `open: true` on a
 * deployment that is protected by email sign-in — telling the login screen the site is unprotected
 * when it is not, which is exactly the wrong message to show.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const passwordSignIn = isAuthConfigured(env);
  const secret = sessionSecret(env);

  // The bots are hosts too, and a bot asking this route should be told it is signed in.
  if (isMuseAuthorized(request, { MUSE_BOT_SECRET: env.MUSE_BOT_SECRET, AMANDA_BOT_SECRET: env.AMANDA_BOT_SECRET })) {
    return corsJson(request, { authenticated: true, authRequired: true, email: null, bot: true });
  }

  if (secret) {
    const session = readSession(request, secret);
    if (session.ok && isAllowedEmail(session.email, emailAllowlist(env))) {
      /*
       * The role travels with the session, so the browser can hide a control it is not allowed to use instead of offering a
       * button that answers 403. The server still decides — this is a courtesy, never the gate. An owner is told it is
       * read-only, and which houses it may read.
       */
      const role = roleFor(session.email, env);
      return corsJson(request, {
        authenticated: true,
        authRequired: true,
        email: session.email,
        role,
        readOnly: role === 'owner',
        houses: role === 'owner' ? ['ranch', 'river'] : null,
      });
    }
    /*
     * A valid signature for an address that is no longer on the list is not a session. It is reported
     * as signed out, and the cookie is cleared so the browser does not keep presenting it.
     */
    const stale = session.ok && !isAllowedEmail(session.email, emailAllowlist(env));
    return corsJson(
      request,
      { authenticated: false, authRequired: true, email: null, emailSignIn: true, passwordSignIn, stale },
      200,
      stale ? { 'Set-Cookie': 'wpm_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' } : {},
    );
  }

  if (!passwordSignIn) {
    // Nothing protects this deployment: no password, no session secret.
    return corsJson(request, { authenticated: false, authRequired: false, open: true });
  }

  return corsJson(request, {
    authenticated: false,
    authRequired: true,
    passwordSignIn: true,
    emailSignIn: false,
  });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
