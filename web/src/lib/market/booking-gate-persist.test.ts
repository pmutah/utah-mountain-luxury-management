import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * **A guest who worked through the gate lost all of it to a refresh.**
 *
 * Opening seven agreement topics and ticking "I have read the house rules" lived only in React state. Measured on
 * production: seven `data-read="yes"` before a reload, seven `no` after, and the request form gone. On a seven-step
 * gate that is a real reason to give up and book through Airbnb instead.
 *
 * The gate now survives a reload **within the visit** — `sessionStorage`, not `localStorage`, because reading the
 * rules for one stay should not carry to a new tab or tomorrow. It is keyed by house, matching the per-house rule the
 * in-memory state already follows.
 *
 * This test reads the component, because the property is about which store is used and when — nothing a unit of pure
 * logic can express.
 */

const source = readFileSync(new URL('../../components/DirectBook.tsx', import.meta.url), 'utf8');

test('the booking gate is remembered for the visit', () => {
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

test('both halves of the gate are saved together', () => {
  /*
   * Topics and the rules-read flag unlock one form between them. Saving one without the other would restore a guest
   * to a state they were never in.
   */
  assert.match(source, /saveGate\(\{\s*topics:\s*openedTopics,\s*read:\s*rulesReadByHouse\s*\}\)/, 'the two halves are saved separately');
  assert.match(source, /loadGate\(\)\.topics/, 'topics are not restored');
  assert.match(source, /loadGate\(\)\.read/, 'the rules-read flag is not restored');
});

test('a browser that refuses storage still gets a working form', () => {
  /*
   * Private mode throws on `sessionStorage`. The gate must degrade to in-memory, not crash the page a guest is trying
   * to book from.
   */
  const load = /function loadGate[\s\S]*?\n\}/.exec(source)?.[0] ?? '';
  const save = /function saveGate[\s\S]*?\n\}/.exec(source)?.[0] ?? '';
  assert.ok(load.length > 0 && save.length > 0, 'the gate helpers are missing');
  assert.match(load, /try\s*\{/, 'the read is unguarded');
  assert.match(load, /catch\s*\{/, 'the read has no failure path');
  assert.match(save, /try\s*\{/, 'the write is unguarded');
  assert.match(save, /catch\s*\{/, 'the write has no failure path');
});

test('the restored gate is per house, so one tab cannot unlock another', () => {
  const load = /function loadGate[\s\S]*?\n\}/.exec(source)?.[0] ?? '';
  assert.match(load, /'river', 'ranch', 'lindon'/, 'the restore does not scope by house');
  assert.match(load, /read\[id\] = true/, 'the rules-read flag is not restored per house');
});
