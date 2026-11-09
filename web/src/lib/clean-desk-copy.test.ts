import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { cleanDeskNote } from './clean-desk-copy.ts';

/*
 * The clean desk's note about its own data was wrong in two of three sentences:
 *
 *   "Checks stay on this browser." — they had been moved to the server.
 *   "A room photo ... is not uploaded." — false of the cleaner's link, which uploads.
 *
 * Both are the class of defect this project keeps finding: a label with nothing behind it. The guard is to read the
 * code that actually writes and compare it with the sentence that describes it.
 */

const DESK = readFileSync(new URL('../components/CleanDesk.tsx', import.meta.url), 'utf8');
const LINK = readFileSync(new URL('../components/CleanLink.tsx', import.meta.url), 'utf8');
const NOTES = readFileSync(new URL('./clean-notes.ts', import.meta.url), 'utf8');

test('the desk no longer says ticks stay in the browser, because they are saved to the server', () => {
  assert.match(DESK, /saveCleanProgress/, 'the desk stopped saving ticks, so the sentence needs revisiting');
  for (const lang of ['en', 'es'] as const) {
    const note = cleanDeskNote(lang);
    assert.equal(/checks stay on this browser/i.test(note), false, `${lang}: still claims ticks are local only`);
    assert.equal(/se quedan en este navegador/i.test(note), false, `${lang}: still claims ticks are local only`);
  }
  assert.match(cleanDeskNote('en'), /saved to the server/);
});

test('the desk does not claim photos are never uploaded, because the cleaner link uploads them', () => {
  // The cleaner's page really does POST a photo, so a blanket claim would be false.
  assert.match(LINK, /photos`, \{/, 'the cleaner link no longer uploads, so the sentence needs revisiting');
  const note = cleanDeskNote('en');
  assert.equal(/a room photo stays in this tab and is not uploaded/i.test(note), false, 'still a blanket claim');
  assert.match(note, /Photos the cleaner uploads from their link are saved/);
  // It may still say a photo attached on the desk is local, because that one is.
  assert.match(note, /A photo you attach here stays in this tab/);
});

test('the fix note really does stay in this browser, and the sentence says so', () => {
  assert.match(NOTES, /sessionStorage\.setItem/, 'fix notes stopped being local, so the sentence needs revisiting');
  assert.match(cleanDeskNote('en'), /A fix note stays in this browser/);
});

test('the note never claims the desk changes a booking or an expense', () => {
  for (const lang of ['en', 'es'] as const) {
    const note = cleanDeskNote(lang);
    assert.match(note, /booking|reserva/i);
    assert.equal(/does change a booking/i.test(note), false);
  }
});

test('both languages say the same number of things', () => {
  // A truncated translation is how the Spanish line lost its fix-note sentence before.
  const en = cleanDeskNote('en');
  const es = cleanDeskNote('es');
  const count = (text: string) => text.split('. ').length;
  assert.ok(count(en) >= 4, 'the English note is missing a sentence');
  assert.ok(count(es) >= 4, 'the Spanish note is missing a sentence');
  assert.notEqual(en, es, 'the Spanish note is a copy of the English one');
});

test('the desk renders the note from the module, not from inline prose that can drift again', () => {
  assert.match(DESK, /\{cleanDeskNote\(lang\)\}/, 'the desk no longer renders the shared note');
  assert.equal(/Checks stay on this browser/.test(DESK), false, 'the old sentence is back in the component');
});

test('a failed task read cannot render as an empty task list', () => {
  /*
   * The panel rendered only when there were tasks to show, so a read that failed and a house with nothing to do both
   * showed nothing at all. A host would read that silence as "clear".
   */
  assert.match(DESK, /tasksState === 'unreadable'/, 'a failed task read has no state of its own');
  assert.match(DESK, /clean-tasks-unreadable/, 'a failed task read renders nothing');
  assert.match(DESK, /This is not the same as no open tasks/, 'the failure is not explained');
  // The list itself may still gate on having tasks; the failure notice must not.
  assert.match(DESK, /tasksState === 'ready' && tasks\.length > 0/, 'the task panel lost its ready state');
});
