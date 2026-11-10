/**
 * No guest's contact details in the source.
 *
 * The repository is **public**. `functions/_lib/data.ts` carried 78 real bookings with exact dates and
 * payouts, and 44 guest phone numbers plus 4 email addresses, all readable on GitHub.
 *
 * The contact fields were read by nothing: `applyHostNetFromSeed` needs payout, source, propertyId,
 * checkIn, checkOut, and guestName, which all stay. So they were pure exposure — the kind of field a
 * spreadsheet export adds and nobody removes.
 *
 * Names and dates stay because the seed is what fills the host net and channel onto an iCal-imported stay;
 * removing those would change real bookings, which this repo does not do. Phone numbers and email
 * addresses are the part that never had a job.
 *
 * Guest contacts belong in the store, keyed to the stay, written by a host who has them — never in a file
 * that ships to a browser bundle and a public remote.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();

/** Directories that are not source, plus the tests that deliberately build fake guests. */
const SKIP = new Set(['node_modules', 'dist', 'build', '.wrangler', '.tmp-fn-build', '.git']);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * A phone number that could belong to a person.
 *
 * Test fixtures use obviously fake values (`+18015550000`, `+18017874722` is Brandon's own), and those
 * still pass this because the check only governs the *seed* file below. Elsewhere a real-looking guest
 * number is not distinguishable from a fixture, so the seed is the file this test pins.
 */
const SEED = path.join(ROOT, 'functions', '_lib', 'data.ts');

test('the booking seed carries no guest contact details', () => {
  const src = fs.readFileSync(SEED, 'utf8');
  assert.equal(
    /guestPhone\s*:/.test(src),
    false,
    'the seed carries guest phone numbers, and this repository is public',
  );
  assert.equal(
    /guestEmail\s*:/.test(src),
    false,
    'the seed carries guest email addresses, and this repository is public',
  );
});

test('the seed still carries what the booking logic actually reads', () => {
  /*
   * The guard above must not be satisfied by deleting the seed. `applyHostNetFromSeed` fills a $0 iCal row's
   * payout and channel from it, so a stay imported from Airbnb would lose its host net — changing real
   * bookings, which the rebuild is not allowed to do.
   */
  const src = fs.readFileSync(SEED, 'utf8');
  const rows = (src.match(/propertyId: '(ranch|lindon|river)'/g) ?? []).length;
  assert.ok(rows > 60, `the seed lost its bookings — only ${rows} rows left`);
  for (const field of ['checkIn:', 'checkOut:', 'payout:', 'source:', 'guestName:']) {
    assert.ok(src.includes(field), `the seed no longer carries ${field}, which the booking logic reads`);
  }
});

test('no build artifact re-publishes the seed', () => {
  /*
   * `web/.tmp-fn-build/index.js` was committed with a bundled copy of the same seed, so cleaning the source
   * alone would have left the phone numbers on GitHub a second time. It is generated, nothing references it,
   * and it went stale — untracked and ignored.
   */
  const artifact = path.join(ROOT, '.tmp-fn-build', 'index.js');
  if (fs.existsSync(artifact)) {
    const text = fs.readFileSync(artifact, 'utf8');
    assert.equal(
      /guestPhone\s*:/.test(text),
      false,
      'a committed build artifact still contains guest phone numbers',
    );
  }
  const ignored = fs.readFileSync(path.join(ROOT, '..', '.gitignore'), 'utf8');
  assert.match(ignored, /\.tmp-fn-build/, 'the build artifact directory is not ignored');
});

test('the source tree has no real guest email address in a seed or fixture file', () => {
  /*
   * Only the seed is pinned by name above; this is the wider sweep. It looks for addresses at consumer mail
   * providers inside files that describe stays, because those are the ones that leaked. The owner's own
   * addresses and the vendor's are legitimate and appear in config, which is why this is scoped to the
   * files that carry booking rows.
   */
  const bookingFiles = walk(path.join(ROOT, 'functions')).filter(
    (file) => /data\.ts$|seed|fixture/i.test(path.basename(file)) && !/\.test\./.test(file),
  );
  const offenders: string[] = [];
  for (const file of bookingFiles) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/[A-Za-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook|comcast|icloud|aol)\.[a-z]+/g)) {
      offenders.push(`${path.relative(ROOT, file)}: ${match[0]}`);
    }
  }
  assert.deepEqual(offenders, [], `guest addresses are committed in source:\n${offenders.join('\n')}`);
});
