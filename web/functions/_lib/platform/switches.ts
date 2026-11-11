/**
 * The agent switches, stored where the server can read them.
 *
 * `PLATFORM_AGENTS` in `back-office.ts` has been a rendered list with a `defaultOn` flag since the rebuild, and **nothing read it**:
 * every switch was a sentence on a page. A host could not turn anything on, and a route that wanted to know whether the daily
 * digest should send had nowhere to ask.
 *
 * This is that place. One KV key, one shape, and a strict allow-list:
 *
 *   - **Only the low-risk switches can be turned on.** The three here decide whether a text is composed and whether a shadow day
 *     is recorded. Everything that touches a guest or a published rate stays off and says why — a switch that can silently start
 *     messaging guests is exactly what the plan forbids.
 *   - **An unreadable store is not "off".** A failed read returns `ok:false`, and the caller has to decide; the digest route treats
 *     it as off (it is a send, so the safe reading is "do not"), and the panel says so rather than showing everything off.
 *   - **The default is off.** A key that was never written means every switch is off, which is the state the plan asks for.
 */

import { kvGet, kvPut, storageReadPaused } from '../kv-json';
import type { SettingsEnv } from '../kv';

const KV_KEY = 'agentSwitches';

/**
 * What a host may actually turn on.
 *
 * The list is short on purpose. `digest` composes the morning text, `snow` decides whether the plow line is included, and
 * `shadowDay` lets the morning run record a shadow day without someone opening a page — all three change what a host is told.
 * None of them messages a guest or publishes a price.
 */
export const SWITCHABLE = ['digest', 'snow', 'shadowDay'] as const;
export type SwitchId = (typeof SWITCHABLE)[number];

export type SwitchState = Record<SwitchId, boolean>;

/** The switches that cannot be turned on here, and the reason. Shown beside the controls so the page is not mysterious. */
export const LOCKED_SWITCHES: ReadonlyArray<{ id: string; name: string; reason: string }> = [
  {
    id: 'guestAutoReply',
    name: 'Guest auto-reply',
    reason: 'A message to a guest goes out only when a person sends it. This switch stays off until the owner changes that rule.',
  },
  {
    id: 'publishRates',
    name: 'Publish rates',
    reason: 'A price reaches Airbnb or VRBO only through the approved-rate sheet with the publish switch on, which is a separate decision.',
  },
];

const OFF: SwitchState = { digest: false, snow: false, shadowDay: false };

export function isSwitchable(id: string): id is SwitchId {
  return (SWITCHABLE as readonly string[]).includes(id);
}

/** Only the three known keys, and only real booleans. Anything else in the store is ignored rather than passed through. */
function clean(value: unknown): SwitchState {
  const out: SwitchState = { ...OFF };
  if (!value || typeof value !== 'object') return out;
  const row = value as Record<string, unknown>;
  for (const id of SWITCHABLE) {
    if (row[id] === true) out[id] = true;
  }
  return out;
}

export type SwitchRead = { ok: true; state: SwitchState } | { ok: false; state: SwitchState; reason: string };

/**
 * Read the switches.
 *
 * A failure returns every switch **off** plus `ok:false`. That is the safe default for a send, and `ok` is what lets the panel say
 * the store could not be read instead of drawing everything as deliberately off.
 */
export async function readSwitches(env: SettingsEnv): Promise<SwitchRead> {
  try {
    const saved = await kvGet<unknown>(env, KV_KEY, null);
    return { ok: true, state: clean(saved) };
  } catch (err) {
    const reason = storageReadPaused(err)
      ? 'Saved records could not be read. Every switch is treated as off.'
      : err instanceof Error
        ? err.message
        : 'The switches could not be read.';
    return { ok: false, state: { ...OFF }, reason };
  }
}

/**
 * Set one switch.
 *
 * It reads before it writes so a set on one switch cannot clear the other two, and it refuses a key outside the three rather than
 * writing an unknown flag a later version might read.
 */
export async function writeSwitch(
  env: SettingsEnv,
  id: string,
  on: boolean,
): Promise<{ ok: true; state: SwitchState } | { ok: false; reason: string }> {
  if (!isSwitchable(id)) {
    return { ok: false, reason: `${id} is not a switch this page can set.` };
  }
  const current = await readSwitches(env);
  if (!current.ok) return { ok: false, reason: current.reason };
  const next: SwitchState = { ...current.state, [id]: on };
  try {
    await kvPut(env, KV_KEY, next);
  } catch (err) {
    if (storageReadPaused(err)) return { ok: false, reason: 'Saved records could not be written. Nothing changed.' };
    return { ok: false, reason: err instanceof Error ? err.message : 'The switch could not be saved.' };
  }
  return { ok: true, state: next };
}

/** One line per switch for a panel or a digest. */
export function switchLine(id: SwitchId, on: boolean): string {
  if (id === 'digest') return on ? 'The morning text is composed and sent.' : 'The morning text is not sent.';
  if (id === 'snow') return on ? 'Snow is included in the morning text.' : 'Snow is left out of the morning text.';
  return on ? 'The morning run records a shadow day.' : 'A shadow day is recorded only from a page visit.';
}
