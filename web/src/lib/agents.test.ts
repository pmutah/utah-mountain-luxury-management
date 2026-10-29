import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENT_ROSTER } from './agents.ts';

test('the roster names the five agents and keeps Nora off the books', () => {
  assert.deepEqual(
    AGENT_ROSTER.map((agent) => agent.id),
    ['co-host', 'build', 'nora', 'muse', 'amanda'],
  );
  const nora = AGENT_ROSTER.find((agent) => agent.id === 'nora');
  assert.equal(nora?.opens, null);
  assert.match(nora?.summary ?? '', /does not see expenses/);
  assert.equal(AGENT_ROSTER.find((agent) => agent.id === 'co-host')?.opens, 'uml:open-cohost');
});
