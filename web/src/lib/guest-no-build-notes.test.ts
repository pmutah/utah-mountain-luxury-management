import assert from 'node:assert/strict';
import test from 'node:test';
import { quietNow, quietNowLine, homeQuietLine } from './stay-rhythm.ts';
import { cleanQuietLine } from './clean.ts';
import { housePausedLines } from './home-paused.ts';
import { stayGuideLookup } from './house-manual.ts';
import { guideDeskAnswer } from './guide-desk.ts';
import { preferenceCardNote, preferencePetLine } from './preference-choices.ts';
import { stayPhotoCaption } from './house-photos.ts';
import { houseCardFacts, companionStayFacts } from './house-page.ts';
import { houseStay } from './house-stay.ts';
import { houseRules } from './house-rules.ts';

/*
 * A guest dashboard must not narrate our own build state. Three sentences used to do exactly that on the
 * River House phone:
 *
 *   "Quiet hours in this mountain neighborhood. The guide does not name a clock."
 *   "Listing rendering · finish photos after the house is done."
 *   "This stay has no preference card yet. Nothing is sent."
 *
 * The first told a guest nothing they could use and read as unfinished work. The second told a guest who
 * had already paid that the house might not be ready. These tests are the guard: guest copy may say what
 * a rule is, and it may say what a surface does not do, but it may not describe a gap in our data or a
 * task still on our list.
 */

/** Copy that describes our build state rather than the guest's stay. */
const BUILD_NOTE = [
  /\bdoes not name a clock\b/i,
  /\bno nombra un reloj\b/i,
  /\bfinish photos\b/i,
  /\bafter the house is done\b/i,
  /\b(placeholder|coming soon|not done|in progress|tbd|todo)\b/i,
  /\bstill being built\b/i,
  /\bunder construction\b/i,
];

function assertNoBuildNote(text: string, where: string) {
  for (const pattern of BUILD_NOTE) {
    assert.equal(pattern.test(text), false, `${where} narrates our build state: ${text.slice(0, 120)}`);
  }
}

test('no quiet-hours line tells the guest we never set a clock', () => {
  const riverOnly = [
    quietNow('river', 23),
    quietNow('river', 13),
    quietNowLine('river', 23, 'quote'),
    quietNowLine('river', 13, 'phone'),
    cleanQuietLine('river', 'en', 23),
    cleanQuietLine('river', 'es', 23),
    ...housePausedLines('river', '2026-10-30', 23),
  ];
  const mixed = [homeQuietLine(23), homeQuietLine(13)];
  for (const line of [...riverOnly, ...mixed]) assertNoBuildNote(line, 'a quiet-hours line');

  /*
   * The River House now publishes a clock — the owner gave 10 PM to 6 AM for all three houses on 2026-11-10 — so this asserts
   * the window is stated rather than refusing one. The earlier version checked the opposite, because the guide named no time
   * there and inventing one would have been a guess.
   *
   * Only the strings that are actually quiet-hours lines: `housePausedLines` returns the minimum-stay line among others, and a
   * blanket check demanded a clock from a sentence about nights.
   */
  const riverQuietLines = [
    quietNow('river', 23),
    quietNow('river', 13),
    quietNowLine('river', 23, 'quote'),
    quietNowLine('river', 13, 'phone'),
    cleanQuietLine('river', 'en', 23),
    cleanQuietLine('river', 'es', 23),
  ];
  for (const line of riverQuietLines) {
    assert.match(line, /6:00 AM|6 AM/, `River did not state the published window: ${line}`);
  }
});

test('River quiet hours name the real window and read as an instruction', () => {
  const line = quietNow('river', 23);
  assert.match(line, /quiet hours/i);
  assert.match(line, /in effect until 6:00 AM/);
  // Still a real instruction rather than a statement about our documentation.
  assert.equal(/guide does not name|could not be read/i.test(line), false);
});

test('the rendering caption does not promise future photography', () => {
  const caption = stayPhotoCaption('river');
  assert.match(caption, /rendering/i);
  assertNoBuildNote(caption, 'the River photo caption');
});

test('no surface the guest reads carries a build note', () => {
  const surfaces: Array<[string, string]> = [
    ['stay card', houseCardFacts('river').join('\n')],
    ['companion-card facts', companionStayFacts('river').join('\n')],
    ['published rules', houseRules('river').map((rule) => rule.text).join('\n')],
    ['stay sheet', houseStay('river').notes.map((note) => note.body).join('\n')],
    ['preference note', preferenceCardNote(0)],
    ['pet line', preferencePetLine()],
  ];
  for (const [where, text] of surfaces) assertNoBuildNote(text, where);
});

test('a gap in the guide points at a person, it does not narrate the gap', () => {
  // No house publishes a pet rule. The phone must not say "the guide does not name a pet rule" — that is
  // our gap, and a guest with a dog cannot act on it.
  const pets = preferencePetLine();
  assert.equal(/does not name/i.test(pets), false);
  // This form is post-booking, so it cannot tell the guest to ask before booking, and it must name a field that is
  // actually on the card.
  assert.equal(/before you book/i.test(pets), false);
  assert.match(pets, /last note on this card/i);
});

test('the guest app still refuses to claim it sends or signs', () => {
  // The "nothing is sent" wording is deliberate, and must not be mistaken for build copy: this phone
  // genuinely cannot send or sign. It says what the surface does not do, which is allowed.
  const line = quietNow('river', 23);
  assert.equal(/sign|charge|post to Airbnb/i.test(line), false, 'a quiet-hours line claimed an action');
});

test('the guide desks answer the River question without narrating the gap', () => {
  const answers = [
    guideDeskAnswer('Is it quiet hours now at the River House?', '2026-10-30', undefined, false, 23),
    stayGuideLookup('Are quiet hours in effect right now?', 'river', undefined, 23)
      .hits.map((hit) => hit.text)
      .join(' '),
  ];
  for (const text of answers) assertNoBuildNote(text, 'a guide answer');
});
