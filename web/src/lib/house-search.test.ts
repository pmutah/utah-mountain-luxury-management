import assert from 'node:assert/strict';
import test from 'node:test';
import { heldSearchLines, houseCardLines, houseMonthPace, houseNextStayLine, housePageRhythm, housePartyLine, housePickLine, houseQuoteCaption, houseQuotePending, houseRhythms, otherStayRules, partyFitList, quotedStayHref, quotedStayPaint, searchHouses, shortestFixLines, stayRuleLines } from './house-search.ts';
import type { YearPace } from './market/fill.ts';
import type { HouseId } from './market/types.ts';

const pace = (): YearPace => 'unknown';
const open = { river: [] as string[], ranch: [] as string[], lindon: [] as string[] };

function textOf(result: ReturnType<typeof searchHouses>): string {
  return JSON.stringify(result);
}

test('the house month names a discount only when the party fits and the calendar is read', () => {
  assert.equal(houseMonthPace('river', '4', '', 'ready', 'short'), 'short');
  assert.equal(houseMonthPace('river', '36', '', 'ready', 'short'), 'unknown');
  assert.equal(houseMonthPace('river', '4', '', 'unread', 'short'), 'unknown');
  assert.equal(houseMonthPace('river', '4', '', 'loading', 'short'), 'unknown');
  assert.equal(houseMonthPace('river', '', '', 'ready', 'short'), 'short');
  assert.equal(houseMonthPace('river', '4', '', 'ready', 'met'), 'met');
  assert.equal(houseMonthPace('river', '4', '', 'ready', null), 'unknown');
});

test('a house button says whether these dates can be quoted and leaves the price off', () => {
  assert.equal(housePickLine('river', '2026-11-06', '2026-11-08', [], '2026-10-30', 'unknown'), 'These dates can be quoted.');
  assert.equal(housePickLine('river', '2026-11-06', '2026-11-08', [], '2026-10-30', 'unknown').includes('$'), false);
  assert.match(housePickLine('river', '2026-11-06', '2026-11-08', ['2026-11-06'], '2026-10-30', 'unknown'), /already booked/);
  assert.match(housePickLine('ranch', '2026-11-16', '2026-11-18', [], '2026-10-31', 'unknown', [], 4, 4), /needs an adult/);
  assert.equal(housePickLine('ranch', '2026-11-16', '2026-11-18', [], '2026-10-31', 'unknown', [], 4, 4).includes('$'), false);
  assert.equal(/\bis open\b/.test(housePickLine('river', '2026-11-06', '2026-11-08', [], '2026-10-30', 'unknown')), false);
});

test('a booked house names the next stay and keeps these dates', () => {
  const booked = ['2026-11-06', '2026-11-07'];
  const line = houseNextStayLine('lindon', '2026-11-06', '2026-11-08', booked, '2026-10-31', 'unknown');
  assert.match(line, /Next stay this page can quote:/);
  assert.match(line, /Choosing this house keeps these dates/);
  assert.match(line, /Nothing is held/);
  assert.equal(line.includes('November 6, 2026'), false);
  assert.equal(line.includes('$'), false);
  assert.equal(/\bis open\b/.test(line), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(line), false);

  assert.equal(houseNextStayLine('river', '2026-11-06', '2026-11-08', [], '2026-10-31', 'unknown'), '');
  assert.equal(houseNextStayLine('river', '2026-11-25', '2026-11-27', [], '2026-11-25', 'unknown'), '');
  assert.equal(houseNextStayLine('ranch', '2026-11-16', '2026-11-18', [], '2026-10-31', 'unknown', [], 4, 4), '');

  const closed = houseNextStayLine('river', '2026-11-13', '2026-11-15', [], '2026-10-31', 'unknown', ['2026-11-13', '2026-11-14']);
  assert.match(closed, /Next stay this page can quote:/);
  assert.equal(closed.includes('November 13, 2026'), false);
  assert.equal(closed.includes('$'), false);
  assert.equal(/\bis open\b/.test(closed), false);
});

test('the house cards say whether these dates can be quoted and leave the price off', () => {
  const openCards = houseCardLines('2026-11-06', '2026-11-08', {}, '2026-10-30');
  assert.equal(openCards.find((row) => row.house === 'river')?.line, 'These dates can be quoted.');
  assert.equal(openCards.find((row) => row.house === 'lindon')?.line, 'These dates can be quoted.');
  const booked = houseCardLines('2026-11-06', '2026-11-08', { lindon: ['2026-11-06'] }, '2026-10-30');
  assert.match(booked.find((row) => row.house === 'lindon')?.line ?? '', /already booked/);
  assert.equal(booked.find((row) => row.house === 'river')?.line, 'These dates can be quoted.');
  const named = houseCardLines('2026-11-06', '2026-11-08', { lindon: ['2026-11-06'] }, '2026-10-31');
  const lindonNext = named.find((row) => row.house === 'lindon')?.next ?? '';
  assert.match(lindonNext, /Next stay this page can quote: November 7, 2026/);
  assert.match(lindonNext, /keeps these dates/);
  assert.match(lindonNext, /Nothing is held/);
  assert.equal(lindonNext.includes('$'), false);
  assert.equal(named.find((row) => row.house === 'river')?.next, '');
  const kids = houseCardLines('2026-11-16', '2026-11-18', {}, '2026-10-31', {}, 4, 4);
  assert.equal(kids.every((row) => /needs an adult/.test(row.line)), true);
  const text = [...openCards, ...booked, ...kids, ...named].map((row) => `${row.line} ${row.next}`).join('\n');
  assert.equal(text.includes('$'), false);
  assert.equal(/\bis open\b/.test(text), false);
  assert.equal(houseCardLines('2026-11-06', '', {}, '2026-10-30').length, 0);
});

test('a clear River weekend says which houses will quote and leaves the price off', () => {
  const result = searchHouses('2026-11-06', '2026-11-08', 4, undefined, open, '2026-10-30', pace);
  assert.equal(result.rows.find((row) => row.house === 'river')?.line, 'River will quote these dates.');
  assert.equal(result.rows.find((row) => row.house === 'river')?.ok, true);
  assert.match(result.rows.find((row) => row.house === 'river')?.href ?? '', /house=river/);
  assert.match(result.rows.find((row) => row.house === 'river')?.href ?? '', /in=2026-11-06/);
  assert.equal(result.event, 'This stay covers BYU at Utah. Nothing extra is added for that.');
  assert.equal(result.together, null);
  assert.equal(textOf(result).includes('$'), false);
  assert.equal(result.rows.length, 3);
});

test('a party larger than the River House is offered both houses with no price', () => {
  const result = searchHouses('2026-11-06', '2026-11-08', 30, undefined, open, '2026-10-30', pace);
  assert.match(result.rows.find((row) => row.house === 'river')?.line ?? '', /sleeps 25/);
  assert.equal(result.rows.find((row) => row.house === 'river')?.ok, false);
  assert.equal(result.together?.ok, true);
  assert.match(result.together?.line ?? '', /25 stay at the River House/);
  assert.equal(textOf(result).includes('$'), false);
});

test('a booked River night stays off the open list', () => {
  const taken: Partial<Record<HouseId, readonly string[]>> = { river: ['2026-11-06'] };
  const result = searchHouses('2026-11-06', '2026-11-08', 4, undefined, taken, '2026-10-30', pace);
  assert.match(result.rows.find((row) => row.house === 'river')?.line ?? '', /already booked/);
  assert.equal(result.rows.find((row) => row.house === 'river')?.ok, false);
  assert.equal(result.rows.find((row) => row.house === 'ranch')?.ok, true);
});

test('Thanksgiving dates name the event and do not add a charge', () => {
  const result = searchHouses('2026-11-25', '2026-11-29', 4, undefined, open, '2026-10-30', pace);
  assert.match(result.event ?? '', /Thanksgiving and BYU vs Cincinnati/);
  assert.equal((result.event ?? '').includes('$'), false);
  assert.equal(result.rows.find((row) => row.house === 'river')?.ok, true);
});

test('a night before the River House opens is not listed as open', () => {
  const result = searchHouses('2026-10-30', '2026-11-02', 4, undefined, open, '2026-10-30', pace);
  assert.match(result.rows.find((row) => row.house === 'river')?.line ?? '', /November 1, 2026/);
  assert.equal(result.rows.find((row) => row.house === 'river')?.ok, false);
});

test('the house list compares the rhythm and does not say a house is open', () => {
  const rows = houseRhythms('2026-11-06', '2026-11-08');
  const text = JSON.stringify(rows);
  assert.equal(rows.length, 3);
  assert.match(rows.find((row) => row.house === 'river')?.lines.join(' ') ?? '', /Quiet hours in this mountain neighborhood/);
  assert.match(rows.find((row) => row.house === 'ranch')?.lines.join(' ') ?? '', /Quiet hours 10 PM to 8 AM/);
  assert.match(rows.find((row) => row.house === 'lindon')?.lines.join(' ') ?? '', /Arrive November 6, 2026 at 4:00 PM/);
  assert.equal(text.includes('will quote'), false);
  assert.equal(text.includes('$'), false);
  assert.equal(/password|code\s*\d/i.test(text), false);
  assert.deepEqual(houseRhythms('2026-11-08', '2026-11-06'), []);
});

test('a house page lists the rhythm for its dates and leaves the door code off', () => {
  const lines = housePageRhythm('ranch', '2026-11-13', '2026-11-15');
  const text = lines.join('\n');
  assert.match(text, /Arrive November 13, 2026 at 4:00 PM/);
  assert.match(text, /Quiet hours 10 PM to 8 AM/);
  assert.match(text, /Leave November 15, 2026 at 11:00 AM/);
  assert.match(text, /BYU vs Baylor/);
  assert.match(text, /does not hold the dates/);
  assert.equal(text.includes('door code'), false);
  assert.equal(text.includes('$'), false);
  assert.equal(/\bis open\b/.test(text), false);
  assert.deepEqual(housePageRhythm('ranch', '2026-11-15', '2026-11-13'), []);
  const river = housePageRhythm('river', '2026-11-13', '2026-11-15').join('\n');
  assert.match(river, /Quiet hours in this mountain neighborhood/);
  assert.equal(river.includes('10 PM'), false);
});

test('the house list names a published night rule for the same dates', () => {
  const lines = stayRuleLines('2026-11-13', '2026-11-14', 4, undefined, '2026-10-30');
  const text = lines.map((row) => row.line).join('\n');
  assert.match(lines.find((row) => row.house === 'river')?.line ?? '', /at least 2 nights/);
  assert.match(lines.find((row) => row.house === 'ranch')?.line ?? '', /both weekend nights/);
  assert.match(lines.find((row) => row.house === 'lindon')?.line ?? '', /both weekend nights/);
  assert.equal(stayRuleLines('2026-11-06', '2026-11-08', 4, undefined, '2026-10-30').length, 0);
  assert.equal(text.includes('$'), false);
  assert.equal(text.toLowerCase().includes('will quote'), false);
  assert.equal(text.toLowerCase().includes('open'), false);
});

test('a quote names the other houses that fail the same dates', () => {
  const lines = otherStayRules('ranch', '2026-11-13', '2026-11-14', 4, undefined, '2026-10-30');
  const text = lines.map((row) => row.line).join('\n');
  assert.equal(lines.some((row) => row.house === 'ranch'), false);
  assert.match(lines.find((row) => row.house === 'river')?.line ?? '', /at least 2 nights/);
  assert.match(lines.find((row) => row.house === 'lindon')?.line ?? '', /both weekend nights/);
  assert.equal(otherStayRules('ranch', '2026-11-13', '2026-11-15', 4, undefined, '2026-10-30').length, 0);
  assert.equal(text.includes('$'), false);
  assert.equal(/\bis open\b/.test(text), false);
});

test('a party is matched to the sleep count and the dates stay unheld', () => {
  const small = partyFitList(15);
  const text = JSON.stringify(small);
  assert.equal(small.rows.find((row) => row.house === 'river')?.fits, true);
  assert.equal(small.rows.find((row) => row.house === 'ranch')?.fits, true);
  assert.equal(small.rows.find((row) => row.house === 'lindon')?.fits, false);
  assert.match(small.rows.find((row) => row.house === 'lindon')?.line ?? '', /larger than that house/);
  assert.equal(small.together, null);
  assert.equal(text.includes('will quote'), false);
  assert.equal(text.includes('$'), false);

  const big = partyFitList(30);
  assert.equal(big.rows.every((row) => row.fits === false), true);
  assert.match(big.together ?? '', /together sleep 45/);
  assert.match(big.together ?? '', /25 stay at the River House and 5 stay at the Ranch House/);
  assert.match(big.together ?? '', /Each house keeps an adult/);
  assert.match(big.together ?? '', /does not hold the dates/);
  assert.equal((big.together ?? '').includes('$'), false);
  assert.equal(/\bis open\b/.test(big.together ?? ''), false);

  const over = partyFitList(46);
  assert.match(over.together ?? '', /larger than Ranch and River together/);
  assert.equal(partyFitList(4, 4).rows[0]?.line, 'A stay needs an adult.');
  assert.equal(partyFitList(4, 4).rows.every((row) => row.fits === false), true);
});

test('a house page says whether the party on the link fits', () => {
  const ranch = housePartyLine('ranch', '30');
  assert.match(ranch, /The Ranch House sleeps 20/);
  assert.match(ranch, /larger than that house/);
  assert.match(ranch, /together sleep 45/);
  assert.match(ranch, /25 stay at the River House and 5 stay at the Ranch House/);
  assert.match(ranch, /does not hold the dates/);
  assert.match(housePartyLine('lindon', '4'), /This party fits that house/);
  assert.equal(housePartyLine('ranch', ''), '');
  assert.match(housePartyLine('ranch', '2', '2'), /A stay needs an adult/);
  assert.equal(ranch.includes('$'), false);
  assert.equal(/\bopen\b/.test(ranch), false);
});

test('a failed stay names the shortest dates and links the house page', () => {
  const rows = shortestFixLines('2026-11-13', '2026-11-14', 4, '2026-10-30');
  assert.equal(rows.length, 3);
  const river = rows.find((row) => row.house === 'river');
  assert.match(river?.line ?? '', /through November 15, 2026, 2 nights/);
  assert.match(river?.line ?? '', /Nothing is charged yet/);
  assert.match(river?.href ?? '', /^\/houses\/river\?in=2026-11-13&out=2026-11-15&guests=4$/);
  assert.equal(rows.every((row) => row.href.startsWith('/houses/')), true);
  assert.equal(rows.some((row) => row.href.includes('/book/')), false);
  const text = rows.map((row) => row.line).join('\n');
  assert.equal(text.includes('$'), false);
  assert.equal(text.replace(/does not say the house is open/gi, '').toLowerCase().includes('house is open'), false);
  assert.equal(shortestFixLines('2026-11-13', '2026-11-15', 4, '2026-10-30').length, 0);
  assert.equal(shortestFixLines('2026-11-13', '2026-11-14', 4, '2026-10-30', 4).length, 0);
  const quote = quotedStayHref('ranch', '2026-11-13', '2026-11-14', '4', '', '2026-10-30');
  assert.equal(quote.shortened, true);
  assert.equal(quote.label, 'See the shortest stay');
  assert.equal(quote.href, '/book/?house=ranch&in=2026-11-13&out=2026-11-15&guests=4');
  const both = quotedStayHref('ranch', '2026-11-13', '2026-11-14', '30', '', '2026-10-30');
  assert.equal(both.label, 'See both houses');
  assert.match(both.href, /house=river/);
  assert.match(both.href, /out=2026-11-15/);
  assert.match(both.href, /guests=30/);
  const ready = quotedStayHref('river', '2026-11-06', '2026-11-08', '36', '', '2026-10-31', {});
  assert.equal(ready.label, 'See both houses');
  assert.equal(ready.shortened, false);
  assert.equal(ready.booked, false);
  assert.match(ready.href, /out=2026-11-08/);
  assert.match(ready.href, /guests=36/);
  assert.equal(quotedStayPaint(ready.label, ready.booked), true);
  const shortBoth = quotedStayHref('river', '2026-12-20', '2026-12-22', '36', '', '2026-10-31', {});
  assert.equal(shortBoth.label, 'See both houses');
  assert.equal(shortBoth.shortened, true);
  assert.equal(shortBoth.href.includes('out=2026-12-22'), false);
  assert.match(houseQuoteCaption(shortBoth.label, shortBoth.booked, shortBoth.shortened), /longer stay for both houses/);
  assert.match(houseQuoteCaption(shortBoth.label, shortBoth.booked, shortBoth.shortened), /dates on this page stay/);
  assert.equal(houseQuoteCaption(shortBoth.label, shortBoth.booked, shortBoth.shortened).includes('$'), false);
  const bookedBoth = quotedStayHref(
    'river',
    '2026-11-25',
    '2026-11-29',
    '36',
    '',
    '2026-10-31',
    { ranch: ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'] },
  );
  assert.match(bookedBoth.label, /already booked/);
  assert.equal(bookedBoth.booked, true);
  assert.equal(bookedBoth.shortened, false);
  assert.match(bookedBoth.href, /out=2026-11-29/);
  assert.equal(quotedStayPaint(bookedBoth.label, bookedBoth.booked), false);
  assert.equal(bookedBoth.label.includes('$'), false);
  assert.equal(quotedStayPaint('Those nights are already booked.', true), false);
  assert.equal(quotedStayPaint('The River House takes its first stays on November 1, 2026.', false), false);
  assert.equal(quotedStayPaint('See the dates', false), true);
  assert.equal(quotedStayPaint(houseQuotePending().label, false), false);
  assert.match(houseQuotePending().caption, /not quoted yet/);
  assert.equal(houseQuotePending().caption.includes('$'), false);
  assert.equal(/\bis open\b/.test(houseQuotePending().caption), false);
  assert.match(houseQuoteCaption('Those nights are already booked.', true), /This stay is not quoted/);
  assert.match(houseQuoteCaption('See the dates', false), /The booking page quotes the stay/);
  assert.equal(houseQuoteCaption('Those nights are already booked.', true).includes('$'), false);
  const early = quotedStayHref('river', '2026-10-31', '2026-11-02', '4', '', '2026-10-31', {});
  assert.equal(early.label, 'The River House takes its first stays on November 1, 2026.');
  assert.equal(early.shortened, false);
  assert.equal(early.booked, false);
  assert.equal(early.label.includes('$'), false);
  assert.match(early.href, /out=2026-11-02/);
  const pass = quotedStayHref('ranch', '2026-11-13', '2026-11-15', '4', '', '2026-10-30');
  assert.equal(pass.shortened, false);
  assert.equal(pass.label, 'See the dates');
  assert.equal(pass.booked, false);
  assert.match(pass.href, /out=2026-11-15/);
  const booked = quotedStayHref('ranch', '2026-11-13', '2026-11-15', '4', '', '2026-10-30', { ranch: ['2026-11-14'] });
  assert.equal(booked.booked, true);
  assert.equal(booked.shortened, false);
  assert.equal(booked.label, 'Those nights are already booked.');
  assert.equal(booked.label.includes('$'), false);
  assert.match(booked.href, /out=2026-11-15/);
  const extended = quotedStayHref('ranch', '2026-11-13', '2026-11-14', '4', '', '2026-10-30', { ranch: ['2026-11-14'] });
  assert.equal(extended.booked, true);
  assert.equal(extended.shortened, false);
  assert.match(extended.href, /out=2026-11-15/);
  const closed = quotedStayHref(
    'ranch',
    '2026-11-13',
    '2026-11-15',
    '4',
    '',
    '2026-10-30',
    { ranch: ['2026-11-13'] },
    { ranch: ['2026-11-13'] },
  );
  assert.equal(closed.label, 'Those nights are closed on the calendar.');
  assert.equal(closed.booked, true);
  const kids = quotedStayHref('ranch', '2026-11-16', '2026-11-18', '4', '4', '2026-10-31', {});
  assert.match(kids.label, /needs an adult/);
  assert.equal(kids.shortened, false);
  assert.equal(kids.booked, false);
  assert.equal(kids.label.includes('$'), false);
  assert.equal(quotedStayPaint(kids.label, kids.booked), false);
  assert.match(houseQuoteCaption(kids.label, kids.booked), /This stay is not quoted/);
  const shortKids = quotedStayHref('ranch', '2026-11-13', '2026-11-14', '4', '4', '2026-10-30', {});
  assert.match(shortKids.label, /needs an adult/);
  assert.equal(shortKids.shortened, false);
  assert.equal(quotedStayPaint(shortKids.label, shortKids.booked), false);
  const bookedKids = quotedStayHref('ranch', '2026-11-16', '2026-11-18', '4', '4', '2026-10-31', { ranch: ['2026-11-16'] });
  assert.equal(bookedKids.label, 'Those nights are already booked.');
  assert.equal(/adult/.test(bookedKids.label), false);
  assert.equal(bookedKids.booked, true);
});

test('the house list names a booked span before a party is entered', () => {
  const rows = heldSearchLines('2026-11-25', '2026-11-27', { ranch: ['2026-11-25'] }, '2026-10-31');
  assert.equal(rows.find((row) => row.house === 'ranch')?.line, 'Ranch: Those nights are already booked.');
  assert.equal(rows.some((row) => row.house === 'lindon'), false);
  const text = rows.map((row) => row.line).join('\n');
  assert.equal(text.includes('$'), false);
  assert.equal(/\bis open\b/.test(text), false);
  const free = heldSearchLines('2026-11-16', '2026-11-18', { ranch: ['2026-11-25'] }, '2026-10-31');
  assert.equal(free.some((row) => row.house === 'ranch'), false);
  const early = heldSearchLines('2026-10-31', '2026-11-02', {}, '2026-10-31');
  assert.equal(
    early.find((row) => row.house === 'river')?.line,
    'The River House takes its first stays on November 1, 2026.',
  );
  assert.equal(early.some((row) => row.line.includes('$')), false);
  assert.equal(/\bis open\b/.test(early.map((row) => row.line).join(' ')), false);
});
