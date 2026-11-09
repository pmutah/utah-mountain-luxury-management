import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * The split mode was component state only. Every reload put the house back to `auto`, so a host who had turned splitting
 * off found it on again the next morning — and nothing said so. A setting that changes what is offered has to outlive
 * the tab.
 *
 * These are source guards: the defect was where the value lived, not what it computed.
 */

const ROUTE = readFileSync(new URL('../../functions/api/pricing/river-split.ts', import.meta.url), 'utf8');
const STORE = readFileSync(new URL('../../functions/_lib/pricing-store.ts', import.meta.url), 'utf8');
const PANEL = readFileSync(new URL('../components/RiverSplitPanel.tsx', import.meta.url), 'utf8');

test('the mode is stored, not only parsed', () => {
  assert.match(STORE, /KV_SPLIT_MODE/, 'there is no stored key for the split mode');
  assert.match(STORE, /export async function loadRiverSplitMode/, 'the stored mode cannot be read');
  assert.match(STORE, /export async function saveRiverSplitMode/, 'the stored mode cannot be written');
});

test('a corrupt stored mode reads as auto, never as off', () => {
  // Reading garbage as "off" would silently stop the house being split at all.
  const body = STORE.slice(STORE.indexOf('export async function loadRiverSplitMode'));
  assert.match(body.slice(0, 400), /=== 'suggest-only' \|\| raw === 'off' \? raw : 'auto'/, 'a bad stored value does not fall back to auto');
});

test('the route answers with the saved mode when the query names none', () => {
  assert.match(ROUTE, /loadRiverSplitMode\(env\)/, 'the route never reads the saved mode');
  assert.match(ROUTE, /has\('mode'\)/, 'the route cannot tell a saved mode from a requested one');
  assert.match(ROUTE, /modeFromStorage/, 'the response does not say where the mode came from');
});

test('the route can save the mode, and refuses a mode it does not know', () => {
  assert.match(ROUTE, /onRequestPut/, 'there is no way to save the setting');
  assert.match(ROUTE, /body\.mode !== 'auto' && body\.mode !== 'suggest-only' && body\.mode !== 'off'/, 'an unknown mode is accepted');
  assert.match(ROUTE, /saveRiverSplitMode\(env, body\.mode\)/, 'the route does not write the mode it validated');
});

test('the panel loads the saved mode rather than passing its own default', () => {
  // The GET must not send a mode: sending `auto` would override the stored setting on every load.
  assert.match(PANEL, /getRiverSplit\(from, until\)/, 'the panel still sends a mode on load');
  assert.equal(/getRiverSplit\(from, until, mode\)/.test(PANEL), false, 'the panel overrides the saved mode on load');
});

test('the panel adopts what the server reports and saves a change', () => {
  assert.match(PANEL, /setMode\(result\.mode\)/, 'the panel ignores the saved mode');
  assert.match(PANEL, /api\.saveRiverSplitMode\(next\)/, 'a mode change is never saved');
  assert.match(PANEL, /setMode\(previous\)/, 'a failed save leaves the control claiming the new setting');
});

test('the save outcome is shown, so a host knows it stuck', () => {
  assert.match(PANEL, /river-split-mode-note/, 'there is no confirmation of the saved setting');
});
