/**
 * Every field a page is sent is either drawn or deliberately withheld — and that is written down.
 *
 * Four defects in four turns, all one shape: the API was right and the surface disagreed.
 *
 *   - the cleaner's door code: sent, never drawn;
 *   - the cleaner's step rows: drawn, but recomputed locally and wrong;
 *   - the guest's per-part door codes: drawn, but only the first;
 *   - the owner's cleaning figure: sent, never drawn.
 *
 * A fifth was found while writing this: the cleaner was never told whether a turn was same-day.
 *
 * This reads the **type** each page is sent, not one route's literal, so it covers every field wherever it is added. A field
 * that is neither `drawn` nor recorded as `withheld` fails here by name, before it can reach a person.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * Everything in `typeName`'s body is a field. Comments and blank lines are ignored, and nested object types are flattened to
 * their own top-level keys only — a house row's `cleaning` is listed separately because that is where the defect was.
 */
function fieldsOf(file: string, typeName: string, opener: 'type' | 'interface' = 'type'): string[] {
  const src = readFileSync(file, 'utf8');
  /*
   * A type can be declared as `type X = {` or `interface X {` — `StayGuide` is an interface, and my first parser only looked for
   * `type`, so it found nothing and the guard failed for the wrong reason rather than reporting a real mismatch.
   */
  const start = src.search(new RegExp(`(?:export )?(?:type|interface) ${typeName}\\b`));
  assert.ok(start >= 0, `${typeName} not found in ${file}`);
  const open = src.indexOf('{', start);
  assert.ok(open > start, `${typeName} has no object body`);
  let depth = 0;
  let end = open;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = src.slice(open + 1, end).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  // Top-level keys: two spaces of indent inside the body.
  return [...body.matchAll(/^\s{2}([a-zA-Z]+)\??:/gm)].map((m) => m[1]!);
}

type Fields = Record<string, 'drawn' | { withheld: string }>;

const REGISTER: Array<{ page: string; typeFile: string; typeName: string; fields: Fields }> = [
  {
    page: 'src/components/CleanLink.tsx',
    typeFile: 'src/lib/clean-link.ts',
    typeName: 'CleanJobView',
    fields: {
      house: 'drawn',
      houseName: 'drawn',
      checkout: 'drawn',
      gapNights: 'drawn',
      sameDay: 'drawn',
      steps: {
        withheld: 'superseded by stepRows — the ids are needed to tick, and drawing both would double the list',
      },
      stepRows: 'drawn',
      arrive: 'drawn',
      door: 'drawn',
      rules: 'drawn',
    },
  },
  {
    page: 'src/components/StayApp.tsx',
    typeFile: 'src/lib/api.ts',
    typeName: 'StayGuide',
    fields: {
      // The stay identity, drawn across the page.
      enabled: 'drawn',
      guestName: 'drawn',
      propertyId: 'drawn',
      propertyName: 'drawn',
      units: 'drawn',
      guide: 'drawn',
      access: 'drawn',
      /*
       * The rest of the stay facts, which this parser surfaced when it stopped reading only `type` bodies and started finding
       * `interface` ones too. All drawn — listed so a future field cannot be added without a decision.
       */
      checkIn: 'drawn',
      checkOut: 'drawn',
      partyGuests: 'drawn',
      partyChildren: 'drawn',
      preferencesDone: 'drawn',
      hasSurvey: 'drawn',
      storageReads: 'drawn',
      nightBeforeFree: 'drawn',
      checkoutNightFree: 'drawn',
    },
  },
  {
    page: 'src/components/OwnerPortal.tsx',
    typeFile: 'src/lib/owner-portal.ts',
    typeName: 'OwnerPortalView',
    fields: {
      rangeLabel: 'drawn',
      todd: 'drawn',
      fee: 'drawn',
      feeBasis: 'drawn',
      houses: 'drawn',
      months: 'drawn',
      notes: 'drawn',
    },
  },
];

test('every field on a page type is drawn or withheld on purpose', () => {
  const failures: string[] = [];
  for (const entry of REGISTER) {
    const page = readFileSync(entry.page, 'utf8');
    const fields = fieldsOf(entry.typeFile, entry.typeName);
    assert.ok(fields.length > 3, `${entry.typeName} produced ${fields.length} fields — the parser is wrong`);

    for (const field of fields) {
      const disposition = entry.fields[field];
      if (disposition === undefined) {
        failures.push(`${entry.page}: ${field} is on ${entry.typeName} but the register has not classified it`);
        continue;
      }
      if (disposition === 'drawn' && !new RegExp(`\\.${field}\\b`).test(page)) {
        failures.push(`${entry.page}: ${field} is classified drawn but the page never reads it`);
      }
    }
    // And the register cannot name fields the type does not have, which would be a stale entry.
    for (const field of Object.keys(entry.fields)) {
      if (!fields.includes(field)) failures.push(`${entry.page}: the register lists ${field}, which ${entry.typeName} does not have`);
    }
  }
  assert.deepEqual(failures, [], `field register mismatches:\n  ${failures.join('\n  ')}`);
});

test('the withheld fields are the ones that must not be shown', () => {
  /*
   * The one withheld field on a job view. `steps` carries labels without ids, so a client ticking by label is refused by the
   * route — that is why `stepRows` exists, and why drawing both would double the list.
   */
  const jobSteps = REGISTER[0]!.fields.steps;
  assert.ok(jobSteps && jobSteps !== 'drawn', 'steps is no longer recorded as withheld');
  assert.match(jobSteps.withheld, /stepRows/, 'the reason does not point at what supersedes it');
});

test('a field marked withheld names why', () => {
  for (const entry of REGISTER) {
    for (const [field, disposition] of Object.entries(entry.fields)) {
      if (disposition === 'drawn') continue;
      assert.ok(
        disposition.withheld.trim().length > 10,
        `${entry.page}: ${field} is withheld with no real reason recorded`,
      );
    }
  }
});

test('the guest access block classifies every code field', () => {
  /*
   * The per-part work added `doorCodes` and `doorMissing` to this block, and the page drew only `doorCode`. Checked through the
   * block's own type rather than the page, so a new field there has to be decided too.
   */
  const access = fieldsOf('src/lib/api.ts', 'StayGuide');
  assert.ok(access.includes('access'), 'the stay guide type has no access block');

  const src = readFileSync('src/lib/api.ts', 'utf8');
  for (const field of ['doorCode', 'doorCodes', 'doorMissing', 'wifiName', 'wifiPassword', 'doorNotes']) {
    assert.ok(src.includes(`${field}`), `the access block has lost ${field}`);
  }
  const page = readFileSync('src/components/StayApp.tsx', 'utf8');
  for (const field of ['doorCode', 'doorCodes', 'doorMissing']) {
    assert.match(page, new RegExp(`access\\.${field}\\b`), `the guest page does not draw access.${field}`);
  }
});
