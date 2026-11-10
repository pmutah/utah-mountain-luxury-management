/**
 * What the market card will report for each house once the measured-median fix is deployed.
 *
 * Runs the real `buildMarketBoard` against the live comp set and asks, so the numbers in the commit message are measured
 * rather than predicted. Reads only.
 */
const BASE = 'https://wilhite-portfolio.pages.dev';
const token = process.env.MUSE_BOT_SECRET ?? '';

async function get(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  return JSON.parse(await res.text());
}

const { buildMarketBoard } = await import('../src/lib/market/board.ts');
const { toLiveComp, toLiveSnaps, indexSnaps } = await import('../src/lib/market/live.ts');
const { compsForHouse } = await import('../src/lib/market/comp-house.ts');

const compSet = await get('/api/pricing/comp-set');
const snaps = await get('/api/pricing/snapshots');

console.log('house   blended  measured  nights  surface shows');
for (const house of ['lindon', 'ranch', 'river'] as const) {
  const mine = compsForHouse(compSet.comps, house)
    .map((c: unknown) => toLiveComp(c as never))
    .filter((c): c is NonNullable<typeof c> => c !== null);
  const ids = new Set(mine.map((c) => c.id));
  const index = indexSnaps(toLiveSnaps(snaps.snaps).filter((s: { compId: string }) => ids.has(s.compId)));
  const board = buildMarketBoard(house, '2026-11-10', 90, undefined, { comps: mine, index }, [], undefined);
  const shows =
    board.summary.liveMedianAsk != null && board.summary.measuredNights >= 5
      ? `$${board.summary.liveMedianAsk}`
      : 'Not measured yet';
  console.log(
    `${house.padEnd(7)} $${String(board.summary.medianAsk).padEnd(8)} $${String(board.summary.liveMedianAsk ?? 'null').padEnd(8)} ${String(board.summary.measuredNights).padEnd(7)} ${shows}`,
  );
}
