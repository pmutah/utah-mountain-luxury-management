import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStayCard } from './survey-stay-card.ts';

test('a staff card keeps a named arrival and drops a window that is not one we offered', () => {
  const named = buildStayCard({
    guestName: 'Ada Lovelace',
    propertyName: 'River House',
    checkIn: '2026-12-10',
    checkOut: '2026-12-13',
    propertyId: 'river',
    answers: { arrivalWindow: '6:00 PM', cell: '801-555-0100' },
  });
  const arrival = named.sections.find((section) => section.id === 'arrival');
  assert.deepEqual(arrival?.lines, ['Arrival around 6:00 PM.']);
  const junk = buildStayCard({
    guestName: 'Ada Lovelace',
    propertyName: 'River House',
    checkIn: '2026-12-10',
    checkOut: '2026-12-13',
    propertyId: 'river',
    answers: { arrivalWindow: '801-555-0100' },
  });
  assert.equal(junk.sections.some((section) => section.id === 'arrival'), false);
  assert.equal(JSON.stringify(junk.sections).includes('801'), false);
});
