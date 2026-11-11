import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { loadPropertyConfig, savePropertyConfig } from '../../_lib/operations-store';
import { readOrRefuse } from '../../_lib/read-guard';
import { storageReadPaused } from '../../_lib/kv-json';
import { audit, auditActorFor } from '../../_lib/platform/audit-store';
import type { AgentEnv, PropertyId, PropertyOpsConfig } from '../../_lib/agent/types';
import type { SettingsEnv } from '../../_lib/kv';

const HOUSES: PropertyId[] = ['ranch', 'lindon', 'river'];

/** The longest one field may be. A house-rules block is a paragraph, not a document. */
const MAX_FIELD = 2000;

function houseFrom(value: unknown): PropertyId | null {
  return value === 'ranch' || value === 'lindon' || value === 'river' ? value : null;
}

/**
 * A field a host supplied. Blank means "not set", so it is dropped rather than stored as an empty
 * string: the loader merges over the defaults, and `''` would overwrite a published house rule with
 * nothing at all.
 */
function field(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, MAX_FIELD);
}

/** An email worth writing to, or nothing. A bad address would silently fail at send time. */
function email(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, 200);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : undefined;
}

/** A phone as a cleaner would give it. Digits, spaces, and the usual punctuation only. */
function phone(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!/^[\d\s()+.-]{7,24}$/.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * The house settings the check-in drafts and cleaner notices are built from.
 *
 * These were readable and writable in the store but **no route ever wrote them**, so `houseRules` and
 * the lock-code line a guest receives were permanently the hardcoded defaults. A host had no way to
 * change what their own guest was told.
 */
export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const read = await readOrRefuse(request, () => loadPropertyConfig(env), 'Saved house settings');
  if (!read.ok) return read.response;
  return corsJson(request, { config: read.value }, 200, { 'Cache-Control': 'no-store' });
};

/**
 * Save one house's settings. Host only, and it merges rather than replaces.
 *
 * A replace would let a save for one house wipe another's rules, and would also drop any field the
 * caller did not send — including the ones a guest is already receiving.
 */
export const onRequestPost: PagesFunction<SettingsEnv & AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  let body: { house?: unknown; houseRules?: unknown; lockCodeTemplate?: unknown; cleanerEmail?: unknown; cleanerPhone?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  const house = houseFrom(body.house);
  if (!house) return corsJson(request, { error: 'Choose the Ranch, the Lindon House, or the River House.' }, 400);

  const patch: PropertyOpsConfig = {};
  const houseRules = field(body.houseRules);
  const lockTemplate = field(body.lockCodeTemplate);
  const cleanerEmail = email(body.cleanerEmail);
  const cleanerPhone = phone(body.cleanerPhone);
  if (houseRules !== undefined) patch.houseRules = houseRules;
  if (lockTemplate !== undefined) patch.lockCodeTemplate = lockTemplate;
  if (cleanerEmail !== undefined) patch.cleanerEmail = cleanerEmail;
  if (cleanerPhone !== undefined) patch.cleanerPhone = cleanerPhone;
  if (Object.keys(patch).length === 0) {
    return corsJson(request, { error: 'Nothing was sent to save. Nothing was written.' }, 400);
  }

  let current;
  try {
    current = await loadPropertyConfig(env);
  } catch (err) {
    // Saving a merge over an unreadable config would replace every house's rules with one.
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'The saved house settings could not be read, so nothing was written.' }, 503);
    }
    const message = err instanceof Error ? err.message : 'The house settings failed';
    return corsJson(request, { error: message }, 500);
  }

  const next = {
    ranch: { ...current.ranch, ...(house === 'ranch' ? patch : {}) },
    lindon: { ...current.lindon, ...(house === 'lindon' ? patch : {}) },
    river: { ...current.river, ...(house === 'river' ? patch : {}) },
  };
  try {
    await savePropertyConfig(env, next);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'The house settings could not be saved. Nothing was written.' }, 503);
    }
    const message = err instanceof Error ? err.message : 'The save failed';
    return corsJson(request, { error: message }, 500);
  }
  /*
   * A house rule is what a guest is told, so a change to it is recorded. The entry names the house and which fields moved — not
   * the text, because a door-code template and a cleaner's phone number are exactly the detail an audit log should not repeat.
   */
  const logged = await audit(env, {
    actor: auditActorFor(request, env),
    action: 'operations.config',
    target: house,
    note: `Fields changed: ${Object.keys(patch).slice(0, 8).join(', ')}.`,
  });
  return corsJson(
    request,
    { ok: true, house, config: next, ...(logged.ok ? {} : { auditFailed: logged.reason }) },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);

export { HOUSES };
