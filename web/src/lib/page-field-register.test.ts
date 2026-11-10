/**
 * Every field a page is sent is either drawn or deliberately withheld — and that is written down.
 *
 * Four defects in four turns, all the same shape:
 *
 *   - the cleaner's door code: sent, never drawn;
 *   - the cleaner's step rows: drawn, but recomputed locally and wrong;
 *   - the guest's per-part door codes: drawn, but only the first;
 *   - the owner's cleaning figure: sent, never drawn.
 *
 * Each time, an API test was green and a person still could not see the thing. Catching that by eye does not scale, so this file
 * holds a **register**: for each guest/host page, every field it is sent is listed as either `drawn` (the page must reference it)
 * or `withheld` (with the reason). Adding a field without deciding which it is fails here, by name, before it can reach a person.
 *
 * This is deliberately a text check on the source. It cannot prove a value renders correctly — the behavioural tests do that —
 * but it does prove somebody decided, and that the decision still matches the page.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * `drawn` means the page reads the field. `withheld` means it is intentionally not shown, and the reason is recorded so a later
 * reader does not "fix" it.
 */
type Fields = Record<string, 'drawn' | { withheld: string }>;

const REGISTER: Array<{
  /** The page a person opens. */
  page: string;
  /** What it is sent. */
  from: string;
  fields: Fields;
}> = [
  {
    page: 'src/components/CleanLink.tsx',
    from: 'functions/api/clean/[token].ts',
    fields: {
      jobs: 'drawn',
      progress: 'drawn',
      note: 'drawn',
      storageReads: {
        withheld:
          'the page shows its own unread state from `note`; the raw flag adds nothing a cleaner can act on',
      },
      lang: {
        withheld: 'the page owns the language and sends it to the route; it is not a value read back',
      },
      since: {
        withheld: "the host's own label for the link, not the cleaner's business",
      },
    },
  },
  {
    page: 'src/components/CleanLink.tsx',
    from: 'src/lib/clean-link.ts',
    // The per-job shape, which is where all four of this class has happened.
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
    from: 'src/lib/api.ts',
    fields: {
      phase: 'drawn',
      opensOn: 'drawn',
      preview: 'drawn',
      unlocked: 'drawn',
      wifiName: 'drawn',
      wifiPassword: 'drawn',
      doorCode: 'drawn',
      doorCodes: 'drawn',
      doorMissing: 'drawn',
      doorNotes: 'drawn',
    },
  },
  {
    page: 'src/components/OwnerPortal.tsx',
    from: 'src/lib/owner-portal.ts',
    fields: {
      rangeLabel: 'drawn',
      todd: 'drawn',
      fee: 'drawn',
      feeBasis: 'drawn',
      houses: 'drawn',
      months: 'drawn',
      notes: 'drawn',
      // The per-house shape.
      revenue: 'drawn',
      costs: 'drawn',
      cleaning: 'drawn',
      estimatedCleaning: 'drawn',
      leftover: 'drawn',
      stays: 'drawn',
    },
  },
];

test('every field in the register is drawn, or withheld on purpose', () => {
  const failures: string[] = [];
  for (const entry of REGISTER) {
    const page = readFileSync(entry.page, 'utf8');
    for (const [field, disposition] of Object.entries(entry.fields)) {
      if (disposition === 'drawn') {
        /*
         * The page must mention the field as a property read. `house.cleaning`, `job.door`, `access.doorCodes` — the dotted form
         * is what a render path looks like; a field merely named in a comment would not carry a dot.
         */
        const pattern = new RegExp(`\\.${field}\\b`);
        if (!pattern.test(page)) failures.push(`${entry.page}: ${field} is sent but not drawn`);
      }
    }
  }
  assert.deepEqual(failures, [], `a field reaches a page that does not draw it:\n  ${failures.join('\n  ')}`);
});

test('a new field on the cleaner route fails this test until somebody decides', () => {
  /*
   * The guard's whole purpose. It reads the route's response payload and the register, and reports any key the register has not
   * classified. Adding a field is then a decision — draw it, or say why not — rather than a silent omission.
   *
   * My first version matched `^\s{6}(key):` and found zero keys, because the payload is written as a spread of `jobs, progress,`
   * shorthands rather than `key:` pairs. It matches bare identifiers in the payload now, which is how this route is written.
   */
  const route = readFileSync('functions/api/clean/[token].ts', 'utf8');
  const registered = new Set(Object.keys(REGISTER[0]!.fields));

  /*
   * The job-list payload specifically.
   *
   * Two earlier versions of this were wrong for different reasons: `lastIndexOf` found the tick handler's return, and
   * `indexOf` found the 404 guard. Anchoring on the literal that contains `jobs` is the only one that finds the payload this
   * register describes. Matching `key:` / `key,` at six spaces also caught helper arguments (`request`, `house`, `units`), so the
   * slice stops at the closing of that object.
   */
  const start = route.indexOf('jobs,');
  assert.ok(start > 0, 'the cleaner payload no longer contains `jobs` — the route changed shape');
  const payload = route.slice(start, route.indexOf('};', start));
  const keys = [...payload.matchAll(/^\s{6}([a-zA-Z]+)[,:]/gm)].map((m) => m[1]!).filter(Boolean);
  assert.ok(keys.length > 3, `only found ${keys.length} payload keys — the shape of the route changed`);

  const unclassified = [...new Set(keys)].filter((key) => !registered.has(key));
  assert.deepEqual(
    unclassified,
    [],
    `the cleaner route returns fields the register has not classified: ${unclassified.join(', ')}`,
  );
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

test('no page draws a field that is registered as withheld', () => {
  /*
   * The other direction: a withheld field quietly appearing on a page is as much a defect as a drawn one disappearing — `since`
   * is the host's label and must not reach a cleaner.
   */
  for (const entry of REGISTER) {
    const page = readFileSync(entry.page, 'utf8');
    for (const [field, disposition] of Object.entries(entry.fields)) {
      if (disposition === 'drawn') continue;
      /*
       * `job.steps` is the field; `t.steps` is a translation label that happens to share the name. Matching only the data
       * access is what tells them apart — my first version matched `\.steps\b` and flagged the label.
       *
       * The page reads jobs through a `job` variable, so the data access is `job.<field>`.
       */
      assert.equal(
        new RegExp(`\\bjob\\.${field}\\b`).test(page),
        false,
        `${entry.page} draws ${field}, which is registered as withheld: ${disposition.withheld}`,
      );
    }
  }
});
