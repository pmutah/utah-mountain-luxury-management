import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  formatRoomPlanShare,
  loadRoomAssignments,
  saveRoomAssignments,
  stayAssignableRooms,
} from './stay-room-plan.ts';

test('assignable rooms cover every sleeping space and exclude summary rows', () => {
  const ranch = stayAssignableRooms('ranch');
  assert.equal(ranch.length, 8);
  assert.equal(ranch.some((room) => room.name === 'Baths'), false);

  const lindon = stayAssignableRooms('lindon');
  assert.equal(lindon.length, 5);
  assert.equal(lindon.some((room) => room.name === 'Baths'), false);

  const riverWhole = stayAssignableRooms('river');
  assert.deepEqual(
    riverWhole.map((room) => room.name),
    ['Garage Suite', 'Recreation Wing', 'Main Lodge'],
  );
});

test('a River part-house stay only offers the wings that guest actually booked', () => {
  const garageOnly = stayAssignableRooms('river', ['garage-suite']);
  assert.deepEqual(garageOnly.map((room) => room.name), ['Garage Suite']);

  const twoWings = stayAssignableRooms('river', ['garage-suite', 'main-lodge']);
  assert.deepEqual(twoWings.map((room) => room.name), ['Garage Suite', 'Main Lodge']);

  // All three wings together equals the whole house.
  const allThree = stayAssignableRooms('river', ['garage-suite', 'recreation-wing', 'main-lodge']);
  assert.equal(allThree.length, 3);
});

test('room assignments persist per stay token, strip accidental secrets, and format cleanly for group chat', () => {
  const mem = new Map<string, string>();
  const storage = {
    getItem: (key: string) => mem.get(key) ?? null,
    setItem: (key: string, val: string) => {
      mem.set(key, val);
    },
  };

  saveRoomAssignments(
    'tok-123',
    {
      'Master bedroom': 'Grandparents',
      Casita: 'Mark & Sarah',
      'Basement bedroom 1': 'door code 4821',
    },
    storage,
  );

  const loaded = loadRoomAssignments('tok-123', storage);
  assert.deepEqual(loaded, {
    'Master bedroom': 'Grandparents',
    Casita: 'Mark & Sarah',
  });
  assert.deepEqual(loadRoomAssignments('other-tok', storage), {});

  const share = formatRoomPlanShare({
    houseName: 'The Ranch House',
    checkIn: '2026-12-18',
    checkOut: '2026-12-22',
    rooms: stayAssignableRooms('ranch').slice(0, 2),
    assignments: loaded,
  });
  assert.match(share, /The Ranch House \(2026-12-18 to 2026-12-22\) — Bedroom plan/);
  assert.match(share, /Master bedroom \(Main level · 1 king\): Grandparents/);
  assert.match(share, /Upstairs guest room 1 \(Upper level · 1 king\): Unassigned/);
  assert.match(share, /does not change the reservation/);
  assert.equal(/door\s*code|wi-?fi|password/i.test(share), false);
});

test('StayApp wires the bedroom planner, gallery, and floor layout while guarding part-house stays', () => {
  const stayApp = readFileSync(join(process.cwd(), 'src', 'components', 'StayApp.tsx'), 'utf8');
  assert.match(stayApp, /data-bot="stay-room-planner"/);
  assert.match(stayApp, /stayAssignableRooms\(houseId, data\.units\)/);
  assert.match(stayApp, /partStay\.wholeHouse \?[\s\S]{0,200}<HouseGallery house=\{houseId\} dense \/>/);
  assert.match(stayApp, /partStay\.wholeHouse \?[\s\S]{0,160}<HouseFloorLayout house=\{houseId\} \/>/);
});
