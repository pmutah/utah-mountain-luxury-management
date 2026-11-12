import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  constructionBasisCsv,
  macrsHintForStage,
  summarizeConstructionPhases,
} from './construction-analytics.ts';
import type { Expense } from './api.ts';

test('summarizeConstructionPhases aggregates partner spend, receipt coverage %, and MACRS hints strictly for construction rows', () => {
  const expenses: Expense[] = [
    {
      id: 'exp-1',
      month: '2026-08',
      propertyId: 'construction',
      category: 'Construction',
      stage: 'Framing',
      amount: 100000,
      paidBy: 'brandon',
      paidDate: '2026-08-12',
      receiptStoragePath: 'r/frame.pdf',
    },
    {
      id: 'exp-2',
      month: '2026-09',
      propertyId: 'construction',
      category: 'Construction',
      stage: 'Furnishings',
      amount: 50000,
      paidBy: 'todd',
      paidDate: '2026-09-04',
    },
    // Rental expense must be ignored by construction phase summary
    {
      id: 'exp-3',
      month: '2026-09',
      propertyId: 'ranch',
      category: 'Repairs',
      amount: 9999,
    },
  ];

  const summary = summarizeConstructionPhases(expenses);
  assert.equal(summary.totalUsd, 150000);
  assert.equal(summary.documentedUsd, 100000);
  assert.equal(summary.overallReceiptPct, 67);
  assert.equal(summary.acceleratedCandidateUsd, 50000);

  const framing = summary.phases.find((p) => p.stage === 'Framing')!;
  assert.equal(framing.brandonUsd, 100000);
  assert.equal(framing.toddUsd, 0);
  assert.equal(framing.receiptPct, 100);

  const furnishings = summary.phases.find((p) => p.stage === 'Furnishings')!;
  assert.equal(furnishings.toddUsd, 50000);
  assert.equal(furnishings.receiptPct, 0);
  assert.match(macrsHintForStage('Furnishings'), /5-yr/);

  const csv = constructionBasisCsv(expenses);
  assert.match(csv, /River House Construction Capital Basis/);
  assert.match(csv, /2026-08-12,2026-08,Framing,Brandon & Stephanie/);
  assert.equal(csv.includes('9999'), false, 'rental expense leaked into construction basis CSV');
});

test('TapeChart exposes calendar-today, multi-horizon toggles, and stay jump while DirectBookingPromises stays clean of channel/price leaks', () => {
  const tape = readFileSync(join(process.cwd(), 'src', 'components', 'TapeChart.tsx'), 'utf8');
  assert.match(tape, /data-bot="calendar-today"/, 'TapeChart must expose the BOT_SELECTORS.calendarToday control');
  assert.match(tape, /data-bot=\{`tape-horizon-\$\{d\}`\}/, 'TapeChart must offer horizon toggles');
  assert.match(tape, /uml:focus-guest/, 'TapeChart stay inspector must link directly to the guest record');

  const promises = readFileSync(join(process.cwd(), 'src', 'components', 'DirectBookingPromises.tsx'), 'utf8');
  assert.equal(/\$\d/.test(promises), false, 'DirectBookingPromises must not contain static dollar figures');
  assert.doesNotMatch(promises, /Airbnb|VRBO|being trialled|preview/i);
  assert.match(promises, /SLEEPS_TOGETHER/, 'DirectBookingPromises must derive capacities from SLEEPS_TOGETHER');
});
