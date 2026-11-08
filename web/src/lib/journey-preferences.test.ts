import assert from 'node:assert/strict';
import test from 'node:test';
import { arrivalJourney } from './journey.ts';
import { preferenceCardLines, preferenceCardNote } from './preference-choices.ts';

/*
 * The River guest phone showed two statements on the same page that contradicted each other:
 *
 *   PREFERENCE CARD:  "This stay has no preference card yet. Nothing is sent."
 *   YOUR TRIP:        "We have your preferences."
 *
 * Both were visible at once. The cause was that `preferencesDone` came from `Boolean(survey.completedAt)`,
 * and this stay's survey had been submitted with only `{ surveyVariant: 'vip' }` and no answers. A
 * submitted-but-empty survey is not "we have your preferences", and it is not a blank start either.
 *
 * The fix makes both sections read the same card, so they cannot disagree. These tests are the guard.
 */

const base = {
  asOf: '2026-11-08',
  checkIn: '2026-12-10',
  checkOut: '2026-12-13',
  opensOn: '2026-12-09',
  checkInTime: '4:00 PM',
  checkOutTime: '11:00 AM',
  phase: 'before' as const,
};

/** The journey's group line for a given pair of facts. */
function groupLine(preferencesDone: boolean, hasSurvey: boolean) {
  const steps = arrivalJourney({ ...base, preferencesDone, hasSurvey, agreementRead: false });
  return steps.find((step) => step.id === 'group')!;
}

test('a submitted but empty survey does not claim to have preferences', () => {
  const line = groupLine(false, true);
  assert.match(line.detail, /came in empty/i);
  assert.equal(/We have your preferences/.test(line.detail), false, 'an empty survey claimed to hold preferences');
  // Nor does it tell someone who already submitted to start over.
  assert.equal(/Tell us about your group/.test(line.detail), false, 'a submitted survey was treated as a blank start');
});

test('real answers are reported as having preferences, and marked done', () => {
  const line = groupLine(true, true);
  assert.equal(line.detail, 'We have your preferences.');
  assert.equal(line.state, 'done');
});

test('nothing submitted still invites the guest to tell us, and is not done', () => {
  const line = groupLine(false, false);
  assert.match(line.detail, /Tell us about your group/);
  assert.notEqual(line.state, 'done');
});

test('the two sections can never disagree, because both read the same card', () => {
  // Empty survey: the card section says there is no card, so the journey must not claim one.
  const emptyLines = preferenceCardLines('river', { surveyVariant: 'vip' } as never);
  assert.equal(emptyLines.length, 0, 'a variant-only survey produced a card');
  assert.match(preferenceCardNote(emptyLines.length), /no preference card yet/);
  assert.equal(
    /We have your preferences/.test(groupLine(emptyLines.length > 0, true).detail),
    false,
    'the journey claimed preferences while the card section said there were none',
  );

  // A real answer: the card exists, so the journey may say so.
  const realLines = preferenceCardLines('river', { adults: '6', celebration: 'birthday' } as never);
  assert.ok(realLines.length > 0, 'a real answer produced no card');
  assert.equal(
    groupLine(realLines.length > 0, true).detail,
    'We have your preferences.',
    'the journey did not acknowledge a real preference card',
  );
});
