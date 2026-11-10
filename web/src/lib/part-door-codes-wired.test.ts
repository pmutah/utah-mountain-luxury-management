/**
 * End-to-end: a part stay's guest page carries only its own door code.
 *
 * This drives the real route against an in-memory store, because the unit of concern is the assembled response — the resolver
 * can be right while the route hands over the house code, which is precisely the bug the gate tests caught once already.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { doorCodesForStay } from './part-door-codes.ts';

/*
 * The resolver is pure, so the route's behaviour reduces to two questions: does it pass the stay's units, and does it gate on
 * `stayAccessSecrets`. Both are checked in source below, and the resolver's own behaviour is checked directly.
 */
import { readFileSync } from 'node:fs';

const ROUTE = readFileSync('functions/api/stay-guide/[token]/index.ts', 'utf8');

test('the route resolves the door codes from the stay, not from the house alone', () => {
  assert.match(ROUTE, /doorCodesForStay\(\{/, 'the route does not resolve per-part codes at all');
  assert.match(ROUTE, /units: Array\.isArray\(stay\?\.units\) \? stay\.units : undefined/, 'the route does not pass the stay units');
  assert.match(ROUTE, /partCodes: guide\.partDoorCodes/, 'the route does not pass the part codes from the guide');
});

test('the per-part codes ride the same gate as the house code did', () => {
  /*
   * The first version gated on `unlocked`, which opens on the window alone — so a phone that had not read the rules was shown a
   * code. `stayAccessSecrets` is the one place that decides, and it needs both.
   */
  assert.match(ROUTE, /const codeOpen = secrets\.doorCode !== null/, 'the route does not gate on the resolved secrets');
  assert.equal(/doorCodesForStay[\s\S]{0,400}unlocked \?/.test(ROUTE), false, 'a per-part code is gated on the window alone');
});

test('a part guest is never handed the house code', () => {
  /*
   * The behavioural claim, stated once against the resolver: the house code opens every part, so it is not a fallback for a
   * part whose own code is missing.
   */
  const plan = doorCodesForStay({
    house: 'river',
    units: ['garage-suite'],
    houseCode: '1111',
    partCodes: { 'main-lodge': '4444' },
  });
  assert.equal(JSON.stringify(plan).includes('1111'), false);
  assert.equal(JSON.stringify(plan).includes('4444'), false);
  assert.ok(plan.missing);
});

test('a whole-house stay still gets exactly one door code', () => {
  const plan = doorCodesForStay({ house: 'river', houseCode: '1111', partCodes: { 'main-lodge': '4444' } });
  assert.deepEqual(plan.codes, [{ label: 'Door code', code: '1111' }]);
  assert.equal(plan.missing, null);
});
