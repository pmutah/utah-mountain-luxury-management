import assert from 'node:assert/strict';
import test from 'node:test';
import { turnWindow } from './turn-clock.ts';
import { canyonDesk, canyonFromTurns, turnLoad, type LoadJob } from './turn-load.ts';

const day = '2026-11-02';

function job(house: LoadJob['house'], name: string, clock: LoadJob['clock'], checkout = day): LoadJob {
  return { house, houseName: name, checkout, clock };
}

test('a same-day window follows the clock', () => {
  assert.deepEqual(turnWindow({ sameDay: true, leaveAt2: false, arriveAt1: false }), { start: 11 * 60, end: 16 * 60 });
  assert.deepEqual(turnWindow({ sameDay: true, leaveAt2: false, arriveAt1: true }), { start: 11 * 60, end: 13 * 60 });
  assert.deepEqual(turnWindow({ sameDay: true, leaveAt2: true, arriveAt1: false }), { start: 14 * 60, end: 16 * 60 });
  assert.equal(turnWindow({ sameDay: false, leaveAt2: true, arriveAt1: false }), null);
});

test('two same-day turns on one day do not fit one person', () => {
  const standard = { sameDay: true, leaveAt2: false, arriveAt1: false };
  const lines = turnLoad([
    job('ranch', 'Ranch', standard),
    job('river', 'River', standard),
  ]);
  assert.equal(lines.length, 1);
  assert.match(lines[0]!.line, /Nov 2: River and Ranch check out the same day/);
  assert.match(lines[0]!.line, /overlap/);
  assert.match(lines[0]!.line, /One person cannot cover those turns/);
  assert.match(lines[0]!.line, /Nothing was booked or sent/);
  assert.equal(lines[0]!.line.includes('$'), false);
  assert.equal(lines[0]!.line.includes('Pat'), false);
});

test('a 1:00 PM arrival and a 2:00 PM leave fit one after the other', () => {
  const lines = turnLoad([
    job('ranch', 'Ranch', { sameDay: true, leaveAt2: false, arriveAt1: true }),
    job('lindon', 'Lindon', { sameDay: true, leaveAt2: true, arriveAt1: false }),
  ]);
  assert.match(lines[0]!.line, /Ranch and Lindon/);
  assert.match(lines[0]!.line, /fit one after the other/);
  assert.equal(lines[0]!.line.includes('cannot'), false);
});

test('a staggered River House turn is not one route with Lindon', () => {
  const lines = turnLoad([
    job('river', 'River', { sameDay: true, leaveAt2: false, arriveAt1: true }),
    job('ranch', 'Ranch', { sameDay: true, leaveAt2: true, arriveAt1: false }),
  ]);
  assert.match(lines[0]!.line, /River and Ranch/);
  assert.match(lines[0]!.line, /not one route/);
  assert.match(lines[0]!.line, /drive up Provo Canyon is not in the clock/);
  assert.equal(/fit one after the other/.test(lines[0]!.line), false);
  assert.equal(lines[0]!.line.includes('$'), false);
  const spanish = turnLoad(
    [
      job('river', 'River', { sameDay: true, leaveAt2: false, arriveAt1: true }),
      job('lindon', 'Lindon', { sameDay: true, leaveAt2: true, arriveAt1: false }),
    ],
    'es',
  );
  assert.match(spanish[0]!.line, /no son una sola ruta/);
  assert.match(spanish[0]!.line, /cañón de Provo no está en el reloj/);
  assert.equal(/caben una después de la otra/.test(spanish[0]!.line), false);
});

test('a 1:00 PM arrival still overlaps a full same-day turn', () => {
  const lines = turnLoad([
    job('river', 'River', { sameDay: true, leaveAt2: false, arriveAt1: true }),
    job('ranch', 'Ranch', { sameDay: true, leaveAt2: false, arriveAt1: false }),
  ]);
  assert.match(lines[0]!.line, /cannot cover/);
});

test('one same-day turn leaves the other clean for later', () => {
  const lines = turnLoad([
    job('river', 'River', { sameDay: true, leaveAt2: false, arriveAt1: false }),
    job('ranch', 'Ranch', { sameDay: false, leaveAt2: false, arriveAt1: false }),
    job('lindon', 'Lindon', { sameDay: false, leaveAt2: false, arriveAt1: false }),
  ]);
  assert.match(lines[0]!.line, /River, Ranch, and Lindon/);
  assert.match(lines[0]!.line, /The other cleans can wait/);
});

test('two later guests can both wait', () => {
  const lines = turnLoad([
    job('ranch', 'Ranch', { sameDay: false, leaveAt2: false, arriveAt1: false }),
    job('lindon', 'Lindon', { sameDay: false, leaveAt2: true, arriveAt1: false }),
  ]);
  assert.match(lines[0]!.line, /No guest returns that day/);
});

test('one house and two dates stay quiet', () => {
  const standard = { sameDay: true, leaveAt2: false, arriveAt1: false };
  assert.deepEqual(turnLoad([job('ranch', 'Ranch', standard), job('ranch', 'Ranch', standard)]), []);
  const split = turnLoad([
    job('ranch', 'Ranch', standard, '2026-11-02'),
    job('river', 'River', standard, '2026-11-03'),
  ]);
  assert.deepEqual(split, []);
});

test('the Spanish line names the overlap and sends nothing', () => {
  const standard = { sameDay: true, leaveAt2: false, arriveAt1: false };
  const lines = turnLoad(
    [job('river', 'River', standard), job('ranch', 'Ranch', standard)],
    'es',
  );
  assert.match(lines[0]!.line, /River y Ranch salen el mismo día/);
  assert.match(lines[0]!.line, /se cruzan/);
  assert.match(lines[0]!.line, /No se reservó ni se envió nada/);
  assert.equal(lines[0]!.line.includes('$'), false);
});

test('a canyon day stays a separate trip and does not change the clock', () => {
  const standard = { sameDay: true, leaveAt2: false, arriveAt1: false };
  const jobs = [job('river', 'River', standard), job('ranch', 'Ranch', standard)];
  const clock = turnLoad(jobs)[0]!.line;
  const canyon = canyonDesk(jobs)[0]!.line;
  assert.match(clock, /One person cannot cover those turns/);
  assert.match(canyon, /separate trip up Provo Canyon/);
  assert.match(canyon, /clock does not include that drive/);
  assert.equal(/cannot cover|cannot fit/i.test(canyon), false);
  assert.equal(canyon.includes('$'), false);
  const valley = canyonDesk([job('ranch', 'Ranch', standard), job('lindon', 'Lindon', standard)]);
  assert.match(valley[0]!.line, /No day on this desk mixes Provo Canyon with Lindon/);
  assert.match(canyonDesk([])[0]!.line, /No day on this desk mixes/);
  const unread = canyonDesk([], 'en', true)[0]!.line;
  assert.match(unread, /could not be read/);
  assert.match(unread, /does not say whether Provo Canyon and Lindon share a day/);
  assert.equal(unread.includes('No day on this desk'), false);
  assert.match(unread, /Nothing was booked or sent/);
  const unreadEs = canyonDesk([], 'es', true)[0]!.line;
  assert.match(unreadEs, /No se pudo leer la lista de salidas/);
  assert.equal(unreadEs.includes('$') || unread.includes('$'), false);
  const fromTurns = canyonFromTurns([
    { house: 'river', checkOut: '2026-11-08' },
    { house: 'ranch', checkOut: '2026-11-08' },
  ])[0]!.line;
  assert.match(fromTurns, /separate trip up Provo Canyon/);
  assert.equal(fromTurns.includes('could not be read'), false);
  assert.equal(fromTurns.includes('$'), false);
  const valleyTurns = canyonFromTurns([{ house: 'lindon', checkOut: '2026-11-08' }])[0]!.line;
  assert.match(valleyTurns, /No day on this desk mixes Provo Canyon with Lindon/);
  assert.match(canyonFromTurns(null)[0]!.line, /could not be read/);
  const spanish = canyonDesk(jobs, 'es')[0]!.line;
  assert.match(spanish, /viaje aparte por el cañón de Provo/);
  assert.match(spanish, /El reloj no incluye ese camino/);
  assert.equal(spanish.includes('$'), false);
});
