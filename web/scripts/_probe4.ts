import { bookingRequestHold } from '../src/lib/booking-request.ts';
import { holdConflict } from '../src/lib/booking-hold.ts';
import { denverToday } from '../src/lib/market/dates.ts';

/*
 * The two functions that only run once `bookingRequestHold` returns null — which it only does when a
 * party is known. Every request without `guests` returns 409 from inside that function, so `guests` is
 * not the cause: it is the field that lets execution get past the early return and reach this code.
 */
const asOf = denverToday();
const stays: never[] = [];
const blocks: never[] = [];

for (const guests of [undefined, 6]) {
  try {
    const hold = bookingRequestHold({
      propertyId: 'ranch',
      checkIn: '2027-01-10',
      checkOut: '2027-01-13',
      stays,
      blocks,
      asOf,
      ...(guests === undefined ? {} : { guests }),
    } as never);
    console.log('bookingRequestHold guests=' + guests, '->', JSON.stringify(hold));

    if (hold === null) {
      try {
        const conflict = holdConflict([], [], 'ranch', '', '2027-01-10', '2027-01-13', new Date());
        console.log('  holdConflict ->', JSON.stringify(conflict));
      } catch (e) {
        console.log('  holdConflict THREW:', (e as Error).message);
        console.log((e as Error).stack?.split('\n').slice(1, 5).join('\n'));
      }
    }
  } catch (e) {
    console.log('bookingRequestHold guests=' + guests, 'THREW:', (e as Error).message);
    console.log((e as Error).stack?.split('\n').slice(1, 5).join('\n'));
  }
}
