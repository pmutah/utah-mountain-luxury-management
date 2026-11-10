export type HouseId = 'ranch' | 'lindon' | 'river';

/**
 * Where a night's band came from.
 *
 * `thin` means a saved ask is present but the band has fewer than three observations, so it is not a
 * market: there is no meaningful percentile to place our rate in. The host's own ask is still shown,
 * because hiding it would be worse, but the board must not call it live.
 */
export type BoardSource = 'sample' | 'live' | 'mixed' | 'thin';

export type NightRow = {
  date: string;
  season: string | null;
  ourGuest: number;
  floorGuest: number;
  /** Open comp asks for this night. The what-if uses these to place a trial price. */
  compRates: number[];
  p25: number;
  median: number;
  p75: number;
  openComps: number;
  percentile: number;
  proposedGuest: number;
  /** 20 only when the fill rules say to discount this night on Airbnb and VRBO. The base is proposedGuest. */
  promotionPercent: 0 | 20;
  /** Guest price after that promotion, never under the floor. Equals proposedGuest when the percent is 0. */
  offerGuest: number;
  /** Direct booking minimum for this night. One means the house does not add a longer stay. */
  minNights: number;
  action: 'hold' | 'raise' | 'promote' | 'locked' | 'booked' | 'closed' | 'paused';
  reason: string;
  compBookedShare: number;
  /** Where this night's band came from. A night with no saved comp ask stays on the sample. */
  source: BoardSource;
};

export type CompCard = {
  id: string;
  name: string;
  area: string;
  beds: number;
  sleeps: number;
  rating: number;
  reviews: number;
  guestFavorite: boolean;
  distanceMi: number;
  nextWeekendAsk: number;
  occupancy: number;
  score: number;
  fit: 'close' | 'small' | 'far';
  inBand: boolean;
};

export type MarketBoard = {
  house: HouseId;
  /** 'sample' means every ask is a stand-in. 'live' means saved asks set every night. 'mixed' is both. */
  source: BoardSource;
  from: string;
  days: number;
  targetPercentile: number;
  nights: NightRow[];
  comps: CompCard[];
  /** How many listed samples sleep close to this house, and whether the band dropped the rest. */
  fit: { close: number; compared: number; narrowed: boolean };
  summary: {
    medianAsk: number;
    /**
     * The median of **measured** nights only, or null when the window holds no real comp ask.
     *
     * `medianAsk` includes nights priced off the sample fixture set, so on a house with thin coverage it can be entirely
     * invented. This is the figure a host should read as the market.
     */
    liveMedianAsk: number | null;
    /** Of the first 30 nights, how many carry a real ask rather than the sample fallback. */
    measuredNights: number;
    ourTypical: number;
    ourPercentile: number;
    raiseNights: number;
    promoteNights: number;
    compPace30: number;
    /** Nights in this window whose band used a saved comp ask. */
    liveNights: number;
    /** How many saved comps were offered to the board. Zero means the sample set only. */
    liveComps: number;
  };
};

