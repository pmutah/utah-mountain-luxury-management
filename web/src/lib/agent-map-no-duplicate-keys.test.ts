import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENT_SITE_MAP } from '../../functions/_lib/agent/site-map.ts';

/*
 * The agent map carried two keys for one route: `amandaOpenapi` and `amandaOpenApi`, differing only in case. TypeScript
 * allows that — the names are distinct — so nothing failed, but a consumer reading the map case-insensitively sees a
 * duplicate, and PowerShell's own JSON parser refused the whole payload: "contains the duplicated keys 'amandaOpenapi'
 * and 'amandaOpenApi'".
 *
 * This reads the **object**, not the source text. Parsing the literal by hand led me through four wrong attempts: the
 * keys sit at two spaces, the depth starts at zero, and a brace inside a string threw the counter off. The object is
 * already the thing a bot receives, so it is the right thing to check.
 */

const KEYS = Object.keys(AGENT_SITE_MAP);

/**
 * Route keys are nested one level down, under groups like `apis`. A duplicate inside a group is the same defect as a
 * duplicate at the top, and checking only the top level let the original one through.
 */
function routeKeys(): Array<{ group: string; key: string }> {
  const out: Array<{ group: string; key: string }> = [];
  for (const [group, value] of Object.entries(AGENT_SITE_MAP)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const key of Object.keys(value)) out.push({ group, key });
  }
  return out;
}

test('the map has the entries it should', () => {
  const routes = routeKeys();
  assert.ok(KEYS.length >= 6, `only ${KEYS.length} groups — the map is not what this test expects`);
  assert.ok(routes.length > 40, `only ${routes.length} route keys across the groups`);
});

test('no two route keys are the same name within a group', () => {
  const byGroup = new Map<string, string[]>();
  for (const { group, key } of routeKeys()) {
    byGroup.set(group, [...(byGroup.get(group) ?? []), key]);
  }
  const dupes: string[] = [];
  for (const [group, keys] of byGroup) {
    const seen = new Set<string>();
    for (const key of keys) {
      if (seen.has(key)) dupes.push(`${group}.${key}`);
      seen.add(key);
    }
  }
  assert.deepEqual(dupes, [], `the map defines ${dupes.join(', ')} more than once`);
});

test('no two route keys differ only in case within a group', () => {
  /*
   * The shape that broke the JSON parser: `amandaOpenapi` and `amandaOpenApi` in the same group. Case-sensitive JSON
   * allows it and nothing else complains, which is exactly why it needs its own check.
   */
  const byGroup = new Map<string, string[]>();
  for (const { group, key } of routeKeys()) {
    byGroup.set(group, [...(byGroup.get(group) ?? []), key]);
  }
  const clashes: string[] = [];
  for (const [group, keys] of byGroup) {
    const lowered = new Map<string, string>();
    for (const key of keys) {
      const lower = key.toLowerCase();
      const prior = lowered.get(lower);
      if (prior && prior !== key) clashes.push(`${group}: ${prior} / ${key}`);
      lowered.set(lower, key);
    }
  }
  assert.deepEqual(clashes, [], `keys differing only in case: ${clashes.join(', ')}`);
});

test('the map serialises to JSON a strict parser accepts', () => {
  /*
   * The end-to-end property. A strict parser rejects duplicate keys regardless of case, so this is the check that would
   * have caught the original defect in one line. It cannot detect case-variant duplicates on its own — JSON.parse allows
   * those — so the case test above stays.
   */
  const json = JSON.stringify(AGENT_SITE_MAP);
  assert.doesNotThrow(() => JSON.parse(json), 'the map does not round-trip through JSON');
  // A duplicate would also make the serialised key count differ from the object's.
  const parsed = JSON.parse(json) as Record<string, unknown>;
  assert.equal(Object.keys(parsed).length, KEYS.length, 'the serialised map has a different number of keys');
});
