import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { readJsonBody } from '../../_lib/json-body';
import type { SettingsEnv } from '../../_lib/kv';
import { audit, auditActorFor } from '../../_lib/platform/audit-store';
import { failSoft } from '../../_lib/platform/http';
import { LOCKED_SWITCHES, readSwitches, SWITCHABLE, switchLine, writeSwitch } from '../../_lib/platform/switches';

/**
 * The agent switches.
 *
 * `GET` reports the three a host may set, what each does, and the two that are locked with the reason. `POST { id, on }` sets one
 * and records it in the audit log. Host only, and it writes no rate, booking, or guest message — the switches decide what the
 * morning run tells the host, not what the platform does to a guest.
 */
export const onRequestGet: PagesFunction<SettingsEnv & { DASHBOARD_PASSWORD?: string }> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const read = await readSwitches(env);
    return corsJson(
      request,
      {
        ok: read.ok,
        ...(read.ok ? {} : { reason: read.reason }),
        switches: SWITCHABLE.map((id) => ({
          id,
          on: read.state[id],
          line: switchLine(id, read.state[id]),
        })),
        locked: LOCKED_SWITCHES,
        sends: false,
        note: 'These decide what the morning run tells you. None of them messages a guest or publishes a rate.',
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (err) {
    return failSoft(request, err, 'The agent switches');
  }
};

export const onRequestPost: PagesFunction<SettingsEnv & { DASHBOARD_PASSWORD?: string }> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const parsed = await readJsonBody<{ id?: unknown; on?: unknown }>(request);
    if (!parsed.ok) return parsed.response;
    const id = typeof parsed.body.id === 'string' ? parsed.body.id : '';
    if (!id) return corsJson(request, { error: 'Name a switch: digest, snow, or shadowDay.' }, 400);
    if (typeof parsed.body.on !== 'boolean') {
      return corsJson(request, { error: 'Send on as true or false.' }, 400);
    }
    const locked = LOCKED_SWITCHES.find((row) => row.id === id);
    if (locked) {
      return corsJson(request, { error: locked.reason, code: 'locked' }, 409);
    }
    const written = await writeSwitch(env, id, parsed.body.on);
    if (!written.ok) return corsJson(request, { error: written.reason }, 503);
    /*
     * A switch changes what the platform does on its own, so it is recorded. The entry names the switch and the new state — no
     * reason text, because the host's reason is his own.
     */
    const logged = await audit(env, {
      actor: auditActorFor(request, env),
      action: 'platform.switch',
      target: id,
      note: parsed.body.on ? 'Turned on.' : 'Turned off.',
    });
    return corsJson(request, {
      ok: true,
      id,
      on: parsed.body.on,
      line: switchLine(id as (typeof SWITCHABLE)[number], parsed.body.on),
      state: written.state,
      ...(logged.ok ? {} : { auditFailed: logged.reason }),
    });
  } catch (err) {
    return failSoft(request, err, 'The agent switches');
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
