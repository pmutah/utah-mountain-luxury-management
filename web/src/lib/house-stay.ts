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

export type PlaceKind = 'ski' | 'food' | 'outdoors' | 'family' | 'essentials';

export type NearbyPlace = { name: string; note: string; area?: string; url?: string; kind: PlaceKind };

const KIND_LABEL: Record<PlaceKind, string> = {
  ski: 'Ski',
  food: 'Food',
  outdoors: 'Outdoors',
  family: 'Family',
  essentials: 'Before you go',
};

const KIND_ORDER: PlaceKind[] = ['ski', 'food', 'outdoors', 'family', 'essentials'];

/** Nearby places in the guest-guide order. An empty group is left off. */
export function nearbyGroups<T extends { kind: PlaceKind }>(
  places: readonly T[],
): Array<{ kind: PlaceKind; label: string; places: T[] }> {
  return KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABEL[kind],
    places: places.filter((place) => place.kind === kind),
  })).filter((group) => group.places.length > 0);
}

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

const RIVER_NEARBY: NearbyPlace[] = [
  { kind: 'ski', name: 'Sundance Mountain Resort', area: 'About 10 minutes up the canyon', note: 'Your home mountain. Lessons and rentals at the base.', url: 'https://www.sundanceresort.com' },
  { kind: 'ski', name: 'Park City and Deer Valley', area: 'About 45 minutes via Heber', note: 'Big resorts and Main Street dining for a day trip.' },
  { kind: 'ski', name: 'Snowbird, Alta, Brighton, Solitude', area: 'About an hour', note: 'Cottonwood Canyon powder days. Leave early for canyon traffic.' },
  { kind: 'food', name: 'Tree Room at Sundance', area: 'Sundance', note: 'Fine dining among Robert Redford’s art collection. Tuesday to Saturday. Reserve ahead.', url: 'https://www.sundanceresort.com/dining/tree-room/' },
  { kind: 'food', name: 'Foundry Grill at Sundance', area: 'Sundance', note: 'Breakfast, lunch, and dinner by the hearth. Sunday brunch is an event.', url: 'https://www.sundanceresort.com/dining/foundry-grill/' },
  { kind: 'food', name: 'Owl Bar at Sundance', area: 'Sundance', note: 'Historic bar with live music and bar food. First come, first served.', url: 'https://www.sundanceresort.com/dining/owl-bar/' },
  { kind: 'food', name: 'Sundance Deli', area: 'Sundance', note: 'Coffee, sandwiches, and pizza to take on a hike.' },
  { kind: 'food', name: 'Communal', area: 'Provo, about 20 minutes', note: 'The best dinner in Utah County. Reserve ahead.' },
  { kind: 'food', name: 'Slackwater', area: 'Riverwoods, Provo', note: 'Pizza and a big patio at the mouth of the canyon.' },
  { kind: 'outdoors', name: 'Provo River tubing and rafting', area: 'Vivian Park', note: 'High Country Adventure runs tubes, rafts, and kayaks that finish at Vivian Park. Spring runoff can close tubing, so check before you go.', url: 'https://highcountryadventure.com' },
  { kind: 'outdoors', name: 'Fly fishing the Provo River', area: 'Right outside', note: 'One of Utah’s best trout rivers. A Utah fishing license is required.' },
  { kind: 'outdoors', name: 'Provo River Parkway', area: 'Starts at Vivian Park', note: 'Paved trail down the canyon for walking and biking.' },
  { kind: 'outdoors', name: 'Stewart Falls', area: 'Sundance', note: 'Easy-moderate hike to a two-tier waterfall. Beautiful in fall color.' },
  { kind: 'outdoors', name: 'Bridal Veil Falls', area: 'Lower Provo Canyon', note: 'A 600-foot waterfall a short walk from the parking lot.' },
  { kind: 'outdoors', name: 'Deer Creek Reservoir', area: 'About 10 minutes up canyon', note: 'Boating, paddle boards, and swimming in summer.' },
  { kind: 'family', name: 'Heber Valley Railroad', area: 'Heber', note: 'Scenic train rides. The Vivian Park run has been paused for track work, so check the schedule.', url: 'https://www.hebervalleyrr.org' },
  { kind: 'essentials', name: 'Winter driving', note: 'AWD or 4WD with good tires from November to April. The canyon road can ice up at night.' },
  { kind: 'essentials', name: 'Groceries', area: 'Orem or Heber', note: 'Stock up before you drive up the canyon. There is no grocery store at Vivian Park.' },
];

const VALLEY_NEARBY: NearbyPlace[] = [
  { kind: 'ski', name: 'Sundance Mountain Resort', area: 'Provo Canyon', note: 'The closest ski hill. Smaller crowds, great for families and first-timers.', url: 'https://www.sundanceresort.com' },
  { kind: 'ski', name: 'Snowbird and Alta', area: 'Little Cottonwood Canyon', note: 'Big-mountain Wasatch skiing. Canyon traffic backs up on powder mornings, so leave early.' },
  { kind: 'ski', name: 'Brighton and Solitude', area: 'Big Cottonwood Canyon', note: 'Relaxed resorts with great snow and night skiing at Brighton.' },
  { kind: 'ski', name: 'Park City and Deer Valley', area: 'Park City', note: 'Two of the largest resorts in the country, plus Main Street for dinner.' },
  { kind: 'food', name: 'Oteo', area: 'Lindon', note: 'Regional Mexican, the local favorite in Lindon.' },
  { kind: 'food', name: 'Eliane French Bakery', area: 'Lindon', note: 'Croissants, tarts, and take-home entrees. Go early.' },
  { kind: 'food', name: 'Communal', area: 'Provo', note: 'The best dinner in Utah County. Seasonal, farm-to-table. Reserve ahead.' },
  { kind: 'food', name: 'Black Sheep Cafe', area: 'Provo', note: 'Southwestern and Native American cooking. Try the Navajo taco.' },
  { kind: 'food', name: 'Station 22', area: 'Provo', note: 'Comfort food in an old firehouse. Great for breakfast and brunch.' },
  { kind: 'food', name: 'La Vaca', area: 'Provo', note: 'Upscale steakhouse for a celebration dinner.' },
  { kind: 'food', name: 'Pizzeria 712', area: 'Orem', note: 'Wood-fired pizza. Reservations help. Closed Sundays.' },
  { kind: 'food', name: 'Slackwater', area: 'Riverwoods, Provo', note: 'Pizza and shareable plates with one of the best patios in the valley.' },
  { kind: 'food', name: 'Rockwell Ice Cream', area: 'Provo', note: 'Small-batch ice cream a block off Center Street.' },
  { kind: 'outdoors', name: 'Provo River Parkway', area: 'Provo Canyon to Utah Lake', note: 'Paved trail for walking and biking along the river.' },
  { kind: 'outdoors', name: 'Bridal Veil Falls', area: 'Provo Canyon', note: 'A 600-foot waterfall a short walk from the parking lot.' },
  { kind: 'outdoors', name: 'Timpanogos Cave', area: 'American Fork Canyon', note: 'Guided cave tours in summer. Tickets sell out, so book ahead.', url: 'https://www.nps.gov/tica' },
  { kind: 'family', name: 'Thanksgiving Point', area: 'Lehi', note: 'Museum of Natural Curiosity, dinosaur museum, gardens, and farm.' },
  { kind: 'family', name: 'BYU campus', area: 'Provo', note: 'Games at LaVell Edwards Stadium, museums, and the Creamery.' },
  { kind: 'essentials', name: 'Most local restaurants close on Sundays', note: 'Plan Sunday meals ahead or cook at the house.' },
];

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
    nearby: RIVER_NEARBY,
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
    nearby: VALLEY_NEARBY,
  },
  lindon: {
    checkIn: '4:00 PM',
    checkOut: '11:00 AM',
    bedrooms: null,
    arrival: 'The house is in Lindon, about 15 minutes from BYU and 45 minutes from the Salt Lake airport.',
    parking: 'Park in the driveway.',
    notes: [],
    nearby: VALLEY_NEARBY,
  },
};

export function houseStay(house: HouseId): HouseStay {
  return { sleeps: SLEEPS[house], emergency: STAY_EMERGENCY, ...STAY[house], checkout: STAY_CHECKOUT };
}

/** A direct request names the overnight party. Children count toward that number. Extra guests are not priced. */
export function partyFits(house: HouseId, guests: number, children?: number): { ok: boolean; reason: string | null } {
  if (!Number.isInteger(guests) || guests < 1) {
    return { ok: false, reason: 'Add the number of overnight guests.' };
  }
  const sleeps = SLEEPS[house];
  if (guests > sleeps) return { ok: false, reason: `${LABEL[house]} sleeps ${sleeps}.` };
  if (children !== undefined && children !== 0) {
    if (!Number.isInteger(children) || children < 0 || children > guests) {
      return { ok: false, reason: 'Children are part of the overnight guests.' };
    }
    if (children === guests) return { ok: false, reason: 'A stay needs an adult.' };
  }
  return { ok: true, reason: null };
}

/** The party line a request note would include. This does not send the request. */
export function partyNote(guests: string, children: string): string {
  if (!/^\d+$/.test(guests)) return '';
  const count = Number(guests);
  if (count < 1) return '';
  if (!/^\d+$/.test(children)) return `Overnight guests ${count}.`;
  const kids = Number(children);
  if (kids < 1 || kids > count) return `Overnight guests ${count}.`;
  return `Overnight guests ${count}, including ${kids} ${kids === 1 ? 'child' : 'children'}.`;
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

const CODE_HOUSES = ['river', 'ranch', 'lindon'] as const;
const CODE_LABEL: Record<(typeof CODE_HOUSES)[number], string> = { river: 'River', ranch: 'Ranch', lindon: 'Lindon' };

/** How many door codes open tomorrow. Names and the codes stay off the sentence. */
export function codesOpenTomorrow(
  stays: readonly { propertyId: string; checkIn: string; checkOut: string; status?: string }[],
  asOf: string,
  page: 'brief' | 'list',
): string {
  const where = page === 'brief' ? 'this brief' : 'this list';
  const none = `No door code opens on the guest phone tomorrow. Codes stay off ${where}.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return none;
  const tomorrow = addDays(asOf, 1);
  const counts: Record<(typeof CODE_HOUSES)[number], number> = { river: 0, ranch: 0, lindon: 0 };
  for (const stay of stays) {
    if (stay.status === 'cancelled' || stay.status === 'blocked') continue;
    if (stay.propertyId !== 'river' && stay.propertyId !== 'ranch' && stay.propertyId !== 'lindon') continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(stay.checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(stay.checkOut)) continue;
    if (stay.checkOut <= stay.checkIn) continue;
    if (addDays(stay.checkIn, -1) !== tomorrow) continue;
    counts[stay.propertyId] += 1;
  }
  const parts = CODE_HOUSES.filter((house) => counts[house] > 0).map((house) => `${CODE_LABEL[house]} ${counts[house]}`);
  if (parts.length === 0) return none;
  return `Door codes that open tomorrow on the guest phone: ${parts.join(', ')}. Codes stay off ${where}.`;
}

/** When this stay's door code opens, without the code. Past stays say the code stays off the list. */
export function hostAccessPhrase(checkIn: string, checkOut: string, asOf: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return null;
  if (checkOut <= checkIn) return null;
  if (asOf >= checkOut) return 'This stay has checked out. The door code stays off this list.';
  const opensOn = addDays(checkIn, -1);
  if (asOf >= opensOn) return 'The door code can be on the guest phone now. It stays off this list.';
  return accessLine(checkIn);
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
