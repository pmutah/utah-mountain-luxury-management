import { bandComps, isCloseSleep, isFairComp, isNearby } from './comp-fit';
import { eachNight, isWeekendNight, monthFactor } from './dates';
import { compsFor, type SampleComp } from './fixtures';
import { type BoardSource, type LiveComp, liveAsk, liveCompFits, type SnapIndex } from './live';
import { approvalBase, approvedGuestRate, type QuotedSheetNight } from './rate-sheet';
import { proposeGuestRate } from './propose';
import { nightAsk } from './rates';
import { median, percentileValue } from './stats';
import type { CompCard, HouseId, MarketBoard, NightRow } from './types';

/** Saved comps and the asks they carry. A night with no ask is left to the sample. */
export type LiveNights = { comps: LiveComp[]; index: SnapIndex };

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

/**
 * What this house currently asks for a night. A night the host approved asks the approved price:
 * that is what the guest page quotes, so the board has to start there too. Otherwise the push plan
 * re-proposes a night that is already set, and the two disagree about the same night.
 *
 * The base is `approvalBase`, the same one the approve route and the quote use. This passed the published card
 * as the base, so a night approved above 8% over the card was **rejected here** and the board went back to
 * reading $179 — while the sheet held $208. Three places computed this base and all three got it wrong the same
 * way; one function is what stops a fourth.
 */
function ourGuest(
  house: HouseId,
  iso: string,
  sheet: readonly QuotedSheetNight[] = [],
): { guest: number; floorGuest: number; season: string | null; lock: boolean; minNights: number } {
  const ask = nightAsk(house, iso);
  const approved = approvedGuestRate(sheet, iso, {
    guest: approvalBase(ask.guest, sheet),
    floorGuest: ask.floorGuest,
  });
  return {
    guest: approved ?? ask.guest,
    floorGuest: ask.floorGuest,
    season: ask.season,
    lock: ask.lock,
    minNights: ask.minNights,
  };
}

function scoreComp(comp: SampleComp, house: HouseId): number {
  const idealBeds = house === 'river' ? 7 : house === 'ranch' ? 6 : 4;
  const bedGap = Math.abs(comp.beds - idealBeds);
  const favorite = comp.guestFavorite ? 8 : 0;
  const rating = (comp.rating - 4.6) * 40;
  const distance = Math.max(0, 12 - comp.distanceMi);
  return Math.round(rating + favorite + distance - bedGap * 3);
}

export function buildMarketBoard(
  house: HouseId,
  from: string,
  days = 90,
  selected?: SampleComp[],
  live?: LiveNights | null,
  /** Host-approved guest rates. A night with none starts from the published card. */
  sheet: readonly QuotedSheetNight[] = [],
): MarketBoard {
  const listed = selected ?? compsFor(house);
  const band = bandComps(house, listed);
  const comps = band.used;
  const nights: NightRow[] = eachNight(from, days).map((iso) => {
    const sampleRows = comps.map((comp) => ({
      rate: compAsk(comp, iso),
      open: unit(`${comp.id}|open|${iso}`) > comp.occupancy * 0.85,
    }));
    /*
     * A saved ask and a sample are different things, so they are never mixed into one band: the
     * saved comps are a separate set with their own ids, and averaging a real ask with a fabricated
     * one would make the band look measured when half of it is not.
     *
     * What was wrong is what happened with only one or two saved asks. They replaced the whole band,
     * so a single $4,000 ask became the median, p25 and p75 all at once, and the source said `live`:
     * one observation presented as the market. Pricing was saved only by `proposeGuestRate`'s own
     * "fewer than 3 comps" hold, so the board showed a confident median off a single listing while
     * quietly not acting on it. Fewer than three observations is not a band, and `thin` says so.
     */
    const liveAsks = (live?.comps ?? [])
      .map((comp) => liveAsk(live!.index, comp.id, iso))
      .filter((ask): ask is number => ask !== null);
    const sampleOpen = sampleRows.filter((row) => row.open).map((row) => row.rate);
    const band =
      liveAsks.length > 0 ? liveAsks : sampleOpen.length >= 3 ? sampleOpen : sampleRows.map((row) => row.rate);
    const source: BoardSource = liveAsks.length === 0 ? 'sample' : band.length < 3 ? 'thin' : 'live';
    const ours = ourGuest(house, iso, sheet);
    const move = proposeGuestRate({
      ourGuest: ours.guest,
      compRates: band,
      floorGuest: ours.floorGuest,
      ceilingGuest: Math.round(ours.guest * 2),
      targetPercentile: TARGET[house],
      maxMove: MAX_MOVE,
      lockBase: ours.lock,
    });
    const observed = liveAsks.length > 0 ? liveAsks : sampleOpen;
    const p75 = Math.round(percentileValue(band, 75));
    /*
     * A band with no saved ask is the invented sample set from `fixtures.ts` — comps named "Sample · Canyon
     * lodge" with rates this repo made up. `proposeGuestRate` cannot tell the difference: it sees eight
     * plausible numbers, places our rate in them, and recommends a raise or a promotion. That recommendation
     * then reaches the push plan as a price to type into Airbnb, and the market page as a "shadow raise".
     *
     * So a night with no measurement does not move. The band is still shown, because hiding it would leave the
     * page blank before any comp exists and the sample set is labelled everywhere it appears — but a price
     * *instruction* rests on a measurement or it does not happen. This is what the `source` field has always
     * meant; nothing downstream was reading it.
     */
    const invented = liveAsks.length === 0;
    /*
     * When the floor is above the whole comp cluster, no allowed discount can bring this night into the
     * market: the floor is the lowest price the house may quote, and it already sits above the 75th
     * percentile. The River House is the case that surfaced this — a flat $1,500 host-net floor is $1,776
     * as a guest price, above p75 on 21 of its 23 live nights, so the 20% promotion it was offered could
     * never work. Saying so is the point: a plan full of promotions that arithmetic forbids is worse than
     * no plan.
     */
    const floorAboveMarket = !invented && band.length >= 3 && ours.floorGuest > p75;
    /*
     * A holiday lock is not a market judgement: it comes from the season table, so it holds whether or not a
     * comp has watched the night. Only the *market-derived* actions are withheld on an invented band.
     */
    const action: NightRow['action'] = ours.lock
      ? 'locked'
      : invented
        ? 'hold'
        : floorAboveMarket && move.action === 'promote'
          ? 'hold'
          : move.action;
    const proposedGuest = invented || ours.lock ? ours.guest : move.proposedGuest;
    return {
      date: iso,
      season: ours.season,
      ourGuest: ours.guest,
      floorGuest: ours.floorGuest,
      compRates: band,
      p25: Math.round(percentileValue(band, 25)),
      median: Math.round(median(band)),
      p75,
      openComps: observed.length,
      percentile: move.percentile,
      proposedGuest,
      promotionPercent: 0,
      offerGuest: proposedGuest,
      action,
      reason: ours.lock
        ? 'Holiday rate stays on the season table.'
        : invented
          ? `No saved comp ask covers this night, so the band is the invented sample set. No rate move is recommended until a real comp watches this date. The published rate stays.`
          : floorAboveMarket
            ? `The floor is $${ours.floorGuest} and the market's 75th percentile is $${p75}, so no allowed discount reaches this market. The published rate stays; the floor is why.`
            : move.reason,
      minNights: ours.minNights,
      compBookedShare: Math.round(((sampleRows.length - observed.length) / sampleRows.length) * 100),
      source,
    };
  });

  const weekend = nights.find((night) => isWeekendNight(night.date)) ?? nights[0]!;
  const inBand = new Set(comps.map((comp) => comp.id));
  /*
   * Cards describe the comps the band actually used, not the sample list.
   *
   * They were always built from `listed`, which is the sample fixtures, so a house with five saved comps
   * rendered a comp table of ten listings named "Sample · River bench home" while its band came from real
   * asks — and the digest said "5 of 10 saved comps" about a list that contained no saved comps at all. A
   * host comparing against that table is comparing against nothing.
   *
   * When saved comps exist they are the market and they get the table. Their ask is the median of what they
   * were observed asking, and their `inBand` flag is whether they fit, because that is the job this table
   * does for a host. The sample list stays only for a house with no saved comp at all, where a blank table
   * would hide the fact that the page has nothing measured to show.
   */
  const saved = live?.comps ?? [];
  const savedCards: CompCard[] = saved
    .map((comp) => {
      const asks = nights
        .map((night) => liveAsk(live!.index, comp.id, night.date))
        .filter((ask): ask is number => ask !== null);
      const ask = asks.length > 0 ? Math.round(median(asks)) : 0;
      return {
        id: comp.id,
        name: comp.name,
        area: comp.area,
        beds: comp.beds,
        sleeps: comp.sleeps,
        rating: comp.rating,
        reviews: comp.reviews,
        guestFavorite: comp.guestFavorite,
        distanceMi: comp.distanceMi,
        nextWeekendAsk: ask,
        occupancy: 0,
        score: scoreComp(
          {
            id: comp.id,
            house,
            name: comp.name,
            area: comp.area,
            beds: comp.beds,
            sleeps: comp.sleeps,
            rating: comp.rating,
            reviews: comp.reviews,
            guestFavorite: comp.guestFavorite,
            distanceMi: comp.distanceMi,
            baseGuest: ask,
            occupancy: 0,
          },
          house,
        ),
        fit: isFairComp(house, comp) ? ('close' as const) : isCloseSleep(house, comp.sleeps) && !isNearby(comp.distanceMi) ? ('far' as const) : ('small' as const),
        inBand: liveCompFits(house, comp.sleeps, comp.distanceMi, comp.isOwn, comp.minNights),
      };
    })
    .sort((a, b) => b.score - a.score);
  const cards: CompCard[] = savedCards.length > 0 ? savedCards : listed
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
      fit: isFairComp(house, comp) ? ('close' as const) : isCloseSleep(house, comp.sleeps) && !isNearby(comp.distanceMi) ? ('far' as const) : ('small' as const),
      inBand: inBand.has(comp.id),
    }))
    .sort((a, b) => b.score - a.score);
  const first30 = nights.slice(0, 30);
  const liveNights = nights.filter((night) => night.source !== 'sample').length;
  return {
    house,
    source: liveNights === 0 ? 'sample' : liveNights === nights.length ? 'live' : 'mixed',
    from,
    days,
    targetPercentile: TARGET[house],
    nights,
    comps: cards,
    fit: {
      close: cards.filter((comp) => comp.fit === 'close').length,
      compared: cards.length,
      narrowed: band.narrowed,
    },
    summary: {
      medianAsk: Math.round(median(first30.map((night) => night.median))),
      ourTypical: Math.round(median(first30.map((night) => night.ourGuest))),
      ourPercentile: Math.round(median(first30.map((night) => night.percentile))),
      raiseNights: nights.filter((night) => night.action === 'raise').length,
      promoteNights: nights.filter((night) => night.action === 'promote').length,
      compPace30: Math.round(median(first30.map((night) => night.compBookedShare))),
      liveNights,
      liveComps: live?.comps.length ?? 0,
    },
  };
}
