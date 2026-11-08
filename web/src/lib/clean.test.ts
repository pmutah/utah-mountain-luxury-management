import assert from 'node:assert/strict';
import test from 'node:test';
import type { Reservation } from './api.ts';
import { cleanJobs, cleanLabel, guestLeavingLine, jobDoneCount, workOrderEssentials, workOrderLeaving, workOrderMap, workOrderNotes, workOrderPlace, workOrderRules, cleanQuietLine, cleanSafetyLine, workOrderNext, workOrderParty, workOrderArrival, workOrderDeparture, workOrderLaterLeave, workOrderEarly, workOrderPrep, workOrderEvent, serviceBrief, workOrderCheckoutParty, workOrderWhen } from './clean.ts';

function stay(partial: Partial<Reservation> & Pick<Reservation, 'id' | 'propertyId' | 'checkIn' | 'checkOut'>): Reservation {
  return { guestName: 'Guest', payout: 0, source: 'Airbnb', ...partial };
}

test('a same-day turn is first and asks for room photos', () => {
  const jobs = cleanJobs(
    [
      stay({ id: 'out', propertyId: 'ranch', checkIn: '2026-11-01', checkOut: '2026-11-04' }),
      stay({ id: 'in', propertyId: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-20' }),
      stay({ id: 'gap', propertyId: 'lindon', checkIn: '2026-11-01', checkOut: '2026-11-07' }),
      stay({ id: 'later', propertyId: 'lindon', checkIn: '2026-11-22', checkOut: '2026-11-24' }),
      stay({ id: 'nope', propertyId: 'river', checkIn: '2026-11-01', checkOut: '2026-11-03', status: 'cancelled' }),
    ],
    '2026-11-01',
  );
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0]?.priority, true);
  assert.equal(jobs[0]?.steps[0]?.id, 'window');
  assert.equal(jobs[0]?.steps.some((step) => step.id === 'photos'), true);
  assert.equal(jobs[1]?.house, 'lindon');
  assert.equal(jobs[1]?.priority, false);
  assert.equal(jobs[1]?.gapNights, 15);
  assert.equal(jobs[0]?.nextCheckOut, '2026-11-20');
  assert.match(workOrderEvent(jobs[0]?.nextCheckIn ?? null, jobs[0]?.nextCheckOut ?? null, 'en'), /The next stay covers BYU at Utah/);
  assert.equal(workOrderEvent(jobs[0]?.nextCheckIn ?? null, jobs[0]?.nextCheckOut ?? null, 'en').includes('$'), false);
  assert.match(workOrderEvent('2026-11-25', '2026-11-29', 'es'), /Thanksgiving and BYU vs Cincinnati/);
  assert.equal(workOrderEvent('2026-11-01', '2026-11-03', 'en'), '');
});

test('the photo line stays open until a room photo is attached', () => {
  const steps = [
    { id: 'beds' },
    { id: 'photos' },
  ];
  assert.equal(jobDoneCount(steps, { 'job:photos': true }, 'job', 0), 0);
  assert.equal(jobDoneCount(steps, { 'job:photos': true, 'job:beds': true }, 'job', 1), 2);
  assert.equal(cleanLabel('photos', 'es').includes('Foto'), true);
  assert.equal(cleanLabel('photos', 'en').includes('Photo'), true);
  assert.match(workOrderWhen('lindon', false, 'en'), /Checkout at 11:00 AM/);
  assert.match(workOrderWhen('ranch', true, 'en'), /next guest arrives at 4:00 PM/);
  assert.match(workOrderPlace('lindon', 'en'), /143 Harcliff Circle, Lindon, Utah 84042/);
  assert.match(workOrderPlace('lindon', 'en'), /Park in the driveway/);
  assert.match(workOrderPlace('river', 'es'), /Dirección: Vivian Park/);
  assert.equal(workOrderPlace('river', 'en').toLowerCase().includes('code'), false);
  assert.equal(workOrderPlace('ranch', 'en').includes('Wi-Fi'), false);
  assert.match(workOrderMap('lindon'), /google\.com\/maps\/search/);
  assert.match(workOrderMap('lindon'), /Harcliff/);
  assert.equal(/password|door/i.test(workOrderMap('river')), false);
  assert.match(workOrderEssentials('river').join(' '), /Winter driving/);
  assert.match(workOrderEssentials('lindon').join(' '), /Sundays/);
  assert.equal(/password/i.test(workOrderEssentials('river').join(' ')), false);
  const riverEs = workOrderEssentials('river', 'es').join(' ');
  assert.match(riverEs, /Conducción en invierno/);
  assert.match(riverEs, /Víveres/);
  assert.equal(riverEs.includes('Winter driving'), false);
  assert.equal(riverEs.includes('$'), false);
  const sundayEs = workOrderEssentials('ranch', 'es').join(' ');
  assert.match(sundayEs, /cierran los domingos/);
  assert.equal(sundayEs.includes('Sundays'), false);
  const safety = cleanSafetyLine('en');
  assert.match(safety, /No lifeguard is on duty/);
  assert.match(safety, /No fireworks/);
  assert.match(safety, /does not sign the agreement/);
  assert.match(safety, /Nothing was sent/);
  assert.equal(safety.includes('$'), false);
  const safetyEs = cleanSafetyLine('es');
  const quiet = cleanQuietLine('ranch', 'en', 23);
  assert.match(quiet, /in effect until 8:00 AM/);
  assert.match(quiet, /not a checklist line/);
  assert.equal(quiet.includes('$'), false);
  const quietDay = cleanQuietLine('lindon', 'es', 13);
  assert.match(quietDay, /no están en vigor/);
  assert.match(quietDay, /10:00 PM a 8:00 AM/);
  assert.match(quietDay, /Esto no es una línea de la lista/);
  const riverQuiet = cleanQuietLine('river', 'es', 23);
  // River publishes quiet hours without a window, so the Spanish line states the rule and no time.
  assert.match(riverQuiet, /horas de silencio/i);
  assert.equal(riverQuiet.includes('10:00'), false);
  assert.match(safetyEs, /No fuegos artificiales/);
  assert.match(safetyEs, /No se envió nada/);
  assert.equal(safetyEs.includes('$'), false);
  assert.match(workOrderRules('ranch', 'en').join(' '), /Quiet hours 10 PM to 8 AM/);
  assert.match(workOrderRules('ranch', 'es').join(' '), /Horas de silencio/);
  assert.match(workOrderRules('lindon', 'en').join(' '), /No smoking indoors/);
  assert.match(workOrderRules('river', 'en').join(' '), /mountain neighborhood/);
  assert.equal(workOrderRules('ranch', 'en').join(' ').includes('hot tub'), false);
  assert.equal(/password/i.test(workOrderRules('river', 'en').join(' ')), false);
  assert.match(workOrderNotes('ranch')[0] ?? '', /Hot tub/);
  assert.match(workOrderNotes('river').join(' '), /Septic/);
  assert.match(workOrderNotes('river').join(' '), /Provo River/);
  assert.equal(workOrderNotes('lindon').length, 0);
  assert.equal(workOrderNotes('river').join(' ').toLowerCase().includes('password'), false);
  assert.match(workOrderNotes('river', 'es').join(' '), /Séptico/);
  assert.match(workOrderNotes('river', 'es').join(' '), /El río Provo/);
  assert.match(workOrderNotes('ranch', 'es')[0] ?? '', /Jacuzzi/);
  assert.equal(workOrderNotes('river', 'es').join(' ').includes('Septic'), false);
  assert.equal(workOrderNotes('river', 'es').join(' ').includes('$'), false);
  assert.equal(workOrderLeaving('lindon', 'en')[0], 'Start the dishwasher.');
  assert.equal(workOrderLeaving('lindon', 'en').length, 5);
  assert.match(workOrderLeaving('river', 'en').join(' '), /Only toilet paper/);
  assert.match(workOrderLeaving('river', 'es').join(' '), /papel higiénico/);
  assert.match(workOrderLeaving('ranch', 'en').join(' '), /hot tub cover/);
  assert.match(workOrderLeaving('ranch', 'es').join(' '), /cubierta del jacuzzi/);
  assert.equal(workOrderLeaving('lindon', 'en').join(' ').includes('toilet paper'), false);
  assert.equal(workOrderLeaving('lindon', 'en').join(' ').toLowerCase().includes('hot tub'), false);
  assert.equal(workOrderLeaving('lindon', 'es')[0], 'Enciende el lavavajillas.');
  assert.equal(/door code|wi-fi|password/i.test(workOrderLeaving('river', 'en').join(' ')), false);
  assert.equal(/door code|wi-fi|password/i.test(guestLeavingLine()), false);
  assert.match(guestLeavingLine(), /start the dishwasher/);
  assert.match(guestLeavingLine(), /The River House: Only toilet paper/);
  assert.match(guestLeavingLine(), /The Ranch House: Put the hot tub cover back on/);
  assert.match(guestLeavingLine(), /The Lindon House keeps that shared list/);
  assert.equal(guestLeavingLine().includes('$'), false);
  assert.match(workOrderWhen('ranch', true, 'es'), /11:00 AM/);
  assert.match(workOrderNext('2026-11-04', 0, 'en'), /The next stay starts November 4, 2026/);
  assert.match(workOrderNext('2026-11-04', 0, 'en'), /The door code opens November 3, 2026/);
  assert.match(workOrderNext('2026-11-22', 15, 'es'), /noviembre/);
  assert.match(workOrderNext(null, null, 'en'), /No next stay is on the calendar/);
  assert.equal(/password|code\s*\d/i.test(workOrderNext('2026-11-04', 0, 'en')), false);
  assert.equal(workOrderParty(9, 'en'), 'The next stay is for 9 guests. Names stay off this list.');
  assert.equal(workOrderParty(20, 'en', 2), 'The next stay is for 20 guests, including 2 children. Names stay off this list.');
  assert.equal(workOrderParty(4, 'en', 4), 'The next stay names only children. A stay needs an adult. Names stay off this list.');
  assert.match(workOrderParty(4, 'es', 4), /necesita un adulto/);
  assert.equal(workOrderParty(4, 'en', 4).includes('including 4 children'), false);
  assert.equal(workOrderCheckoutParty(4, 'en', 4), 'This checkout names only children. A stay needs an adult. Names stay off this list.');
  assert.equal(workOrderParty(4, 'en', 8), 'The next stay is for 4 guests. Names stay off this list.');
  assert.equal(workOrderCheckoutParty(4, 'en', 8), 'This checkout was 4 guests. Names stay off this list.');
  assert.match(workOrderParty(null, 'en', 2), /names 2 children/);
  assert.match(workOrderLaterLeave(true, 'en'), /Nothing is charged yet/);
  assert.match(workOrderLaterLeave(false, 'es'), /no está abierta/);
  assert.equal(workOrderLaterLeave(false, 'en').includes('$'), false);
  assert.match(workOrderEarly(true, 'en'), /Arrive at 1:00 PM is a request/);
  assert.equal(/password|code\s*\d/i.test(workOrderEarly(true, 'en')), false);
  assert.match(workOrderEarly(false, 'es'), /no está abierta/);
  assert.match(workOrderPrep('ranch', '2026-11-06', '2026-10-29', 'en'), /hot tub/);
  assert.equal(workOrderPrep('lindon', '2026-11-06', '2026-10-29', 'en'), '');
  assert.equal(workOrderPrep('ranch', '2026-11-06', '2026-10-29', 'en').includes('$'), false);
  const service = serviceBrief(
    [
      { id: 'out', propertyId: 'ranch', checkIn: '2026-11-01', checkOut: '2026-11-04', status: 'confirmed' },
      { id: 'in', propertyId: 'ranch', checkIn: '2026-11-04', checkOut: '2026-11-08', status: 'confirmed' },
    ],
    { ranch: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'], lindon: [], river: [] },
    '2026-10-29',
  );
  assert.match(service, /Ranch Nov 4: A 2:00 PM leave is not open for this checkout\. An early arrival is not open for this stay/);
  assert.match(service, /The next stay can request the hot tub/);
  assert.match(service, /Ranch Nov 8: Leave at 2:00 PM is a request/);
  assert.equal(service.includes('$'), false);
  assert.equal(service.includes('Guest'), false);
  assert.equal(service.includes('Ada'), false);
  assert.match(workOrderParty(20, 'es', 2), /incluyendo 2 niños/);
  assert.match(workOrderParty(9, 'es'), /9 huéspedes/);
  assert.match(workOrderParty(null, 'en'), /does not say how many guests/);
  assert.equal(workOrderParty(9, 'en').includes('Ada'), false);
  assert.equal(
    workOrderArrival('6:00 PM', 'en'),
    'The next stay names an arrival. Arrival around 6:00 PM. Names stay off this list.',
  );
  assert.match(workOrderArrival('6:00 PM', 'es'), /Llegada alrededor de las 6:00 PM/);
  assert.match(workOrderArrival('8–10 PM', 'es'), /horas de silencio/);
  assert.match(workOrderArrival('801-555-0100', 'en'), /does not name an arrival time/);
  assert.equal(workOrderArrival('801-555-0100', 'en').includes('801'), false);
  assert.match(workOrderDeparture('11:00 AM', 'en'), /Leave at 11:00 AM/);
  assert.match(workOrderDeparture('2:00 PM', 'en'), /Nothing is charged yet/);
  assert.match(workOrderDeparture('2:00 PM', 'es'), /Todavía no se cobra nada/);
  assert.match(workOrderDeparture('801-555-0100', 'en'), /does not name a departure time/);
  assert.equal(workOrderDeparture('801-555-0100', 'en').includes('801'), false);
  assert.equal(workOrderCheckoutParty(null, 'en'), 'This checkout does not say how many guests. Names stay off this list.');
  assert.match(workOrderCheckoutParty(9, 'es'), /9 huéspedes/);
});
