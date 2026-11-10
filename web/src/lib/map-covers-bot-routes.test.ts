import assert from 'node:assert/strict';
import test from 'node:test';
import { AGENT_SITE_MAP } from '../../functions/_lib/agent/site-map.ts';
import { botRoutePaths } from '../../functions/_lib/muse/routes.ts';

/*
 * A bot holding a bearer can call every route in the OpenAPI registry. Three of those were not described anywhere in the
 * site map — `/api/expenses/archive`, `/api/book/decline`, and the stay-message route — so an agent could call them and had
 * nothing telling it what they do.
 *
 * One of the three is the only recovery path for a deleted expense, and another sends mail to a guest. A route an agent can
 * reach but cannot read about is how it does the wrong thing confidently.
 *
 * Found by comparing the two registries, which nothing had done before.
 */

const APIs = AGENT_SITE_MAP.apis as Record<string, string>;
const MAP_TEXT = Object.values(APIs).join('\n');

/** The path of a bot route, without the braces a spec uses for a parameter. */
function readable(path: string): string {
  return path.replace(/\{[^}]+\}/g, ':token');
}

test('every bot-callable route is described in the site map', () => {
  const paths = botRoutePaths();
  assert.ok(paths.length > 10, `only ${paths.length} bot paths — the registry is not being read`);

  const missing = paths.filter((path) => {
    const readablePath = readable(path);
    // A route counts as described when the map names it either with a brace or with the colon form this repo uses.
    return !MAP_TEXT.includes(path) && !MAP_TEXT.includes(readablePath);
  });

  assert.deepEqual(
    missing,
    [],
    `a bot can call these but the map does not describe them:\n  ${missing.join('\n  ')}`,
  );
});

test('the three routes that were missing are named', () => {
  // Named explicitly as well, so removing one from the map fails here by name rather than only by the generic check.
  assert.match(MAP_TEXT, /\/api\/expenses\/archive/, 'the expense archive is undocumented');
  assert.match(MAP_TEXT, /\/api\/book\/decline/, 'declining a request is undocumented');
  assert.match(MAP_TEXT, /stay-message/, 'sending a stay message is undocumented');
});

test('the archive entry says it is the recovery path and not a total', () => {
  assert.match(APIs.expenseArchive ?? '', /recovery path|way back/, 'the archive does not say what it is for');
  assert.match(APIs.expenseArchive ?? '', /no report, statement, or P&L/, 'the archive does not say those rows are excluded');
});

test('the stay-message entry says nothing is scheduled', () => {
  // The distinction matters: a host reading "sends a message" could assume a schedule exists.
  assert.match(APIs.stayMessage ?? '', /Nothing is scheduled/, 'the stay-message entry does not rule out a schedule');
});
