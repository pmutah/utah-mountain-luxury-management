import { SLEEPS, houseStay } from './house-stay';
import { RIVER_UNIT_DETAIL } from './river-units';
import type { HouseId } from './market/types';

/**
 * What each house is, in the words and pictures a guest deciding where to stay needs.
 *
 * Everything here comes from the listing the house already runs on — bed counts and room names from the
 * public VRBO and Airbnb pages, the River details from our own Hospitable property page. Nothing is
 * invented: a house that has not published a fact does not claim it.
 *
 * Capacities are never written down here. They are read from `SLEEPS` and `RIVER_UNIT_DETAIL`, because a
 * second copy is how the River House was once sold as sleeping 25 while the listing said 22. The guards in
 * `sleeps-truth.test.ts` and `part-capacity-truth.test.ts` fail on a literal in this file.
 */

export type HouseHighlight = {
  /** A short noun for the icon slot. The component maps this to a glyph. */
  icon: 'group' | 'water' | 'tub' | 'kitchen' | 'fire' | 'games' | 'mountain' | 'location' | 'bed';
  title: string;
  detail: string;
};

export type HouseRoom = {
  name: string;
  beds: string;
  /** The level or wing, so a big house reads as separate spaces rather than one number. */
  where: string;
  note?: string;
};

export type AmenityGroup = {
  title: string;
  items: string[];
};

export type HouseProfile = {
  /** One sentence for a card and the page subtitle. */
  tagline: string;
  /** Square footage and setting, as the listing states them. */
  scale: string;
  /** Two or three short paragraphs. Plain sentences, no marketing filler. */
  story: string[];
  highlights: HouseHighlight[];
  rooms: HouseRoom[];
  amenityGroups: AmenityGroup[];
  /** The nearest town and the drive a guest actually cares about. */
  setting: string;
};

/** "1 bedroom", "4 bedrooms" — a counting noun that does not read as a bug on the one-bedroom part. */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * The Ranch House — 270 East Center Street, Lindon.
 *
 * Bed layout and amenity list are the ones the VRBO and Airbnb listings already publish for this house.
 */
const RANCH: HouseProfile = {
  tagline: 'A group house with a game room, a big yard, and a hot tub under the pergola.',
  scale: '4,600 sq ft on a half-acre lot in Lindon',
  story: [
    'The Ranch House is built for a family reunion, a wedding weekend, or a team that wants to eat together and then scatter. The main floor holds the kitchen, the dining table, and a living room with a brick fireplace. The lower level is the fun one: a pool table, theater seating, an arcade, and a bar.',
    'Six of the bedrooms have king beds, which is unusual at this size, and two more rooms sleep four each in twin bunks. Everyone gets a real bed.',
    'Outside there is a pergola over the hot tub, a gas fire pit with chairs around it, a fenced yard, garden beds, and a large driveway that parks a crowd.',
  ],
  highlights: [
    { icon: 'tub', title: 'Hot tub and fire pit', detail: 'Under a timber pergola strung with lights, open year round.' },
    { icon: 'games', title: 'A game room for the group', detail: 'Pool table, arcade cabinet, theater seating, and a bar downstairs.' },
    { icon: 'group', title: 'Six king beds', detail: 'Every adult gets a king, with bunk rooms for the kids.' },
    { icon: 'location', title: 'Minutes from the venues', detail: 'A short drive to Walker Farms, Wadley Farms, and BYU.' },
  ],
  rooms: [
    { name: 'Master bedroom', beds: '1 king', where: 'Main level', note: 'The largest room, on the main floor.' },
    { name: 'Upstairs guest room 1', beds: '1 king', where: 'Upper level' },
    { name: 'Upstairs guest room 2', beds: '1 king', where: 'Upper level' },
    { name: 'Upstairs guest room 3', beds: '2 twin bunks', where: 'Upper level', note: 'Sleeps four in two bunks.' },
    { name: 'Basement bedroom 1', beds: '1 king', where: 'Lower level' },
    { name: 'Basement bedroom 2', beds: '2 twin bunks', where: 'Lower level', note: 'Sleeps four in two bunks.' },
    { name: 'Basement bedroom 3', beds: '1 king', where: 'Lower level' },
    { name: 'Casita', beds: '1 king', where: 'Detached, off the garage', note: 'Its own bath and kitchenette, apart from the main house.' },
    { name: 'Baths', beds: '4 full baths', where: 'Main, upper, and lower levels' },
  ],
  amenityGroups: [
    {
      title: 'Outdoors',
      items: ['Hot tub under a pergola', 'Gas fire pit with seating', 'Fenced yard and lawn', 'Garden beds', 'Patio furniture'],
    },    {
      title: 'Games and entertainment',
      items: ['Pool table', 'Stand-up arcade', 'Theater seating and a bar', 'Smart TVs', 'Fast Wi-Fi'],
    },
    {
      title: 'Kitchen and dining',
      items: ['Full kitchen with a wide island', 'Stainless appliances', 'Dining table for the group', 'Coffee maker', 'Dishwasher'],
    },
    {
      title: 'Comfort and family',
      items: ['Air conditioning', 'Washer and dryer', 'Linens and towels', 'Pack ’n play', 'High chair'],
    },
    {
      title: 'Parking',
      items: ['Large driveway', 'Off-street parking for a group', 'Garage'],
    },
  ],
  setting:
    'Lindon, in north Utah County. About 45 minutes from the Salt Lake airport, 15 minutes from BYU, and a short drive to the Provo Canyon mouth.',
};

/** The Lindon House — 143 Harcliff Circle, Lindon. A family home across from the Lindon Aquatics Center. */
const LINDON: HouseProfile = {
  tagline: 'A remodeled family home across the street from the Lindon Aquatics Center.',
  scale: 'About 3,200 sq ft in Lindon',
  story: [
    'The Lindon House is the quiet one. It is a 1950s home that has been taken back to the studs and rebuilt, with a stone fireplace in the living room and a mountain view out the kitchen window.',
    'It has four bedrooms, a downstairs suite, and a sleeper in the living room, with two full baths — one on each level.',
    'The location is the reason guests pick it: the Lindon Aquatics Center is directly across the street, BYU and UVU are a short drive, and the Provo Canyon mouth is close enough for a canyon day.',
  ],
  highlights: [
    { icon: 'water', title: 'Across from the aquatics center', detail: 'Lazy river, slides, and a FlowRider, a 30-second walk away.' },
    { icon: 'bed', title: 'Room for a family', detail: 'Four bedrooms plus a downstairs suite.' },
    { icon: 'mountain', title: 'Mountain views', detail: 'Mount Timpanogos fills the kitchen window.' },
    { icon: 'location', title: 'Close to BYU and UVU', detail: 'About 15 minutes to BYU and 10 to UVU.' },
  ],
  rooms: [
    { name: 'Bedroom 1', beds: '1 king', where: 'Main level' },
    { name: 'Bedroom 2', beds: '1 queen', where: 'Main level' },
    { name: 'Bedroom 3', beds: '1 queen', where: 'Main level' },
    { name: 'Downstairs suite', beds: '1 king and 1 queen sofa bed', where: 'Lower level', note: 'The most private room in the house.' },
    { name: 'Living room', beds: '1 queen futon', where: 'Main level' },
    { name: 'Baths', beds: '2 full baths', where: 'One per level' },
  ],
  amenityGroups: [
    {
      title: 'In the house',
      items: ['Stone fireplace', 'Full kitchen', 'Coffee and tea station', 'Washer and dryer', 'Smart TVs', 'Air conditioning'],
    },
    {
      title: 'Outside',
      items: ['Private balcony with bistro seating', 'Covered front porch', 'Fenced yard', 'Barbecue grill', 'Off-street parking'],
    },
    {
      title: 'Nearby',
      items: ['Lindon Aquatics Center next door', 'Utah Lake minutes away', 'Provo Canyon and Sundance', 'BYU and UVU', 'Restaurants and groceries close'],
    },
  ],
  setting:
    'Lindon, in north Utah County. Across the street from the Lindon Aquatics Center, about 15 minutes from BYU and 45 minutes from the Salt Lake airport.',
};

const RIVER_BEDROOMS = RIVER_UNIT_DETAIL.reduce((sum, unit) => sum + unit.bedrooms, 0);
const RIVER_BATHS = RIVER_UNIT_DETAIL.reduce((sum, unit) => sum + unit.baths, 0);

/**
 * The River House — Vivian Park, Provo Canyon.
 *
 * The room list is built from `RIVER_UNIT_DETAIL`, so the wing names and capacities match the parts a guest
 * can actually book. The bedroom names come from the published floor plans (main level: den, office,
 * mudroom, great room, kitchen, dining; upper level: master, guest suites, bunk room, loft, bonus room).
 */
const RIVER: HouseProfile = {
  tagline: 'A riverside lodge on the Provo River at Vivian Park, built for large groups.',
  scale: 'About 7,000 sq ft on the Provo River at Vivian Park',
  story: [
    'The River House is a new lodge on the Provo River, at the top of Provo Canyon where the paved river trail ends. It sleeps a full group without anyone doubling up, with king beds across the suites and bunks for the kids.',
    'The main floor is one open room: a great room with a fireplace, a dining table for the whole party, and a kitchen built around a long island. A second kitchen in the recreation wing handles catering or a second family cooking at once.',
    'Outside there is river frontage, a hot tub, a barrel sauna, a fire pit, parking for a crowd, and three EV chargers. Sundance is a short drive up the canyon.',
  ],
  highlights: [
    { icon: 'water', title: 'On the Provo River', detail: 'River frontage at Vivian Park, where the paved canyon trail ends.' },
    { icon: 'tub', title: 'Hot tub and barrel sauna', detail: 'Outside, with the river running past.' },
    { icon: 'kitchen', title: 'Two kitchens', detail: 'A main kitchen with a long island, plus a second in the recreation wing.' },
    { icon: 'games', title: 'A heated game garage', detail: 'About 850 sq ft of games and river gear.' },
  ],
  rooms: [
    ...RIVER_UNIT_DETAIL.map((unit) => ({
      name: unit.name.replace('River ', ''),
      beds: `${plural(unit.bedrooms, 'bedroom')} · ${plural(unit.beds, 'bed')} · ${plural(unit.baths, 'bath')}`,
      where: unit.id === 'main-lodge' ? 'The main house' : unit.id === 'recreation-wing' ? 'The recreation wing' : 'Over the garage',
      note: `Sleeps ${unit.sleeps}.`,
    })),
    {
      name: 'Whole house',
      beds: `${plural(RIVER_BEDROOMS, 'bedroom')} · ${plural(RIVER_BATHS, 'bath')}`,
      where: 'All three parts together',
      note: `Sleeps ${SLEEPS.river}.`,
    },
  ],
  amenityGroups: [
    {
      title: 'Outside',
      items: ['Provo River frontage', 'Hot tub', 'Barrel sauna', 'Fire pit', 'Three EV chargers', 'Parking for a crowd'],
    },
    {
      title: 'In the house',
      items: ['Two kitchens', 'Great room with a fireplace', 'Dining for the full group', 'Heated game garage', 'Recreation room and den', 'Office and laundry'],
    },
    {
      title: 'Comfort',
      items: ['Air conditioning', 'Washer and dryer', 'Linens and towels', 'Fast Wi-Fi', 'Dedicated workspace'],
    },
    {
      title: 'Nearby',
      items: ['Sundance Mountain Resort', 'Provo River Parkway trail', 'Bridal Veil Falls', 'Deer Creek Reservoir', 'Park City, about an hour'],
    },
  ],
  setting:
    'Vivian Park, in Provo Canyon. About 10 minutes to Sundance, 25 minutes to Provo and Orem, and an hour from Park City.',
};

const PROFILES: Record<HouseId, HouseProfile> = { ranch: RANCH, lindon: LINDON, river: RIVER };

/** The profile for a house. */
export function houseProfile(house: HouseId): HouseProfile {
  return PROFILES[house];
}

/**
 * Bedroom and bath counts, as each listing publishes them.
 *
 * Separate from `SLEEPS` because these are room counts, not occupancy, and a guard pins the occupancy
 * figures. The bedroom numbers are the ones on the live listings: Ranch lists 8 bedrooms and 4 baths,
 * Lindon lists 4 bedrooms and 2 baths, and River's totals are summed from the wing table.
 */
const BEDROOMS: Record<HouseId, number> = { ranch: 8, lindon: 4, river: RIVER_BEDROOMS };
const BATHS: Record<HouseId, number> = { ranch: 4, lindon: 2, river: RIVER_BATHS };

/** The headline facts a card or the top of a listing shows, built from the same source as the page. */
export function houseFacts(house: HouseId): Array<{ label: string; value: string }> {
  const stay = houseStay(house);
  return [
    { label: 'Guests', value: `Sleeps ${stay.sleeps}` },
    { label: 'Bedrooms', value: String(BEDROOMS[house]) },
    { label: 'Baths', value: String(BATHS[house]) },
    { label: 'Check-in', value: stay.checkIn },
    { label: 'Check-out', value: stay.checkOut },
  ];
}

/**
 * A short amenity line for a property card: the three or four things that actually decide the booking.
 *
 * These are chosen per house rather than derived, because "what matters most" is an editorial judgement —
 * a hot tub sells the Ranch House, the river sells the River House, and the pool across the street sells
 * the Lindon House. The list is short on purpose: a card is not a spec sheet. The sleep count is read from
 * `SLEEPS` so the card cannot drift from the booking gate.
 */
const CARD_AMENITIES: Record<HouseId, string[]> = {
  ranch: ['Hot tub', 'Game room', 'Fire pit'],
  lindon: ['Across from the pool', 'Mountain views', 'Full kitchen'],
  river: ['On the Provo River', 'Hot tub & sauna', 'Two kitchens'],
};

/** The three or four amenities a card shows, ending with the sleep count. */
export function cardAmenities(house: HouseId): string[] {
  return [...CARD_AMENITIES[house], `Sleeps ${SLEEPS[house]}`];
}
