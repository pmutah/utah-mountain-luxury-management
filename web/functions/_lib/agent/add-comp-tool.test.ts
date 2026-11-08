import assert from 'node:assert/strict';
import test from 'node:test';
import { executeAgentTool } from './execute-tool.ts';
import type { AgentEnv } from './types';

/*
 * The co-host adds comps through `manage_pricing action=add_comp`, not through the screen. That path
 * was worse than the screen's: it passed only a URL and a label, so every comp the agent created had
 * no house, no sleep count and no distance. A comp in that shape can never enter a rate band — the
 * band needs the size and the distance to decide whether the listing even competes — so the agent
 * could report "added a comp" and change nothing about any price.
 */

type Store = Map<string, string>;

function fakeKv(store: Store) {
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

function envWith(store: Store): AgentEnv {
  return { SETTINGS: fakeKv(store) as unknown as KVNamespace } as AgentEnv;
}

function comps(store: Store): Array<Record<string, unknown>> {
  const raw = store.get('compSet');
  return raw ? (JSON.parse(raw) as Array<Record<string, unknown>>) : [];
}

test('the agent cannot add a comp without naming its house', async () => {
  const store: Store = new Map();
  const { result } = await executeAgentTool(envWith(store), 'manage_pricing', {
    action: 'add_comp',
    url: 'https://airbnb.com/rooms/1',
    label: 'Canyon lodge',
    sleeps: 18,
    distanceMi: 2.4,
  });

  assert.equal(result.ok, false, 'a house-less comp must be refused, not saved');
  assert.match(String(result.error), /house/i, 'the agent has to be told what is missing');
  assert.deepEqual(comps(store), [], 'a refused comp wrote a row');
});

test('the agent cannot add a comp that never says how big it is or how far away', async () => {
  const store: Store = new Map();

  const noSleeps = await executeAgentTool(envWith(store), 'manage_pricing', {
    action: 'add_comp',
    propertyId: 'river',
    url: 'https://airbnb.com/rooms/1',
    label: 'Canyon lodge',
    distanceMi: 2.4,
  });
  assert.equal(noSleeps.result.ok, false);
  assert.match(String(noSleeps.result.error), /sleeps/i);

  const noDistance = await executeAgentTool(envWith(store), 'manage_pricing', {
    action: 'add_comp',
    propertyId: 'river',
    url: 'https://airbnb.com/rooms/1',
    label: 'Canyon lodge',
    sleeps: 18,
  });
  assert.equal(noDistance.result.ok, false);
  assert.match(String(noDistance.result.error), /miles/i);

  assert.deepEqual(comps(store), [], 'a refused comp wrote a row');
});

test('the agent saves a comp that carries every fact the band needs', async () => {
  const store: Store = new Map();
  const { result } = await executeAgentTool(envWith(store), 'manage_pricing', {
    action: 'add_comp',
    propertyId: 'river',
    platform: 'vrbo',
    url: 'https://vrbo.com/1',
    label: 'Canyon lodge',
    sleeps: 18,
    distanceMi: 2.4,
    area: 'Sundance',
  });

  assert.equal(result.ok, true);
  const saved = comps(store);
  assert.equal(saved.length, 1, 'the comp was not written');
  assert.equal(saved[0]!.propertyId, 'river');
  assert.equal(saved[0]!.sleeps, 18);
  assert.equal(saved[0]!.distanceMi, 2.4);
  assert.equal(saved[0]!.platform, 'vrbo', 'the channel decides which fee converts the ask to host net');
});

test('the agent can name both houses for a comp that competes with the Ranch and the River', async () => {
  const store: Store = new Map();
  const { result } = await executeAgentTool(envWith(store), 'manage_pricing', {
    action: 'add_comp',
    propertyId: 'both',
    url: 'https://airbnb.com/rooms/2',
    label: 'Group estate',
    sleeps: 20,
    distanceMi: 3,
  });
  assert.equal(result.ok, true);
  assert.equal(comps(store)[0]!.propertyId, 'both');
});
