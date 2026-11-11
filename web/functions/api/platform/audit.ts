import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { auditLine, readAudit } from '../../_lib/platform/audit-store';
import { failSoft } from '../../_lib/platform/http';
import { resolveCaller } from '../../_lib/roles';

type Env = { DASHBOARD_PASSWORD?: string; SETTINGS?: unknown; SESSION_SECRET?: string; ROLE_EMAILS?: string; ALLOWED_EMAILS?: string };

/**
 * The audit log, newest first.
 *
 * Host only, and admin only: an owner reading the log would learn about Lindon and about work done on it, which is exactly
 * what the owner role is not supposed to see. A read that failed says so — it is never rendered as "nothing has changed".
 *
 * Entries name a row and an action. They carry no amount, no guest name, and no receipt body.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const caller = resolveCaller(request, env);
    if (caller.kind === 'host' && caller.role !== 'admin') {
      return corsJson(
        request,
        { entries: [], lines: [], stored: false, reason: 'This account does not read the audit log.', code: 'read-only' },
        403,
      );
    }
    const limit = Number(new URL(request.url).searchParams.get('limit')) || 100;
    const read = await readAudit(env as never, limit);
    if (!read.ok) {
      return corsJson(
        request,
        { entries: [], lines: [], stored: false, reason: read.reason, note: 'The log could not be read. This does not mean nothing changed.' },
        200,
        { 'Cache-Control': 'no-store' },
      );
    }
    return corsJson(
      request,
      {
        entries: read.entries,
        lines: read.entries.map(auditLine),
        stored: true,
        note: 'Who changed what, and when. No amount, guest name, phone, or receipt body is recorded here.',
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (err) {
    return failSoft(request, err, 'The audit log');
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
