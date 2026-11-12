/**
 * Every Utah ski resort, as one row of snow.
 *
 * The numbers come from Open-Meteo's public forecast API, which is keyless, allows a batch, and returns the same
 * modelled snowfall for every mountain. That is deliberately **not** the same source a resort publishes: a resort's own
 * snow stake is the authority on what fell at its base, and several of them update only when someone walks out and
 * measures. This page is a mountain-by-mountain weather read for trip planning, so it says so and links each resort's
 * own report beside the number.
 *
 * Snowfall is modelled at each resort's upper-mountain coordinates, because that is where the snowpack that opens
 * terrain accumulates. `elevationFt` is recorded so the page can say what height the number describes.
 */
export type ResortRegion = 'Provo Canyon' | 'Wasatch Front' | 'Park City & Deer Valley' | 'Ogden Valley' | 'Southern Utah';

export type UtahResort = {
  key: string;
  name: string;
  region: ResortRegion;
  /** Upper-mountain latitude/longitude, where the snow that opens terrain falls. */
  lat: number;
  lon: number;
  /** The elevation those coordinates sit at, for the label. */
  elevationFt: number;
  /** The resort's own snow report. Linked, never scraped. */
  reportUrl: string;
  /** Minutes by car from the River House, roughly. Null when the drive is not a day trip. */
  fromRiver: string | null;
  /** The route a guest would drive, for the note. */
  route: string;
};

/** The sixteen resorts on the official Utah snow report, ordered the way a River House guest would care about them. */
export const UTAH_RESORTS: UtahResort[] = [
  {
    key: 'sundance',
    name: 'Sundance',
    region: 'Provo Canyon',
    lat: 40.39,
    lon: -111.588,
    elevationFt: 8250,
    reportUrl: 'https://www.sundanceresort.com/mountain-report/',
    fromRiver: '10 min',
    route: 'SR-92 above the River House',
  },
  {
    key: 'alta',
    name: 'Alta',
    region: 'Wasatch Front',
    lat: 40.5826,
    lon: -111.637,
    elevationFt: 9050,
    reportUrl: 'https://www.alta.com/weather',
    fromRiver: 'about 1 hr 10 min',
    route: 'I-15 then SR-210 Little Cottonwood',
  },
  {
    key: 'snowbird',
    name: 'Snowbird',
    region: 'Wasatch Front',
    lat: 40.5826,
    lon: -111.655,
    elevationFt: 9640,
    reportUrl: 'https://www.snowbird.com/webcams/',
    fromRiver: 'about 1 hr 10 min',
    route: 'I-15 then SR-210 Little Cottonwood',
  },
  {
    key: 'brighton',
    name: 'Brighton',
    region: 'Wasatch Front',
    lat: 40.5989,
    lon: -111.583,
    elevationFt: 9500,
    reportUrl: 'https://www.brightonresort.com/',
    fromRiver: 'about 1 hr 15 min',
    route: 'I-15 then SR-190 Big Cottonwood',
  },
  {
    key: 'solitude',
    name: 'Solitude',
    region: 'Wasatch Front',
    lat: 40.622,
    lon: -111.552,
    elevationFt: 9400,
    reportUrl: 'https://www.solitudemountain.com/',
    fromRiver: 'about 1 hr 15 min',
    route: 'I-15 then SR-190 Big Cottonwood',
  },
  {
    key: 'park-city',
    name: 'Park City Mountain',
    region: 'Park City & Deer Valley',
    lat: 40.6511,
    lon: -111.565,
    elevationFt: 9400,
    reportUrl: 'https://www.parkcitymountain.com/',
    fromRiver: 'about 1 hr 20 min',
    route: 'I-80 then SR-224',
  },
  {
    key: 'deer-valley',
    name: 'Deer Valley',
    region: 'Park City & Deer Valley',
    lat: 40.624,
    lon: -111.54,
    elevationFt: 9100,
    reportUrl: 'https://www.deervalley.com/webcams',
    fromRiver: 'about 1 hr 20 min',
    route: 'I-80 then SR-224 Deer Valley Dr',
  },
  {
    key: 'woodward',
    name: 'Woodward Park City',
    region: 'Park City & Deer Valley',
    lat: 40.69,
    lon: -111.54,
    elevationFt: 7200,
    reportUrl: 'https://www.woodwardparkcity.com/',
    fromRiver: 'about 1 hr 20 min',
    route: 'I-80 to Park City',
  },
  {
    key: 'snowbasin',
    name: 'Snowbasin',
    region: 'Ogden Valley',
    lat: 41.218,
    lon: -111.856,
    elevationFt: 9350,
    reportUrl: 'https://www.snowbasin.com/',
    fromRiver: 'about 1 hr 35 min',
    route: 'I-15 then I-84 then SR-167',
  },
  {
    key: 'powder',
    name: 'Powder Mountain',
    region: 'Ogden Valley',
    lat: 41.38,
    lon: -111.78,
    elevationFt: 8900,
    reportUrl: 'https://www.powdermountain.com/',
    fromRiver: 'about 1 hr 45 min',
    route: 'I-15 then I-84 then SR-158',
  },
  {
    key: 'nordic-valley',
    name: 'Nordic Valley',
    region: 'Ogden Valley',
    lat: 41.34,
    lon: -111.83,
    elevationFt: 6600,
    reportUrl: 'https://www.nordicvalley.com/',
    fromRiver: 'about 1 hr 40 min',
    route: 'I-15 then I-84 then SR-158',
  },
  {
    key: 'beaver',
    name: 'Beaver Mountain',
    region: 'Ogden Valley',
    lat: 41.97,
    lon: -111.53,
    elevationFt: 8800,
    reportUrl: 'https://www.skithebeav.com/',
    fromRiver: null,
    route: 'US-89 through Logan Canyon',
  },
  {
    key: 'cherry-peak',
    name: 'Cherry Peak',
    region: 'Ogden Valley',
    lat: 41.93,
    lon: -111.87,
    elevationFt: 7300,
    reportUrl: 'https://www.cherrypeak.com/',
    fromRiver: null,
    route: 'US-91 north of Logan',
  },
  {
    key: 'eagle-point',
    name: 'Eagle Point',
    region: 'Southern Utah',
    lat: 38.32,
    lon: -112.39,
    elevationFt: 9100,
    reportUrl: 'https://www.eaglepointresort.com/',
    fromRiver: null,
    route: 'I-15 then SR-20 then SR-153',
  },
  {
    key: 'brian-head',
    name: 'Brian Head',
    region: 'Southern Utah',
    lat: 37.7,
    lon: -112.84,
    elevationFt: 9600,
    reportUrl: 'https://www.brianhead.com/webcams',
    fromRiver: null,
    route: 'I-15 then SR-143',
  },
  {
    key: 'snowland',
    name: 'Snowland Resort',
    region: 'Southern Utah',
    lat: 37.68,
    lon: -112.86,
    elevationFt: 9100,
    reportUrl: 'https://www.skiutah.com/snowreport/',
    fromRiver: null,
    route: 'SR-143 near Brian Head',
  },
];

/** One resort's snow, as the page shows it. */
export type ResortSnowDay = { date: string; inches: number };

export type ResortSnow = {
  key: string;
  name: string;
  region: ResortRegion;
  elevationFt: number;
  reportUrl: string;
  fromRiver: string | null;
  route: string;
  /** The past days shown, oldest first. */
  past: ResortSnowDay[];
  /** Today and the days after, in order. */
  ahead: ResortSnowDay[];
  /** Total of the past days shown, inches. */
  pastTotal: number;
  /** Total of the next days shown, inches. */
  aheadTotal: number;
  /** How much fell in the most recent past day, inches. Null when that day is missing. */
  lastDay: number | null;
};

const CM_PER_INCH = 2.54;

function toInches(cm: number): number {
  return Math.round((cm / CM_PER_INCH) * 10) / 10;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** "3.5", "1", "0" — one formatter so the whole page agrees. */
export function inchesText(inches: number): string {
  const rounded = Math.round(inches * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Denver's calendar date, because every resort on this list is in Mountain Time. */
function denverTodayValue(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
}

/** Open-Meteo's daily snowfall for every resort, as one request. Past days first, then the forecast. */
export function forecastUrl(resorts: readonly UtahResort[] = UTAH_RESORTS, pastDays = 7): string {
  const params = new URLSearchParams({
    latitude: resorts.map((resort) => resort.lat.toFixed(4)).join(','),
    longitude: resorts.map((resort) => resort.lon.toFixed(4)).join(','),
    daily: 'snowfall_sum',
    timezone: 'America/Denver',
    past_days: String(pastDays),
    forecast_days: '4',
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

type OpenMeteoDay = { time?: string[]; snowfall_sum?: Array<number | null> };
type OpenMeteoPoint = { daily?: OpenMeteoDay; elevation?: number };

/**
 * Turn Open-Meteo's answer into the rows the page renders.
 *
 * A resort whose point came back missing or empty is **left out**, never shown as zero snow: "we did not get a number"
 * and "it did not snow" are different claims, and a powder page that reports zero for a mountain it failed to read is
 * the worse of the two errors.
 */
export function buildSnowReport(payload: unknown, resorts: readonly UtahResort[] = UTAH_RESORTS, today?: string): ResortSnow[] {
  const points: OpenMeteoPoint[] = Array.isArray(payload) ? (payload as OpenMeteoPoint[]) : payload ? [payload as OpenMeteoPoint] : [];
  const stamp = today ?? denverTodayValue();
  const rows: ResortSnow[] = [];
  resorts.forEach((resort, index) => {
    const daily = points[index]?.daily;
    const times = daily?.time ?? [];
    const values = daily?.snowfall_sum ?? [];
    if (times.length === 0) return;
    const past: ResortSnowDay[] = [];
    const ahead: ResortSnowDay[] = [];
    times.forEach((date, at) => {
      const cm = values[at];
      if (typeof cm !== 'number' || !Number.isFinite(cm)) return;
      const day = { date, inches: toInches(cm) };
      if (date < stamp) past.push(day);
      else ahead.push(day);
    });
    if (past.length === 0 && ahead.length === 0) return;
    const lastSeven = past.slice(-7);
    const nextFour = ahead.slice(0, 4);
    rows.push({
      key: resort.key,
      name: resort.name,
      region: resort.region,
      elevationFt: resort.elevationFt,
      reportUrl: resort.reportUrl,
      fromRiver: resort.fromRiver,
      route: resort.route,
      past: lastSeven,
      ahead: nextFour,
      pastTotal: round1(lastSeven.reduce((sum, day) => sum + day.inches, 0)),
      aheadTotal: round1(nextFour.reduce((sum, day) => sum + day.inches, 0)),
      lastDay: lastSeven.length > 0 ? lastSeven[lastSeven.length - 1]!.inches : null,
    });
  });
  return rows;
}

/** Groups in the order the page shows them, with the resorts that came back. */
export function snowByRegion(rows: readonly ResortSnow[]): Array<{ region: ResortRegion; rows: ResortSnow[] }> {
  const order: ResortRegion[] = ['Provo Canyon', 'Wasatch Front', 'Park City & Deer Valley', 'Ogden Valley', 'Southern Utah'];
  return order
    .map((region) => ({ region, rows: rows.filter((row) => row.region === region) }))
    .filter((group) => group.rows.length > 0);
}

/** The deepest snow in the last reported day, for a one-line headline. Null when nothing came back or it was all dry. */
export function deepestLastDay(rows: readonly ResortSnow[]): ResortSnow | null {
  const withSnow = rows.filter((row) => (row.lastDay ?? 0) > 0);
  if (withSnow.length === 0) return null;
  return withSnow.reduce((best, row) => ((row.lastDay ?? 0) > (best.lastDay ?? 0) ? row : best));
}

/** "Fri, Nov 14" for a date pill. */
export function snowDateLabel(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** The one-line headline over the table. Never claims a resort is open or that a road is. */
export function snowHeadline(rows: readonly ResortSnow[], updatedLabel: string): string {
  const deepest = deepestLastDay(rows);
  if (rows.length === 0) return 'The resort snow could not be read just now.';
  if (!deepest) return `No resort reported new snow in the last day. Modelled at upper mountain, updated ${updatedLabel}.`;
  const amount = deepest.lastDay ?? 0;
  return `${deepest.name} led the last day with ${inchesText(amount)} inch${amount === 1 ? '' : 'es'}. Modelled at upper mountain, updated ${updatedLabel}.`;
}
