import { cleanJobView, cleanPageNote, sortCleanJobs } from '../src/lib/clean-link';

/**
 * Local preview only. The deployed route builds the jobs from the saved bookings; this fixture lets
 * the cleaner page and the host link card be checked in a dev browser.
 */
const TOKEN = 'abcdefabcdefabcdefabcdefabcdef12';

export const DEV_CLEAN_TOKEN = TOKEN;

export function devCleanLinks() {
  return {
    links: [
      {
        token: TOKEN,
        label: 'Preview cleaner',
        path: `/clean/${TOKEN}`,
        createdAt: new Date().toISOString(),
        lastViewedAt: null,
        views: 0,
      },
    ],
    storageReads: 'ok' as const,
    source: 'dev-preview' as const,
  };
}

export function devMintCleanLink(body: { label?: string } = {}) {
  return {
    token: TOKEN,
    label: body.label?.trim() || 'Cleaner',
    path: `/clean/${TOKEN}`,
    createdAt: new Date().toISOString(),
    source: 'dev-preview' as const,
  };
}

export function devCleanJobs(lang: string | null) {
  const scope = lang === 'es' ? 'es' : 'en';
  const jobs = sortCleanJobs(
    [
      { house: 'river' as const, checkout: '2026-11-14', gapNights: 2 },
      { house: 'ranch' as const, checkout: '2026-11-16', gapNights: 0 },
      { house: 'lindon' as const, checkout: '2026-11-19', gapNights: 3 },
    ].flatMap((row) => {
      const view = cleanJobView({ ...row, lang: scope });
      return view ? [view] : [];
    }),
  );
  return {
    jobs,
    progress: devProgress(),
    note: cleanPageNote(jobs, false),
    lang: scope,
    storageReads: 'ok' as const,
    source: 'dev-preview' as const,
  };
}

/** Ticks made in this dev session, so the page and the desk agree during a preview. */
const ticks = new Map<string, string[]>();

function devProgress() {
  return [...ticks.entries()].map(([key, done]) => {
    const [house, checkout] = key.split(':');
    return { house, checkout, done, updatedAt: new Date().toISOString() };
  });
}

export function devSaveCleanProgress(body: { house?: string; checkout?: string; done?: unknown } = {}) {
  const house = typeof body.house === 'string' ? body.house : '';
  const checkout = typeof body.checkout === 'string' ? body.checkout : '';
  const done = Array.isArray(body.done) ? body.done.filter((id): id is string => typeof id === 'string') : null;
  if (!house || !checkout || !done) {
    return { error: 'A house, a checkout, and a list of done steps are required.', status: 400 as const };
  }
  ticks.set(`${house}:${checkout}`, done);
  return { ok: true, progress: devProgress() };
}

export function devCleanProgressHost() {
  return {
    progress: devProgress(),
    summary: null,
    storageReads: 'ok' as const,
    source: 'dev-preview' as const,
  };
}
