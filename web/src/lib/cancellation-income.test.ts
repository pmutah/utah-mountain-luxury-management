/**
 * A cancelled stay earns nothing — except when the channel kept a cancellation fee and paid it out.
 *
 * Gabriel Veliz booked The Lindon House for Mar 29 – Apr 5, 2026 (Airbnb `HMPWJRXSCS`), cancelled, and Airbnb paid
 * out **$543.87** under the host's own cancellation policy. That money is real: it left Airbnb on March 30 and
 * landed in the Operating account. The booking never happened, so there is no stay, no night, and no clean — only
 * income.
 *
 * The trap this file exists to prevent: **`payout` on a cancelled row is not income.** It is the figure the stay
 * would have paid. Writing the fee into `payout` would make the board look right on one row and silently wrong on
 * every other cancelled stay, because the live book holds twenty of them with four-figure payouts that never
 * arrived. The fee therefore lives in `cancellationIncome`, and that field alone decides whether a cancelled row
 * posts.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cancellationIncomeOf,
  earnsOnCancellation,
  postsRevenue,
  revenueOf,
} from './cancellation-income.ts';
import { buildPortfolioReport, isActiveStay } from './report.ts';
import { calculateMetrics } from '../../functions/_lib/data.ts';
import { getAllReservations } from '../../functions/_lib/reservations-store.ts';
import type { Reservation } from './api';

const VELIZ: Reservation = {
  id: 'l-veliz',
  guestName: 'Gabriel Veliz',
  propertyId: 'lindon',
  checkIn: '2026-03-29',
  checkOut: '2026-04-05',
  /*
   * What the stay would have paid. This is the number that must never reach revenue — it is nearly seven times the
   * fee, and treating it as income is the whole class of bug this change is shaped to avoid.
   */
  payout: 3600,
  cancellationIncome: 543.87,
  source: 'Airbnb',
  status: 'cancelled',
  confirmationCode: 'HMPWJRXSCS',
};

/** A cancelled stay with no fee: the ordinary case, and it must keep behaving exactly as it did. */
const CANCELLED_NO_FEE: Reservation = {
  id: 'l-gone',
  guestName: 'Cancelled Guest',
  propertyId: 'lindon',
  checkIn: '2026-03-10',
  checkOut: '2026-03-14',
  payout: 1800,
  source: 'Airbnb',
  status: 'cancelled',
};

const CONFIRMED: Reservation = {
  id: 'l-real',
  guestName: 'Real Guest',
  propertyId: 'lindon',
  checkIn: '2026-03-06',
  checkOut: '2026-03-09',
  payout: 425.49,
  source: 'Airbnb',
  status: 'confirmed',
};

function lindonMarch(reservations: Reservation[]) {
  return buildPortfolioReport('2026-03', 'month', reservations, [], {}, 'lindon', 'all');
}

test('the fee is read as income, and the payout beside it is not', () => {
  assert.equal(cancellationIncomeOf(VELIZ), 543.87);
  assert.equal(earnsOnCancellation(VELIZ), true);
  // The decisive assertion: revenue picks the fee, never the 3,600 the stay would have paid.
  assert.equal(revenueOf(VELIZ), 543.87, 'revenue took the payout instead of the fee');
});

test('a cancelled stay with no fee earns nothing, and its payout is not income', () => {
  assert.equal(cancellationIncomeOf(CANCELLED_NO_FEE), 0);
  assert.equal(earnsOnCancellation(CANCELLED_NO_FEE), false);
  assert.equal(postsRevenue(CANCELLED_NO_FEE), false, 'a cancelled stay with no fee started posting revenue');
});

test('a confirmed stay is untouched by the cancellation rule', () => {
  assert.equal(cancellationIncomeOf(CONFIRMED), 0);
  assert.equal(postsRevenue(CONFIRMED), true);
  assert.equal(revenueOf(CONFIRMED), 425.49);
});

test('a blocked night never posts, even with a figure on it', () => {
  assert.equal(postsRevenue({ status: 'blocked', cancellationIncome: 500 }), false);
  assert.equal(cancellationIncomeOf({ status: 'blocked', cancellationIncome: 500 }), 0, 'a block earned a fee');
});

test('a fee on a row that is not cancelled is not income', () => {
  // Only the cancelled path reads the field, so a stray figure on a confirmed row cannot double-count the payout.
  assert.equal(cancellationIncomeOf({ status: 'confirmed', cancellationIncome: 500 }), 0);
  assert.equal(revenueOf({ status: 'confirmed', cancellationIncome: 500, payout: 900 }), 900);
});

test('rubbish is not money', () => {
  for (const bad of [0, -50, Number.NaN, Number.POSITIVE_INFINITY, null, undefined] as const) {
    assert.equal(cancellationIncomeOf({ status: 'cancelled', cancellationIncome: bad }), 0, `${String(bad)} counted as a fee`);
  }
});

test('the fee posts in the check-in month, and only there', () => {
  const march = lindonMarch([VELIZ]);
  assert.equal(march.properties[0]!.revenue, 543.87, 'the March fee did not reach Lindon revenue');

  const april = buildPortfolioReport('2026-04', 'month', [VELIZ], [], {}, 'lindon', 'all');
  assert.equal(april.properties[0]!.revenue, 0, 'the fee was counted a second time in April');
});

test('the fee is income with no stay, night, or occupancy behind it', () => {
  const report = lindonMarch([VELIZ]);
  const row = report.properties[0]!;
  assert.equal(row.stayCount, 0, 'a cancelled stay was counted as a stay');
  assert.equal(row.stayNights, 0, 'a cancelled stay contributed stay nights');
  assert.equal(row.occupiedNights, 0, 'a cancelled stay occupied a night');
  assert.equal(row.channels.Airbnb.stays, 0, 'the channel counted a stay that never happened');
  // And no turnover clean was charged for a house nobody slept in.
  assert.equal(row.cleaning, 0, 'a clean was charged for a cancelled stay');
});

test('the fee shows on the channel it was paid through', () => {
  const report = lindonMarch([VELIZ]);
  assert.equal(report.properties[0]!.channels.Airbnb.revenue, 543.87, 'the fee is not attributed to Airbnb');
});

test('one fee posts beside a real stay without disturbing it', () => {
  const report = lindonMarch([CONFIRMED, VELIZ, CANCELLED_NO_FEE]);
  const row = report.properties[0]!;
  assert.equal(row.revenue, 425.49 + 543.87, 'the month total is not the real stay plus the one fee');
  assert.equal(row.stayCount, 1, 'the stay count is not exactly the one stay that happened');
});

test('the metrics route and the report agree on the month', () => {
  /*
   * Two independent implementations sum this month: `calculateMetrics` feeds the overview and the house cards,
   * `buildPortfolioReport` feeds the management report. A fee counted in one and not the other would show a host two
   * different revenues for the same month on the same screen.
   */
  const reservations = [CONFIRMED, VELIZ, CANCELLED_NO_FEE];
  const metrics = calculateMetrics('lindon', '2026-03', {}, [], reservations);
  const report = lindonMarch(reservations);
  assert.equal(metrics.revenue, report.properties[0]!.revenue, 'the overview and the report disagree on March revenue');
  assert.equal(metrics.stayCount, report.properties[0]!.stayCount, 'the overview and the report disagree on stay count');
});

test('a cancellation fee does not make the row a stay for the calendar', () => {
  // `isActiveStay` governs nights, turns, and counts. The fee-bearing row must keep answering no.
  assert.equal(isActiveStay(VELIZ), false, 'a fee-bearing cancellation became an active stay');
});

test('the store keeps a cancelled row only when it carries a fee', async () => {
  /*
   * This is the mechanism that lets the fee reach the revenue lines at all. `getAllReservations` drops cancelled
   * rows so they cannot count as bookings; it has to keep the one that carries money, and keep dropping the rest.
   */
  const rows = [VELIZ, CANCELLED_NO_FEE, CONFIRMED];
  const env = {
    SETTINGS: {
      get: async (key: string) => (key === 'reservations' ? JSON.stringify(rows) : null),
      put: async () => undefined,
    },
  };
  const all = await getAllReservations(env as never);
  const ids = all.map((row) => row.id);
  assert.ok(ids.includes('l-veliz'), 'the fee-bearing cancellation was dropped, so its money cannot post');
  assert.equal(ids.includes('l-gone'), false, 'a cancelled stay with no fee was kept, so it can leak into a stay');
  assert.ok(ids.includes('l-real'));
});
