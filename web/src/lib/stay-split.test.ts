import assert from 'node:assert/strict';
import test from 'node:test';
import { splitStay, splitStayLine } from './stay-split.ts';

function centsOf(split: NonNullable<ReturnType<typeof splitStay>>): number {
  return split.highCount * split.highCents + split.lowCount * split.lowCents;
}

test('an even party splits the stay with nothing left over', () => {
  const split = splitStay(3360, 8);
  assert.ok(split);
  assert.equal(split.highCount, 0);
  assert.equal(split.lowCents, 42000);
  assert.equal(centsOf(split), 336000);
  assert.match(splitStayLine(3360, 8) ?? '', /8 overnight guests would each cover \$420/);
  assert.match(splitStayLine(3360, 8) ?? '', /Nothing is charged/);
});

test('leftover pennies sit on the first shares and still add up', () => {
  const split = splitStay(100, 3);
  assert.ok(split);
  assert.equal(split.highCount, 1);
  assert.equal(split.highCents, 3334);
  assert.equal(split.lowCount, 2);
  assert.equal(split.lowCents, 3333);
  assert.equal(centsOf(split), 10000);
  const line = splitStayLine(100, 3) ?? '';
  assert.match(line, /1 overnight guest would cover \$33\.34/);
  assert.match(line, /2 overnight guests would cover \$33\.33/);
});

test('one guest and a bad count do not split the stay', () => {
  assert.equal(splitStay(4200, 1), null);
  assert.equal(splitStay(4200, 0), null);
  assert.equal(splitStay(4200, 1.5), null);
  assert.equal(splitStay(-1, 2), null);
});
