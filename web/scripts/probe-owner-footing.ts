/**
 * Does the owner statement foot, on every owner link?
 *
 * The statement is the one page an owner reads to know what they are owed. What has to hold:
 *
 *   1. `leftover` = revenue − cleaning − fee − (other costs), and `todd` = leftover / 2
 *   2. the houses' `todd` column sums to the headline
 *   3. the monthly `todd` column sums to the headline
 *
 * **Not** checked: `fee === 20% of the annual basis`. The fee is rounded to cents **per month** and then summed, on purpose —
 * `report.ts` does `mgtFee: cents(basis * 0.2)` inside `ownerSplit` and `sumDist` adds those rounded figures. Recomputing 20%
 * on the year disagrees with the twelve monthly lines an owner can add up, by a cent or two, and `owner-fee-footing.test.ts`
 * pins that choice. A first version of this probe asserted the annual recomputation and reported 27 "failures" that were all
 * its own arithmetic.
 *
 * Reads production read-only.
 */
const BASE = 'https://wilhite-portfolio.pages.dev';

const links = (await (
  await fetch(`${BASE}/api/owner/links`, {
    headers: { Authorization: `Bearer ${process.env.MUSE_BOT_SECRET ?? ''}`, Accept: 'application/json' },
  })
).json()) as { links: Array<{ token: string; path: string; views: number }> };

console.log(`owner links: ${links.links.length}\n`);

const cents = (n: number) => Math.round(n * 100) / 100;
const same = (a: number, b: number, tolerance = 0.011) => Math.abs(cents(a) - cents(b)) <= tolerance;

let failures = 0;
const fail = (message: string) => {
  failures++;
  console.log(`  FAIL ${message}`);
};

for (const link of links.links) {
  const res = await fetch(`${BASE}/api/owner/${link.token}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    console.log(`${link.path.slice(0, 18)}… http ${res.status} — skipped`);
    continue;
  }
  const body = (await res.json()) as {
    rangeLabel?: string;
    todd?: number;
    fee?: number;
    feeBasis?: number;
    houses?: Array<{
      id: string;
      revenue: number;
      costs: number;
      cleaning: number;
      fee: number;
      leftover: number;
      todd: number;
    }>;
    months?: Array<{ month: string; todd: number }>;
    empty?: boolean;
  };
  console.log(`${link.path.slice(0, 18)}… ${body.rangeLabel ?? '(no range)'} empty=${String(body.empty)}`);
  if (body.empty) {
    console.log('  (empty period — nothing to foot)');
    continue;
  }

  // The published basis must equal revenue less cleaning, or the "20% after cleaning" note is describing something else.
  let summedTodd = 0;
  for (const house of body.houses ?? []) {
    const basis = cents(house.revenue - house.cleaning);
    if (body.feeBasis !== undefined && body.houses?.length === 1 && !same(basis, body.feeBasis)) {
      fail(`${house.id}: published basis ${body.feeBasis} is not revenue - cleaning = ${basis}`);
    }

    // 1. Leftover, and the half split.
    const otherCosts = cents(house.costs - house.cleaning);
    const leftover = cents(house.revenue - house.cleaning - house.fee - otherCosts);
    if (!same(house.leftover, leftover)) {
      fail(`${house.id}: leftover ${house.leftover}, recomputed ${leftover}`);
    }
    if (!same(house.todd, house.leftover / 2)) {
      /*
       * Not a failure: the share is rounded to cents per month and summed, so it can sit a cent or two off a straight halving.
       * What must hold is that the gap stays at rounding scale — a share that is genuinely wrong is the defect, a cent and a half
       * is the documented design. The page says so in as many words when the gap exists.
       */
      const gap = Math.abs(cents(house.leftover / 2) - cents(house.todd));
      if (gap > 0.05) {
        fail(`${house.id}: todd ${house.todd} is ${gap} away from half of leftover ${house.leftover}`);
      } else {
        console.log(`  (${house.id}: share is ${gap}c off an exact half, which is the monthly rounding the page explains)`);
      }
    }
    summedTodd = cents(summedTodd + house.todd);
  }

  // 2. Houses sum to the headline.
  if (!same(summedTodd, body.todd ?? 0)) {
    fail(`houses sum to todd ${summedTodd}, headline says ${body.todd}`);
  }

  // 3. Months sum to the headline.
  const monthSum = cents((body.months ?? []).reduce((sum, month) => sum + month.todd, 0));
  if (body.months && body.months.length > 0 && !same(monthSum, body.todd ?? 0)) {
    fail(`months sum to ${monthSum}, headline says ${body.todd}`);
  }

  console.log(
    `  fee ${body.fee} on basis ${body.feeBasis} | todd ${body.todd} | houses ${summedTodd} | months ${monthSum} (${body.months?.length ?? 0})`,
  );
  console.log(
    `  annual fee is the sum of the monthly fees: ${body.fee} vs 20% of basis = ${cents((body.feeBasis ?? 0) * 0.2)} (a cent or two apart is expected)`,
  );
}

console.log(`\nfailures: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
