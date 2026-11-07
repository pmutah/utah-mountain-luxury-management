import assert from 'node:assert/strict';
import test from 'node:test';
import {
  constructionDocsUnreadLine,
  constructionListUnreadable,
  constructionProjectUnreadLine,
  partnerSpendUnreadLine,
} from './construction-read.ts';

test('a failed construction read is not an empty project', () => {
  assert.equal(constructionListUnreadable('Saved expenses could not be read. Storage reads are paused for the rest of the day. Nothing was written over them.'), true);
  assert.equal(constructionListUnreadable('error code: 1101'), true);
  assert.equal(constructionListUnreadable('No tagged construction bills yet.'), false);
  const docs = constructionDocsUnreadLine();
  const bills = partnerSpendUnreadLine();
  const project = constructionProjectUnreadLine();
  for (const line of [docs, bills, project]) {
    assert.equal(line.includes('$'), false);
    assert.match(line, /Nothing was written over/);
  }
  assert.match(docs, /not using an empty project file/);
  assert.match(bills, /not using an empty partner list/);
  assert.match(bills, /Nothing was logged/);
  assert.match(project, /not using a blank project/);
});
