import assert from 'node:assert/strict';
import test from 'node:test';
import { letterPausedLine, ownerStatementPausedLine, reportPausedLine } from './report-paused.ts';

test('the management report stays off without a stand-in list', () => {
  const line = reportPausedLine();
  assert.match(line, /management figures stay off/);
  assert.match(line, /not using a stand-in list/);
  assert.match(line, /Nothing was written over them/);
  assert.match(line, /Documents stay available/);
  assert.equal(line.includes('$'), false);
  assert.equal(/\b\d{3,}\b/.test(line), false);
  const letter = letterPausedLine();
  assert.match(letter, /letter stays off/);
  assert.match(letter, /Nothing was written over them/);
  assert.equal(letter.includes('$'), false);
  const owner = ownerStatementPausedLine();
  assert.match(owner, /statement stays off/);
  assert.match(owner, /not using a stand-in total/);
  assert.match(owner, /Nothing was written over them/);
  assert.match(owner, /direct request stays off/);
  assert.match(owner, /does not ask for a name/);
  assert.equal(owner.includes('$'), false);
  assert.equal(/\b\d{3,}\b/.test(owner), false);
});
