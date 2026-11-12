import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { readJsonBody } from '../../_lib/json-body';
import { failSoft } from '../../_lib/platform/http';
import { audit, auditActorFor } from '../../_lib/platform/audit-store';
import { allowedHouses, resolveCaller } from '../../_lib/roles';
import {
  decideStayRequest,
  listStayRequests,
  readStayRequest,
  stayRequestLine,
  visibleStayRequests,
} from '../../_lib/platform/stay-request-store';
import type { SettingsEnv } from '../../_lib/kv';

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string; MARKET_DB?: unknown };

const NOTE =
  'A guest add-on waits here until a host marks it. Marking it sends no text, charges nothing, and does not move the booking.';

/**
 * Add-on requests the stay app filed.
 *
 * Host only. An owner does not receive Lindon. Marking a row noted or declined does not change the stay.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const read = await listStayRequests(env);
    if (!read.ok) {
      return corsJson(request, { stored: false, items: [], reason: read.reason, sends: false, changesBooking: false, note: NOTE }, 200, {
        'Cache-Control': 'no-store',
      });
    }
    const caller = resolveCaller(request, env);
    const role = caller.kind === 'host' ? caller.role : 'admin';
    const items = visibleStayRequests(read.items, allowedHouses(role));
    return corsJson(
      request,
      {
        stored: true,
        items: items.map((item) => ({ ...item, line: stayRequestLine(item) })),
        sends: false,
        changesBooking: false,
        note: NOTE,
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (err) {
    return failSoft(request, err, 'Stay requests');
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const parsed = await readJsonBody<{ id?: unknown; decision?: unknown }>(request);
    if (!parsed.ok) return parsed.response;
    const id = typeof parsed.body.id === 'string' ? parsed.body.id : '';
    const decision = parsed.body.decision === 'noted' || parsed.body.decision === 'declined' ? parsed.body.decision : null;
    if (!decision) return corsJson(request, { error: 'Mark the request noted or declined.' }, 400);
    const caller = resolveCaller(request, env);
    const role = caller.kind === 'host' ? caller.role : 'admin';
    const found = await readStayRequest(env, id);
    if (!found.ok) return corsJson(request, { error: found.reason, sends: false, changesBooking: false }, 409);
    if (!found.item || !visibleStayRequests([found.item], allowedHouses(role)).length) {
      return corsJson(request, { error: 'That request is not on this desk.', sends: false, changesBooking: false }, 403);
    }
    const result = await decideStayRequest(env, id, decision);
    if (!result.ok) return corsJson(request, { error: result.reason, sends: false, changesBooking: false }, 409);
    if (!result.item) return corsJson(request, { error: 'That request is not on the desk.', sends: false, changesBooking: false }, 409);
    const logged = await audit(env, {
      actor: auditActorFor(request, env),
      action: 'stay-request.decide',
      target: result.item.id,
      note: `${decision === 'noted' ? 'Noted' : 'Declined'} a ${result.item.kind} wait for ${result.item.house}.`,
    });
    return corsJson(request, {
      item: { ...result.item, line: stayRequestLine(result.item) },
      sends: false,
      changesBooking: false,
      note: NOTE,
      ...(logged.ok ? {} : { auditFailed: logged.reason }),
    });
  } catch (err) {
    return failSoft(request, err, 'Stay requests');
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
