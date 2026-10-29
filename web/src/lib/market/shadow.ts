import { RIVER_FIRST_STAY } from '../brand';
import { promotionForNight, type YearPace } from './fill';
import type { HouseId, MarketBoard, NightRow } from './types';

export type GuardAction = NightRow['action'] | 'booked' | 'closed' | 'paused';

export type ShadowNight = Omit<NightRow, 'action'> & { action: GuardAction };

export type ShadowCounts = Record<GuardAction, number>;

export type ShadowRun = {
  house: HouseId;
  paused: boolean;
  nights: ShadowNight[];
  counts: ShadowCounts;
  /** The daily text, ready to send later. This module does not send it. */
  digest: string;
};

const LABEL: Record<HouseId, string> = { river: 'River', ranch: 'Ranch', lindon: 'Lindon' };

function money(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function shortDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function emptyCounts(): ShadowCounts {
  return { hold: 0, raise: 0, promote: 0, locked: 0, booked: 0, closed: 0, paused: 0 };
}

function guardNight(night: NightRow, house: HouseId, taken: Set<string>, paused: boolean): ShadowNight {
  if (paused) {
    return { ...night, action: 'paused', proposedGuest: night.ourGuest, reason: 'This house is paused. The published rate stays.' };
  }
  if (house === 'river' && night.date < RIVER_FIRST_STAY) {
    return { ...night, action: 'closed', proposedGuest: night.ourGuest, reason: 'The River House is closed this night. The rate stays.' };
  }
  if (taken.has(night.date)) {
    return { ...night, action: 'booked', proposedGuest: night.ourGuest, reason: 'Already booked. The rate stays.' };
  }
  return night;
}

export function runShadow(
  board: MarketBoard,
  taken: string[],
  paused: boolean,
  asOf: string,
  pace: YearPace = 'unknown',
): ShadowRun {
  const takenSet = new Set(taken);
  const guarded = board.nights.map((night) => guardNight(night, board.house, takenSet, paused));
  const nights = guarded.map((night) => applyFill(night, takenSet, asOf, pace));
  const counts = emptyCounts();
  for (const night of nights) counts[night.action] += 1;
  const raises = nights.filter((night) => night.action === 'raise');
  const largest = raises.reduce<ShadowNight | null>((best, night) => {
    if (!best) return night;
    return night.proposedGuest - night.ourGuest > best.proposedGuest - best.ourGuest ? night : best;
  }, null);
  const lines = paused
    ? [`UML shadow ${LABEL[board.house]} ${asOf}`, 'Paused. Every night stays at the published rate.']
    : [
        `UML shadow ${LABEL[board.house]} ${asOf}`,
        `Raises ${counts.raise} · promotions ${counts.promote} · booked left alone ${counts.booked} · closed ${counts.closed} · held ${counts.hold + counts.locked}`,
        largest
          ? `Largest raise ${shortDate(largest.date)} ${money(largest.ourGuest)} → ${money(largest.proposedGuest)}`
          : 'No raises today.',
        pace === 'met'
          ? 'The year is on the books. No promotions.'
          : pace === 'unknown'
            ? 'Year pace is not loaded, so no promotion is recommended.'
            : 'The year is still short. A promotion is 20% off the base on Airbnb and VRBO.',
      ];
  lines.push('Nothing sent to Hospitable.');
  return { house: board.house, paused, nights, counts, digest: lines.join('\n') };
}

function applyFill(night: ShadowNight, taken: Set<string>, asOf: string, pace: YearPace): ShadowNight {
  if (night.action === 'booked' || night.action === 'closed' || night.action === 'paused') {
    return { ...night, promotionPercent: 0, offerGuest: night.proposedGuest };
  }
  const decision = promotionForNight({
    date: night.date,
    asOf,
    holiday: night.action === 'locked',
    ourGuest: night.proposedGuest,
    floorGuest: night.floorGuest,
    taken,
    pace,
  });
  if (decision.percent === 20) {
    const raised = night.proposedGuest > night.ourGuest;
    return {
      ...night,
      action: 'promote',
      promotionPercent: 20,
      offerGuest: decision.offerGuest,
      reason: raised
        ? `Base ${money(night.ourGuest)} to ${money(night.proposedGuest)}. ${decision.reason}`
        : decision.reason,
    };
  }
  if (night.action === 'locked') {
    return { ...night, promotionPercent: 0, offerGuest: night.proposedGuest };
  }
  const action = night.action === 'promote' ? 'hold' : night.action;
  return {
    ...night,
    action,
    promotionPercent: 0,
    offerGuest: night.proposedGuest,
    reason: night.action === 'promote' ? decision.reason : night.reason,
  };
}
