import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * The gate was two halves: seven agreement topics opened one at a time, and a separate "I have read the house rules"
 * tick. Both had to be true before the request form appeared.
 *
 * Measured on production, that gate lost a guest's work to a refresh: seven `data-read="yes"` became `no` and the
 * request form disappeared. The rebuild replaced it with **one** checkbox, which keeps the properties that protect a
 * guest and drops the clicking:
 *
 *   - it is scoped per house, so a tick on the Lindon page cannot unlock River;
 *   - it lives in `sessionStorage`, so it survives a refresh in this visit and does not carry to tomorrow;
 *   - it degrades to in-memory when a browser refuses storage, rather than breaking the page;
 *   - and the terms are readable on the page before the tick means anything.
 *
 * The guard was retargeted from `/book/` when that route began rendering this card.
 */

const source = readFileSync(new URL('../../components/DirectReserveCard.tsx', import.meta.url), 'utf8');

test('the gate is remembered for the visit', () => {
  assert.match(source, /const GATE_KEY = '/, 'the gate has no storage key');
  assert.match(source, /sessionStorage\.setItem\(GATE_KEY/, 'nothing writes the gate');
  assert.match(source, /sessionStorage\.getItem\(GATE_KEY\)/, 'nothing reads the gate back');
});

test('it is session storage, not local', () => {
  // A new tab or the next day should start clean. Reusing rules read yesterday is not "reading the rules".
  assert.equal(
    /localStorage[\s\S]{0,80}GATE_KEY|GATE_KEY[\s\S]{0,80}localStorage/.test(source),
    false,
    'the gate was moved to localStorage, so it outlives the visit',
  );
});

test('the gate is saved as one record, so a half-state cannot be restored', () => {
  /*
   * The old gate had two halves and had to save them together. This one has a single flag per house, and the property
   * that survives is the one that mattered: one write, restoring exactly the state the guest was in.
   */
  assert.match(source, /saveGate\(\{ read \}\)/, 'the gate is saved piecemeal');
  assert.match(source, /const read: Partial<Record<HouseId, boolean>>/, 'the stored shape changed');
});

test('a browser that refuses storage still gets a working form', () => {
  // Private mode throws on `sessionStorage`. The gate must degrade to in-memory, not crash the booking page.
  const load = /function loadGate[\s\S]*?\n\}/.exec(source)?.[0] ?? '';
  const save = /function saveGate[\s\S]*?\n\}/.exec(source)?.[0] ?? '';
  assert.ok(load.length > 0 && save.length > 0, 'the gate helpers are missing');
  assert.match(load, /try\s*\{/, 'the read is unguarded');
  assert.match(load, /catch\s*\{/, 'the read has no failure path');
  assert.match(save, /try\s*\{/, 'the write is unguarded');
  assert.match(save, /catch\s*\{/, 'the write has no failure path');
});

test('the restored gate is per house, so one page cannot unlock another', () => {
  const load = /function loadGate[\s\S]*?\n\}/.exec(source)?.[0] ?? '';
  assert.match(load, /'river', 'ranch', 'lindon'/, 'the restore does not scope by house');
  assert.match(load, /read\[id\] = true/, 'the rules-read flag is not restored per house');
});

test('reading the rules is still something the guest must do', () => {
  // The single tick is not a rubber stamp: the terms render on the page, and the button stays off without the tick.
  assert.match(source, /data-bot="stay-rules-check"/, 'the rules checkbox is missing');
  assert.match(source, /rulesRead/, 'readiness no longer checks the tick');
  assert.match(source, /<details/, 'the terms are not readable before the tick');
});
