import { occupiedByHouse, type StaySpan } from './availability';
import { addDays, isRealDay } from './market/dates';
import type { YearPace } from './market/fill';
import type { ApprovedRate } from './market/rate-sheet';
import type { HouseId } from './market/types';
import { grossPace, type PaceStay } from './revenue-goals';
import { RIVER_UNIT_DETAIL, riverAvailability, type UnitSpan } from './river-units';
import { unitRateState, type RiverUnitRates } from './river-unit-rates';

const HOUSES: HouseId[] = ['ranch', 'lindon', 'river'];

export type PublicTurn = { house: HouseId; checkOut: string };

export type PublicCalendar = {
  storageReads: 'ok' | 'paused';
  from: string;
  until: string;
  nights: Record<HouseId, string[]> | null;
  closed: Record<HouseId, string[]> | null;
  /** Nights another guest is finishing a request for. Not booked, and they let go on their own. */
  held: Record<HouseId, string[]> | null;
  /**
   * Guest prices the host approved, by house and night. A price is public by nature, and this is the
   * only comp-driven figure a guest is quoted, so it travels with the calendar. Null when the sheet
   * could not be read, so a stand-in price is never shown as approved.
   */
  approved: Record<HouseId, Array<{ date: string; guest: number }>> | null;
  pace: Record<HouseId, YearPace>;
  turns: PublicTurn[] | null;
  /**
   * The Riverhouse parts: what each costs and which nights it is still free.
   *
   * Null means the part prices could not be read, which is not the same as "no parts for sale" — a page that treated an
   * unreadable price list as an empty one would silently stop offering the parts. A part with no price carries
   * `nightly: null` and is never offered.
   */
  units: PublicUnit[] | null;
};

/** One Riverhouse part as a guest may see it. No guest names, no payouts, no host-only notes. */
export type PublicUnit = {
  id: string;
  name: string;
  sleeps: number;
  bedrooms: number;
  beds: number;
  baths: number;
  /** Guest nightly rate. Null when the host has not priced this part yet. */
  nightly: number | null;
  cleaning: number | null;
  minNights: number | null;
  /** 'unset' or 'partial' means this part cannot be booked at any price. */
  rateState: 'unset' | 'partial' | 'ready';
  /** Nights this part is free, within the calendar window. */
  nights: string[];
};

const UNKNOWN: Record<HouseId, YearPace> = { ranch: 'unknown', lindon: 'unknown', river: 'unknown' };

function staySpan(row: unknown): StaySpan | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  if (typeof record.propertyId !== 'string' || typeof record.checkIn !== 'string' || typeof record.checkOut !== 'string') return null;
  return {
    propertyId: record.propertyId,
    checkIn: record.checkIn,
    checkOut: record.checkOut,
    status: typeof record.status === 'string' ? record.status : undefined,
  };
}

function blockSpan(row: unknown): StaySpan | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const checkIn = typeof record.start === 'string' ? record.start : typeof record.checkIn === 'string' ? record.checkIn : '';
  const checkOut = typeof record.end === 'string' ? record.end : typeof record.checkOut === 'string' ? record.checkOut : '';
  if (typeof record.propertyId !== 'string' || !checkIn || !checkOut) return null;
  return { propertyId: record.propertyId, checkIn, checkOut, status: 'blocked' };
}

function paceStay(row: unknown): PaceStay | null {
  const span = staySpan(row);
  if (!span) return null;
  const payout = Number((row as { payout?: unknown }).payout);
  return { ...span, payout: Number.isFinite(payout) ? payout : 0 };
}

/** Booked nights and a pace word. Names, notes, phones, and payout amounts are not copied out. */
export function publicCalendarFromLists(
  reservations: readonly unknown[],
  blocks: readonly unknown[],
  asOf: string,
  holds: readonly { propertyId: string; checkIn: string; checkOut: string }[] = [],
  approved: readonly ApprovedRate[] | null = [],
  unitRates: RiverUnitRates | null = null,
): PublicCalendar {
  const until = /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? addDays(asOf, 540) : '';
  if (!until) {
    return {
      storageReads: 'paused',
      from: asOf,
      until: asOf,
      nights: null,
      closed: null,
      held: null,
      approved: null,
      pace: UNKNOWN,
      turns: null,
      units: null,
    };
  }
  const stays = reservations.map(staySpan).filter((stay): stay is StaySpan => stay !== null);
  const closedStays = blocks.map(blockSpan).filter((stay): stay is StaySpan => stay !== null);
  const heldStays = holds
    .filter((hold) => isHouse(hold.propertyId))
    .map((hold) => ({ propertyId: hold.propertyId, checkIn: hold.checkIn, checkOut: hold.checkOut, status: 'held' }));
  const paceStays = reservations.map(paceStay).filter((stay): stay is PaceStay => stay !== null);
  const pace = Object.fromEntries(
    HOUSES.map((house) => [house, grossPace(house, paceStays, asOf).stillNeeded > 0 ? 'short' : 'met']),
  ) as Record<HouseId, YearPace>;
  return {
    storageReads: 'ok',
    from: asOf,
    until,
    nights: occupiedByHouse([...stays, ...closedStays], asOf, until),
    closed: occupiedByHouse(closedStays, asOf, until),
    // A held night is not booked. It is listed apart so the quote can name it and still explain.
    held: occupiedByHouse(heldStays, asOf, until),
    approved: approvedSheet(approved),
    pace,
    turns: checkoutTurns(stays, asOf),
    units: publicUnits(unitRates, [...stays, ...closedStays], asOf, until),
  };
}

/**
 * The Riverhouse parts as a guest may see them.
 *
 * The nights come from the same unit blocking the host side uses, so the page cannot offer a part the booking gate
 * would refuse. A part with no price is listed with `nightly: null` rather than hidden, because "this part exists but
 * is not for sale yet" is the honest answer and hiding it invites a guest to ask.
 */
function publicUnits(
  rates: RiverUnitRates | null,
  spans: readonly UnitSpan[],
  from: string,
  until: string,
): PublicUnit[] | null {
  if (rates === null) return null;
  const availability = riverAvailability(spans, from, until);
  return RIVER_UNIT_DETAIL.map((unit) => {
    const rate = rates[unit.id];
    const state = unitRateState(rate);
    return {
      id: unit.id,
      name: unit.name,
      sleeps: unit.sleeps,
      bedrooms: unit.bedrooms,
      beds: unit.beds,
      baths: unit.baths,
      nightly: state === 'ready' ? rate.nightly : null,
      cleaning: rate.cleaning,
      minNights: rate.minNights,
      rateState: state,
      nights: availability.units[unit.id],
    };
  });
}

/**
 * The approved sheet as three plain lists of night and price. A row whose date or price cannot be
 * read is dropped rather than shown. A sheet that could not be read at all is null, never empty.
 */
function approvedSheet(approved: readonly ApprovedRate[] | null): Record<HouseId, Array<{ date: string; guest: number }>> | null {
  if (approved === null) return null;
  const out: Record<HouseId, Array<{ date: string; guest: number }>> = { ranch: [], lindon: [], river: [] };
  for (const row of approved) {
    if (!isHouse(row.house) || !isRealDay(row.date)) continue;
    if (!Number.isFinite(row.guest) || row.guest <= 0) continue;
    out[row.house].push({ date: row.date, guest: Math.round(row.guest) });
  }
  for (const house of HOUSES) out[house].sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function isHouse(id: string): id is HouseId {
  return id === 'ranch' || id === 'lindon' || id === 'river';
}

/** Checkout mornings in the next two weeks. Cancelled and blocked stays stay off. Names are not copied. */
function checkoutTurns(stays: readonly StaySpan[], asOf: string): PublicTurn[] {
  const until = addDays(asOf, 14);
  const seen = new Set<string>();
  const turns: PublicTurn[] = [];
  for (const stay of stays) {
    if (!isHouse(stay.propertyId) || stay.status === 'cancelled' || stay.status === 'blocked') continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(stay.checkOut) || stay.checkOut < asOf || stay.checkOut >= until) continue;
    const key = `${stay.propertyId}|${stay.checkOut}`;
    if (seen.has(key)) continue;
    seen.add(key);
    turns.push({ house: stay.propertyId, checkOut: stay.checkOut });
  }
  return turns.sort((a, b) => a.checkOut.localeCompare(b.checkOut) || a.house.localeCompare(b.house));
}
