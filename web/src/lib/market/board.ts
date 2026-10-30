import { eachNight, isWeekendNight, monthFactor } from './dates';
import { compsFor, type SampleComp } from './fixtures';
import { proposeGuestRate } from './propose';
import { nightAsk } from './rates';
import { median, percentileValue } from './stats';
import type { CompCard, HouseId, MarketBoard, NightRow } from './types';

const TARGET: Record<HouseId, number> = { river: 85, ranch: 70, lindon: 55 };
const MAX_MOVE = 0.08;

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function unit(text: string): number {
  return (hash(text) % 10000) / 10000;
}

function compAsk(comp: SampleComp, iso: string): number {
  const weekend = isWeekendNight(iso) ? 1.16 : 1;
  const wobble = 0.94 + unit(`${comp.id}|${iso}`) * 0.12;
  return Math.round(comp.baseGuest * monthFactor(iso) * weekend * wobble);
}

function ourGuest(house: HouseId, iso: string): { guest: number; floorGuest: number; season: string | null; lock: boolean } {
  const ask = nightAsk(house, iso);
  return { guest: ask.guest, floorGuest: ask.floorGuest, season: ask.season, lock: ask.lock };
}

function scoreComp(comp: SampleComp, house: HouseId): number {
  const idealBeds = house === 'river' ? 7 : house === 'ranch' ? 6 : 4;
  const bedGap = Math.abs(comp.beds - idealBeds);
  const favorite = comp.guestFavorite ? 8 : 0;
  const rating = (comp.rating - 4.6) * 40;
  const distance = Math.max(0, 12 - comp.distanceMi);
  return Math.round(rating + favorite + distance - bedGap * 3);
}

export function buildMarketBoard(house: HouseId, from: string, days = 90, selected?: SampleComp[]): MarketBoard {
  const comps = selected ?? compsFor(house);
  const nights: NightRow[] = eachNight(from, days).map((iso) => {
    const priced = comps.map((comp) => ({
      rate: compAsk(comp, iso),
      open: unit(`${comp.id}|open|${iso}`) > comp.occupancy * 0.85,
    }));
    const openRates = priced.filter((row) => row.open).map((row) => row.rate);
    const band = openRates.length >= 3 ? openRates : priced.map((row) => row.rate);
    const ours = ourGuest(house, iso);
    const move = proposeGuestRate({
      ourGuest: ours.guest,
      compRates: band,
      floorGuest: ours.floorGuest,
      ceilingGuest: Math.round(ours.guest * 2),
      targetPercentile: TARGET[house],
      maxMove: MAX_MOVE,
      lockBase: ours.lock,
    });
    return {
      date: iso,
      season: ours.season,
      ourGuest: ours.guest,
      floorGuest: ours.floorGuest,
      p25: Math.round(percentileValue(band, 25)),
      median: Math.round(median(band)),
      p75: Math.round(percentileValue(band, 75)),
      openComps: openRates.length,
      percentile: move.percentile,
      proposedGuest: move.proposedGuest,
      promotionPercent: 0,
      offerGuest: move.proposedGuest,
      action: move.action,
      reason: move.reason,
      compBookedShare: Math.round(((priced.length - openRates.length) / priced.length) * 100),
    };
  });

  const weekend = nights.find((night) => isWeekendNight(night.date)) ?? nights[0]!;
  const cards: CompCard[] = comps
    .map((comp) => ({
      id: comp.id,
      name: comp.name,
      area: comp.area,
      beds: comp.beds,
      sleeps: comp.sleeps,
      rating: comp.rating,
      reviews: comp.reviews,
      guestFavorite: comp.guestFavorite,
      distanceMi: comp.distanceMi,
      nextWeekendAsk: compAsk(comp, weekend.date),
      occupancy: Math.round(comp.occupancy * 100),
      score: scoreComp(comp, house),
    }))
    .sort((a, b) => b.score - a.score);

  const first30 = nights.slice(0, 30);
  return {
    house,
    source: 'sample',
    from,
    days,
    targetPercentile: TARGET[house],
    nights,
    comps: cards,
    summary: {
      medianAsk: Math.round(median(first30.map((night) => night.median))),
      ourTypical: Math.round(median(first30.map((night) => night.ourGuest))),
      ourPercentile: Math.round(median(first30.map((night) => night.percentile))),
      raiseNights: nights.filter((night) => night.action === 'raise').length,
      promoteNights: nights.filter((night) => night.action === 'promote').length,
      compPace30: Math.round(median(first30.map((night) => night.compBookedShare))),
    },
  };
}
