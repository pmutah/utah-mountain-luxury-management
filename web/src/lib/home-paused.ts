import { RIVER_FIRST_STAY } from './brand';
import { bookingRules } from './booking-rules';
import { houseNextEventLine } from './event-plan';
import { nextEventLine } from './market/events';
import { rateGuardLine } from './market/whatif';
import type { HouseId } from './market/types';
import { denverHour, homeQuietLine, quietNow } from './stay-rhythm';
import { requestClosedLine } from './house-rules';
import { addonMenuLine } from './upsells';

/** What the home page can still say when the bookings cannot be read. No price. */
export function homePausedLines(asOf: string, hour = denverHour()): string[] {
  return [
    'Saved bookings could not be read. No night is raised or promoted. Nothing was written over them.',
    requestClosedLine(),
    nextEventLine(asOf),
    ...(asOf < RIVER_FIRST_STAY
      ? ['The River House is not on an event that ends before November 1. Nothing extra is added for an event.']
      : []),
    rateGuardLine(),
    homeQuietLine(hour),
  ];
}

/** What a house tab can still say when that house's bookings cannot be read. No price. */
export function housePausedLines(house: HouseId, asOf: string, hour = denverHour()): string[] {
  return [
    ...bookingRules(house),
    addonMenuLine(house),
    houseNextEventLine(house, asOf),
    rateGuardLine(),
    quietNow(house, hour),
  ];
}
