/**
 * Does the downloaded CSV add up, on the real owner statement?
 *
 * The page has a Download button whose file an owner forwards to an accountant. That file has two tables:
 *
 *   Month,Ranch,River,Total      — every month, then a Total row
 *   House,Host payout,Costs,Stays,Todd share — every house, then the management fee
 *
 * Two identities have to hold in the file itself, independent of the page:
 *
 *   1. the month rows sum to the Total row, in each of the three columns
 *   2. the house rows' Todd share sums to the same Total
 *
 * A CSV is checked by adding a column in a spreadsheet, so a header that says Total over figures that do not sum to it is the
 * same defect as the "Half is" sentence — the reader's own arithmetic contradicting the file.
 *
 * Reads production read-only and parses the generated file the way a spreadsheet would.
 */
const BASE = 'https://wilhite-portfolio.pages.dev';

const { buildOwnerStatement } = await import('../src/lib/owner-statement.ts');
const { ownerStatementCsv, ownerStatementFilename } = await import('../src/lib/owner-statement-file.ts');

const links = (await (
  await fetch(`${BASE}/api/owner/links`, {
    headers: { Authorization: `Bearer ${process.env.MUSE_BOT_SECRET ?? ''}`, Accept: 'application/json' },
  })
).json()) as { links: Array<{ token: string; path: string }> };

/** Split one CSV line, honouring quoted cells. */
function parseLine(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ',') {
      out.push(cell);
      cell = '';
      continue;
    }
    cell += ch;
  }
  out.push(cell);
  return out;
}

const num = (value: string | undefined) => {
  const n = Number(String(value ?? '').replace(/[^-\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const cents = (n: number) => Math.round(n * 100) / 100;

let failures = 0;
const fail = (message: string) => {
  failures++;
  console.log(`  FAIL ${message}`);
};

for (const link of links.links.slice(0, 3)) {
  const res = await fetch(`${BASE}/api/owner/${link.token}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    console.log(`${link.path.slice(0, 18)}… http ${res.status} — skipped`);
    continue;
  }
  const body = (await res.json()) as Parameters<typeof buildOwnerStatement> extends never ? never : Record<string, unknown>;
  if (body.empty) {
    console.log(`${link.path.slice(0, 18)}… empty — skipped`);
    continue;
  }

  /*
   * The route returns the statement the page builds, so the CSV can be generated from the same shape. `buildOwnerStatement`
   * needs reservations and expenses; instead of re-deriving them, the returned statement is used directly — it already has the
   * fields the file writer reads.
   */
  const statement = body as unknown as Parameters<typeof ownerStatementCsv>[0];
  const csv = ownerStatementCsv(statement);
  const rows = csv.split('\n').filter((line) => line.length > 0).map(parseLine);

  console.log(`\n${ownerStatementFilename(statement.rangeLabel)}  (${rows.length} rows)`);

  // --- table 1: months ---
  const monthHeader = rows.findIndex((row) => row[0] === 'Month');
  const monthTotalRow = rows.findIndex((row) => row[0] === 'Total');
  if (monthHeader < 0 || monthTotalRow < 0) {
    fail('the month table or its Total row is missing');
  } else {
    let ranch = 0;
    let river = 0;
    let total = 0;
    for (let i = monthHeader + 1; i < monthTotalRow; i += 1) {
      ranch += num(rows[i]![1]);
      river += num(rows[i]![2]);
      total += num(rows[i]![3]);
    }
    const stated = rows[monthTotalRow]!;
    if (!close(cents(ranch), num(stated[1]))) fail(`months sum to ranch ${cents(ranch)}, Total row says ${stated[1]}`);
    if (!close(cents(river), num(stated[2]))) fail(`months sum to river ${cents(river)}, Total row says ${stated[2]}`);
    if (!close(cents(total), num(stated[3]))) fail(`months sum to ${cents(total)}, Total row says ${stated[3]}`);
    // And the row's own Total should be ranch + river.
    if (!close(num(stated[3]), num(stated[1]) + num(stated[2]))) {
      fail(`Total row does not add: ${stated[1]} + ${stated[2]} != ${stated[3]}`);
    }
    console.log(`  months: ranch ${cents(ranch)} river ${cents(river)} total ${cents(total)} | row says ${stated[3]}`);
  }

  // --- table 2: houses ---
  const houseHeader = rows.findIndex((row) => row[0] === 'House');
  const feeRow = rows.findIndex((row) => row[0] === 'Management fee');
  if (houseHeader < 0) {
    fail('the house table is missing');
  } else {
    const end = feeRow > houseHeader ? feeRow : rows.length;
    let shares = 0;
    for (let i = houseHeader + 1; i < end; i += 1) shares += num(rows[i]![4]);
    const headline = monthTotalRow >= 0 ? num(rows[monthTotalRow]![3]) : 0;
    if (!close(cents(shares), headline)) {
      fail(`house Todd shares sum to ${cents(shares)}, month table Total says ${headline}`);
    }
    console.log(`  houses: Todd shares sum to ${cents(shares)} | headline ${headline}`);
  }

  // --- the file must not claim to change the books ---
  const note = rows.find((row) => row[0] === 'Note')?.[1] ?? '';
  if (!/does not change the books/i.test(note)) fail('the read-only note is missing from the file');
}

function close(a: number, b: number): boolean {
  return Math.abs(cents(a) - cents(b)) <= 0.011;
}

console.log(`\nfailures: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
