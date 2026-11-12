import assert from 'node:assert/strict';
import test from 'node:test';
import { arrivalBoard } from './arrival-readiness.ts';
import { findNightGaps } from './gap-fill.ts';
import { omnibarHits } from './omnibar-search.ts';
import { parseUsgsInstant, classifyRiver } from './platform/river-flow.ts';
import { qrModules } from './qr-svg.ts';
import { layoutTape } from './tape-chart.ts';
import { utilitySpikes } from './utility-anomalies.ts';

test('a whole-house stay shades the wings and a short gap stays clickable', () => {
  const layout = layoutTape({
    start: '2026-11-12',
    days: 10,
    reservations: [
      { id: 'a', propertyId: 'ranch', checkIn: '2026-11-12', checkOut: '2026-11-14', guestName: 'Ada', source: 'Airbnb' },
      { id: 'b', propertyId: 'ranch', checkIn: '2026-11-16', checkOut: '2026-11-18', guestName: 'Bea', source: 'direct' },
      { id: 'w', propertyId: 'river', checkIn: '2026-11-12', checkOut: '2026-11-13', guestName: 'Whole', source: 'VRBO' },
      { id: 'g', propertyId: 'river', checkIn: '2026-11-14', checkOut: '2026-11-15', guestName: 'Garage', source: 'direct', units: ['garage-suite'] },
    ],
  });
  assert.equal(layout.bars.find((bar) => bar.id.startsWith('a:'))?.channel, 'airbnb');
  assert.ok(layout.gaps.some((gap) => gap.house === 'ranch' && gap.nights === 2 && gap.checkIn === '2026-11-14'));
  assert.ok(layout.cascades.some((cell) => cell.row === 'river-main-lodge' && cell.day === 0));
  assert.ok(layout.bars.some((bar) => bar.row === 'river-garage-suite'));
  assert.equal(layout.bars.some((bar) => bar.row === 'river-main-lodge' && bar.reservationId === 'g'), false);
  assert.equal(classifyRiver(200), 'prime');
  assert.equal(classifyRiver(800), 'high');
});

test('a missing USGS discharge is not a calm river', () => {
  const empty = parseUsgsInstant({ value: { timeSeries: [] } });
  assert.equal(empty.ok, false);
  const live = parseUsgsInstant({
    value: {
      timeSeries: [
        {
          variable: { variableCode: [{ value: '00060' }] },
          values: [{ value: [{ value: '420', dateTime: '2026-11-12T12:00:00Z' }] }],
        },
        {
          variable: { variableCode: [{ value: '00010' }] },
          values: [{ value: [{ value: '8', dateTime: '2026-11-12T12:00:00Z' }] }],
        },
      ],
    },
  });
  assert.equal(live.ok, true);
  if (live.ok) {
    assert.equal(live.cfs, 420);
    assert.equal(live.tempF, 46);
    assert.equal(live.state, 'swift');
  }
});

test('arrival pills do not call an unread door ready', () => {
  const [row] = arrivalBoard({
    asOf: '2026-11-12',
    guides: null,
    progress: [],
    reservations: [
      {
        id: 's1',
        guestName: 'Casey',
        propertyId: 'ranch',
        checkIn: '2026-11-13',
        checkOut: '2026-11-15',
        payout: 0,
        source: 'Airbnb',
      },
    ],
  });
  assert.equal(row?.pills.find((pill) => pill.id === 'door')?.state, 'unknown');
  assert.equal(row?.pills.find((pill) => pill.id === 'portal')?.state, 'missing');
  assert.equal(row?.pills.find((pill) => pill.id === 'pay')?.state, 'na');
});

test('gaps name a past guest only when a contact matches', () => {
  const gaps = findNightGaps(
    [
      { id: '1', propertyId: 'ranch', checkIn: '2026-11-01', checkOut: '2026-11-03', guestName: 'Pat Lee', guestEmail: 'pat@example.com', source: 'direct', status: 'confirmed' },
      { id: '2', propertyId: 'ranch', checkIn: '2026-11-10', checkOut: '2026-11-12', guestName: 'Sam', source: 'direct', status: 'confirmed' },
      { id: '3', propertyId: 'ranch', checkIn: '2026-11-14', checkOut: '2026-11-16', guestName: 'Jo', source: 'direct', status: 'confirmed' },
    ],
    '2026-11-01',
    40,
  );
  const gap = gaps.find((row) => row.checkIn === '2026-11-12');
  assert.equal(gap?.nights, 2);
  assert.match(gap?.link ?? '', /\/book\/\?house=ranch/);
  assert.equal(gap?.guests[0]?.name, 'Pat Lee');
  assert.match(gap?.draft ?? '', /Hi Pat/);
});

test('an owner search does not surface Lindon', () => {
  const hits = omnibarHits({
    query: 'lindon',
    hideLindon: true,
    reservations: [{ id: 'l', guestName: 'Lin', propertyId: 'lindon', checkIn: '2026-11-01', status: 'confirmed' }],
  });
  assert.equal(hits.some((hit) => hit.id === 'lindon' || hit.stayId === 'l'), false);
});

test('a utility bill at 1.6 times the usual month is flagged', () => {
  const spikes = utilitySpikes({
    reservations: [],
    expenses: [
      { id: 'a', month: '2026-08', propertyId: 'ranch', category: 'Electric', amount: 100 },
      { id: 'b', month: '2026-09', propertyId: 'ranch', category: 'Electric', amount: 100 },
      { id: 'c', month: '2026-10', propertyId: 'ranch', category: 'Electric', amount: 200, receiptStoragePath: 'receipt:c' },
    ],
  });
  assert.equal(spikes.some((spike) => spike.id === 'c' && spike.reason === 'multiple'), true);
});

test('a stay QR keeps the finder squares', () => {
  const modules = qrModules('https://wilhite-portfolio.pages.dev/stay/abc');
  assert.equal(modules.length, modules[0]?.length);
  assert.equal(modules[0]?.[0], true);
  assert.equal(modules[0]?.[6], true);
  assert.equal(modules[3]?.[3], true);
  assert.equal(modules[1]?.[1], false);
});
