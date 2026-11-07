import assert from 'node:assert/strict';
import test from 'node:test';
import { bothHouseMonthNights } from './compound.ts';
import { bothHouseEventPlans, bothHouseNextEventLine, eventPlanCompare, eventPlans, houseNextEventLine, ownerEventLines, ownerEvents } from './event-plan.ts';

test('upcoming events name the shortest stay and do not say the house is open', () => {
  const river = eventPlans('river', '2026-10-30');
  const baylor = river.find((line) => line.includes('BYU vs Baylor'));
  const thanks = river.find((line) => line.includes('Thanksgiving'));
  const christmas = river.find((line) => line.includes('Christmas'));
  assert.match(baylor ?? '', /2 nights/);
  assert.match(thanks ?? '', /4 nights/);
  assert.match(christmas ?? '', /5 nights/);
  assert.equal(river.some((line) => line.includes('Arizona State')), false);
  const text = river.join('\n').replace(/does not say the house is open/g, '');
  assert.equal(text.includes('$'), false);
  assert.equal(text.includes('house is open'), false);
  assert.match(text, /Nothing is charged yet/);
  const ranch = eventPlans('ranch', '2026-10-30').find((line) => line.includes('Arizona State'));
  assert.match(ranch ?? '', /1 night/);
  assert.equal((ranch ?? '').includes('$'), false);
  const compared = eventPlanCompare('2026-10-30');
  const thanksRow = compared.find((row) => row.label.includes('Thanksgiving'));
  const asu = compared.find((row) => row.label.includes('Arizona State'));
  assert.equal(thanksRow?.houses.find((house) => house.house === 'river')?.nights, 4);
  assert.equal(asu?.houses.find((house) => house.house === 'river')?.absent, true);
  assert.equal(asu?.houses.find((house) => house.house === 'ranch')?.nights, 1);
  const comparedText = compared
    .flatMap((row) => [row.label, ...row.houses.map((house) => `${house.name} ${house.nights ?? ''}`)])
    .join('\n');
  assert.equal(comparedText.includes('$'), false);
  assert.equal(/\bthe house is open\b/i.test(comparedText), false);
});

test('Todd’s page names Ranch and River events and leaves Lindon off', () => {
  const lines = ownerEventLines('2026-10-30');
  const thanks = lines.find((line) => line.includes('Thanksgiving')) ?? '';
  const asu = lines.find((line) => line.includes('Arizona State')) ?? '';
  assert.match(thanks, /The River House: 4 nights/);
  assert.match(thanks, /The Ranch House:/);
  assert.match(asu, /The Ranch House: 1 night/);
  assert.match(asu, /The River House is not on this event/);
  const text = lines.join('\n');
  assert.match(text, /Lindon is not on this page/);
  assert.equal(text.includes('Lindon House'), false);
  assert.equal(text.includes('$'), false);
  assert.equal(text.replace(/does not say a house is open/g, '').toLowerCase().includes('house is open'), false);
  assert.match(text, /Nothing is charged yet/);
  const events = ownerEvents('2026-10-30');
  const asuEvent = events.find((event) => event.label.includes('Arizona State'));
  const ranch = asuEvent?.stays.find((stay) => stay.house === 'ranch');
  const river = asuEvent?.stays.find((stay) => stay.house === 'river');
  assert.match(ranch?.href ?? '', /^\/houses\/ranch\?in=\d{4}-\d{2}-\d{2}&out=\d{4}-\d{2}-\d{2}$/);
  assert.equal(ranch?.href?.includes('guests='), false);
  assert.equal(river?.href, null);
  assert.equal(events.some((event) => event.stays.some((stay) => stay.house === 'lindon' as string)), false);
  assert.equal(JSON.stringify(events).includes('$'), false);
});

test('a booked event start is named and is not offered as a quote', () => {
  const taken = ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'];
  const ranch = eventPlans('ranch', '2026-10-31', { taken }).find((line) => line.includes('Thanksgiving')) ?? '';
  assert.match(ranch, /already booked/);
  assert.equal(ranch.includes('can quote'), false);
  assert.equal(ranch.includes('$'), false);
  const compared = eventPlanCompare('2026-10-31', { taken: { ranch: taken } });
  const thanks = compared.find((row) => row.label.includes('Thanksgiving'));
  assert.match(thanks?.houses.find((house) => house.house === 'ranch')?.hold ?? '', /already booked/);
  assert.equal(thanks?.houses.find((house) => house.house === 'river')?.nights, 4);
  assert.equal(thanks?.houses.find((house) => house.house === 'river')?.hold, null);
  const next = houseNextEventLine('ranch', '2026-11-24', { taken });
  assert.equal(next.includes('Thanksgiving'), false);
  assert.match(next, /Christmas/);
  assert.equal(next.includes('$'), false);
  const owner = ownerEvents('2026-10-31', { taken: { ranch: taken } });
  const ownerThanks = owner.find((event) => event.label.includes('Thanksgiving'));
  const ownerRanch = ownerThanks?.stays.find((stay) => stay.house === 'ranch');
  const ownerRiver = ownerThanks?.stays.find((stay) => stay.house === 'river');
  assert.match(ownerRanch?.line ?? '', /already booked/);
  assert.equal(ownerRanch?.href, null);
  assert.equal(ownerRiver?.nights, 4);
  assert.match(ownerRiver?.href ?? '', /^\/houses\/river\?in=2026-11-25&out=/);
  assert.equal(JSON.stringify(owner).includes('$'), false);
});

test('a two-house event follows a night booked at either house', () => {
  const taken = ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'];
  const nights = bothHouseMonthNights({ ranch: taken, lindon: ['2026-11-13'] }, { lindon: ['2026-11-13'] });
  const lines = bothHouseEventPlans('2026-11-04', nights);
  const thanks = lines.find((line) => line.includes('Thanksgiving')) ?? '';
  const baylor = lines.find((line) => line.includes('Baylor')) ?? '';
  assert.match(thanks, /already booked/);
  assert.equal(thanks.includes('can quote'), false);
  assert.match(baylor, /Both houses can quote/);
  assert.equal(baylor.includes('$'), false);
  assert.equal(/\bis open\b/.test(lines.join('\n')), false);
  assert.equal(nights.taken.includes('2026-11-13'), false);
  const next = bothHouseNextEventLine('2026-11-24', { taken, closed: [] });
  assert.equal(next.includes('Thanksgiving'), false);
  assert.match(next, /Next event both houses can quote: Christmas/);
  assert.equal(next.includes('$'), false);
});
