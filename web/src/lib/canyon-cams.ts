/**
 * The live cameras a guest can watch before driving up.
 *
 * Every frame comes from the Utah Department of Transportation's public CCTV service, which serves each camera as a
 * still image at `https://udottraffic.utah.gov/map/Cctv/<id>`. UDOT answers with `Access-Control-Allow-Origin: *`
 * and a 60-second cache, so the site can show the picture without scraping or asking anyone for a key.
 *
 * Two deliberate choices:
 *
 * 1. **Every camera is a road camera, not a resort camera.** The resorts publish webcams through embedded players
 *    that need a page, an iframe, or a vendor script; those break, change, or refuse framing without warning, and a
 *    guest who taps a camera to see the road wants the road. UDOT's own cameras cover the canyon, the two Little
 *    Cottonwood corners, the Park City approach, and the Powder Mountain road, and they all work the same way.
 * 2. **Resort webcams are still linked, not embedded.** `CANYON_LIVE_PORTALS` in `canyon-map.ts` already points at
 *    Sundance's own report, and each group below carries its resort page so a guest who wants the mountain view can
 *    open it in one tap.
 *
 * `id` is UDOT's numeric camera id and is the only thing that reaches the network. A name here that is not in this
 * table cannot fetch anything: the proxy looks the id up rather than accepting a URL.
 */
export type CameraGroupId = 'provo-canyon' | 'sundance' | 'little-cottonwood' | 'park-city' | 'north' | 'south' | 'lindon';

export type CanyonCam = {
  /** Stable key for `data-bot` and the proxy path. */
  key: string;
  /** UDOT's numeric camera id. */
  id: number;
  name: string;
  /** What a guest is looking at, and why it matters for the drive. */
  note: string;
  /** Miles along the drive from the River House, roughly, or null when it is not on that route. */
  fromRiver: string | null;
};

export type CameraGroup = {
  id: CameraGroupId;
  label: string;
  /** The house this group is most useful for, or null when it is a statewide ski-road group. */
  house: 'river' | 'ranch' | 'lindon' | null;
  blurb: string;
  /** The resort's own report, when the group is a ski road. Opened in a new tab, never framed. */
  resortHref?: { href: string; label: string };
  cams: CanyonCam[];
};

export const CAMERA_GROUPS: CameraGroup[] = [
  {
    id: 'provo-canyon',
    label: 'Provo Canyon to the River House',
    house: 'river',
    blurb: 'US-189 from Canyon View Park up past Bridal Veil Falls and Vivian Park. These are the turns between the freeway and the driveway.',
    cams: [
      { key: 'canyon-view', id: 177561, name: 'Canyon View Park · MP 8.46', note: 'The mouth of the canyon, where US-189 leaves Orem.', fromRiver: '5 mi below' },
      { key: 'springdell', id: 178155, name: 'Springdell · MP 9.68', note: 'Below Bridal Veil, past the first set of curves.', fromRiver: '4 mi below' },
      { key: 'canyon-glen', id: 177585, name: 'Canyon Glen Park · MP 9.98', note: 'The riverside park and the Provo River Parkway trailhead.', fromRiver: '4 mi below' },
      { key: 'bridal-veil', id: 177938, name: 'Bridal Veil Falls · MP 11.15', note: 'The waterfall, and the plow turnaround in heavy snow.', fromRiver: '2 mi below' },
      { key: 'fishermens', id: 178211, name: 'Fishermens · MP 15.46', note: 'Above the house, on the way up to Deer Creek.', fromRiver: '2 mi above' },
      { key: 'vivian', id: 178142, name: 'Vivian Park · MP 13.16', note: 'The River House exit. The driveway is off this junction.', fromRiver: 'at the house' },
      { key: 'sundance-jct', id: 177604, name: 'Alpine Scenic Hwy / SR-92 · MP 14.26', note: 'The Sundance turnoff, two miles above the house.', fromRiver: '2 mi above' },
      { key: 'timpanogos-cave', id: 178254, name: 'Alpine Loop @ Timpanogos Cave · MP 10.3', note: 'The SR-92 climb toward the cave and the summit.', fromRiver: 'up SR-92' },
    ],
  },
  {
    id: 'sundance',
    label: 'Sundance & the Alpine Loop',
    house: 'river',
    blurb: 'SR-92 between the canyon and the resort. Sundance is about ten minutes above the River House.',
    resortHref: { href: 'https://www.sundanceresort.com/mountain-report/', label: 'Sundance mountain report & snow stake' },
    cams: [
      { key: 'sundance-road', id: 178589, name: 'Alpine Loop @ Ranger Station · MP 7.99', note: 'The ranger station on the way up to Sundance.', fromRiver: '10 min' },
      { key: 'sr92-summit', id: 177761, name: 'Alpine Loop · MP 14.54', note: 'The upper loop, above the resort. Closes to American Fork in winter.', fromRiver: 'past Sundance' },
    ],
  },
  {
    id: 'little-cottonwood',
    label: 'Little & Big Cottonwood — Alta, Snowbird, Solitude, Brighton',
    house: null,
    blurb: 'The canyon roads to the four Cottonwood resorts, about an hour north of the houses. These are where a powder morning actually backs up.',
    resortHref: { href: 'https://www.alta.com/weather', label: 'Alta snow & road report' },
    cams: [
      { key: 'white-pine', id: 178493, name: 'Little Cottonwood Rd @ White Pine · MP 8.7', note: 'The climbing lane where the canyon starts to slow.', fromRiver: null },
      { key: 'alta', id: 178136, name: 'Little Cottonwood Rd @ Alta · MP 12.16', note: 'Alta and the top of SR-210.', fromRiver: null },
      { key: 'solitude', id: 179390, name: 'Big Cottonwood Rd @ Solitude · MP 14.53', note: 'Solitude, and the Brighton road above it.', fromRiver: null },
      { key: 'brighton', id: 177322, name: 'Big Cottonwood Rd @ Brighton · MP 16.07', note: 'The top of Big Cottonwood Canyon.', fromRiver: null },
    ],
  },
  {
    id: 'park-city',
    label: 'Park City & Deer Valley',
    house: null,
    blurb: 'SR-224 and SR-248 from I-80 into town. Deer Valley and Park City Mountain both sit off these two roads.',
    resortHref: { href: 'https://www.deervalley.com/webcams', label: 'Deer Valley webcams' },
    cams: [
      { key: 'park-city', id: 178084, name: 'SR-224 @ Canyon Resort Dr', note: 'The Park City Mountain approach from Kimball Junction.', fromRiver: null },
      { key: 'deer-valley', id: 178272, name: 'Deer Valley Dr @ Bonanza Dr', note: 'Deer Valley Drive into Snow Park.', fromRiver: null },
    ],
  },
  {
    id: 'north',
    label: 'Powder Mountain & Ogden Valley',
    house: null,
    blurb: 'SR-158 climbs to Powder Mountain. Snowbasin is reached from SR-167 off I-84.',
    cams: [
      { key: 'powder', id: 179677, name: 'SR-158 @ Powder Mountain · MP 11.62', note: 'The last climb to the Powder Mountain lot.', fromRiver: null },
    ],
  },
  {
    id: 'south',
    label: 'Brian Head',
    house: null,
    blurb: 'SR-143 through Brian Head, the high road in the south of the state.',
    cams: [
      { key: 'brian-head', id: 178742, name: 'SR-143 @ Brian Head · MP 18.19', note: 'The resort road at 9,800 feet.', fromRiver: null },
    ],
  },
  {
    id: 'lindon',
    label: 'Lindon & the Timpanogos Highway',
    house: 'lindon',
    blurb: 'SR-92 across the north end of Utah Valley, the quickest way from the Lindon house to the freeway and the canyons.',
    cams: [
      { key: 'lindon-92', id: 177705, name: 'Timpanogos Hwy @ Digital Dr', note: 'SR-92 at Digital Drive, a mile from the Lindon house.', fromRiver: null },
    ],
  },
];

/** Every camera, flattened, for the id lookup the proxy uses. */
export const ALL_CAMS: CanyonCam[] = CAMERA_GROUPS.flatMap((group) => group.cams);

/** A camera by its stable key, or undefined. */
export function camByKey(key: string): CanyonCam | undefined {
  return ALL_CAMS.find((cam) => cam.key === key);
}

/** The groups worth showing a guest, most useful first, with an optional house to narrow them. */
export function cameraGroupsFor(house?: 'river' | 'ranch' | 'lindon'): CameraGroup[] {
  const order: CameraGroupId[] = ['provo-canyon', 'sundance', 'lindon', 'little-cottonwood', 'park-city', 'north', 'south'];
  const groups = order.map((id) => CAMERA_GROUPS.find((group) => group.id === id)).filter((group): group is CameraGroup => !!group);
  if (!house) return groups;
  return groups.filter((group) => group.house === null || group.house === house);
}

/** The source that serves one frame. UDOT's public still-image endpoint. */
export function camFrameUrl(id: number): string {
  return `https://udottraffic.utah.gov/map/Cctv/${id}`;
}

/** How many road cameras the site can show. Used in the copy, so it cannot drift from the table. */
export const CAMERA_COUNT = ALL_CAMS.length;
