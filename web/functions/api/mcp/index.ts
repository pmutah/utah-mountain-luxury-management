import { hostDenied, hostOnly } from '../../_lib/auth';
import { loadCalendarBlocks } from '../../_lib/calendar-store';
import { mergeAllExpenses } from '../../_lib/expenses';
import { guardNight } from '../../_lib/market/rate-engine';
import { failSoft, jsonResponse, refuseIfLedgerUnreadable } from '../../_lib/platform/http';
import { marketDb, readRows } from '../../_lib/platform/market-db';
import { readPause } from '../../_lib/platform/pause-store';
import { getAllReservations } from '../../_lib/reservations-store';
import { allowedHouses, mayReadHouse, resolveCaller, stripHouses, type Role, type RoleEnv } from '../../_lib/roles';
import type { Expense, Reservation } from '../../../src/lib/api';
import { cleanJobs } from '../../../src/lib/clean';
import { bothHouseQuote, compoundOffer } from '../../../src/lib/compound';
import { houseProfile } from '../../../src/lib/house-catalog';
import { SLEEPS } from '../../../src/lib/house-stay';
import { listingOpportunities } from '../../../src/lib/listing';
import { addDays, denverToday } from '../../../src/lib/market/dates';
import { compsFor } from '../../../src/lib/market/fixtures';
import { nightAsk } from '../../../src/lib/market/rates';
import type { HouseId } from '../../../src/lib/market/types';
import { quoteWithTax } from '../../../src/lib/platform/guest-ops';
import { acceptLedgerRead } from '../../../src/lib/platform/integrity';
import { loadComps, opportunities, pickTop, type CompCandidate } from '../../../src/lib/platform/market-intel';
import { quoteStay } from '../../../src/lib/quote';
import { buildTaxYearPacket } from '../../../src/lib/tax-prep';
import { buildPublicConditions } from '../public/conditions';

type McpToolDescriptor = {
  name: string;
  summary: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
};

const TOOLS: McpToolDescriptor[] = [
  {
    name: 'market_overview',
    summary: 'Target percentiles, role-allowed houses, and D1 market comp counts. Nothing is sent.',
    description: 'Read target percentiles, active houses for the caller role, and stored comp counts without sending anything.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'top_comps',
    summary: 'Top scored comps for one house using its real sleep capacity (D1 market_comps when bound, labeled fixture otherwise).',
    description: 'Score and pick top market comps for river, ranch, or lindon.',
    inputSchema: {
      type: 'object',
      properties: { house: { type: 'string', enum: ['river', 'ranch', 'lindon'] } },
    },
  },
  {
    name: 'pricing_run',
    summary: 'Guarded shadow rate decision for any house and date against real floors, comp bands, and D1 house_pause. send is false.',
    description: 'Run the shadow rate engine for one house and date without publishing a rate.',
    inputSchema: {
      type: 'object',
      properties: {
        house: { type: 'string', enum: ['river', 'ranch', 'lindon'] },
        date: { type: 'string', description: 'YYYY-MM-DD night to evaluate' },
        ourGuest: { type: 'number', description: 'Optional override for current guest nightly rate' },
        nights: { type: 'number', description: 'Length of stay (default 2; 3 on River weekends)' },
      },
    },
  },
  {
    name: 'opportunities',
    summary: 'Published listing readiness items and amenity gaps for one house. Nothing is posted.',
    description: 'Inspect direct-site listing opportunities and comp amenity gaps for one house.',
    inputSchema: {
      type: 'object',
      properties: { house: { type: 'string', enum: ['river', 'ranch', 'lindon'] } },
    },
  },
  {
    name: 'quote_stay',
    summary: 'Live direct stay quote (single house or 23–42 guest River+Ranch compound) with Utah tax estimate. Holds and charges nothing.',
    description: 'Compute a live direct stay quote against booked and blocked nights without holding dates or charging a card.',
    inputSchema: {
      type: 'object',
      properties: {
        house: { type: 'string', enum: ['river', 'ranch', 'lindon'] },
        checkIn: { type: 'string', description: 'YYYY-MM-DD' },
        checkOut: { type: 'string', description: 'YYYY-MM-DD' },
        guests: { type: 'number' },
        children: { type: 'number' },
        dogs: { type: 'number' },
      },
      required: ['checkIn', 'checkOut'],
    },
  },
  {
    name: 'canyon_conditions',
    summary: 'Live National Weather Service mountain/valley forecast, 48h Sundance snowfall, alerts, and USGS Vivian Park river flow.',
    description: 'Read live public weather and Provo River discharge telemetry.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'upcoming_turnovers',
    summary: 'Role-filtered cleaner turnovers ahead (house, checkout date, same-day flag, gap nights, step count). No guest PII or codes.',
    description: 'List upcoming turnovers filtered by caller role without guest names or access codes.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'str_tax_summary',
    summary: 'Role-filtered 2026+ Schedule E, §469 7-day average stay test, and cleaner hour summary (2025 Campbell filed locks preserved).',
    description: 'Summarize STR tax lines and §469 stay rules for a given tax year without altering books.',
    inputSchema: {
      type: 'object',
      properties: { year: { type: 'number', description: 'Tax year (default 2026; <=2025 returns Campbell lock notice)' } },
    },
  },
  {
    name: 'integrity_check',
    summary: 'Judges a ledger the caller supplies. Refuses bulk delete and does not read or delete the books.',
    description: 'Verify ledger array integrity without mutating or deleting records.',
    inputSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        rows: { type: 'array' },
      },
    },
  },
];

function parseHouseArg(raw: unknown, fallback: HouseId = 'river'): HouseId {
  return raw === 'ranch' || raw === 'lindon' || raw === 'river' ? raw : fallback;
}

function expandDates(start: string, end: string): string[] {
  const out: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end <= start) return out;
  let cur = start;
  let guard = 0;
  while (cur < end && guard < 370) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard += 1;
  }
  return out;
}

async function loadTakenAndClosed(
  env: unknown,
  role: Role,
): Promise<{ taken: Record<HouseId, string[]>; closed: Record<HouseId, string[]>; live: boolean }> {
  const taken: Record<HouseId, string[]> = { ranch: [], lindon: [], river: [] };
  const closed: Record<HouseId, string[]> = { ranch: [], lindon: [], river: [] };
  const kv = (env as { SETTINGS?: { get?: unknown } } | null)?.SETTINGS;
  if (!kv || typeof kv.get !== 'function') {
    return { taken, closed, live: false };
  }
  const stays = stripHouses((await getAllReservations(env as never)) as unknown as Reservation[], role);
  for (const stay of stays) {
    const house = stay.propertyId as HouseId;
    if (!taken[house] || stay.status === 'cancelled') continue;
    const target = stay.status === 'blocked' ? closed[house] : taken[house];
    target.push(...expandDates(stay.checkIn, stay.checkOut));
  }
  const blocks = stripHouses(await loadCalendarBlocks(env as never), role);
  for (const block of blocks) {
    const house = block.propertyId as HouseId;
    if (!closed[house]) continue;
    closed[house].push(...expandDates(block.start, block.end));
  }
  return { taken, closed, live: true };
}

type ToolOutcome =
  | { status: 200; payload: Record<string, unknown> }
  | { status: 400 | 403; error: string; extra?: Record<string, unknown> };

async function executeMcpTool(
  name: string,
  args: Record<string, unknown>,
  env: RoleEnv & Record<string, unknown>,
  role: Role,
): Promise<ToolOutcome> {
  if (name === 'integrity_check') {
    if (args.delete === true || args.action === 'bulk-delete') {
      return { status: 400, error: 'Bulk delete is refused.', extra: { touchedBooks: false } };
    }
    const read = acceptLedgerRead(
      args.ok === false
        ? { ok: false as const, error: 'The read failed.' }
        : { ok: true as const, rows: Array.isArray(args.rows) ? args.rows : [] },
    );
    return { status: 200, payload: { tool: name, read, touchedBooks: false } };
  }

  if (name === 'market_overview') {
    const allowed = allowedHouses(role);
    const allTargets: Record<HouseId, number> = { river: 85, ranch: 70, lindon: 55 };
    const targets: Partial<Record<HouseId, number>> = {};
    for (const id of ['river', 'ranch', 'lindon'] as HouseId[]) {
      if (allowed === null || allowed.includes(id)) targets[id] = allTargets[id];
    }
    let storedComps: number | null = null;
    if (marketDb(env)) {
      const counted = await readRows<{ n: number }>(env, 'SELECT COUNT(*) AS n FROM comps');
      if (counted.ok) storedComps = Number(counted.rows[0]?.n) || 0;
    }
    return {
      status: 200,
      payload: {
        tool: name,
        targets,
        ...(allowed !== null ? { houses: allowed } : {}),
        storedComps,
        send: false,
        source: storedComps && storedComps > 0 ? 'd1+fixture' : 'fixture until an AirROI key exists',
      },
    };
  }

  if (name === 'top_comps') {
    const house = parseHouseArg(args.house, 'river');
    if (!mayReadHouse(role, house)) {
      return { status: 403, error: 'That house is not available to this role.', extra: { send: false } };
    }
    const houseSleeps = SLEEPS[house];
    if (marketDb(env)) {
      const dbRows = await readRows<{
        id: string;
        title: string | null;
        sleeps: number | null;
        rating: number | null;
        reviews: number | null;
        distance_mi: number | null;
        guest_favorite: number | null;
        pinned: number | null;
        excluded: number | null;
      }>(env, 'SELECT id, title, sleeps, rating, reviews, distance_mi, guest_favorite, pinned, excluded FROM comps WHERE house = ?', house);
      if (dbRows.ok && dbRows.rows.length > 0) {
        const pinned: string[] = [];
        const excluded: string[] = [];
        const mapped: CompCandidate[] = dbRows.rows.map((row) => {
          if (Number(row.pinned) === 1) pinned.push(row.id);
          if (Number(row.excluded) === 1) excluded.push(row.id);
          return {
            id: row.id,
            house,
            name: row.title ?? row.id,
            sleeps: Number(row.sleeps) || houseSleeps,
            rating: Number(row.rating) || 4.8,
            reviews: Number(row.reviews) || 10,
            distanceMi: Number(row.distance_mi) || 2,
            guestFavorite: Number(row.guest_favorite) === 1,
            nightly: 0,
            source: 'airroi',
          };
        });
        return {
          status: 200,
          payload: {
            tool: name,
            house,
            houseSleeps,
            source: 'd1',
            comps: mapped,
            picked: pickTop(mapped, { houseSleeps, pinned, excluded }),
            send: false,
          },
        };
      }
    }
    const loaded = loadComps({ house });
    return {
      status: 200,
      payload: {
        tool: name,
        house,
        houseSleeps,
        ...loaded,
        picked: pickTop(loaded.comps, { houseSleeps }),
        send: false,
      },
    };
  }

  if (name === 'pricing_run') {
    const house = parseHouseArg(args.house, 'lindon');
    if (!mayReadHouse(role, house)) {
      return { status: 403, error: 'That house is not available to this role.', extra: { send: false } };
    }
    const date = typeof args.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.date) ? args.date : '2026-12-08';
    const ask = nightAsk(house, date);
    const ourGuest = typeof args.ourGuest === 'number' && Number.isFinite(args.ourGuest) ? args.ourGuest : ask.guest;
    const sampleRates = compsFor(house).map((comp) => comp.baseGuest);
    const compRates = sampleRates.length > 0 ? sampleRates : [400, 420, 450];
    const pauseRead = marketDb(env) ? await readPause(env) : null;
    const paused = args.paused === true || (pauseRead ? pauseRead.paused[house] : false);
    const nights =
      typeof args.nights === 'number' && Number.isInteger(args.nights) && args.nights >= 1
        ? args.nights
        : Math.max(2, ask.minNights);
    const ceilings: Record<HouseId, number> = { river: 4800, ranch: 2200, lindon: 900 };
    const decision = guardNight({
      house,
      date,
      ourGuest,
      compRates,
      floorGuest: ask.floorGuest,
      ceilingGuest: ceilings[house],
      booked: args.booked === true,
      closed: ask.closed || args.closed === true,
      holiday: ask.lock || args.holiday === true,
      paused,
      killSwitch: args.killSwitch === true,
      nights,
    });
    return { status: 200, payload: { tool: name, house, date, decision, send: false } };
  }

  if (name === 'opportunities') {
    const house = parseHouseArg(args.house, 'river');
    if (!mayReadHouse(role, house)) {
      return { status: 403, error: 'That house is not available to this role.', extra: { send: false } };
    }
    const ours = houseProfile(house).amenityGroups.flatMap((group) => group.items.map((item) => item.toLowerCase()));
    const benchmarkComps: Record<HouseId, string[][]> = {
      river: [
        ['hot tub', 'barrel sauna', 'ev charger', 'provo river frontage', 'pickleball court'],
        ['hot tub', 'ev charger', 'heated driveway', 'ski boot dryers'],
        ['hot tub', 'ev charger', 'ski boot dryers', 'espresso bar'],
      ],
      ranch: [
        ['hot tub under a pergola', 'pool table', 'ev charger', 'pickleball court'],
        ['hot tub under a pergola', 'ev charger', 'sauna'],
        ['pool table', 'ev charger', 'sauna'],
      ],
      lindon: [
        ['full kitchen', 'washer and dryer', 'ev charger', 'hot tub'],
        ['full kitchen', 'ev charger', 'hot tub'],
        ['washer and dryer', 'ev charger', 'fire pit'],
      ],
    };
    return {
      status: 200,
      payload: {
        tool: name,
        house,
        listingChecklist: listingOpportunities(house),
        opportunities: opportunities({ ours, comps: benchmarkComps[house] }),
        send: false,
      },
    };
  }

  if (name === 'quote_stay') {
    const house = parseHouseArg(args.house, 'river');
    const checkIn = typeof args.checkIn === 'string' ? args.checkIn : '';
    const checkOut = typeof args.checkOut === 'string' ? args.checkOut : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) {
      return { status: 400, error: 'Valid YYYY-MM-DD checkIn and checkOut dates are required.', extra: { send: false } };
    }
    const guests = typeof args.guests === 'number' && Number.isInteger(args.guests) ? args.guests : undefined;
    const children = typeof args.children === 'number' && Number.isInteger(args.children) ? args.children : undefined;
    const dogs = typeof args.dogs === 'number' && Number.isInteger(args.dogs) ? args.dogs : undefined;
    const today = denverToday();
    const { taken, closed, live } = await loadTakenAndClosed(env, role);

    if (guests !== undefined && bothHouseQuote(guests)) {
      if (!mayReadHouse(role, 'river') || !mayReadHouse(role, 'ranch')) {
        return { status: 403, error: 'That house is not available to this role.', extra: { send: false } };
      }
      const compound = compoundOffer(checkIn, checkOut, guests, children, taken, today, () => 'unknown', closed);
      const tax =
        compound.show && compound.ok
          ? quoteWithTax({ lodging: compound.total, cleaning: 0, pet: dogs && dogs > 0 ? 149 : 0 })
          : null;
      return {
        status: 200,
        payload: {
          tool: name,
          mode: 'two-house-compound',
          calendarLive: live,
          compound,
          taxEstimate: tax,
          holdsDates: false,
          chargesCard: false,
          send: false,
        },
      };
    }

    if (!mayReadHouse(role, house)) {
      return { status: 403, error: 'That house is not available to this role.', extra: { send: false } };
    }
    const quote = quoteStay(house, checkIn, checkOut, taken[house], {
      asOf: today,
      pace: 'unknown',
      closed: closed[house],
      ...(guests !== undefined ? { guests } : {}),
      ...(children !== undefined ? { children } : {}),
      ...(dogs !== undefined ? { dogs } : {}),
    });
    const taxEstimate = quote.ok
      ? quoteWithTax({ lodging: quote.lodging, cleaning: quote.cleaning, pet: quote.petFee })
      : null;
    return {
      status: 200,
      payload: {
        tool: name,
        mode: 'single-house',
        house,
        calendarLive: live,
        quote,
        taxEstimate,
        holdsDates: false,
        chargesCard: false,
        send: false,
      },
    };
  }

  if (name === 'canyon_conditions') {
    const conditions = await buildPublicConditions(fetch);
    return {
      status: 200,
      payload: {
        tool: name,
        ...conditions,
        send: false,
      },
    };
  }

  if (name === 'upcoming_turnovers') {
    const kv = (env as { SETTINGS?: { get?: unknown } } | null)?.SETTINGS;
    if (!kv || typeof kv.get !== 'function') {
      return { status: 200, payload: { tool: name, turns: [], calendarLive: false, send: false, touchedBooks: false } };
    }
    const stays = stripHouses((await getAllReservations(env as never)) as unknown as Reservation[], role);
    const jobs = cleanJobs(stays, denverToday()).map((job) => ({
      house: job.house,
      checkout: job.checkout,
      priority: job.priority,
      gapNights: job.gapNights,
      sameDay: job.gapNights === 0,
      stepCount: job.steps.length,
    }));
    return {
      status: 200,
      payload: {
        tool: name,
        asOf: denverToday(),
        turns: jobs,
        ...(allowedHouses(role) !== null ? { houses: allowedHouses(role) } : {}),
        send: false,
        touchedBooks: false,
      },
    };
  }

  if (name === 'str_tax_summary') {
    const year = typeof args.year === 'number' && Number.isInteger(args.year) ? args.year : 2026;
    if (year <= 2025) {
      const locked = buildTaxYearPacket({ year, reservations: [], expenses: [] });
      return {
        status: 200,
        payload: {
          tool: name,
          year,
          locked2025: locked.locked2025,
          lockReason: locked.lockReason,
          touchedBooks: false,
          send: false,
        },
      };
    }
    const kv = (env as { SETTINGS?: { get?: unknown } } | null)?.SETTINGS;
    const stays =
      kv && typeof kv.get === 'function'
        ? stripHouses((await getAllReservations(env as never)) as unknown as Reservation[], role)
        : [];
    const bills =
      kv && typeof kv.get === 'function'
        ? stripHouses((await mergeAllExpenses(env as never)) as unknown as Expense[], role)
        : [];
    const packet = buildTaxYearPacket({ year, reservations: stays, expenses: bills });
    const allowed = allowedHouses(role);
    const filteredProps =
      allowed === null ? packet.properties : packet.properties.filter((col) => allowed.includes(col.propertyId));
    const filteredRules =
      allowed === null ? packet.strRules : packet.strRules.filter((row) => allowed.includes(row.propertyId));
    return {
      status: 200,
      payload: {
        tool: name,
        year,
        locked2025: false,
        ...(allowed !== null ? { houses: allowed } : {}),
        properties: filteredProps.map((col) => ({
          propertyId: col.propertyId,
          rents: col.lines.line3_rents,
          deductibleBefore1098: col.deductibleOperatingTotal,
          netBefore1098AndDepreciation: col.netBefore1098AndDepreciation,
        })),
        strRules: filteredRules,
        totalCleanerEstimatedHours:
          allowed === null
            ? packet.totalCleanerEstimatedHours
            : allowed.reduce((sum, id) => sum + (packet.cleanerEstimatedHours[id] ?? 0), 0),
        touchedBooks: false,
        send: false,
      },
    };
  }

  return { status: 400, error: 'Unknown tool.', extra: { send: false } };
}

export const onRequestGet: PagesFunction<RoleEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const caller = resolveCaller(request, env);
  if (caller.kind === 'denied') return hostDenied(request, env);
  try {
    return jsonResponse(request, {
      protocolVersion: '2024-11-05',
      tools: TOOLS,
      houses: allowedHouses(caller.role),
      send: false,
      bulkDelete: false,
    });
  } catch (err) {
    return failSoft(request, err, 'MCP');
  }
};

export const onRequestPost: PagesFunction<RoleEnv & Record<string, unknown>> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const caller = resolveCaller(request, env);
  if (caller.kind === 'denied') return hostDenied(request, env);
  try {
    const paused = await refuseIfLedgerUnreadable(request, env);
    if (paused) return paused;

    const body = (await request.json().catch(() => null)) as {
      jsonrpc?: string;
      id?: string | number | null;
      method?: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
      name?: string;
      arguments?: Record<string, unknown>;
    } | null;

    if (body?.jsonrpc === '2.0' && typeof body.method === 'string') {
      const rpcId = body.id ?? null;
      if (body.method === 'initialize') {
        return jsonResponse(request, {
          jsonrpc: '2.0',
          id: rpcId,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'utah-mountain-luxury-mcp', version: '2.0.0' },
          },
        });
      }
      if (body.method === 'tools/list') {
        return jsonResponse(request, {
          jsonrpc: '2.0',
          id: rpcId,
          result: { tools: TOOLS },
        });
      }
      if (body.method === 'tools/call') {
        const toolName = body.params?.name ?? '';
        const toolArgs = body.params?.arguments ?? {};
        const outcome = await executeMcpTool(toolName, toolArgs, env, caller.role);
        if (outcome.status !== 200) {
          return jsonResponse(request, {
            jsonrpc: '2.0',
            id: rpcId,
            error: {
              code: outcome.status === 403 ? -32001 : -32602,
              message: outcome.error,
              data: outcome.extra ?? {},
            },
          });
        }
        return jsonResponse(request, {
          jsonrpc: '2.0',
          id: rpcId,
          result: {
            content: [{ type: 'text', text: JSON.stringify(outcome.payload, null, 2) }],
            structuredContent: outcome.payload,
            isError: false,
          },
        });
      }
      return jsonResponse(request, {
        jsonrpc: '2.0',
        id: rpcId,
        error: { code: -32601, message: `Unsupported JSON-RPC method: ${body.method}` },
      });
    }

    const name = body?.name ?? '';
    const args = body?.arguments ?? {};
    const outcome = await executeMcpTool(name, args, env, caller.role);
    if (outcome.status !== 200) {
      return jsonResponse(request, { error: outcome.error, ...(outcome.extra ?? {}) }, outcome.status);
    }
    return jsonResponse(request, outcome.payload);
  } catch (err) {
    return failSoft(request, err, 'MCP');
  }
};
