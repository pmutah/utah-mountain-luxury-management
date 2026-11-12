import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { readJsonBody } from '../../_lib/json-body';
import { failSoft } from '../../_lib/platform/http';
import { audit, auditActorFor } from '../../_lib/platform/audit-store';
import {
  approvalLine,
  decideApproval,
  fileApproval,
  listApprovals,
  parseApprovalDraft,
} from '../../_lib/platform/approval-store';
import type { SettingsEnv } from '../../_lib/kv';

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string; MARKET_DB?: unknown };

const NOTE =
  'A refund or a guardrail override waits here until a host marks it. Marking it sends no text and does not change a booking, an expense, a receipt, or a published rate.';

/**
 * The approval queue.
 *
 * Host only. GET lists the waiting requests and the recent decisions. POST either files a new one or marks one that is
 * already waiting. The mark is a decision on this list. It does not refund a guest, publish a rate, or send a text.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const read = await listApprovals(env);
    if (!read.ok) {
      return corsJson(request, { stored: false, items: [], reason: read.reason, sends: false, note: NOTE }, 200, {
        'Cache-Control': 'no-store',
      });
    }
    return corsJson(
      request,
      {
        stored: true,
        items: read.items.map((item) => ({ ...item, line: approvalLine(item) })),
        sends: false,
        note: NOTE,
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (err) {
    return failSoft(request, err, 'The approval queue');
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const parsed = await readJsonBody<{
      id?: unknown;
      decision?: unknown;
      kind?: unknown;
      house?: unknown;
      summary?: unknown;
      amountCents?: unknown;
    }>(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    const deciding = body.decision != null || (typeof body.id === 'string' && body.id !== '' && body.kind == null);
    if (deciding) {
      const id = typeof body.id === 'string' ? body.id : '';
      const decision = body.decision === 'approved' || body.decision === 'declined' ? body.decision : null;
      if (!decision) return corsJson(request, { error: 'Mark the request approved or declined.' }, 400);
      const result = await decideApproval(env, id, decision);
      if (!result.ok) return corsJson(request, { error: result.reason, sends: false }, 409);
      const logged = await audit(env, {
        actor: auditActorFor(request, env),
        action: 'approval.decide',
        target: result.item.id,
        note: `${decision === 'approved' ? 'Approved' : 'Declined'} a ${result.item.kind} wait for ${result.item.house}.`,
      });
      return corsJson(request, {
        item: { ...result.item, line: approvalLine(result.item) },
        sends: false,
        note: NOTE,
        ...(logged.ok ? {} : { auditFailed: logged.reason }),
      });
    }
    const draft = parseApprovalDraft(body);
    if (!draft.ok) return corsJson(request, { error: draft.error, sends: false }, 400);
    const filed = await fileApproval(env, crypto.randomUUID(), draft.draft);
    if (!filed.ok) return corsJson(request, { error: filed.reason, sends: false }, 503);
    const logged = await audit(env, {
      actor: auditActorFor(request, env),
      action: 'approval.file',
      target: filed.item.id,
      note: `Filed a ${filed.item.kind} wait for ${filed.item.house}.`,
    });
    return corsJson(request, {
      item: { ...filed.item, line: approvalLine(filed.item) },
      sends: false,
      note: NOTE,
      ...(logged.ok ? {} : { auditFailed: logged.reason }),
    });
  } catch (err) {
    return failSoft(request, err, 'The approval queue');
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
