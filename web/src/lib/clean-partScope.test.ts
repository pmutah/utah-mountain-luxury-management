import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanJobs } from './clean.ts';
import type { Reservation } from './api.ts';

/*
 * A cleaner sent to a Garage Suite turn was told to "Strip and remake every bed" — in a house with eleven beds, after a
 * stay that used two. Hours of work nobody stayed in, and on a part turn the cleaner walks into rooms another guest is
 * using.
 *
 * The turnover now carries which parts it touches, and the two steps that name a whole-house scope are rewritten for it.
 * Everything else is left exactly as written: inventing a narrower instruction for a generic step would be its own kind
 * of wrong.
 */

const reservation = (over: Partial<Reservation>): Reservation =>
  ({
    id: 'res-1',
    guestName: 'Guest',
    propertyId: 'river',
    checkIn: '2027-03-10',
    checkOut: '2027-03-12',
    payout: 900,
    source: 'Direct',
    status: 'confirmed',
    ...over,
  }) as Reservation;

function jobs(stay: Partial<Reservation>) {
  return cleanJobs([reservation(stay)], '2027-03-01', 30);
}

test('a whole-house turn keeps the whole-house steps', () => {
  const [job] = jobs({});
  assert.ok(job, 'no turnover was produced');
  const beds = job!.steps.find((step) => step.id === 'beds');
  assert.equal(beds?.label, 'Strip and remake every bed', 'a whole-house clean was scoped down');
});

test('a part turn names the beds it actually has to make', () => {
  const [job] = jobs({ units: ['garage-suite'] });
  const beds = job!.steps.find((step) => step.id === 'beds');
  assert.ok(beds, 'no beds step');
  assert.match(beds!.label, /2 beds/);
  assert.match(beds!.label, /Garage Suite/);
  assert.match(beds!.label, /1 bedroom/);
  assert.match(beds!.label, /not the whole house/);
  assert.equal(/every bed/.test(beds!.label), false, 'a part clean still says every bed');
});

test('a part turn scopes the bathrooms too', () => {
  const [job] = jobs({ units: ['garage-suite'] });
  const baths = job!.steps.find((step) => step.id === 'baths');
  assert.match(baths!.label, /Garage Suite only/);
  assert.match(baths!.label, /1 bath/);
});

test('two parts add their rooms together', () => {
  const [job] = jobs({ units: ['garage-suite', 'main-lodge'] });
  const beds = job!.steps.find((step) => step.id === 'beds');
  // 2 beds in the Garage Suite, 5 in the Main Lodge (four kings plus the bunk-room bunk) = 7.
  assert.match(beds!.label, /7 beds/);
  assert.match(beds!.label, /5 bedrooms/);
});

test('all three parts is the whole house again, so the plain step stands', () => {
  const [job] = jobs({ units: ['garage-suite', 'recreation-wing', 'main-lodge'] });
  const beds = job!.steps.find((step) => step.id === 'beds');
  assert.equal(beds?.label, 'Strip and remake every bed', 'taking every part was scoped like a part');
});

test('a generic step is left exactly as written', () => {
  const [job] = jobs({ units: ['garage-suite'] });
  const kitchen = job!.steps.find((step) => step.id === 'kitchen');
  assert.equal(kitchen?.label, 'Kitchen, dishes, and coffee', 'a generic step was rewritten');
});

test('a room photo step is not narrowed, because a part still needs photos', () => {
  const [job] = jobs({ units: ['main-lodge'] });
  const photos = job!.steps.find((step) => step.id === 'photos');
  assert.equal(photos?.label, 'Photo each room before you leave');
});
