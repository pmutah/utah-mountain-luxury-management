import { hostDenied, hostOnly } from '../../_lib/auth';
import { guardNight } from '../../_lib/market/rate-engine';
import { acceptLedgerRead } from '../../../src/lib/platform/integrity';
import { loadComps, opportunities, pickTop } from '../../../src/lib/platform/market-intel';
import { failSoft, jsonResponse, refuseIfLedgerUnreadable } from '../../_lib/platform/http';

const TOOLS = [
  { name: 'market_overview', summary: 'Target percentiles and the fact that nothing is sent.' },
  { name: 'top_comps', summary: 'Fixture top comps for one house. Not a live AirROI pull.' },
  { name: 'pricing_run', summary: 'A shadow decision for one night. send is false.' },
  { name: 'opportunities', summary: 'Amenity gaps. Nothing is posted.' },
  { name: 'integrity_check', summary: 'Judges a ledger the caller supplies. Does not read or delete the books.' },
];

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    return jsonResponse(request, { tools: TOOLS, send: false, bulkDelete: false });
  } catch (err) {
    return failSoft(request, err, 'MCP');
  }
};

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const paused = await refuseIfLedgerUnreadable(request, env);
    if (paused) return paused;
    const body = (await request.json().catch(() => null)) as { name?: string; arguments?: Record<string, unknown> } | null;
    const name = body?.name ?? '';
    const args = body?.arguments ?? {};
    if (name === 'integrity_check') {
      if (args.delete === true || args.action === 'bulk-delete') {
        return jsonResponse(request, { error: 'Bulk delete is refused.', touchedBooks: false }, 400);
      }
      const read = acceptLedgerRead(
        args.ok === false
          ? { ok: false as const, error: 'The read failed.' }
          : { ok: true as const, rows: Array.isArray(args.rows) ? args.rows : [] },
      );
      return jsonResponse(request, { tool: name, read, touchedBooks: false });
    }
    if (name === 'top_comps') {
      const house = args.house === 'ranch' || args.house === 'lindon' || args.house === 'river' ? args.house : 'river';
      const loaded = loadComps({ house });
      return jsonResponse(request, { tool: name, ...loaded, picked: pickTop(loaded.comps, { houseSleeps: 12 }), send: false });
    }
    if (name === 'pricing_run') {
      const decision = guardNight({
        house: 'lindon',
        date: '2026-12-08',
        ourGuest: Number(args.ourGuest ?? 179),
        compRates: [400, 420, 450],
        floorGuest: 51,
        ceilingGuest: 900,
        booked: false,
        closed: false,
        holiday: false,
        paused: false,
        killSwitch: false,
        nights: 2,
      });
      return jsonResponse(request, { tool: name, decision });
    }
    if (name === 'opportunities') {
      return jsonResponse(request, {
        tool: name,
        opportunities: opportunities({ ours: ['wifi'], comps: [['wifi', 'ev charger'], ['ev charger'], ['ev charger']] }),
        send: false,
      });
    }
    if (name === 'market_overview') {
      return jsonResponse(request, {
        tool: name,
        targets: { river: 85, ranch: 70, lindon: 55 },
        send: false,
        source: 'fixture until an AirROI key exists',
      });
    }
    return jsonResponse(request, { error: 'Unknown tool.', send: false }, 400);
  } catch (err) {
    return failSoft(request, err, 'MCP');
  }
};
