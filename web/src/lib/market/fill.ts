import { addDays, isWeekendNight, weekdayIndex } from './dates';

export type YearPace = 'unknown' | 'short' | 'met';

export type FillDecision = {
  percent: 0 | 20;
  offerGuest: number;
  reason: string;
};

function leadDays(asOf: string, iso: string): number {
  const [ay, am, ad] = asOf.split('-').map(Number);
  const [by, bm, bd] = iso.split('-').map(Number);
  const start = Date.UTC(ay!, am! - 1, ad);
  const end = Date.UTC(by!, bm! - 1, bd);
  return Math.round((end - start) / 86_400_000);
}

/** Friday and Saturday of the Sunday-start week that holds this night. */
export function weekWeekend(iso: string): { friday: string; saturday: string } {
  const sunday = addDays(iso, -weekdayIndex(iso));
  return { friday: addDays(sunday, 5), saturday: addDays(sunday, 6) };
}

/**
 * Whether this open night gets the 20% fill promotion.
 * The published base is not reduced here. The offer is the base after 20%, floored.
 */
export function promotionForNight(input: {
  date: string;
  asOf: string;
  holiday: boolean;
  ourGuest: number;
  floorGuest: number;
  taken: Set<string>;
  pace: YearPace;
}): FillDecision {
  const base = input.ourGuest;
  if (input.pace === 'met') {
    return { percent: 0, offerGuest: base, reason: 'The year is on the books. No promotion.' };
  }
  if (input.pace === 'unknown') {
    return { percent: 0, offerGuest: base, reason: 'Year pace is not loaded, so no promotion is recommended.' };
  }
  const lead = leadDays(input.asOf, input.date);
  const weekend = isWeekendNight(input.date);
  const { friday, saturday } = weekWeekend(input.date);
  const weekendBooked = input.taken.has(friday) && input.taken.has(saturday);
  let eligible: boolean;
  let waiting: string;
  let due: string;
  if (input.holiday) {
    eligible = lead >= 0 && lead <= 14;
    waiting = 'Holiday rate stays. A promotion waits until 14 days out.';
    due = 'Holiday is inside 14 days. 20% off the base on Airbnb and VRBO. The base stays.';
  } else if (weekend) {
    eligible = lead >= 0 && lead <= 21;
    waiting = 'Weekend stays at the base until 21 days out.';
    due = 'Open weekend inside 21 days. 20% off the base on Airbnb and VRBO. The base stays.';
  } else if (weekendBooked) {
    eligible = lead >= 0;
    waiting = 'Weekday promotion waits until that Friday and Saturday are booked, or until 21 days out.';
    due = 'Friday and Saturday are booked. 20% off this weekday on Airbnb and VRBO. The base stays.';
  } else {
    eligible = lead >= 0 && lead <= 21;
    waiting = 'Weekday promotion waits until that Friday and Saturday are booked, or until 21 days out.';
    due = 'Open weekday inside 21 days. 20% off the base on Airbnb and VRBO. The base stays.';
  }
  if (!eligible) return { percent: 0, offerGuest: base, reason: waiting };
  const raw = Math.round(base * 0.8);
  if (raw < input.floorGuest) {
    return { percent: 0, offerGuest: base, reason: 'The floor stops a promotion. The base stays.' };
  }
  return { percent: 20, offerGuest: raw, reason: due };
}
