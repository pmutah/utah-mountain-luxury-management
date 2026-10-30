export type HouseId = 'ranch' | 'lindon' | 'river';

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
  action: 'hold' | 'raise' | 'promote' | 'locked' | 'booked' | 'closed' | 'paused';
  reason: string;
  compBookedShare: number;
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
};

export type MarketBoard = {
  house: HouseId;
  source: 'sample';
  from: string;
  days: number;
  targetPercentile: number;
  nights: NightRow[];
  comps: CompCard[];
  summary: {
    medianAsk: number;
    ourTypical: number;
    ourPercentile: number;
    raiseNights: number;
    promoteNights: number;
    compPace30: number;
  };
};
