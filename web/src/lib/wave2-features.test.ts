import assert from 'node:assert/strict';
import test from 'node:test';
import { computeMountainLight, moonPhaseForDate, mountainUtcOffsetHours } from './mountain-alpenglow.ts';
import {
  buildItineraryIcs,
  CURATED_TRACKS,
  formatItineraryPlainText,
  generateUtahItinerary,
} from './itinerary-studio.ts';
import { macrs39Year1Rate, simulateCostSegregation, sumLoggedConstructionSpend } from './cost-seg.ts';
import {
  missingRowsToCsv,
  parseStatementText,
  reconcileStatementAgainstExpenses,
} from './statement-reconciler.ts';
import { simulatePortfolioWhatIf } from './report-whatif.ts';
import { buildPortfolioReport } from './report.ts';

test('mountain alpenglow computes summer MDT and winter MST solar windows and moon phases deterministically', () => {
  assert.equal(mountainUtcOffsetHours(2026, 7, 1), -6);
  assert.equal(mountainUtcOffsetHours(2026, 12, 15), -7);
  assert.equal(computeMountainLight('not-a-date', 'river'), null);
  assert.equal(computeMountainLight('2026-02-30', 'river'), null);

  const summer = computeMountainLight('2026-06-21', 'ranch')!;
  const winter = computeMountainLight('2026-12-21', 'ranch')!;
  assert.ok(summer.daylightHours > winter.daylightHours + 4, 'summer solstice must have >4h more daylight than winter');
  assert.match(summer.sunrise, /^\d{1,2}:\d{2} AM$/);
  assert.match(winter.sunset, /^\d{1,2}:\d{2} PM$/);

  // River House sits inside Provo Canyon walls, so direct sun dips earlier than on the valley floor
  const canyonWinter = computeMountainLight('2026-12-21', 'river')!;
  assert.notEqual(canyonWinter.sunset, winter.sunset);

  const moon = moonPhaseForDate('2026-11-12');
  assert.ok(moon.illuminationPct >= 0 && moon.illuminationPct <= 100);
  assert.ok(moon.name.length > 3);
});

test('every itinerary track across all three houses carries zero prices, zero door codes, zero build notes, and valid ICS', () => {
  const forbidden = /\b(door\s*code|wi-?fi\s*password|placeholder|coming soon|not done|in progress|tbd|todo|under construction)\b/i;

  for (const house of ['river', 'ranch', 'lindon'] as const) {
    for (const track of CURATED_TRACKS) {
      const plans = generateUtahItinerary({
        house,
        track: track.id,
        days: 4,
        startDate: '2026-12-10',
      });
      assert.equal(plans.length, 4);
      assert.equal(plans[0]!.dateIso, '2026-12-10');
      assert.equal(plans[3]!.dateIso, '2026-12-13');

      const plain = formatItineraryPlainText('Test House', track.label, plans);
      assert.equal(plain.includes('$'), false, `${house}/${track.id} leaked a dollar sign`);
      assert.equal(forbidden.test(plain), false, `${house}/${track.id} leaked internal or secret text`);

      const ics = buildItineraryIcs('Test House', track.label, plans);
      assert.match(ics, /^BEGIN:VCALENDAR/);
      assert.match(ics, /BEGIN:VEVENT/);
      assert.match(ics, /DTSTART;VALUE=DATE:20261210/);
      assert.match(ics, /END:VCALENDAR$/);
    }
  }
});

test('cost-segregation simulator compares 39-year mid-month straight-line against bonus depreciation buckets', () => {
  // November (month 11) has 1.5 months in service out of 12 * 39
  const novRate = macrs39Year1Rate(11);
  assert.ok(Math.abs(novRate - 1.5 / (12 * 39)) < 1e-9);

  const bonus100 = simulateCostSegregation({
    grossBasisUsd: 2_000_000,
    landValuePct: 0.2, // $1,600,000 depreciable building basis
    profileId: 'luxury-lodge', // 30% accelerated = $480,000 in 5/7/15-yr
    bonusRate: 1,
    placedInServiceMonth: 11,
    marginalFedRate: 0.32,
    includeUtahTax: true,
    ownershipShare: 0.5,
  });

  assert.equal(bonus100.depreciableBasisUsd, 1_600_000);
  // 30% of $1.6M = $480k immediate bonus + 39-yr slice on remaining $1.12M
  assert.ok(bonus100.acceleratedYear1TotalUsd > 480_000);
  assert.ok(bonus100.straightLine39Year1Usd < 6_000);
  assert.equal(bonus100.ownerShareYear1DeductionUsd, Math.round(bonus100.acceleratedYear1TotalUsd * 0.5 * 100) / 100);

  const bonus40 = simulateCostSegregation({
    grossBasisUsd: 2_000_000,
    landValuePct: 0.2,
    profileId: 'luxury-lodge',
    bonusRate: 0.4,
    placedInServiceMonth: 11,
    marginalFedRate: 0.32,
    includeUtahTax: true,
    ownershipShare: 0.5,
  });
  assert.ok(bonus100.acceleratedYear1TotalUsd > bonus40.acceleratedYear1TotalUsd);

  const spend = sumLoggedConstructionSpend([
    { id: 'c1', month: '2026-08', propertyId: 'construction', category: 'Framing', amount: 40000, paidBy: 'brandon' },
    { id: 'c2', month: '2026-09', propertyId: 'construction', category: 'HVAC', amount: 25000, paidBy: 'todd' },
    { id: 'r1', month: '2026-09', propertyId: 'ranch', category: 'Utilities', amount: 300 },
  ]);
  assert.equal(spend.total, 65000);
  assert.equal(spend.brandon, 40000);
  assert.equal(spend.todd, 25000);
  assert.equal(spend.count, 2);
});

test('bank CSV reconciler handles Chase negative charges and prevents one receipt from matching two identical charges', () => {
  const chaseCsv = [
    'Transaction Date,Post Date,Description,Category,Type,Amount',
    '11/04/2026,11/05/2026,ROCKY MOUNTAIN POWER,Bills,Sale,-312.40',
    '11/08/2026,11/09/2026,APRIL JENSON CLEANING,Services,Sale,-350.00',
    '11/15/2026,11/16/2026,APRIL JENSON CLEANING,Services,Sale,-350.00',
    '11/18/2026,11/18/2026,PAYMENT THANK YOU - WEB,,Payment,1012.40',
    '11/20/2026,11/21/2026,THE HOME DEPOT #4408 OREM,Home,Sale,-184.15',
  ].join('\n');

  const parsed = parseStatementText(chaseCsv);
  assert.equal(parsed.lines.length, 4, 'header and payment thank-you must be skipped while 4 debits parse');

  const summary = reconcileStatementAgainstExpenses(chaseCsv, [
    { id: 'e1', month: '2026-11', propertyId: 'ranch', category: 'Utilities', vendor: 'Rocky Mountain Power', amount: 312.4, receiptUrl: '/r/1' },
    // Only ONE $350 cleaning receipt is logged; the second $350 charge must stay unlogged!
    { id: 'e2', month: '2026-11', propertyId: 'ranch', category: 'Cleaning', vendor: 'April Jenson', amount: 350 },
  ]);

  assert.equal(summary.matchedCount, 2);
  assert.equal(summary.missingCount, 2);
  assert.equal(summary.matchedTotalUsd, 662.4);
  assert.equal(summary.missingTotalUsd, 534.15);

  const missingCsv = missingRowsToCsv(summary);
  assert.match(missingCsv, /HOME DEPOT/);
  assert.match(missingCsv, /Repairs,Line 14/);
});

test('portfolio what-if simulator preserves baseline at zero delta and scales partner waterfall accurately', () => {
  const report = buildPortfolioReport(
    '2026-11',
    'month',
    [
      { id: 's1', guestName: 'Guest', propertyId: 'ranch', checkIn: '2026-11-05', checkOut: '2026-11-09', payout: 4000, source: 'Airbnb', status: 'confirmed' },
      { id: 's2', guestName: 'Guest 2', propertyId: 'lindon', checkIn: '2026-11-10', checkOut: '2026-11-14', payout: 1600, source: 'VRBO', status: 'confirmed' },
    ],
    [],
    {},
    'all',
    'all',
  );

  const baseline = simulatePortfolioWhatIf(report.properties, {
    adrDeltaPct: 0,
    occupancyDeltaPts: 0,
    directShiftPct: 0,
  });

  assert.equal(baseline.revenueDelta, 0);
  assert.equal(baseline.profitDelta, 0);

  const lifted = simulatePortfolioWhatIf(report.properties, {
    adrDeltaPct: 10,
    occupancyDeltaPts: 10,
    directShiftPct: 30,
  });

  assert.ok(lifted.projectedRevenue > baseline.baseRevenue);
  assert.ok(lifted.projectedProfit > baseline.baseProfit);
  assert.ok(lifted.projectedBrandon > baseline.baseBrandon);
  assert.ok(lifted.projectedTodd > baseline.baseTodd);
});
