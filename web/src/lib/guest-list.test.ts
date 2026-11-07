import assert from 'node:assert/strict';
import test from 'node:test';
import { guestEditorLockLine, guestLinkNote, guestListUnreadable, guestListUnreadNote, guestMailUnreadLine } from './guest-list.ts';

test('a failed guest-list read is not an empty book', () => {
  assert.equal(guestListUnreadable('The dashboard could not load. Storage writes are paused for the rest of the day.'), true);
  assert.equal(guestListUnreadable('KV get() limit exceeded for the day.'), true);
  assert.equal(guestListUnreadable('error code: 1101'), true);
  assert.equal(guestListUnreadable('No upcoming stays.'), false);
  const note = guestListUnreadNote();
  assert.match(note, /not using a stand-in/);
  assert.match(note, /Nothing was written over them/);
  assert.equal(note.includes('$'), false);
  const hidden = guestLinkNote(true);
  assert.match(hidden, /does not show a guest link/);
  assert.match(hidden, /Nothing is sent/);
  assert.equal(/door\s*code|wi-?fi|token/i.test(hidden), false);
  assert.match(guestLinkNote(false), /Guest URL: \/stay\/<token>/);
  const locked = guestEditorLockLine();
  assert.match(locked, /editor stays closed/);
  assert.match(locked, /Nothing was written over the guide/);
  assert.equal(/door\s*code|wi-?fi|password/i.test(locked), false);
  const mail = guestMailUnreadLine();
  assert.match(mail, /does not say whether mail or text is connected/);
  assert.match(mail, /Nothing is sent/);
  assert.equal(mail.includes('not connected'), false);
  assert.equal(mail.includes('@'), false);
});
