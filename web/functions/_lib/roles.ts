/**
 * Who the caller is, and what that role may do.
 *
 * The plan asks for "admin, owner (Todd sees Ranch and River read-only), cleaner (portal only), and vendor". The matrix and
 * the audit rule were written in `src/lib/platform/back-office.ts` and **called only from a test** — nothing in `auth.ts`,
 * nothing in any route. A role that no route reads is not a role, it is a comment. This wires it to the one gate every host
 * route already passes through.
 *
 * The rules, in the order they are decided:
 *
 *   1. A bot bearer, the dashboard password, and an unmapped address are **admin**. That is the present behaviour and it is
 *      correct: the password is a single shared owner credential, and the bots already hold the ledger by design.
 *   2. An email sign-in gets the role mapped to it in `ROLE_EMAILS`. An address with no mapping is admin, so adding a
 *      family member to the allowlist does not silently downgrade them to nothing.
 *   3. **Owner** is read-only and cannot see Lindon. That is the plan's explicit requirement, and it is enforced in the
 *      data rather than in the UI: a route that returns a list strips Lindon for an owner, and a route that writes refuses.
 *
 * Why the stripping happens in the route rather than in the browser: an owner portal that hides a house with CSS has still
 * sent the house to the owner's browser. The requirement is that Todd does not see Lindon, so Lindon must not leave the
 * server.
 */

import { readSession, sessionSecret } from './email-session';
import { emailAllowlist, isAllowedEmail } from './email-allowlist';

export type Role = 'admin' | 'owner' | 'cleaner' | 'vendor';

export type Ability =
  | 'read-ledger'
  | 'edit-expense'
  | 'read-owner'
  | 'read-lindon'
  | 'read-clean';

const ABILITIES: Record<Role, readonly Ability[]> = {
  admin: ['read-ledger', 'edit-expense', 'read-owner', 'read-lindon', 'read-clean'],
  // Read-only, and only the owner's own houses. No edit, and no Lindon.
  owner: ['read-owner'],
  cleaner: ['read-clean'],
  vendor: ['read-task' as Ability],
};

export function abilitiesOf(role: Role): readonly Ability[] {
  return ABILITIES[role];
}

export function canDo(role: Role, ability: Ability): boolean {
  return ABILITIES[role].includes(ability);
}

/** Houses an owner may read. `null` means every house, which is every other role. */
export function allowedHouses(role: Role): readonly ('ranch' | 'lindon' | 'river')[] | null {
  return role === 'owner' ? ['ranch', 'river'] : null;
}

export function mayReadHouse(role: Role, house: string): boolean {
  const allowed = allowedHouses(role);
  return allowed === null || allowed.includes(house as 'ranch' | 'lindon' | 'river');
}

export type RoleEnv = {
  ALLOWED_EMAILS?: string;
  VITE_ALLOWED_EMAILS?: string;
  SESSION_SECRET?: string;
  /**
   * `owner=address@example.com,cleaner=someone@example.com`. A comma-separated map from role to address.
   *
   * A list per role rather than one list per address so the env var reads as the policy it is, and so a person who is both
   * (the owner who also cleans) is expressed by listing them twice rather than by inventing a combined role.
   */
  ROLE_EMAILS?: string;
};

/**
 * Parse `owner=a@x.com,b@x.com;cleaner=c@x.com`.
 *
 * Semicolon-separated groups, comma-separated addresses inside a group, because an address may itself be on the allowlist
 * with commas between addresses and the group separator has to be unambiguous.
 */
export function parseRoleEmails(raw: string | null | undefined): Array<{ email: string; role: Role }> {
  const out: Array<{ email: string; role: Role }> = [];
  for (const group of (raw ?? '').split(';')) {
    const trimmed = group.trim();
    if (!trimmed) continue;
    const at = trimmed.indexOf('=');
    if (at < 0) continue;
    const roleText = trimmed.slice(0, at).trim().toLowerCase();
    if (roleText !== 'admin' && roleText !== 'owner' && roleText !== 'cleaner' && roleText !== 'vendor') continue;
    for (const email of trimmed.slice(at + 1).split(',')) {
      const address = email.trim().toLowerCase();
      if (!address.includes('@')) continue;
      out.push({ email: address, role: roleText });
    }
  }
  return out;
}

/** The role for one address. An address with no mapping is admin, which is the behaviour that exists today. */
export function roleFor(email: string | null | undefined, env: RoleEnv): Role {
  const address = (email ?? '').trim().toLowerCase();
  if (!address) return 'admin';
  const mapped = parseRoleEmails(env.ROLE_EMAILS).find((row) => row.email === address);
  return mapped?.role ?? 'admin';
}

export type Caller =
  /** No credential the platform recognises. The route must refuse. */
  | { kind: 'denied' }
  /** A bot bearer, the shared password, or an allowlisted email with no mapping. Full access. */
  | { kind: 'host'; role: 'admin'; via: 'bearer' | 'password' | 'email' }
  /** An email sign-in mapped to a narrower role. */
  | { kind: 'host'; role: Exclude<Role, 'admin'>; via: 'email'; email: string };

/**
 * Resolve the caller **without** trusting an unverified cookie.
 *
 * This mirrors the order in `hostOnly`: bot bearer first, then a verified email session, then the password. It does not
 * decide permission; `mayReadHouse` and `canDo` do. The point of splitting them is that the route can refuse a write for an
 * owner while still answering a read.
 */
export function resolveCaller(request: Request, env: unknown): Caller {
  const field = (key: keyof RoleEnv | 'DASHBOARD_PASSWORD' | 'MUSE_BOT_SECRET' | 'AMANDA_BOT_SECRET'): string | undefined => {
    const value = (env as Record<string, unknown> | null)?.[key];
    return typeof value === 'string' ? value : undefined;
  };

  // A bot bearer. Checked first, exactly as `hostOnly` does, so a deployment with no password is still usable by the bots.
  const authorization = request.headers.get('Authorization') ?? '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (bearer) {
    const muse = field('MUSE_BOT_SECRET');
    const amanda = field('AMANDA_BOT_SECRET');
    if ((muse && bearer === muse) || (amanda && bearer === amanda)) return { kind: 'host', role: 'admin', via: 'bearer' };
  }

  const secret = sessionSecret({ SESSION_SECRET: field('SESSION_SECRET') });
  if (secret) {
    const session = readSession(request, secret);
    if (
      session.ok &&
      isAllowedEmail(
        session.email,
        emailAllowlist({
          ALLOWED_EMAILS: field('ALLOWED_EMAILS'),
          VITE_ALLOWED_EMAILS: field('VITE_ALLOWED_EMAILS'),
        }),
      )
    ) {
      const role = roleFor(session.email, {
        ROLE_EMAILS: field('ROLE_EMAILS'),
        ALLOWED_EMAILS: field('ALLOWED_EMAILS'),
        VITE_ALLOWED_EMAILS: field('VITE_ALLOWED_EMAILS'),
      });
      if (role === 'admin') return { kind: 'host', role: 'admin', via: 'email' };
      return { kind: 'host', role, via: 'email', email: session.email };
    }
  }

  const password = field('DASHBOARD_PASSWORD');
  if (password && password.length > 0) {
    const cookie = request.headers.get('Cookie') ?? '';
    const match = cookie.match(/wpm_auth=([^;]+)/);
    if (match && match[1] === btoa(`wpm:${password}`).replace(/=+$/, '')) {
      return { kind: 'host', role: 'admin', via: 'password' };
    }
  }

  return { kind: 'denied' };
}

/**
 * Whether this request carries a valid emailed session on an allowed address.
 *
 * Exported so the middleware and `hostOnly` share one check. The middleware runs first on every `/api/*` request, so a gate
 * that only understood the password cookie refused every emailed session before any route could see it — which is why Google
 * sign-in failed even after the token verified and the cookie was set.
 */
export function emailSessionValid(request: Request, env: unknown): boolean {
  const field = (key: 'SESSION_SECRET' | 'ALLOWED_EMAILS' | 'VITE_ALLOWED_EMAILS'): string | undefined => {
    const value = (env as Record<string, unknown> | null)?.[key];
    return typeof value === 'string' ? value : undefined;
  };
  const secret = sessionSecret({ SESSION_SECRET: field('SESSION_SECRET') });
  if (!secret) return false;
  const session = readSession(request, secret);
  if (!session.ok) return false;
  return isAllowedEmail(
    session.email,
    emailAllowlist({ ALLOWED_EMAILS: field('ALLOWED_EMAILS'), VITE_ALLOWED_EMAILS: field('VITE_ALLOWED_EMAILS') }),
  );
}

/** A refusal body for a role that may read but not write. Distinct from 401, so a caller can tell "wrong person" from "read only". */
export function readOnlyRefusal(): { error: string; code: 'read-only'; authRequired: false } {
  return {
    error: 'This account is read-only. Ask the owner to make the change.',
    code: 'read-only',
    authRequired: false,
  };
}

/**
 * Refuse a write from a read-only role.
 *
 * Returns a 403 with a `read-only` code, or null when the caller may write. A route calls this **after** `hostOnly`, so an
 * unauthenticated caller still gets 401 and only a real, narrower role gets 403. The distinction matters to a client: 401
 * means sign in, 403 here means this account cannot do that.
 */
export function refuseReadOnly(request: Request, env: unknown, cors?: (request: Request, body: unknown, status?: number) => Response): Response | null {
  const caller = resolveCaller(request, env);
  if (caller.kind === 'denied') return null; // hostOnly already refused; do not answer for it.
  if (caller.role === 'owner') {
    const body = readOnlyRefusal();
    if (cors) return cors(request, body, 403);
    return new Response(JSON.stringify(body), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
  return null;
}

/**
 * Strip the houses a role may not see from a list of rows.
 *
 * A row with no `propertyId` is left alone: the household ledger and a seed row that predates the field are not a house, and
 * dropping them would silently change a total the owner is reading.
 */
export function stripHouses<T extends { propertyId?: string }>(rows: readonly T[], role: Role): T[] {
  const allowed = allowedHouses(role);
  if (allowed === null) return [...rows];
  return rows.filter((row) => {
    const house = row.propertyId;
    if (!house) return true;
    return allowed.includes(house as 'ranch' | 'lindon' | 'river');
  });
}
