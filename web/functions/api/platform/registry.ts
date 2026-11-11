import { hostDenied, hostOnly } from '../../_lib/auth';
import { FEATURE_CATALOG } from '../../../src/lib/platform/feature-catalog';
import { failSoft, jsonResponse } from '../../_lib/platform/http';
import { dbTables, readRows, seedRegistry, type RegistryRow } from '../../_lib/platform/market-db';

type Env = { MARKET_DB?: unknown };

/**
 * The feature catalog, and whether it is stored in the market database.
 *
 * `POST` seeds the table from the TypeScript catalog with an upsert. It never deletes a row, so a note a person wrote
 * on a feature survives a reseed, and a feature that leaves the catalog keeps its history in the table.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const tables = await dbTables(env);
    const stored = await readRows<RegistryRow>(
      env,
      'SELECT id, area, title, status, competitor, notes FROM feature_registry ORDER BY area, id',
    );
    return jsonResponse(request, {
      catalog: FEATURE_CATALOG,
      d1: tables.ok ? 'bound' : 'not-bound',
      tables: tables.ok ? tables.rows.map((row) => row.name) : [],
      reason: tables.ok ? undefined : tables.reason,
      stored: stored.ok ? stored.rows.length : 0,
      storedRows: stored.ok ? stored.rows : [],
      readReason: stored.ok ? undefined : stored.reason,
      note: 'The catalog is the source of truth. D1 mirrors it so the night run reads one table. No expense, booking, or receipt is here.',
    });
  } catch (err) {
    return failSoft(request, err, 'Feature registry');
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const seeded = await seedRegistry(env, FEATURE_CATALOG);
    return jsonResponse(
      request,
      {
        seeded: seeded.seeded,
        ok: seeded.ok,
        reason: seeded.ok ? undefined : seeded.reason,
        note: 'New rows and changed rows are upserted. No row is deleted, and no book is touched.',
      },
      seeded.ok ? 200 : 409,
    );
  } catch (err) {
    return failSoft(request, err, 'Feature registry seed');
  }
};
