import { riverHolidayNights } from './market/seasons';
import type { HouseId } from './market/types';
import { MAX_NIGHTS } from './quote';

const WEEKEND =
  'A Friday or Saturday by itself waits until it is inside 7 days. Otherwise book both weekend nights.';

/** Published booking rules. No price, and this does not say a night is open. */
export function bookingRules(house: HouseId): string[] {
  const cap = `A request can cover up to ${MAX_NIGHTS} nights.`;
  if (house !== 'river') return ['A weekday can be 1 night.', WEEKEND, cap];
  const holidays = riverHolidayNights()
    .map((row) => `${row.name} is ${row.nights} nights`)
    .join('. ');
  return ['A stay is at least 2 nights.', `Holidays ask for more. ${holidays}.`, WEEKEND, cap];
}
