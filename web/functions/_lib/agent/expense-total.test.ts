import assert from 'node:assert/strict';
import test from 'node:test';
import { executeAgentTool } from './execute-tool.ts';
import type { AgentEnv } from './types';

/*
 * On 2026-11-08 the co-host was asked "what are the Ranch House expenses for November 2026". It
 * answered **$350**, naming only the cleaning row. The books hold **$3,483.36** for that month: a
 * $350 turnover clean and a $3,133.36 mortgage.
 *
 * The tool was the fault, not the model. `list_expenses` dropped every `Mortgage` row and returned a
 * `count` that described the filtered list as though it were the whole month. The model summed the one
 * row it was given and had nothing to indicate anything had been withheld — the worst kind of wrong
 * answer, because it was arithmetically correct over the data it could see.
 *
 * A tool that withholds rows from a total is not a filter, it is a wrong answer waiting to happen.
 */

type Store = Map<string, string>;

function envWith(store: Store): AgentEnv {
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

/** A month shaped like the real one: the mortgage is by far the biggest line. */
/**
 * The fixture lives in a month the seed ledger does not use.
 *
 * The first version used 2026-11, which the real seed expenses already cover, so the fixture rows were
 * added on top of the seed ones and the expected $3,483.36 came back as $6,616.72 — a fixture that
 * cannot be the whole population cannot assert a total.
 */
const PROBE_MONTH = '2031-06';

const NOVEMBER_RANCH = [
  { id: 'e-mort', propertyId: 'ranch', month: PROBE_MONTH, category: 'Mortgage', amount: 3133.36, note: 'Mortgage' },
  { id: 'e-clean', propertyId: 'ranch', month: PROBE_MONTH, category: 'Cleaning', amount: 350, note: 'Turnover cleaning' },
];

async function listExpenses(store: Store) {
  const { result } = await executeAgentTool(envWith(store), 'manage_finances', {
    action: 'list_expenses',
    propertyId: 'ranch',
    month: PROBE_MONTH,
  });
  return result as {
    expenses: Array<{ id: string; category: string; amount: number }>;
    count: number;
    total: number;
    mortgageIncluded: boolean;
  };
}

test('a month total includes the mortgage, because it is money that left the account', async () => {
  const store: Store = new Map();
  store.set('customExpenses', JSON.stringify(NOVEMBER_RANCH));
  const result = await listExpenses(store);

  const ids = result.expenses.filter((e) => e.id.startsWith('e-')).map((e) => e.id);
  assert.ok(ids.includes('e-mort'), 'the mortgage row was withheld from the expense list');
  assert.equal(
    result.total,
    3483.36,
    `the month total came back as ${result.total}; the books hold $3,483.36`,
  );
  assert.equal(result.count, ids.length, 'count does not match the rows returned');
  assert.equal(result.mortgageIncluded, true, 'the response does not say the mortgage is in the rows');
});

test('the total is computed by the tool, so it cannot depend on the model adding rows up', async () => {
  const store: Store = new Map();
  store.set('customExpenses', JSON.stringify(NOVEMBER_RANCH));
  const result = await listExpenses(store);

  const summed = result.expenses
    .filter((e) => e.id.startsWith('e-'))
    .reduce((sum, e) => sum + e.amount, 0);
  assert.equal(
    result.total,
    Math.round(summed * 100) / 100,
    'the reported total does not equal the rows returned',
  );
});

test('a month with no mortgage says so rather than leaving it ambiguous', async () => {
  const store: Store = new Map();
  store.set(
    'customExpenses',
    JSON.stringify([
      { id: 'e-clean', propertyId: 'ranch', month: PROBE_MONTH, category: 'Cleaning', amount: 350, note: 'Turn' },
    ]),
  );
  const result = await listExpenses(store);
  assert.equal(result.total, 350);
  assert.equal(result.mortgageIncluded, false);
});

test('another house and month do not leak into the total', async () => {
  const store: Store = new Map();
  store.set(
    'customExpenses',
    JSON.stringify([
      ...NOVEMBER_RANCH,
      { id: 'e-lindon', propertyId: 'lindon', month: PROBE_MONTH, category: 'Cleaning', amount: 160, note: 'Other house' },
      { id: 'e-oct', propertyId: 'ranch', month: '2031-05', category: 'Cleaning', amount: 900, note: 'Other month' },
    ]),
  );
  const result = await listExpenses(store);
  assert.equal(result.total, 3483.36, 'a total from another house or month leaked in');
});
