import { addDays } from './market/dates';
import { nightBeforeIsFree } from './journey';
import type { HouseId } from './market/types';

/** Published sleep counts from the listing titles and the guest guide. */
export const SLEEPS: Record<HouseId, number> = { river: 25, ranch: 20, lindon: 12 };

const LABEL: Record<HouseId, string> = {
  river: 'The River House',
  ranch: 'The Ranch House',
  lindon: 'The Lindon House',
};

export type NearbyPlace = { name: string; note: string };

export type HouseNote = { title: string; body: string };

export type HouseStay = {
  sleeps: number;
  checkIn: string;
  checkOut: string;
  bedrooms: string | null;
  arrival: string;
  parking: string;
  notes: HouseNote[];
  checkout: readonly string[];
  emergency: string;
  nearby: NearbyPlace[];
};

export const STAY_EMERGENCY = 'For a fire, medical emergency, or anyone in danger, call 911 first, then call us.';

/** Published checkout lines. The same list is on every house. Door codes stay off it. */
export const STAY_CHECKOUT = [
  'Start the dishwasher.',
  'Put used towels in the laundry room.',
  'Take kitchen trash to the outside bins.',
  'Turn off lights and the fireplace, close windows.',
  'Lock the door behind you. The lock will reset for the next guests.',
] as const;

/** Public facts from the guest guide. Door codes and Wi-Fi stay off this page. */
const STAY: Record<HouseId, Omit<HouseStay, 'sleeps' | 'emergency' | 'checkout'>> = {
  river: {
    checkIn: '4:00 PM',
    checkOut: '11:00 AM',
    bedrooms: 'Seven king suites, each in its own room, plus an expandable king.',
    arrival: 'Drive up Provo Canyon to Vivian Park. Stock up on groceries in Orem first. AWD or 4WD in winter.',
    parking: 'Park in the driveway and garage. Keep the canyon road clear for plows in winter.',
    notes: [
      { title: 'Septic', body: 'The house is on septic. Only toilet paper goes in the toilets. No wipes, even flushable ones.' },
      {
        title: 'The river',
        body: 'The Provo River runs cold and fast, especially in spring. Watch kids near the bank and wear life jackets on the water.',
      },
    ],
    nearby: [
      { name: 'Sundance Mountain Resort', note: 'Your home mountain. Lessons and rentals at the base.' },
      { name: 'Provo River Parkway', note: 'Paved trail down the canyon for walking and biking.' },
      { name: 'Bridal Veil Falls', note: 'A 600-foot waterfall a short walk from the parking lot.' },
      { name: 'Groceries', note: 'Stock up before you drive up the canyon. There is no grocery store at Vivian Park.' },
    ],
  },
  ranch: {
    checkIn: '4:00 PM',
    checkOut: '11:00 AM',
    bedrooms: null,
    arrival: 'The house is in Lindon, about 45 minutes south of the Salt Lake airport.',
    parking: 'Park in the driveway. Please do not block neighbors.',
    notes: [
      { title: 'Hot tub', body: 'Keep the cover on when not in use. No glass in or near the tub. Kids with an adult only.' },
    ],
    nearby: [
      { name: 'Sundance Mountain Resort', note: 'The closest ski hill. Smaller crowds, great for families and first-timers.' },
      { name: 'Communal', note: 'The best dinner in Utah County. Seasonal, farm-to-table. Reserve ahead.' },
      { name: 'Thanksgiving Point', note: 'Museum of Natural Curiosity, dinosaur museum, gardens, and farm.' },
      { name: 'Oteo', note: 'Regional Mexican, the local favorite in Lindon.' },
    ],
  },
  lindon: {
    checkIn: '4:00 PM',
    checkOut: '11:00 AM',
    bedrooms: null,
    arrival: 'The house is in Lindon, about 15 minutes from BYU and 45 minutes from the Salt Lake airport.',
    parking: 'Park in the driveway.',
    notes: [],
    nearby: [
      { name: 'BYU campus', note: 'Games at LaVell Edwards Stadium, museums, and the Creamery.' },
      { name: 'Sundance Mountain Resort', note: 'The closest ski hill. Smaller crowds, great for families and first-timers.' },
      { name: 'Communal', note: 'The best dinner in Utah County. Seasonal, farm-to-table. Reserve ahead.' },
      { name: 'Thanksgiving Point', note: 'Museum of Natural Curiosity, dinosaur museum, gardens, and farm.' },
    ],
  },
};

export function houseStay(house: HouseId): HouseStay {
  return { sleeps: SLEEPS[house], emergency: STAY_EMERGENCY, ...STAY[house], checkout: STAY_CHECKOUT };
}

/** A direct request names the overnight party. Extra guests are not priced; the party has to fit. */
export function partyFits(house: HouseId, guests: number): { ok: boolean; reason: string | null } {
  if (!Number.isInteger(guests) || guests < 1) {
    return { ok: false, reason: 'Add the number of overnight guests.' };
  }
  const sleeps = SLEEPS[house];
  if (guests > sleeps) return { ok: false, reason: `${LABEL[house]} sleeps ${sleeps}.` };
  return { ok: true, reason: null };
}

function longDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** When the guest phone shows the door code. This page never includes the code. */
export function accessLine(checkIn: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return null;
  const opensOn = addDays(checkIn, -1);
  return `The door code and Wi-Fi open on the guest phone on ${longDate(opensOn)}, the day before check-in, after the house rules are read.`;
}

/** An earlier arrival is only a request, and only when the night before is open. */
export function earlyLine(checkIn: string, taken: readonly string[], asOf: string): string | null {
  if (!accessLine(checkIn) || asOf >= checkIn) return null;
  if (!nightBeforeIsFree(checkIn, taken)) return null;
  return 'The night before is open. Arriving early is a request. The door code still opens the day before.';
}
