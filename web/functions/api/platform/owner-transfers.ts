import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { readJsonBody } from '../../_lib/json-body';
import { failSoft } from '../../_lib/platform/http';
import { audit, auditActorFor } from '../../_lib/platform/audit-store';
import { refuseReadOnly } from '../../_lib/roles';
import {
  fileOwnerTransfer,
  listOwnerTransfers,
  parseOwnerTransfer,
  recordedCents,
  transferLine,
  voidOwnerTransfer,
} from '../../_lib/platform/owner-transfer-store';
import type { SettingsEnv } from '../../_lib/kv';

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string; MARKET_DB?: unknown };

const NOTE =
  'A recorded transfer is a note that money was sent or returned. It does not change Todd’s share, a booking, an expense, or a receipt.';

/**
 * Transfers a host records against Todd's Ranch and River share.
 *
 * Host only. An owner may read and may not record or void. Lindon is not accepted. Nothing here writes a book.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const read = await listOwnerTransfers(env);
    if (!read.ok) {
      return corsJson(
        request,
        { stored: false, items: [], recordedCents: null, reason: read.reason, changesBooks: false, note: NOTE },
        200,
        { 'Cache-Control': 'no-store' },
      );
    }
    const items = read.items.map((item) => ({ ...item, line: transferLine(item) }));
    return corsJson(
      request,
      { stored: true, items, recordedCents: recordedCents(read.items), changesBooks: false, note: NOTE },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (err) {
    return failSoft(request, err, 'Owner transfers');
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const refused = refuseReadOnly(request, env, corsJson);
  if (refused) return refused;
  try {
    const parsed = await readJsonBody<{
      id?: unknown;
      void?: unknown;
      house?: unknown;
      amountCents?: unknown;
      paidOn?: unknown;
      note?: unknown;
    }>(request);
    if (!parsed.ok) return parsed.response;
    if (parsed.body.void === true) {
      const id = typeof parsed.body.id === 'string' ? parsed.body.id : '';
      if (!id) return corsJson(request, { error: 'Name the transfer to void.', changesBooks: false }, 400);
      const result = await voidOwnerTransfer(env, id);
      if (!result.ok) return corsJson(request, { error: result.reason, changesBooks: false }, 409);
      const logged = await audit(env, {
        actor: auditActorFor(request, env),
        action: 'owner-transfer.void',
        target: result.item.id,
        note: `Voided a ${result.item.house} transfer.`,
      });
      return corsJson(request, {
        item: { ...result.item, line: transferLine(result.item) },
        changesBooks: false,
        note: NOTE,
        ...(logged.ok ? {} : { auditFailed: logged.reason }),
      });
    }
    const draft = parseOwnerTransfer(parsed.body);
    if (!draft.ok) return corsJson(request, { error: draft.error, changesBooks: false }, 400);
    const filed = await fileOwnerTransfer(env, crypto.randomUUID(), draft);
    if (!filed.ok) return corsJson(request, { error: filed.reason, changesBooks: false }, 503);
    const logged = await audit(env, {
      actor: auditActorFor(request, env),
      action: 'owner-transfer.record',
      target: filed.item.id,
      note: `Recorded a ${filed.item.house} transfer.`,
    });
    return corsJson(request, {
      item: { ...filed.item, line: transferLine(filed.item) },
      changesBooks: false,
      note: NOTE,
      ...(logged.ok ? {} : { auditFailed: logged.reason }),
    });
  } catch (err) {
    return failSoft(request, err, 'Owner transfers');
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
