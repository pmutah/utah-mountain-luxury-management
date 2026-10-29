import { isWeekendNight } from './dates';
import { riverSeasonOn } from './seasons';
import { listPriceForHostNet } from './stats';
import { AIRBNB_KEEP } from '../revenue-goals';
import type { HouseId } from './types';

/** Working published guest ask until the Hospitable calendar is connected. */
const PUBLISHED: Record<Exclude<HouseId, 'river'>, { weekend: number; weekday: number; floorHost: number }> = {
  ranch: { weekend: 890, weekday: 640, floorHost: 105 },
  lindon: { weekend: 249, weekday: 179, floorHost: 43 },
};

export type NightAsk = {
  /** Guest price on Airbnb, with the host fee grossed up. */
  guest: number;
  /** What the host keeps. A direct booking charges this, because there is no platform fee. */
  host: number;
  floorGuest: number;
  floorHost: number;
  season: string | null;
  lock: boolean;
  minNights: number;
  /** River is not offered before the first stay date. */
  closed: boolean;
};

export function nightAsk(house: HouseId, iso: string): NightAsk {
  if (house === 'river') {
    const season = riverSeasonOn(iso);
    const weekend = isWeekendNight(iso);
    const host = weekend ? season.weekendHostNet : season.weekdayHostNet;
    return {
      guest: listPriceForHostNet(host),
      host,
      floorGuest: listPriceForHostNet(1500),
      floorHost: 1500,
      season: season.name,
      lock: season.holiday,
      minNights: weekend ? season.minWeekend : season.minWeekday,
      closed: iso < '2026-11-01',
    };
  }
  const published = PUBLISHED[house];
  const weekend = isWeekendNight(iso);
  const guest = weekend ? published.weekend : published.weekday;
  return {
    guest,
    host: Math.round(guest * AIRBNB_KEEP),
    floorGuest: listPriceForHostNet(published.floorHost),
    floorHost: published.floorHost,
    season: null,
    lock: false,
    minNights: 1,
    closed: false,
  };
}
