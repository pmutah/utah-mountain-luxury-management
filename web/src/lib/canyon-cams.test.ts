import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  ALL_CAMS,
  camByKey,
  camFrameUrl,
  CAMERA_COUNT,
  CAMERA_GROUPS,
  cameraGroupsFor,
} from './canyon-cams.ts';
import type { HouseId } from './market/types.ts';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

test('every camera key is unique and every id is a real UDOT camera id', () => {
  const keys = ALL_CAMS.map((cam) => cam.key);
  assert.equal(new Set(keys).size, keys.length, 'two cameras share a key, so one is unreachable by the proxy');
  for (const cam of ALL_CAMS) {
    assert.ok(Number.isInteger(cam.id) && cam.id > 1000, `${cam.key} has no numeric UDOT id`);
    assert.ok(cam.name.trim().length > 3, `${cam.key} has no name`);
    assert.ok(cam.note.trim().length > 10, `${cam.key} has no note`);
    assert.equal(camFrameUrl(cam.id), `https://udottraffic.utah.gov/map/Cctv/${cam.id}`);
    // The frame URL is the only thing that reaches the network, so it must be UDOT and nothing else.
    assert.match(camFrameUrl(cam.id), /^https:\/\/udottraffic\.utah\.gov\/map\/Cctv\/\d+$/);
  }
  assert.equal(CAMERA_COUNT, ALL_CAMS.length);
});

test('the Provo Canyon group covers the drive up to the River House in order, ending at Vivian Park', () => {
  const canyon = CAMERA_GROUPS.find((group) => group.id === 'provo-canyon');
  assert.ok(canyon);
  assert.equal(canyon.house, 'river');
  const vivian = canyon.cams.find((cam) => cam.key === 'vivian');
  assert.ok(vivian, 'the River House exit camera is missing');
  assert.equal(vivian!.fromRiver, 'at the house');
  assert.match(canyon.blurb, /US-189/);
  // The house-specific groups come first for a River guest.
  const forRiver = cameraGroupsFor('river');
  assert.equal(forRiver[0]!.id, 'provo-canyon');
  assert.ok(forRiver.some((group) => group.id === 'sundance'));
});

test('a ski-road group carries its resort page as a link, never as a frame, and statewide groups are house-neutral', () => {
  for (const group of CAMERA_GROUPS) {
    assert.ok(group.cams.length > 0, `${group.id} has no cameras`);
    if (group.resortHref) {
      assert.match(group.resortHref.href, /^https:\/\//);
      assert.ok(group.resortHref.label.length > 4);
    }
    if (group.house === null) {
      assert.equal(group.id === 'provo-canyon' || group.id === 'sundance' || group.id === 'lindon', false);
    }
  }
  const cottonwood = CAMERA_GROUPS.find((group) => group.id === 'little-cottonwood');
  assert.ok(cottonwood);
  const names = cottonwood!.cams.map((cam) => cam.name).join(' ');
  for (const resort of ['Alta', 'Solitude', 'Brighton']) assert.match(names, new RegExp(resort));
});

test('every house is shown its own canyon group and the statewide ski groups', () => {
  for (const house of ['river', 'ranch', 'lindon'] as HouseId[]) {
    const groups = cameraGroupsFor(house);
    assert.ok(groups.length >= 3, `${house} has too few camera groups`);
    assert.ok(groups.some((group) => group.id === 'little-cottonwood'), `${house} lost the Cottonwood roads`);
  }
  assert.equal(cameraGroupsFor().length, CAMERA_GROUPS.length);
  // The Lindon house is closest to the Timpanogos Highway camera, not the canyon one.
  assert.ok(cameraGroupsFor('lindon').some((group) => group.id === 'lindon'));
});

test('the proxy only accepts a known key and never takes a URL from the request', () => {
  const route = read('functions', 'api', 'public', 'cam.ts');
  assert.match(route, /camByKey\(key\)/);
  assert.match(route, /camFrameUrl\(cam\.id\)/);
  // No branch may read a full URL out of the query string.
  assert.equal(/searchParams\.get\('(url|src|href|image)'\)/.test(route), false);
  assert.match(route, /status: 404/);
  assert.match(route, /status: 502/);
  assert.match(route, /stale-while-revalidate/);
  assert.match(route, /'Cache-Control': `public, max-age=\$\{CACHE_SECONDS\}/);
  // A stale frame has to say so, or a guest reads an old road as the current one.
  assert.match(route, /X-Camera-Stale/);
  assert.equal(camByKey('nope'), undefined);
  assert.equal(camByKey('vivian')?.id, 178142);
});

test('the proxy refuses UDOT\'s offline placeholder rather than serving it as a live frame', () => {
  const route = read('functions', 'api', 'public', 'cam.ts');
  // An offline camera answers 200 with a branded placeholder; the proxy has to notice and refuse it.
  assert.match(route, /OFFLINE_FRAME_SHA256 = 'b9b4dc336246421065a66accf27768af3269a75e48cbacf0624aa2b0e9f59ef9'/);
  assert.match(route, /await isOfflineFrame\(body\)/);
  assert.match(route, /status: 503/);
  assert.match(route, /lastGood\.delete\(cam\.key\)/);
  // Nothing on the catalog may be the camera UDOT has offline today.
  assert.equal(
    ALL_CAMS.some((cam) => cam.id === 171294),
    false,
    'camera 171294 is UDOT\'s offline placeholder today; it would show "offline" under a Live badge',
  );
});

test('the guest tile never implies a camera proves the road is open, and names the source', () => {
  const component = read('src', 'components', 'CanyonCameras.tsx');
  assert.match(component, /udottraffic\.utah\.gov/);
  assert.match(component, /not whether it is open/);
  // The copy must not promise live road status or a price.
  assert.equal(/\$\d/.test(component), false);
  assert.equal(/road is (open|closed)/i.test(component), false);
  assert.match(component, /about once a minute/);
  // A failed camera says so instead of rendering the previous frame.
  assert.match(component, /not answering right now/);
  assert.match(component, /document\.visibilityState === 'visible'/);
});

test('the cams tab renders real frames and keeps the resort reports as links', () => {
  const map = read('src', 'components', 'CanyonPocketMap.tsx');
  assert.match(map, /<CanyonCameras house=\{house\} \/>/);
  assert.match(map, /CANYON_LIVE_PORTALS\.map/);
  assert.equal(/<iframe/.test(map), false, 'a resort webcam is framed, which their players refuse');
});
