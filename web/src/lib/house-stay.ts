import type { HouseId } from './market/types';

/** Published sleep counts from the listing titles and the guest guide. */
export const SLEEPS: Record<HouseId, number> = { river: 25, ranch: 20, lindon: 12 };

const LABEL: Record<HouseId, string> = {
  river: 'The River House',
  ranch: 'The Ranch House',
  lindon: 'The Lindon House',
};

export type NearbyPlace = { name: string; note: string };

export type HouseStay = {
  sleeps: number;
  checkIn: string;
  checkOut: string;
  bedrooms: string | null;
  arrival: string;
  parking: string;
  nearby: NearbyPlace[];
};

/** Public facts from the guest guide. Door codes and Wi-Fi stay off this page. */
const STAY: Record<HouseId, Omit<HouseStay, 'sleeps'>> = {
  river: {
    checkIn: '4:00 PM',
    checkOut: '11:00 AM',
    bedrooms: 'Seven king suites, each in its own room, plus an expandable king.',
    arrival: 'Drive up Provo Canyon to Vivian Park. Stock up on groceries in Orem first. AWD or 4WD in winter.',
    parking: 'Park in the driveway and garage. Keep the canyon road clear for plows in winter.',
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
    nearby: [
      { name: 'BYU campus', note: 'Games at LaVell Edwards Stadium, museums, and the Creamery.' },
      { name: 'Sundance Mountain Resort', note: 'The closest ski hill. Smaller crowds, great for families and first-timers.' },
      { name: 'Communal', note: 'The best dinner in Utah County. Seasonal, farm-to-table. Reserve ahead.' },
      { name: 'Thanksgiving Point', note: 'Museum of Natural Curiosity, dinosaur museum, gardens, and farm.' },
    ],
  },
};

export function houseStay(house: HouseId): HouseStay {
  return { sleeps: SLEEPS[house], ...STAY[house] };
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
