import { isWeekendNight } from './dates';
import { riverSeasonOn } from './seasons';
import { listPriceForHostNet } from './stats';
import type { HouseId } from './types';

/** Working published guest ask until the Hospitable calendar is connected. */
const PUBLISHED: Record<Exclude<HouseId, 'river'>, { weekend: number; weekday: number; floorHost: number }> = {
  ranch: { weekend: 890, weekday: 640, floorHost: 105 },
  lindon: { weekend: 249, weekday: 179, floorHost: 43 },
};

export type NightAsk = {
  guest: number;
  floorGuest: number;
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
      floorGuest: listPriceForHostNet(1500),
      season: season.name,
      lock: season.holiday,
      minNights: weekend ? season.minWeekend : season.minWeekday,
      closed: iso < '2026-11-01',
    };
  }
  const published = PUBLISHED[house];
  const weekend = isWeekendNight(iso);
  return {
    guest: weekend ? published.weekend : published.weekday,
    floorGuest: listPriceForHostNet(published.floorHost),
    season: null,
    lock: false,
    minNights: 1,
    closed: false,
  };
}
