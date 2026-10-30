import assert from 'node:assert/strict';
import test from 'node:test';
import { ownerArrivalLines, ownerOfferLines, ownerStartLines, ownerTurnLines } from './owner-offers.ts';

test('Todd sees Ranch and River quote choices with no price', () => {
  const lines = ownerOfferLines([], '2026-10-29', []);
  assert.equal(lines.map((line) => line.id).join(','), 'ranch,river');
  assert.match(lines[1]?.text ?? '', /River Nov 1 can quote 2, 3, 4, 7, 14, 28 nights/);
  assert.match(lines[1]?.text ?? '', /can request an early arrival, a later checkout, and a grocery drop/);
  assert.match(lines[0]?.text ?? '', /Ranch Oct 29 can request a later checkout/);
  assert.equal(lines.some((line) => line.text.includes('Lindon') || line.text.includes('$')), false);
  const held = ownerOfferLines([], '2026-10-29', [{ propertyId: 'river', start: '2026-11-01', end: '2026-11-03' }]);
  assert.match(held[1]?.text ?? '', /River Nov 3 can quote 2, 3, 4, 7, 14, 28 nights/);
  assert.equal(held[1]?.text.includes('early arrival'), false);
  const starts = ownerStartLines([], '2026-10-29', []);
  assert.equal(starts.map((line) => line.id).join(','), 'ranch,river');
  assert.match(starts[0]?.text ?? '', /weekend nights show 2 nights/);
  assert.match(starts[1]?.text ?? '', /Nov 23 starts at 4 nights/);
  assert.equal(starts.some((line) => line.text.includes('Lindon') || line.text.includes('$')), false);
  const turns = ownerTurnLines(
    [
      { id: 'a', propertyId: 'ranch', checkIn: '2026-10-28', checkOut: '2026-11-04', status: 'confirmed' },
      { id: 'b', propertyId: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-08', status: 'confirmed' },
      { id: 'c', propertyId: 'lindon', checkIn: '2026-11-01', checkOut: '2026-11-07', status: 'confirmed' },
      { id: 'd', propertyId: 'river', checkIn: '2026-11-01', checkOut: '2026-11-03', status: 'cancelled' },
    ],
    '2026-11-01',
  );
  assert.equal(turns.map((line) => line.id).join(','), 'ranch,river');
  assert.match(turns[0]?.text ?? '', /Ranch checkout Nov 4\. The next stay starts November 4, 2026\. The door code opens November 3, 2026/);
  assert.match(turns[1]?.text ?? '', /River: no checkout in the next 90 days/);
  assert.equal(turns.some((line) => line.text.includes('Lindon') || line.text.includes('$')), false);
  assert.equal(/password|code\s*\d/i.test(turns.map((line) => line.text).join(' ')), false);
  const arrivals = ownerArrivalLines(
    [
      { propertyId: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-08', status: 'confirmed', note: 'Ada Lovelace · 9 guests · 801-555-0100' },
      { propertyId: 'river', checkIn: '2026-12-10', checkOut: '2026-12-14', status: 'confirmed', note: 'a name with no count' },
      { propertyId: 'lindon', checkIn: '2026-11-01', checkOut: '2026-11-07', status: 'confirmed', note: '4 guests' },
      { propertyId: 'river', checkIn: '2026-11-01', checkOut: '2026-11-03', status: 'cancelled', note: '2 guests' },
      { propertyId: 'ranch', checkIn: '2026-10-20', checkOut: '2026-11-02', status: 'confirmed', note: '6 guests' },
    ],
    '2026-11-01',
  );
  assert.equal(arrivals.map((line) => line.id).join(','), 'ranch-2026-11-04-2026-11-08,river-2026-12-10-2026-12-14');
  assert.match(arrivals[0]?.text ?? '', /Ranch Nov 4 for 4 nights\. The booking says 9 guests\./);
  assert.match(arrivals[1]?.text ?? '', /does not say how many guests/);
  const arrivalText = arrivals.map((line) => line.text).join(' ');
  assert.equal(arrivalText.includes('Ada') || arrivalText.includes('801') || arrivalText.includes('Lindon') || arrivalText.includes('$'), false);
  const named = ownerArrivalLines(
    [
      {
        id: 'ranch-stay',
        propertyId: 'ranch',
        checkIn: '2026-11-04',
        checkOut: '2026-11-08',
        status: 'confirmed',
        note: 'Ada Lovelace · 9 guests · 801-555-0100',
      },
      { id: 'river-stay', propertyId: 'river', checkIn: '2026-12-10', checkOut: '2026-12-14', status: 'confirmed' },
    ],
    '2026-11-01',
    { 'ranch-stay': '6:00 PM', 'river-stay': '801-555-0100' },
  );
  assert.match(named[0]?.text ?? '', /The booking says 9 guests\. This stay names an arrival\. Arrival around 6:00 PM\./);
  assert.match(named[1]?.text ?? '', /does not say how many guests\. This stay does not name an arrival time\./);
  assert.equal(named.map((line) => line.text).join(' ').includes('801'), false);
  assert.equal(named.map((line) => line.text).join(' ').includes('Ada'), false);
});
