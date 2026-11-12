/**
 * Deterministic Solar Sunrise, Timpanogos Alpenglow / Golden Hour, Sunset & Lunar Phase Calculator
 * for Provo Canyon & Utah Valley (40.3487°N, -111.5973°W, America/Denver).
 *
 * Uses standard NOAA solar position equations and the synodic lunar cycle — zero network calls,
 * zero API keys, and 100% deterministic for any trip date (`YYYY-MM-DD`).
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export const UTAH_MOUNTAIN_COORDS = {
  river: { lat: 40.3487, lon: -111.5973, label: 'Vivian Park · Provo Canyon' },
  ranch: { lat: 40.3416, lon: -111.7206, label: 'Center St · Lindon' },
  lindon: { lat: 40.3403, lon: -111.7163, label: 'Harcliff Cir · Lindon' },
} as const;

export type MoonPhaseInfo = {
  phaseRatio: number; // 0..1 (0 = New, 0.5 = Full)
  illuminationPct: number;
  name: string;
  stargazingNote: string;
};

export type MountainLightWindow = {
  date: string;
  sunrise: string;
  goldenHourStart: string;
  sunset: string;
  stargazingStart: string;
  daylightHours: number;
  moon: MoonPhaseInfo;
  alpenglowLine: string;
};

function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function dayOfYear(year: number, month: number, day: number): number {
  const start = Date.UTC(year, 0, 0);
  const target = Date.UTC(year, month - 1, day);
  return Math.round((target - start) / 86_400_000);
}

/** Mountain Time UTC offset in hours (-6 in MDT, -7 in MST) at noon on the given date. */
export function mountainUtcOffsetHours(year: number, month: number, day: number): number {
  const noonUtc = new Date(Date.UTC(year, month - 1, day, 19, 0, 0));
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    timeZoneName: 'longOffset',
  }).format(noonUtc);
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(formatted);
  if (!match) return -7;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) + Number(match[3] ?? 0) / 60);
}

function formatClockMinutes(totalMinutes: number): string {
  const wrapped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hour24 = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/** Synodic moon phase from reference New Moon (2000-01-06 18:14 UTC). */
export function moonPhaseForDate(iso: string): MoonPhaseInfo {
  const parsed = parseIsoDate(iso);
  if (!parsed) {
    return {
      phaseRatio: 0,
      illuminationPct: 0,
      name: 'New Moon',
      stargazingNote: 'Dark canyon skies after twilight.',
    };
  }
  const targetMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day, 20, 0, 0);
  const refNewMoonMs = Date.UTC(2000, 0, 6, 18, 14, 0);
  const synodicDays = 29.530588853;
  const elapsedDays = (targetMs - refNewMoonMs) / 86_400_000;
  const ratio = ((elapsedDays % synodicDays) + synodicDays) % synodicDays / synodicDays;
  const illuminationPct = Math.round(((1 - Math.cos(2 * Math.PI * ratio)) / 2) * 100);

  let name = 'Full Moon';
  if (ratio < 0.03 || ratio > 0.97) name = 'New Moon';
  else if (ratio < 0.22) name = 'Waxing Crescent';
  else if (ratio < 0.28) name = 'First Quarter';
  else if (ratio < 0.47) name = 'Waxing Gibbous';
  else if (ratio <= 0.53) name = 'Full Moon';
  else if (ratio < 0.72) name = 'Waning Gibbous';
  else if (ratio < 0.78) name = 'Last Quarter';
  else name = 'Waning Crescent';

  const stargazingNote =
    illuminationPct <= 25
      ? 'Dark sky window — prime Milky Way & hot-tub stargazing'
      : illuminationPct >= 80
        ? 'Bright moonlit canyon peaks & snowfields'
        : 'Crisp evening twilight followed by starry canyon skies';

  return {
    phaseRatio: Math.round(ratio * 1000) / 1000,
    illuminationPct,
    name,
    stargazingNote,
  };
}

/**
 * Compute sunrise, golden hour / alpenglow, sunset, and astronomical twilight stargazing start
 * for a house and ISO date (`YYYY-MM-DD`).
 */
export function computeMountainLight(
  iso: string,
  house: 'ranch' | 'lindon' | 'river' = 'river',
): MountainLightWindow | null {
  const parsed = parseIsoDate(iso);
  if (!parsed) return null;

  const coords = UTAH_MOUNTAIN_COORDS[house];
  const doy = dayOfYear(parsed.year, parsed.month, parsed.day);
  const tzHours = mountainUtcOffsetHours(parsed.year, parsed.month, parsed.day);

  // Fractional year in radians (NOAA solar equations)
  const gamma = ((2 * Math.PI) / 365) * (doy - 1 + 0.5);

  const eqTimeMinutes =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  const declRad =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const latRad = coords.lat * DEG_TO_RAD;
  const zenithStandard = 90.833 * DEG_TO_RAD;

  const cosHa =
    (Math.cos(zenithStandard) / (Math.cos(latRad) * Math.cos(declRad))) -
    Math.tan(latRad) * Math.tan(declRad);

  const clampedCos = Math.max(-1, Math.min(1, cosHa));
  const haDeg = Math.acos(clampedCos) * RAD_TO_DEG;

  const solarNoonUtcMin = 720 - 4 * coords.lon - eqTimeMinutes;
  const solarNoonLocalMin = solarNoonUtcMin + tzHours * 60;

  const sunriseMin = solarNoonLocalMin - haDeg * 4;
  // In Provo Canyon, canyon walls dip sun slightly earlier than the valley floor (~18 min earlier direct sun).
  const canyonRidgeOffset = house === 'river' ? -18 : 0;
  const sunsetMin = solarNoonLocalMin + haDeg * 4 + canyonRidgeOffset;
  const goldenHourMin = sunsetMin - 45;
  const stargazingMin = sunsetMin + 72; // Nautical/astronomical dark sky onset

  const daylightHours = Math.round(((sunsetMin - sunriseMin) / 60) * 10) / 10;
  const moon = moonPhaseForDate(iso);

  return {
    date: iso,
    sunrise: formatClockMinutes(sunriseMin),
    goldenHourStart: formatClockMinutes(goldenHourMin),
    sunset: formatClockMinutes(sunsetMin),
    stargazingStart: formatClockMinutes(stargazingMin),
    daylightHours,
    moon,
    alpenglowLine: `Sunrise ${formatClockMinutes(sunriseMin)} · Alpenglow ${formatClockMinutes(goldenHourMin)} · Sunset ${formatClockMinutes(sunsetMin)} · Stars ${formatClockMinutes(stargazingMin)}`,
  };
}
