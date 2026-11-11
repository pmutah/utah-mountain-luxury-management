/**
 * End-to-end: the real metrics route over a book shaped like production, with and without the fee.
 *
 * The unit tests prove the arithmetic. This proves the wiring: that `/api/portfolio/metrics` — the route behind the
 * house cards and the Overview revenue figure — actually reads `cancellationIncome`, and that adding it moves revenue
 * by exactly the fee and by nothing else.
 *
 * Every assertion here is a **difference**, never a bare total, and that is deliberate. `getAllReservations` merges
 * the seed rows into whatever the store holds, so an absolute figure for a month also contains stand-in stays that
 * have nothing to do with the case under test. Comparing two books that differ only in the row being examined keeps
 * the seed out of it and measures the one thing this feature changes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequestGet } from '../../functions/api/portfolio/metrics.ts';
import { buildPortfolioReport } from '../../src/lib/report.ts';
import type { Reservation } from '../../src/lib/api';

type Handler = (context: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>;

const COOKIE = `wpm_auth=${btoa('wpm:pw').replace(/=+$/, '')}`;

function kv(rows: unknown[]) {
  const store = new Map<string, string>();
  store.set('reservations', JSON.stringify(rows));
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list() {
      return { keys: [], list_complete: true };
    },
  };
}

function call(rows: unknown[], month = '2026-03') {
  return {
    request: new Request(`https://x/api/portfolio/metrics?month=${month}`, { headers: { Cookie: COOKIE } }),
    env: { SETTINGS: kv(rows), DASHBOARD_PASSWORD: 'pw' },
    params: {},
  };
}

type Metrics = {
  lindon: { revenue: number; stayCount: number; totalCleaning: number };
  totalRevenue: number;
  reservations: Array<{ id: string; cancellationIncome?: number }>;
};

async function metrics(rows: unknown[], month = '2026-03'): Promise<Metrics> {
  const res = await (onRequestGet as unknown as Handler)(call(rows, month));
  assert.equal(res.status, 200);
  return (await res.json()) as Metrics;
}

/*
 * The trap, in one row: **`payout` on a cancelled stay is what the stay would have paid, not money that arrived.**
 * Gabriel's row carries a 3,600 payout and a 543.87 fee. If any revenue path sums the payout of a cancelled row, the
 * difference below jumps by thousands instead of by the fee.
 */
const VELIZ = {
  id: 'l-veliz',
  guestName: 'Gabriel Veliz',
  propertyId: 'lindon',
  checkIn: '2026-03-29',
  checkOut: '2026-04-05',
  payout: 3600,
  cancellationIncome: 543.87,
  source: 'Airbnb',
  status: 'cancelled',
  confirmationCode: 'HMPWJRXSCS',
};

/** A cancelled stay with no fee: the ordinary case, which must change nothing at all. */
const CANCELLED_NO_FEE = {
  id: 'l-gone',
  guestName: 'Cancelled Guest',
  propertyId: 'lindon',
  checkIn: '2026-03-10',
  checkOut: '2026-03-14',
  payout: 1800,
  source: 'Airbnb',
  status: 'cancelled',
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

test('the metrics route posts the fee, and only the fee', async () => {
  const withFee = await metrics([VELIZ]);
  const withoutRow = await metrics([]);

  assert.equal(
    round2(withFee.lindon.revenue - withoutRow.lindon.revenue),
    543.87,
    'the fee-bearing cancelled stay did not add exactly the cancellation fee to Lindon revenue',
  );
  assert.equal(
    round2(withFee.totalRevenue - withoutRow.totalRevenue),
    543.87,
    'the portfolio total did not move by exactly the fee',
  );
  assert.equal(withFee.lindon.stayCount, withoutRow.lindon.stayCount, 'the fee changed the stay count');
  assert.equal(
    withFee.lindon.totalCleaning,
    withoutRow.lindon.totalCleaning,
    'a clean was charged for a cancelled stay (the cleaning fallback is stays x the house fee)',
  );
});

test('a cancelled stay with no fee changes nothing, even carrying a large payout', async () => {
  const withRow = await metrics([CANCELLED_NO_FEE]);
  const withoutRow = await metrics([]);
  assert.equal(withRow.lindon.revenue, withoutRow.lindon.revenue, 'a fee-less cancellation moved revenue');
  assert.equal(withRow.lindon.stayCount, withoutRow.lindon.stayCount, 'a fee-less cancellation counted as a stay');
  // And it never reaches the board.
  assert.equal(
    withRow.reservations.some((row) => row.id === 'l-gone'),
    false,
    'a cancelled stay with no fee leaked into the stay list',
  );
});

test('the fee-bearing row reaches the client so the board can name it', async () => {
  const body = await metrics([VELIZ]);
  const row = body.reservations.find((item) => item.id === 'l-veliz');
  assert.ok(row, 'the fee-bearing cancellation never reached the board');
  assert.equal(row.cancellationIncome, 543.87, 'the fee was dropped in transit, so the board cannot show it');
});

test('removing the fee removes exactly the fee, and nothing else moves', async () => {
  const withFee = await metrics([VELIZ]);
  const withoutFee = await metrics([{ ...VELIZ, cancellationIncome: undefined }]);
  assert.equal(
    round2(withFee.lindon.revenue - withoutFee.lindon.revenue),
    543.87,
    'the difference between having the fee and not having it is not exactly the fee',
  );
  assert.equal(withFee.lindon.stayCount, withoutFee.lindon.stayCount, 'the fee changed the stay count');
});

test('the report view of the same book matches the metrics view', async () => {
  const body = await metrics([VELIZ]);
  const report = buildPortfolioReport('2026-03', 'month', body.reservations, [], {}, 'lindon', 'all');
  assert.equal(
    report.properties[0]!.revenue,
    body.lindon.revenue,
    'the management report and the house card show different revenue for the same month',
  );
  assert.equal(report.properties[0]!.stayCount, body.lindon.stayCount);
});

test('a book of cancelled stays alone earns only their fees', async () => {
  // The shape that would be catastrophic if `payout` were read: no stays at all, but real money.
  const body = await metrics([VELIZ, CANCELLED_NO_FEE]);
  const empty = await metrics([]);
  assert.equal(round2(body.lindon.revenue - empty.lindon.revenue), 543.87, 'a cancelled stay posted its would-have-paid payout');
  assert.equal(body.lindon.stayCount, empty.lindon.stayCount, 'a month with no stay reported one');
});

test('the fee posts in March and not in April', async () => {
  /*
   * The fee follows the check-in month, the rule every other payout already uses — and the month it was actually
   * paid: Airbnb released this on 2026-03-30 for a 2026-03-29 arrival. It crosses into April as a stay would, but the
   * money must be counted once.
   */
  const march = await metrics([VELIZ], '2026-03');
  const marchEmpty = await metrics([], '2026-03');
  const april = await metrics([VELIZ], '2026-04');
  const aprilEmpty = await metrics([], '2026-04');

  assert.equal(round2(march.lindon.revenue - marchEmpty.lindon.revenue), 543.87, 'the fee is not in March');
  assert.equal(round2(april.lindon.revenue - aprilEmpty.lindon.revenue), 0, 'the fee was counted again in April');
});
