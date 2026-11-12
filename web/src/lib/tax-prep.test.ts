import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildTaxYearPacket,
  evaluateMaterialParticipation,
  mapCategoryToScheduleELine,
  taxPacketToCsv,
} from './tax-prep.ts';
import type { Expense, Reservation } from './api.ts';

test('tax year 2025 is locked to the filed Ben Campbell return and refuses live CSV re-export', () => {
  const locked = buildTaxYearPacket({
    year: 2025,
    reservations: [
      { id: 'r1', guestName: 'Guest', propertyId: 'ranch', checkIn: '2025-07-10', checkOut: '2025-07-14', payout: 4200, source: 'Airbnb' },
    ],
    expenses: [
      { id: 'exp-1', month: '2025-07', propertyId: 'ranch', category: 'Utilities', amount: 300 },
    ],
  });

  assert.equal(locked.locked2025, true);
  assert.equal(locked.properties.length, 0);
  assert.equal(locked.totalRents, 0);
  const csv = taxPacketToCsv(locked);
  assert.match(csv, /Locked/);
  assert.match(csv, /2025 filed return is locked/);
});

test('2026 Schedule E mapper, §469 7-day stay test, §280A ceiling, and 1099-NEC thresholds compute accurately', () => {
  const reservations: Reservation[] = [
    // Ranch: two 4-night stays -> avg 4.0 days -> qualifies <= 7.0d
    { id: 's1', guestName: 'A', propertyId: 'ranch', checkIn: '2026-06-01', checkOut: '2026-06-05', payout: 3200, source: 'Airbnb', status: 'confirmed' },
    { id: 's2', guestName: 'B', propertyId: 'ranch', checkIn: '2026-07-10', checkOut: '2026-07-14', payout: 3600, source: 'Direct', guestTotal: 3900, status: 'confirmed' },
    // Cancelled stay with cancellationIncome -> adds revenue to Line 3, adds 0 stays and 0 nights
    { id: 's3', guestName: 'C', propertyId: 'ranch', checkIn: '2026-08-01', checkOut: '2026-08-06', payout: 4000, cancellationIncome: 500, source: 'VRBO', status: 'cancelled' },
    // Lindon: one 10-night stay -> avg 10.0 days -> exceeds 7.0d
    { id: 's4', guestName: 'D', propertyId: 'lindon', checkIn: '2026-05-01', checkOut: '2026-05-11', payout: 2500, source: 'Airbnb', status: 'confirmed' },
  ];

  const expenses: Expense[] = [
    { id: 'exp-10', month: '2026-06', propertyId: 'ranch', category: 'Utilities', vendor: 'Rocky Mountain Power', amount: 420, receiptUrl: '/r/1' },
    { id: 'exp-11', month: '2026-07', propertyId: 'ranch', category: 'Repairs', vendor: 'Wasatch HVAC', amount: 780 },
    { id: 'exp-12', month: '2026-06', propertyId: 'ranch', category: 'Cleaning', vendor: 'April Jenson', amount: 350, receiptStoragePath: 'r/2' },
  ];

  const packet = buildTaxYearPacket({
    year: 2026,
    reservations,
    expenses,
    mileageTrips: [
      { id: 'm1', date: '2026-06-02', propertyId: 'ranch', routeLabel: 'Lindon ↔ Ranch', miles: 100, purpose: 'Inspection' },
    ],
  });

  assert.equal(packet.locked2025, false);
  const ranch = packet.properties.find((p) => p.propertyId === 'ranch')!;
  // 3200 + 3600 + 500 cancellation fee = 7300 (cancelled 4000 payout ignored!)
  assert.equal(ranch.lines.line3_rents, 7300);
  assert.equal(ranch.lines.line17_utilities, 420);
  assert.equal(ranch.lines.line14_repairs, 780);
  assert.equal(ranch.lines.line7_cleaning_maintenance, 350);
  assert.equal(ranch.lines.line6_auto_travel, 70); // 100 miles * $0.70
  assert.equal(ranch.missingReceiptsCount, 1); // exp-11 has no receipt

  const ranchRule = packet.strRules.find((r) => r.propertyId === 'ranch')!;
  assert.equal(ranchRule.stayCount, 2);
  assert.equal(ranchRule.totalStayNights, 8);
  assert.equal(ranchRule.averageStayDays, 4);
  assert.equal(ranchRule.status, 'qualifies-7day');
  assert.equal(ranchRule.personalUseCeilingDays, 14);

  const lindonRule = packet.strRules.find((r) => r.propertyId === 'lindon')!;
  assert.equal(lindonRule.averageStayDays, 10);
  assert.equal(lindonRule.status, 'substantial-services-30day');
  assert.equal(lindonRule.longStaysOver7.length, 1);

  // Wasatch HVAC ($780) and April Jenson ($350 logged + $350 assumed July turn = $700) both >= $600
  const hvac = packet.vendors1099.find((v) => v.vendor === 'Wasatch HVAC');
  assert.equal(hvac?.status, 'requires-1099-review');

  // Lodging tax separates OTA vs direct
  assert.equal(packet.lodgingTax.channelCollectedByOta, 2);
  assert.ok(packet.lodgingTax.directEstimate > 0);
  assert.equal(packet.lodgingTax.confirmed, false);
});

test('material participation compares host hours against cleaner turnover hours and 500h safe harbor', () => {
  const below = evaluateMaterialParticipation({
    year: 2026,
    cleanerHoursByProperty: { ranch: 80, lindon: 40, river: 10 }, // 130h cleaner total
    entries: [{ id: '1', date: '2026-11-01', propertyId: 'river', hours: 115, category: 'river-setup', note: 'Setup' }],
  });
  assert.equal(below.totalHours, 115);
  assert.equal(below.passes100HourAndMoreThanOthers, false, '115h does not beat 130h cleaner hours');
  assert.equal(below.passes500HourSafeHarbor, false);

  const above = evaluateMaterialParticipation({
    year: 2026,
    cleanerHoursByProperty: { ranch: 80, lindon: 40, river: 10 },
    entries: [{ id: '1', date: '2026-11-01', propertyId: 'river', hours: 145, category: 'river-setup', note: 'Setup' }],
  });
  assert.equal(above.passes100HourAndMoreThanOthers, true);
  assert.equal(mapCategoryToScheduleELine('Dominion Energy gas'), 'line17_utilities');
  assert.equal(mapCategoryToScheduleELine('Snow removal'), 'line7_cleaning_maintenance');
});

test('TaxPrepDesk stays lazy-loaded in App.tsx and refuses to render personal/Lindon tax data to an owner session', () => {
  const app = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
  assert.match(app, /const TaxPrepDesk = lazy\(/, 'TaxPrepDesk must stay lazy so the main shell stays small');

  const desk = readFileSync(join(process.cwd(), 'src', 'components', 'TaxPrepDesk.tsx'), 'utf8');
  assert.match(desk, /if \(hideLindon\)/, 'TaxPrepDesk must gate out read-only partner accounts');
  assert.match(desk, /data-bot="tax-not-visible"/);
});
