/**
 * The cleaner link, in the language the cleaner reads.
 *
 * A cleaner is the one person on this app who may not read English, and the page has had an en/es
 * toggle for a while. The steps translated; the sentence under them did not. So a Spanish speaker read
 * Spanish tasks and an English explanation underneath, which reads as a half-finished page — and the
 * one line it carried ("the door code stays on the guest phone") is exactly the line a cleaner needs to
 * understand.
 *
 * What is **not** translated, and should not be guessed at: `houseName`, `arrive`, and `rules` come from
 * the published house guide, which is English. Those are the septic, river, and parking instructions.
 * Machine-translating "only toilet paper goes in the toilets" is a plumbing bill waiting to happen, so
 * they stay as published until someone writes real Spanish copy for that house.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanPageNote, cleanSteps } from './clean-link.ts';

const job = (over: Partial<{ sameDay: boolean }> = {}) => ({
  house: 'river' as const,
  houseName: 'The River House',
  checkout: '2026-11-11',
  gapNights: 3,
  sameDay: false,
  steps: [],
  arrive: '',
  rules: [],
  ...over,
});

test('the sentence under the steps is in the cleaner language', () => {
  const en = cleanPageNote([job()], false, 'en');
  const es = cleanPageNote([job()], false, 'es');
  assert.notEqual(en, es, 'the note did not change with the language');
  assert.match(en, /turnover/);
  assert.match(es, /limpieza/, 'the Spanish note is not Spanish');
  // The line that matters: the code is not on this page.
  assert.match(es, /c[oó]digo de la puerta/i, 'the Spanish note does not mention the door code');
  assert.equal(/the door code stays/i.test(es), false, 'English leaked into the Spanish note');
});

test('plurals and the same-day warning translate too', () => {
  const one = cleanPageNote([job({ sameDay: true })], false, 'es');
  assert.match(one, /1 limpieza/);
  assert.match(one, /1 es el mismo día de entrada/);

  const many = cleanPageNote([job({ sameDay: true }), job({ sameDay: true }), job()], false, 'es');
  assert.match(many, /3 limpiezas/);
  assert.match(many, /2 son el mismo día de entrada/);
});

test('an empty list and an unread list are said in the cleaner language', () => {
  const empty = cleanPageNote([], false, 'es');
  assert.match(empty, /No hay limpieza/);
  assert.equal(/No turnover/i.test(empty), false);

  const unread = cleanPageNote([], true, 'es');
  assert.match(unread, /No se pudieron leer/, 'an unread list is not explained in Spanish');
  assert.equal(/could not be read/i.test(unread), false);
});

test('English is unchanged, so nothing that already worked reads differently', () => {
  assert.match(cleanPageNote([job()], false), /1 turnover in the next two weeks/);
  assert.match(cleanPageNote([], false), /No turnover in the next two weeks/);
  assert.match(cleanPageNote([], true), /Saved bookings could not be read/);
});

test('the steps still translate, and a same-day turn still puts the deadline first', () => {
  const es = cleanSteps(true, 'es');
  const en = cleanSteps(true, 'en');
  assert.notDeepEqual(es, en);
  assert.match(es[0] ?? '', /mismo día|antes de las/i, 'the Spanish same-day deadline is not first');
  assert.match(en[0] ?? '', /same-day|before/i);
});
