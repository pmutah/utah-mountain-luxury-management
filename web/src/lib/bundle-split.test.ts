import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

/*
 * The main bundle carried the guest portal's whole house guide — the prose, the restaurants, the trails — because
 * `StayApp` was statically imported in App.tsx. A host opening the dashboard downloaded a guest's guide, and the build
 * warned about the 685 kB it produced.
 *
 * Making the guest-path pages lazy took it to 483 kB, 146 kB gzipped, and the warning went away. Measured live: 144 kB
 * over the wire for the main bundle, and the stay page's own chunk is 10 kB, fetched only when a guest opens it.
 *
 * These guards hold the property, not the byte count. A hard-coded size would fail on every dependency change and get
 * deleted; what must not come back is a heavy guest page in the shell.
 */

const APP = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');

/** The components that carry the guide, the e-signature flow, and the house pages. */
const LAZY = ['StayApp', 'GuestPreferenceForm', 'EsignCeremony', 'PropertyDetail'];

test('the guest-path pages are lazy, not static', () => {
  for (const name of LAZY) {
    assert.match(
      APP,
      new RegExp(`const ${name} = lazy\\(`),
      `${name} is statically imported again, so its weight lands in the shell`,
    );
  }
});

test('no guest-path page is imported statically as well as lazily', () => {
  /*
   * A leftover static import defeats the lazy one silently — that is exactly what happened on the first attempt at this
   * change, and the typechecker caught the duplicate rather than the bundle size.
   */
  for (const name of LAZY) {
    assert.equal(
      new RegExp(`^import \\{ ${name} \\}`, 'm').test(APP),
      false,
      `${name} is imported both statically and lazily`,
    );
  }
});

test('every lazy route sits inside a Suspense boundary', () => {
  /*
   * A lazy component with no boundary throws and leaves a blank page. The `/stay/` and `/esign/` branches return before
   * the dashboard's own Suspense, so each needed one of its own.
   */
  const stay = APP.slice(APP.indexOf('const stayMatch'), APP.indexOf('const esignMatch'));
  assert.match(stay, /<Suspense/, 'the stay route has no Suspense boundary');
  const esign = APP.slice(APP.indexOf('const esignMatch'), APP.indexOf('const esignMatch') + 400);
  assert.match(esign, /<Suspense/, 'the esign route has no Suspense boundary');
});

test('the booking and house pages are still lazy, so a guest does not download the dashboard', () => {
  /*
   * `/book/` used to load its own component. It now renders the same listing as `/houses/:house/`, so the thing that
   * must stay lazy is the listing itself — a guest arriving on a quote link should never download the host dashboard.
   */
  assert.match(APP, /const HouseListing = lazy\(/, 'the listing page is statically imported');
  assert.match(APP, /const HouseSite = lazy\(/, 'the house site is statically imported');
  assert.equal(/const DirectBook = lazy\(/.test(APP), false, 'a retired page is still being loaded');
});
