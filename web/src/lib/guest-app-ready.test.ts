import assert from 'node:assert/strict';
import test from 'node:test';
import { enableHold, guideFill, guideReadiness, readinessLine, switchLine } from './guest-app-ready.ts';

const FULL = {
  headline: 'Sleeps 24 on the Provo River',
  address: '270 East Center Street, Lindon, Utah 84042',
  arrival: 'Drive up Provo Canyon to Vivian Park.',
  parking: 'Park in the driveway and garage.',
  checkout: 'Start the dishwasher.',
  sections: [{ title: 'Septic', body: 'Only toilet paper goes in the toilets.' }],
  places: [
    { name: 'Sundance', note: 'Ski in winter.' },
    { name: 'Bridal Veil Falls', note: 'A short walk.' },
    { name: 'Heber Valley Railroad', note: 'Scenic rides.' },
  ],
};

test('a full guide is ready', () => {
  const readiness = guideReadiness(FULL);
  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.missing, []);
  assert.match(readiness.line, /Ready for guests/);
  assert.equal(readiness.line.includes('$'), false);
});

test('a guide with too few nearby places is not ready', () => {
  const fewPlaces = guideReadiness({ ...FULL, places: [{ name: 'A', note: 'x' }] });
  assert.ok(fewPlaces.missing.includes('at least three nearby places'));
  assert.match(fewPlaces.line, /thinner|thin page/);
});

test('a house with no house notes is ready, because some houses have nothing special to warn about', () => {
  /*
   * This used to assert the opposite, and that assertion blocked the Lindon House permanently: its
   * published guide has `notes: []` because there is no hot tub, septic, or river to warn about. A gate
   * that demands a warning where there is none teaches a host to invent one, and a fabricated septic note
   * reaches a real guest.
   */
  const noNotes = guideReadiness({ ...FULL, sections: [] });
  assert.equal(noNotes.ready, true, 'a house with no special notes was refused');
  assert.equal(noNotes.missing.length, 0);
  // The line has to say why there are none, so a host is not left thinking it is unfinished.
  assert.match(noNotes.line, /no special notes/i);
});

test('a blank section or place does not count', () => {
  const blank = guideReadiness({
    ...FULL,
    sections: [{ title: 'Septic', body: '   ' }],
    places: [
      { name: 'Sundance', note: 'Ski.' },
      { name: 'Bridal Veil', note: '' },
      { name: 'Heber', note: 'Train.' },
    ],
  });
  /* A blank note is simply not a note. It is no longer a blocker, but it must not read as content either. */
  assert.equal(blank.ready, false);
  assert.ok(blank.missing.includes('at least three nearby places'));
  assert.equal(blank.missing.includes('at least one house note'), false, 'a missing note is not a blocker');
});

test('every missing fact is named so a host knows what to add', () => {
  const readiness = guideReadiness({ headline: 'x' });
  assert.equal(readiness.ready, false);
  for (const phrase of ['the street address', 'how to arrive', 'where to park', 'the checkout steps']) {
    assert.ok(readiness.missing.includes(phrase), `missing did not name ${phrase}`);
  }
});

test('the switch refuses to turn on a thin guide and says why', () => {
  const hold = enableHold({ headline: 'x' });
  assert.ok(hold);
  assert.match(hold, /nearly blank page/);
  assert.match(hold, /stays off/);
  assert.equal(enableHold(FULL), null);
});

test('a null guide is refused rather than treated as ready', () => {
  assert.equal(guideReadiness(null).ready, false);
  assert.ok(enableHold(null));
  assert.match(guideReadiness(undefined).line, /has not loaded/);
});

test('the editor line says when an on app is thin instead of pretending it is fine', () => {
  const thin = switchLine({ headline: 'x' }, true);
  assert.match(thin, /It is on, so a guest can see the thin page/);
  const goodOff = switchLine(FULL, false);
  assert.match(goodOff, /has enough in it to turn on/);
  const goodOn = switchLine(FULL, true);
  assert.match(goodOn, /guests can open their stay page/);
});

test('the fill count is honest about partial work', () => {
  /*
   * Six, not seven: the five required facts plus the nearby places. House notes are not required, so they
   * are not counted — a permanent "6 of 7" on a house with nothing special to warn about is what pushes a
   * host to invent a note.
   */
  assert.deepEqual(guideFill(FULL), { done: 6, total: 6 });
  const partial = guideFill({ headline: 'x', address: 'y' });
  assert.equal(partial.done, 2);
  assert.equal(partial.total, 6);
  assert.equal(guideFill(null).done, 0);
});

test('the readiness line names off and thin houses without overstating', () => {
  const line = readinessLine([
    { id: 'river', name: 'The River House', guide: FULL, enabled: true },
    { id: 'ranch', name: 'The Ranch House', guide: { headline: 'x' }, enabled: false },
  ]);
  assert.match(line, /The Ranch House is off/);
  assert.match(line, /The Ranch House is thin/);
  assert.match(readinessLine([{ id: 'river', name: 'The River House', guide: FULL, enabled: true }]), /Every guest app is on/);
  assert.equal(readinessLine([]), 'No house to check.');
});
