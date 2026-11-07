/**
 * Local preview only. The deployed route saves the days in KV, so a cleared tab cannot reset the
 * week. This fixture keeps the same shape in memory for a dev check and says it is a preview.
 */
type Day = { date: string; digest: string };

const saved: Day[] = [];

function denverToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Denver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function clock() {
  const today = denverToday();
  const dates = [...new Set(saved.map((day) => day.date))].filter((date) => date <= today).sort();
  return {
    days: Math.min(dates.length, 7),
    required: 7,
    ready: dates.length >= 7,
    dates,
  };
}

export function devShadowDays() {
  return { clock: clock(), hasWriteToken: false, days: saved.map((day) => ({ date: day.date })), storageReads: 'ok' as const, source: 'dev-preview' as const };
}

export function devSaveShadowDay(body: { date?: string; digest?: string } = {}) {
  const date = typeof body.date === 'string' ? body.date : '';
  const digest = typeof body.digest === 'string' ? body.digest : '';
  // Mirror the deployed route: a real date and an unsent digest, or nothing is saved.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: 'A Denver date is required.', status: 400 as const };
  }
  if (!digest.includes('Nothing sent to Hospitable.')) {
    return { error: 'This digest is not an unsent shadow day.', status: 400 as const };
  }
  const rest = saved.filter((day) => day.date !== date);
  rest.push({ date, digest });
  saved.length = 0;
  saved.push(...rest.sort((a, b) => a.date.localeCompare(b.date)).slice(-14));
  return { clock: clock(), days: saved.map((day) => ({ date: day.date })), source: 'dev-preview' as const };
}
