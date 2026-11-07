import { buildMarketBoard } from './board';
import { compsFor, type SampleComp } from './fixtures';
import type { HouseId, MarketBoard } from './types';

function sameCompSet(house: HouseId, selected: readonly SampleComp[]): boolean {
  const base = compsFor(house);
  if (selected.length !== base.length) return false;
  return selected.every((comp, index) => comp.id === base[index]?.id);
}

/** A market overview payload. Anything else stays off the board. */
export function isMarketBoard(value: unknown, house: HouseId): value is MarketBoard {
  if (!value || typeof value !== 'object') return false;
  const board = value as Partial<MarketBoard>;
  if (board.house !== house) return false;
  // `thin` is a saved ask too few to read a band from. Leaving it out of this list would reject the
  // whole board on any night a host had recorded one or two asks, which is the opposite of a guard.
  if (
    board.source !== 'sample' &&
    board.source !== 'live' &&
    board.source !== 'mixed' &&
    board.source !== 'thin'
  ) {
    return false;
  }
  if (typeof board.from !== 'string' || typeof board.days !== 'number') return false;
  if (!Array.isArray(board.nights) || board.nights.length === 0) return false;
  if (!Array.isArray(board.comps) || board.comps.length === 0) return false;
  const night = board.nights[0];
  if (!night || typeof night.date !== 'string' || typeof night.ourGuest !== 'number') return false;
  return true;
}

/**
 * Use the overview when it matches this house and the default comp set.
 * A pinned or hidden comp keeps the board built from that set.
 */
export function boardFromOverview(
  house: HouseId,
  from: string,
  days: number,
  selected: readonly SampleComp[],
  remote: MarketBoard | null,
): MarketBoard {
  if (
    remote &&
    remote.house === house &&
    remote.from === from &&
    remote.days === days &&
    sameCompSet(house, selected)
  ) {
    return remote;
  }
  return buildMarketBoard(house, from, days, [...selected]);
}

/** Read the overview. A page that is not JSON is not a board. */
export async function loadMarketOverview(house: HouseId, suffix = ''): Promise<MarketBoard | null> {
  try {
    const response = await fetch(`/api/market/overview?house=${house}${suffix}`);
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.includes('application/json')) return null;
    const body: unknown = await response.json();
    return isMarketBoard(body, house) ? body : null;
  } catch {
    return null;
  }
}
