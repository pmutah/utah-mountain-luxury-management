/**
 * Shadow rate engine.
 *
 * The result never sends. Booked nights, a paused house, a kill switch, and a one-night River stay stay put.
 * A raise cannot move more than 8% in a day. Holidays stay on the season table.
 */

import { proposeGuestRate } from '../../../src/lib/market/propose.ts';
import type { HouseId } from '../../../src/lib/market/types.ts';

export const TARGET_PERCENTILE: Record<HouseId, number> = {
  river: 85,
  ranch: 70,
  lindon: 55,
};

export const MAX_DAILY_MOVE = 0.08;

export type EngineDecision = {
  house: HouseId;
  date: string;
  action: 'untouched' | 'hold' | 'raise' | 'promote' | 'locked' | 'refused';
  proposedGuest: number;
  reason: string;
  send: false;
};

export function guardNight(input: {
  house: HouseId;
  date: string;
  ourGuest: number;
  compRates: number[];
  floorGuest: number;
  ceilingGuest: number;
  booked: boolean;
  closed: boolean;
  holiday: boolean;
  paused: boolean;
  killSwitch: boolean;
  /** Length of the stay being priced. River refuses a one-night stay. */
  nights: number;
}): EngineDecision {
  const base = {
    house: input.house,
    date: input.date,
    proposedGuest: input.ourGuest,
    send: false as const,
  };
  if (input.killSwitch || input.paused) {
    return { ...base, action: 'untouched', reason: 'The house is paused. The published ask stays.' };
  }
  if (input.booked || input.closed) {
    return { ...base, action: 'untouched', reason: 'A booked or closed night is not repriced.' };
  }
  if (input.house === 'river' && input.nights < 2) {
    return { ...base, action: 'refused', reason: 'The River House is never offered for one night.' };
  }
  const proposed = proposeGuestRate({
    ourGuest: input.ourGuest,
    compRates: input.compRates,
    floorGuest: input.floorGuest,
    ceilingGuest: input.ceilingGuest,
    targetPercentile: TARGET_PERCENTILE[input.house],
    maxMove: MAX_DAILY_MOVE,
    lockBase: input.holiday,
  });
  return {
    ...base,
    action: proposed.action === 'locked' ? 'locked' : proposed.action,
    proposedGuest: proposed.proposedGuest,
    reason: proposed.reason,
  };
}

/** Live send needs the shadow week, the switch, and a token. Missing any one of them stays dark. */
export function mayPublish(input: { shadowDays: number; switchOn: boolean; tokenPresent: boolean }): boolean {
  return input.shadowDays >= 7 && input.switchOn && input.tokenPresent;
}

export function changeLogEntry(decision: EngineDecision, at: string): {
  at: string;
  house: HouseId;
  date: string;
  action: EngineDecision['action'];
  proposedGuest: number;
  reason: string;
  mode: 'shadow';
  send: false;
} {
  return {
    at,
    house: decision.house,
    date: decision.date,
    action: decision.action,
    proposedGuest: decision.proposedGuest,
    reason: decision.reason,
    mode: 'shadow',
    send: false,
  };
}
