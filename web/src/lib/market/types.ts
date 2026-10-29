export type HouseId = 'ranch' | 'lindon' | 'river';

export type NightRow = {
  date: string;
  season: string | null;
  ourGuest: number;
  floorGuest: number;
  p25: number;
  median: number;
  p75: number;
  openComps: number;
  percentile: number;
  proposedGuest: number;
  action: 'hold' | 'raise' | 'promote' | 'locked';
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
