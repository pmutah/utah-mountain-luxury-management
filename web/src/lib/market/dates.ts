/** Date helpers for the market board. Weekend nights are Friday and Saturday, matching the pricing doctrine. */

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
