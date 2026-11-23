import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { migrateKvLedger } from '../../_lib/ledger-migrate';
import type { SettingsEnv } from '../../_lib/kv';
import { refuseReadOnly } from '../../_lib/roles';
import { audit, auditActorFor } from '../../_lib/platform/audit-store';

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string };

/**
 * Import the KV reservation and expense blobs into D1. Safe to run more than once: existing rows
 * are left alone, and a deleted row is not put back. Does not write the KV blobs.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const readOnly = refuseReadOnly(request, env, corsJson);
  if (readOnly) return readOnly;
  try {
    const result = await migrateKvLedger(env);
    const logged = await audit(env, {
      actor: auditActorFor(request, env),
      action: 'ledger.migrate',
      target: 'd1',
      note: `Imported ${result.reservationsInserted} stays, ${result.overridesInserted} overrides, ${result.expensesInserted} expenses.`,
    });
    return corsJson(request, { ...result, ...(logged.ok ? {} : { auditFailed: logged.reason }) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The ledger import failed. Nothing was written over KV.';
    return corsJson(request, { error: message }, 500);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
