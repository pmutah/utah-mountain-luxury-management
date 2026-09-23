import { kvGet, kvPut } from './kv-json';
import type { SettingsEnv } from './kv';
import { PROPERTIES } from './data';
import { SURVEY_PHONE, SURVEY_REPLY_EMAIL } from './survey-copy';

export type GuideHouseId = 'ranch' | 'lindon' | 'river';

export const GUIDE_HOUSE_IDS: GuideHouseId[] = ['ranch', 'lindon', 'river'];

export interface GuideSection {
  title: string;
  body: string;
}

export interface GuideVideo {
  title: string;
  url: string;
}

/** A guest-facing device. The entity id stays on the server. */
export interface GuideControl {
  name: string;
  entityId: string;
  kind: 'light';
}

export interface GuidePlace {
  name: string;
  kind: 'ski' | 'food' | 'outdoors' | 'family' | 'rentals' | 'essentials';
  note: string;
  area?: string;
  url?: string;
}

export interface HouseGuide {
  /** Off: guest links open the preference form only. Owner preview still shows the app. */
  enabled: boolean;
  headline: string;
  address: string;
  checkInTime: string;
  checkOutTime: string;
  wifiName: string;
  wifiPassword: string;
  doorCode: string;
  doorNotes: string;
  parking: string;
  arrival: string;
  checkout: string;
  houseRules: string;
  contactPhone: string;
  contactEmail: string;
  emergency: string;
  sections: GuideSection[];
  videos: GuideVideo[];
  places: GuidePlace[];
  controls: GuideControl[];
  updatedAt?: string;
}

const KV_KEY = 'guestGuides';

const VALLEY_PLACES: GuidePlace[] = [
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

const CANYON_PLACES: GuidePlace[] = [
  { kind: 'ski', name: 'Sundance Mountain Resort', area: 'About 10 minutes up the canyon', note: 'Your home mountain. Lessons and rentals at the base.', url: 'https://www.sundanceresort.com' },
  { kind: 'ski', name: 'Park City and Deer Valley', area: 'About 45 minutes via Heber', note: 'Big resorts and Main Street dining for a day trip.' },
  { kind: 'ski', name: 'Snowbird, Alta, Brighton, Solitude', area: 'About an hour', note: 'Cottonwood Canyon powder days. Leave early for canyon traffic.' },
  { kind: 'food', name: 'Tree Room at Sundance', area: 'Sundance', note: 'Fine dining among Robert Redford\u2019s art collection. Tuesday to Saturday. Reserve ahead.', url: 'https://www.sundanceresort.com/dining/tree-room/' },
  { kind: 'food', name: 'Foundry Grill at Sundance', area: 'Sundance', note: 'Breakfast, lunch, and dinner by the hearth. Sunday brunch is an event.', url: 'https://www.sundanceresort.com/dining/foundry-grill/' },
  { kind: 'food', name: 'Owl Bar at Sundance', area: 'Sundance', note: 'Historic bar with live music and bar food. First come, first served.', url: 'https://www.sundanceresort.com/dining/owl-bar/' },
  { kind: 'food', name: 'Sundance Deli', area: 'Sundance', note: 'Coffee, sandwiches, and pizza to take on a hike.' },
  { kind: 'food', name: 'Communal', area: 'Provo, about 20 minutes', note: 'The best dinner in Utah County. Reserve ahead.' },
  { kind: 'food', name: 'Slackwater', area: 'Riverwoods, Provo', note: 'Pizza and a big patio at the mouth of the canyon.' },
  { kind: 'outdoors', name: 'Provo River tubing and rafting', area: 'Vivian Park', note: 'High Country Adventure runs tubes, rafts, and kayaks that finish at Vivian Park. Spring runoff can close tubing, so check before you go.', url: 'https://highcountryadventure.com' },
  { kind: 'outdoors', name: 'Fly fishing the Provo River', area: 'Right outside', note: 'One of Utah\u2019s best trout rivers. A Utah fishing license is required.' },
  { kind: 'outdoors', name: 'Provo River Parkway', area: 'Starts at Vivian Park', note: 'Paved trail down the canyon for walking and biking.' },
  { kind: 'outdoors', name: 'Stewart Falls', area: 'Sundance', note: 'Easy-moderate hike to a two-tier waterfall. Beautiful in fall color.' },
  { kind: 'outdoors', name: 'Bridal Veil Falls', area: 'Lower Provo Canyon', note: 'A 600-foot waterfall a short walk from the parking lot.' },
  { kind: 'outdoors', name: 'Deer Creek Reservoir', area: 'About 10 minutes up canyon', note: 'Boating, paddle boards, and swimming in summer.' },
  { kind: 'family', name: 'Heber Valley Railroad', area: 'Heber', note: 'Scenic train rides. The Vivian Park run has been paused for track work, so check the schedule.', url: 'https://www.hebervalleyrr.org' },
  { kind: 'essentials', name: 'Winter driving', note: 'AWD or 4WD with good tires from November to April. The canyon road can ice up at night.' },
  { kind: 'essentials', name: 'Groceries', area: 'Orem or Heber', note: 'Stock up before you drive up the canyon. There is no grocery store at Vivian Park.' },
];

function defaults(id: GuideHouseId): HouseGuide {
  const shared = {
    enabled: false,
    checkInTime: '4:00 PM',
    checkOutTime: '11:00 AM',
    wifiName: '',
    wifiPassword: '',
    doorCode: '',
    doorNotes: '',
    contactPhone: SURVEY_PHONE,
    contactEmail: SURVEY_REPLY_EMAIL,
    emergency: 'For a fire, medical emergency, or anyone in danger, call 911 first, then call us.',
    videos: [],
    controls: [],
    checkout: [
      'Start the dishwasher.',
      'Put used towels in the laundry room.',
      'Take kitchen trash to the outside bins.',
      'Turn off lights and the fireplace, close windows.',
      'Lock the door behind you. The lock will reset for the next guests.',
    ].join('\n'),
  };
  if (id === 'river') {
    return {
      ...shared,
      headline: 'Sleeps 25 on the Provo River',
      address: PROPERTIES.river.address,
      parking: 'Park in the driveway and garage. Keep the canyon road clear for plows in winter.',
      arrival: 'Drive up Provo Canyon to Vivian Park. Stock up on groceries in Orem first. AWD or 4WD in winter.',
      houseRules:
        'Whole-house rental only. Quiet hours in this mountain neighborhood. No parties or events without written approval. Follow the septic and trash notes below. No smoking indoors.',
      sections: [
        { title: 'Bedrooms', body: 'Seven king suites, each in its own room, plus an expandable king.' },
        { title: 'Septic', body: 'The house is on septic. Only toilet paper goes in the toilets. No wipes, even flushable ones.' },
        { title: 'The river', body: 'The Provo River runs cold and fast, especially in spring. Watch kids near the bank and wear life jackets on the water.' },
      ],
      places: CANYON_PLACES,
    };
  }
  if (id === 'ranch') {
    return {
      ...shared,
      headline: 'Sleeps 20 with a hot tub in Lindon',
      address: PROPERTIES.ranch.address,
      parking: 'Park in the driveway. Please do not block neighbors.',
      arrival: 'The house is in Lindon, about 45 minutes south of the Salt Lake airport.',
      houseRules: 'Quiet hours 10 PM to 8 AM. No parties. Stay within the booked guest count. No smoking indoors.',
      sections: [
        { title: 'Hot tub', body: 'Keep the cover on when not in use. No glass in or near the tub. Kids with an adult only.' },
      ],
      places: VALLEY_PLACES,
    };
  }
  return {
    ...shared,
    headline: 'Sleeps 12 near BYU',
    address: PROPERTIES.lindon.address,
    parking: 'Park in the driveway.',
    arrival: 'The house is in Lindon, about 15 minutes from BYU and 45 minutes from the Salt Lake airport.',
    houseRules: 'Quiet hours 10 PM to 8 AM. No smoking indoors. No parties.',
    sections: [],
    places: VALLEY_PLACES,
  };
}

export async function loadGuides(env: SettingsEnv): Promise<Record<GuideHouseId, HouseGuide>> {
  const stored = await kvGet<Partial<Record<GuideHouseId, Partial<HouseGuide>>>>(env, KV_KEY, {});
  return Object.fromEntries(
    GUIDE_HOUSE_IDS.map((id) => [id, { ...defaults(id), ...(stored[id] ?? {}) }]),
  ) as Record<GuideHouseId, HouseGuide>;
}

export async function guideEnabled(env: SettingsEnv, id: string): Promise<boolean> {
  if (!GUIDE_HOUSE_IDS.includes(id as GuideHouseId)) return false;
  return (await loadGuides(env))[id as GuideHouseId].enabled === true;
}

export async function saveGuide(env: SettingsEnv, id: GuideHouseId, guide: Partial<HouseGuide>) {
  const stored = await kvGet<Partial<Record<GuideHouseId, Partial<HouseGuide>>>>(env, KV_KEY, {});
  const next = { ...stored, [id]: { ...(stored[id] ?? {}), ...guide, updatedAt: new Date().toISOString() } };
  await kvPut(env, KV_KEY, next);
  return (await loadGuides(env))[id];
}

function denverParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Codes open the day before check-in and close at noon on checkout day, Denver time. */
export function accessWindow(checkIn: string, checkOut: string, now = new Date()) {
  const opensOn = addDays(checkIn, -1);
  const { day, hour } = denverParts(now);
  const beforeOpen = day < opensOn;
  const afterClose = day > checkOut || (day === checkOut && hour >= 12);
  return {
    open: !beforeOpen && !afterClose,
    phase: beforeOpen ? ('before' as const) : afterClose ? ('after' as const) : ('during' as const),
    opensOn,
    closesOn: checkOut,
  };
}
