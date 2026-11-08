import type { Reservation } from './api';
import { addDays } from './market/dates';
import { noteChildCount, noteGuestCount } from './note-party';
import { noteArrivesAt1, noteLeavesAt2 } from './turn-clock';
import type { HouseId } from './luxury';

const HOUSES: HouseId[] = ['ranch', 'lindon', 'river'];

const HOUSE_NAME: Record<HouseId, string> = {
  ranch: 'Ranch',
  lindon: 'Lindon',
  river: 'River',
};

export type StayMove = {
  id: string;
  house: HouseId;
  houseName: string;
  guest: string;
  date: string;
  kind: 'arrival' | 'departure';
  nights: number;
};

export type TodayDesk = {
  asOf: string;
  arrivals: StayMove[];
  departures: StayMove[];
  openNext30: Record<HouseId, number>;
};

function isHouse(id: string): id is HouseId {
  return id === 'ranch' || id === 'lindon' || id === 'river';
}

function nightsBetween(checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / 86400000);
}

function liveStays(reservations: Reservation[]): Reservation[] {
  return reservations.filter(
    (stay) => isHouse(stay.propertyId) && stay.status !== 'cancelled' && stay.status !== 'blocked',
  );
}

export type Turnover = {
  id: string;
  house: HouseId;
  houseName: string;
  checkout: string;
  nextCheckIn: string | null;
  nextCheckOut: string | null;
  /** Nights empty between checkout and the next arrival. Zero is a same-day clean. */
  gapNights: number | null;
  /** Guest count from the next booking note. Null when the note does not say. Names are not stored. */
  nextGuests: number | null;
  /** Children named beside an adult count on the next booking. Null when the note does not say. */
  nextChildren: number | null;
  /** The next stay's id, used to read a preference arrival time. Null when nothing follows. */
  nextStayId: string | null;
  /** This checkout's id, used to read a preference departure time. */
  checkoutStayId: string;
  /** Guest count from the checkout booking note. Null when the note does not say. Names are not stored. */
  checkoutGuests: number | null;
  /** Children named beside an adult count on this checkout. Null when the note does not say. */
  checkoutChildren: number | null;
  /** The checkout note names a 2:00 PM leave. The rest of the note is not stored. */
  leaveAt2: boolean;
  /** The next stay note names a 1:00 PM arrival. The rest of the note is not stored. */
  arriveAt1: boolean;
};

export function buildTurnovers(reservations: Reservation[], asOf: string, horizonDays = 14): Turnover[] {
  /*
   * `< until` excluded a checkout that lands exactly on the horizon. With `asOf` 2026-11-08 and a
   * 14-day horizon, `until` is 2026-11-22, so a confirmed Lindon checkout on 2026-11-22 was dropped —
   * and that turn is a **same-day** clean with the next guest arriving that afternoon. A cleaner's
   * page read "No turnover in the next two weeks" while the most urgent job of the fortnight was the
   * one hidden by the boundary. The horizon is inclusive: a clean due on day 14 is due.
   */
  const until = addDays(asOf, horizonDays);
  const stays = liveStays(reservations);
  return stays
    .filter((stay) => stay.checkOut >= asOf && stay.checkOut <= until)
    .map((stay) => {
      const house = stay.propertyId as HouseId;
      const next = stays
        .filter((other) => other.propertyId === house && other.checkIn >= stay.checkOut && other.id !== stay.id)
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
      return {
        id: `turn-${stay.id}`,
        house,
        houseName: HOUSE_NAME[house],
        checkout: stay.checkOut,
        nextCheckIn: next?.checkIn ?? null,
        nextCheckOut: next?.checkOut ?? null,
        gapNights: next ? nightsBetween(stay.checkOut, next.checkIn) : null,
        nextGuests: next ? noteGuestCount(next.note) : null,
        nextChildren: next ? noteChildCount(next.note) : null,
        nextStayId: next?.id ?? null,
        checkoutStayId: stay.id,
        checkoutGuests: noteGuestCount(stay.note),
        checkoutChildren: noteChildCount(stay.note),
        leaveAt2: noteLeavesAt2(stay.note),
        arriveAt1: next ? noteArrivesAt1(next.note) : false,
      };
    })
    .sort((a, b) => a.checkout.localeCompare(b.checkout) || a.house.localeCompare(b.house));
}

export function buildTodayDesk(reservations: Reservation[], asOf: string, horizonDays = 7): TodayDesk {
  const until = addDays(asOf, horizonDays);
  const stays = liveStays(reservations);
  const moves = (kind: 'arrival' | 'departure', dateOf: (stay: Reservation) => string): StayMove[] =>
    stays
      .filter((stay) => {
        const date = dateOf(stay);
        return date >= asOf && date < until;
      })
      .map((stay) => ({
        id: `${kind}-${stay.id}`,
        house: stay.propertyId as HouseId,
        houseName: HOUSE_NAME[stay.propertyId as HouseId],
        guest: stay.guestName || 'Guest',
        date: dateOf(stay),
        kind,
        nights: nightsBetween(stay.checkIn, stay.checkOut),
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.house.localeCompare(b.house));

  const openNext30 = { ranch: 0, lindon: 0, river: 0 };
  const taken = new Set<string>();
  for (const stay of stays) {
    let cursor = stay.checkIn;
    while (cursor < stay.checkOut) {
      taken.add(`${stay.propertyId}|${cursor}`);
      cursor = addDays(cursor, 1);
    }
  }
  for (const house of HOUSES) {
    let cursor = asOf;
    const stop = addDays(asOf, 30);
    while (cursor < stop) {
      if (!taken.has(`${house}|${cursor}`) && (house !== 'river' || cursor >= '2026-11-01')) openNext30[house] += 1;
      cursor = addDays(cursor, 1);
    }
  }

  return {
    asOf,
    arrivals: moves('arrival', (stay) => stay.checkIn),
    departures: moves('departure', (stay) => stay.checkOut),
    openNext30,
  };
}
