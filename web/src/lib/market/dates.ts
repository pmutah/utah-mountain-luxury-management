/** Date helpers for the market board. Weekend nights are Friday and Saturday, matching the pricing doctrine. */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A real calendar day. A digit pattern alone accepts a month of 13 or a 30th of February, and this
 * project has written that bug three separate times, so every date check goes through here.
 */
export function isRealDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month! < 1 || month! > 12 || day! < 1 || day! > 31) return false;
  const check = new Date(Date.UTC(year!, month! - 1, day!));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month! - 1 && check.getUTCDate() === day;
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function denverToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(now);
}

export function weekdayIndex(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function isWeekendNight(iso: string): boolean {
  const day = weekdayIndex(iso);
  return day === 5 || day === 6;
}

export function eachNight(from: string, days: number): string[] {
  const nights: string[] = [];
  for (let i = 0; i < days; i += 1) nights.push(addDays(from, i));
  return nights;
}

export function monthFactor(iso: string): number {
  const month = Number(iso.slice(5, 7));
  const factors = [0.82, 0.86, 0.9, 0.84, 0.92, 1.12, 1.16, 1.02, 0.9, 0.86, 0.8, 1.05];
  return factors[month - 1] ?? 1;
}
