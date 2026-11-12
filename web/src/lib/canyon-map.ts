export type MapPinKind = 'ski' | 'river' | 'food' | 'trails' | 'house';

export type MapPin = {
  id: string;
  name: string;
  kind: MapPinKind;
  x: number;
  y: number;
  elevationFt: number;
  corridor: string;
  minutes: Record<'ranch' | 'lindon' | 'river', number>;
  note: string;
  mapsQuery: string;
};

/** Typical drive minutes from each house. These are planning figures, not live traffic. */
export const CANYON_PINS: MapPin[] = [
  {
    id: 'lindon',
    name: 'Lindon / Utah Lake',
    kind: 'house',
    x: 70,
    y: 210,
    elevationFt: 4640,
    corridor: 'I-15 Exit 273 · Lindon Aquatics Center',
    minutes: { ranch: 4, lindon: 0, river: 26 },
    note: 'Valley floor across from the Lindon Aquatics Center. Mount Timpanogos rises to the east.',
    mapsQuery: '143 Harcliff Circle, Lindon, UT 84042',
  },
  {
    id: 'ranch',
    name: 'The Ranch House',
    kind: 'house',
    x: 112,
    y: 192,
    elevationFt: 4720,
    corridor: 'Center Street · Lindon Foothills',
    minutes: { ranch: 0, lindon: 4, river: 22 },
    note: 'Half-acre estate on Center Street in Lindon, minutes from the Provo Canyon mouth, BYU, and Walker Farms.',
    mapsQuery: '270 East Center Street, Lindon, UT 84042',
  },
  {
    id: 'riverwoods',
    name: 'Shops at Riverwoods',
    kind: 'food',
    x: 185,
    y: 166,
    elevationFt: 4780,
    corridor: 'US-189 & University Ave · Canyon Mouth',
    minutes: { ranch: 10, lindon: 12, river: 14 },
    note: 'Dining, Harmons / groceries, and outfitters right at the mouth of Provo Canyon.',
    mapsQuery: 'Shops at Riverwoods, 4801 N University Ave, Provo, UT',
  },
  {
    id: 'bridal',
    name: 'Bridal Veil Falls',
    kind: 'trails',
    x: 275,
    y: 132,
    elevationFt: 5080,
    corridor: 'US-189 Mile 4 · Provo River Parkway',
    minutes: { ranch: 15, lindon: 17, river: 6 },
    note: '607-foot double cataract waterfall along the paved Provo River Parkway bike and walking trail.',
    mapsQuery: 'Bridal Veil Falls, Provo Canyon, UT',
  },
  {
    id: 'vivian',
    name: 'Vivian Park — The River House',
    kind: 'river',
    x: 365,
    y: 100,
    elevationFt: 5260,
    corridor: 'US-189 Mile 6.5 · South Fork & Provo River',
    minutes: { ranch: 22, lindon: 26, river: 0 },
    note: 'Direct Provo River frontage at Vivian Park where the paved canyon trail meets the Heber Creeper rail line.',
    mapsQuery: 'Vivian Park, Provo Canyon, UT 84604',
  },
  {
    id: 'deercreek',
    name: 'Deer Creek Reservoir',
    kind: 'river',
    x: 435,
    y: 82,
    elevationFt: 5417,
    corridor: 'US-189 Mile 11 · State Park Marina',
    minutes: { ranch: 28, lindon: 30, river: 9 },
    note: 'Boating, paddleboarding, sandy beach, and ziplining above the dam with Mount Timpanogos views.',
    mapsQuery: 'Deer Creek State Park, Midway, UT',
  },
  {
    id: 'sundance',
    name: 'Sundance Mountain Resort',
    kind: 'ski',
    x: 505,
    y: 44,
    elevationFt: 6100,
    corridor: 'SR-92 Alpine Loop · Base 6,100 ft / Peak 8,250 ft',
    minutes: { ranch: 26, lindon: 28, river: 10 },
    note: 'Ski lifts, Tree Room & Foundry Grill dining, Owl Bar, spa, Nordic trails, and summer lift rides.',
    mapsQuery: 'Sundance Mountain Resort, 8841 N Alpine Loop Rd, Sundance, UT',
  },
];

export function pinsFor(kind: MapPinKind | 'all'): MapPin[] {
  if (kind === 'all') return CANYON_PINS;
  return CANYON_PINS.filter((pin) => pin.kind === kind || pin.kind === 'house');
}

export type TravelOrigin = {
  id: string;
  label: string;
  code?: string;
  minutesTo: Record<'ranch' | 'lindon' | 'river', number>;
  milesTo: Record<'ranch' | 'lindon' | 'river', number>;
  routeTo: Record<'ranch' | 'lindon' | 'river', string>;
  winterNote: string;
  originQuery: string;
};

/**
 * Typical non-rush planning times and highway routes from major airports and Utah hubs.
 * Always presented as typical planning estimates — never live traffic.
 */
export const TRAVEL_ORIGINS: TravelOrigin[] = [
  {
    id: 'slc',
    label: 'Salt Lake City Int’l Airport',
    code: 'SLC',
    minutesTo: { ranch: 44, lindon: 45, river: 56 },
    milesTo: { ranch: 41, lindon: 42, river: 51 },
    routeTo: {
      ranch: 'I-80 E → I-15 S to Exit 275 (Pleasant Grove / Lindon) → Center St',
      lindon: 'I-80 E → I-15 S to Exit 273 (Lindon / 1600 N) → State St → Harcliff Cir',
      river: 'I-80 E → I-15 S to Exit 272 (800 N Orem) → US-189 E up Provo Canyon to Vivian Park',
    },
    winterNote: 'Freeway all the way to Lindon; US-189 up Provo Canyon is a 4-lane divided highway kept plowed by UDOT.',
    originQuery: 'Salt Lake City International Airport, UT',
  },
  {
    id: 'pvu',
    label: 'Provo Airport',
    code: 'PVU',
    minutesTo: { ranch: 18, lindon: 18, river: 28 },
    milesTo: { ranch: 13, lindon: 13, river: 21 },
    routeTo: {
      ranch: 'I-15 N to Exit 273 (Lindon) → State St → Center St',
      lindon: 'I-15 N to Exit 273 (Lindon) → Harcliff Cir',
      river: 'University Ave / US-189 N straight into Provo Canyon to Vivian Park',
    },
    winterNote: 'Direct regional flights via Breeze & Allegiant — skips Point of the Mountain traffic completely.',
    originQuery: 'Provo Airport, Provo, UT',
  },
  {
    id: 'byu',
    label: 'BYU / Provo Campus & Stadium',
    minutesTo: { ranch: 15, lindon: 15, river: 18 },
    milesTo: { ranch: 8, lindon: 8, river: 11 },
    routeTo: {
      ranch: 'University Pkwy or State St north into Lindon',
      lindon: 'State St or Geneva Rd north to Lindon Aquatics Center',
      river: '800 North or University Ave onto US-189 E up Provo Canyon',
    },
    winterNote: 'Game days add traffic near Lavell Edwards Stadium; US-189 bypasses downtown Provo.',
    originQuery: 'Brigham Young University, Provo, UT',
  },
  {
    id: 'sundance-origin',
    label: 'Sundance Mountain Resort',
    minutesTo: { ranch: 26, lindon: 28, river: 10 },
    milesTo: { ranch: 16, lindon: 17, river: 5 },
    routeTo: {
      ranch: 'SR-92 W → US-189 W down Provo Canyon → 800 N → Lindon Center St',
      lindon: 'SR-92 W → US-189 W down Provo Canyon → 800 N → Lindon',
      river: 'SR-92 W down North Fork → US-189 W 2 miles to Vivian Park turnoff',
    },
    winterNote: 'SR-92 above US-189 is steep in storms; AWD/4WD or snow tires strongly recommended in winter.',
    originQuery: 'Sundance Mountain Resort, UT',
  },
  {
    id: 'parkcity',
    label: 'Park City (Main Street / Deer Valley)',
    minutesTo: { ranch: 58, lindon: 60, river: 38 },
    milesTo: { ranch: 46, lindon: 47, river: 31 },
    routeTo: {
      ranch: 'US-40 E → US-189 S past Deer Creek & Provo Canyon → Lindon',
      lindon: 'US-40 E → US-189 S past Deer Creek & Provo Canyon → Lindon',
      river: 'US-40 E through Heber Valley → US-189 S along Deer Creek to Vivian Park',
    },
    winterNote: 'Scenic four-lane highway via Heber Valley and Deer Creek Reservoir — no mountain pass required.',
    originQuery: 'Main Street, Park City, UT',
  },
  {
    id: 'siliconslopes',
    label: 'Silicon Slopes / Lehi Tech Corridor',
    minutesTo: { ranch: 18, lindon: 19, river: 32 },
    milesTo: { ranch: 12, lindon: 13, river: 23 },
    routeTo: {
      ranch: 'I-15 S to Pleasant Grove / Lindon Exit 275 → Center St',
      lindon: 'I-15 S to Lindon Exit 273 → Harcliff Cir',
      river: 'I-15 S to Orem 800 N Exit 272 → US-189 E into Provo Canyon',
    },
    winterNote: 'Easy off-site retreat commute from Lehi, Thanksgiving Point, and Draper.',
    originQuery: 'Thanksgiving Point, Lehi, UT',
  },
];

export const HOUSE_DESTINATION_QUERY: Record<'ranch' | 'lindon' | 'river', string> = {
  ranch: '270 East Center Street, Lindon, UT 84042',
  lindon: '143 Harcliff Circle, Lindon, UT 84042',
  river: 'Vivian Park, Provo Canyon, UT 84604',
};

export function googleDirectionsUrl(origin: string, destination: string): string {
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function appleDirectionsUrl(origin: string, destination: string): string {
  const params = new URLSearchParams({
    saddr: origin,
    daddr: destination,
    dirflg: 'd',
  });
  return `https://maps.apple.com/?${params.toString()}`;
}

export type LiveCanyonPortal = {
  id: string;
  title: string;
  provider: string;
  detail: string;
  href: string;
};

export const CANYON_LIVE_PORTALS: LiveCanyonPortal[] = [
  {
    id: 'udot-canyon',
    title: 'US-189 Provo Canyon Live Traffic & Plow Cams',
    provider: 'UDOT Traffic',
    detail: 'Official Utah DOT live highway cameras, snowplow locations, and active traction laws on US-189 and I-15.',
    href: 'https://udottraffic.utah.gov/',
  },
  {
    id: 'sundance-cams',
    title: 'Sundance Base, Outlaw & Summit Live Webcams',
    provider: 'Sundance Resort',
    detail: 'Live mountain webcams, snow stake camera, lift status, and grooming report 10 minutes above the River House.',
    href: 'https://www.sundanceresort.com/mountain-report/',
  },
  {
    id: 'usgs-vivian',
    title: 'Provo River Hydrograph at Vivian Park (#10163000)',
    provider: 'USGS WaterWatch',
    detail: '7-day cubic-feet-per-second discharge curve and water temperature right beside the River House.',
    href: 'https://waterdata.usgs.gov/monitoring-location/10163000/',
  },
  {
    id: 'alpine-loop',
    title: 'SR-92 Alpine Loop Seasonal Closure Info',
    provider: 'UDOT Seasonal Roads',
    detail: 'SR-92 remains open to Sundance year-round; the upper Alpine Loop summit over to American Fork Canyon closes in winter.',
    href: 'https://www.udot.utah.gov/connect/current-conditions/seasonal-roads/',
  },
];
