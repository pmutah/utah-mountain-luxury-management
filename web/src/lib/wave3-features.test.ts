import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeRoomAssignments,
  encodeRoomAssignments,
  formatRoomPlanText,
  roomsForPlanner,
  sampleFamilyAssignments,
} from './room-planner.ts';
import { RIVER_UNIT_DETAIL } from './river-units.ts';
import { executeAgentTool } from '../../functions/_lib/agent/execute-tool.ts';
import type { AgentEnv } from '../../functions/_lib/agent/types.ts';

function fakeAgentEnv(store: Map<string, string>): AgentEnv {
  return {
    SETTINGS: {
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async put(key: string, value: string) {
        store.set(key, value);
      },
    } as unknown as KVNamespace,
  } as AgentEnv;
}

test('roomsForPlanner derives exact sleepable bedroom counts from houseProfile and RIVER_UNIT_DETAIL and filters River wings', () => {
  const ranchRooms = roomsForPlanner('ranch');
  assert.equal(ranchRooms.length, 8, 'Ranch has 8 sleeping rooms (including casita)');
  assert.equal(ranchRooms.some((r) => r.name === 'Baths'), false);

  const lindonRooms = roomsForPlanner('lindon');
  assert.equal(lindonRooms.length, 5, 'Lindon has 4 bedrooms/suites + living room futon');

  const expectedRiverWhole = RIVER_UNIT_DETAIL.reduce((sum, u) => sum + u.bedrooms, 0);
  const riverWhole = roomsForPlanner('river');
  assert.equal(riverWhole.length, expectedRiverWhole);

  const garageDetail = RIVER_UNIT_DETAIL.find((u) => u.id === 'garage-suite')!;
  const recDetail = RIVER_UNIT_DETAIL.find((u) => u.id === 'recreation-wing')!;
  const riverPartial = roomsForPlanner('river', ['garage-suite', 'recreation-wing']);
  assert.equal(riverPartial.length, garageDetail.bedrooms + recDetail.bedrooms);
  assert.equal(riverPartial.some((r) => r.unitId === 'main-lodge'), false);
});

test('room planner encodes/decodes URL share strings safely and strips prices and delimiter characters', () => {
  const rooms = roomsForPlanner('lindon');
  const filled = sampleFamilyAssignments(rooms);
  filled[rooms[0]!.id] = 'Grandparents | $500 ; Suite';

  const encoded = encodeRoomAssignments(rooms, filled);
  assert.equal(encoded.includes('$'), false, 'dollar signs must be stripped');

  const decoded = decodeRoomAssignments(encoded, rooms);
  assert.equal(decoded[rooms[0]!.id], 'Grandparents   500   Suite');
  assert.equal(Object.keys(decoded).length, rooms.length);

  const text = formatRoomPlanText({
    houseName: 'The Lindon House',
    checkIn: '2026-12-18',
    checkOut: '2026-12-22',
    rooms,
    assignments: decoded,
    shareUrl: 'https://wilhite-portfolio.pages.dev/houses/lindon/?rooms=test',
  });
  assert.match(text, /The Lindon House \(2026-12-18 → 2026-12-22\)/);
  assert.equal(text.includes('$'), false);
  assert.match(text, /does not hold dates or change a reservation/);
});

test('Co-host & Muse manage_finances get_tax_packet, simulate_cost_seg, and reconcile_statement run read-only and honor 2025 lock', async () => {
  const store = new Map<string, string>();
  store.set(
    'customExpenses',
    JSON.stringify([
      { id: 'exp-b1', propertyId: 'construction', month: '2026-09', category: 'Framing', amount: 420000, paidBy: 'brandon' },
      { id: 'exp-b2', propertyId: 'construction', month: '2026-10', category: 'Finishes', amount: 380000, paidBy: 'todd' },
      { id: 'exp-r1', propertyId: 'ranch', month: '2026-11', category: 'Repairs', vendor: 'Wasatch Plumbing', amount: 850 },
    ]),
  );
  const env = fakeAgentEnv(store);
  const snapshotBefore = store.get('customExpenses');

  // 1. 2025 tax packet is locked
  const lockRes = await executeAgentTool(env, 'manage_finances', { action: 'get_tax_packet', year: 2025 });
  assert.equal(lockRes.result.locked2025, true);
  assert.equal(lockRes.result.touchedBooks, false);

  // 2. 2026 tax packet returns Schedule E lines, §469 rules, and $600+ 1099 vendor candidate
  const tax2026 = await executeAgentTool(env, 'manage_finances', { action: 'get_tax_packet', year: 2026 });
  assert.equal(tax2026.result.locked2025, false);
  assert.equal(tax2026.result.touchedBooks, false);
  const vendors = tax2026.result.vendors1099 as Array<{ vendor: string; status: string }>;
  assert.ok(vendors.some((v) => v.vendor === 'Wasatch Plumbing' && v.status === 'requires-1099-review'));

  // 3. Cost-segregation auto-reads logged River construction spend when grossBasisUsd is omitted
  const costSeg = await executeAgentTool(env, 'manage_finances', {
    action: 'simulate_cost_seg',
    bonusRate: 1,
    costSegProfile: 'luxury-lodge',
  });
  assert.equal(costSeg.result.basisSource, 'logged-river-build');
  assert.equal(costSeg.result.touchedBooks, false);
  const sim = costSeg.result.simulation as { grossBasisUsd: number; acceleratedYear1TotalUsd: number; straightLine39Year1Usd: number };
  assert.ok(sim.grossBasisUsd >= 800000);
  assert.ok(sim.acceleratedYear1TotalUsd > sim.straightLine39Year1Usd);

  // 4. Statement reconciliation matches Wasatch Plumbing ($850) and flags unlogged Dominion Energy ($195.40)
  const recon = await executeAgentTool(env, 'manage_finances', {
    action: 'reconcile_statement',
    statementText: '2026-11-05, Wasatch Plumbing, 850.00\n2026-11-12, Dominion Energy Gas, 195.40',
  });
  assert.equal(recon.result.matchedCount, 1);
  assert.equal(recon.result.missingCount, 1);
  assert.equal(recon.result.touchedBooks, false);

  // Verify KV was never mutated
  assert.equal(store.get('customExpenses'), snapshotBefore);
});
