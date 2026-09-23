import { PROPERTIES } from './data';
import { getAllReservations } from './reservations-store';
import { loadCalendarBlocks } from './calendar-store';
import { compareMarket, loadCompSet, loadListingConfig, loadPriceSnapshots, median } from './pricing-store';
import type { SettingsEnv } from './kv';
import type { PropertyId } from './agent/types';

/** Standing yield rules for Muse, Amanda, and the in-app co-host. One source. */
export const PRICING_DOCTRINE = `## Pricing — fill the night at the highest rate it will bear
You are the yield manager for Utah Mountain Luxury. The job is occupancy and rate together. An empty night earns nothing and still carries the mortgage. A full calendar at a soft rate leaves money on the table. Price the night, not the month.

Never name a nightly rate until you have called manage_pricing action suggest_rate_adjustment for that house and those dates. If comps are empty, say so and do not invent a market number. The carrying floor in the tool is the mortgage spread over 30 nights. It is the lowest you may go on a last-week empty night. It is not the asking rate.

Houses and who they compete with:
- Ranch (sleeps 20, 8 bedrooms, hot tub, Lindon): entire homes that sleep about 16–20 with a hot tub in Utah County. Wedding, reunion, and BYU weekends. Weekdays can be softer. Do not comp it to a 4-bedroom.
- Lindon (sleeps 12, 4 bedrooms, Brandon only): entire 4-bedroom homes in north Utah County. Ignore basement apartments and 2-bedroom comps. Weekdays should fill. Do not drop the weekend to do it.
- River (sleeps 25, Vivian Park, on the Provo River, first stays November 1, 2026): brand new, modern, automated, 7,000 sq ft, 7 king bedrooms each in its own room plus an expandable king. It is the only rental up the canyon that sleeps 25 on the river. It competes with the best Sundance and Park City group homes, not with Lindon or Ranch. Do not sell a night before November 1, 2026. No mortgage is on the books — do not invent one.

## River premium pricing
River has its own season table in the tool (yield_plan seasonRates, and each night's season). Every number is host net. Airbnb and VRBO list prices are in the same rows.
- Floor: $1,500 host net on any night, promotion included. Airbnb $1,776, VRBO $1,631. Nothing goes under it. The lowest typed base is $1,875 so a full 20% promotion lands on $1,500 and still earns Airbnb's strikethrough and email placement.
- Proof: Dec 28 2026–Jan 2 2027 booked at $3,143 host net a night ($15,717 for 5 nights on Airbnb). Dec 10–13 2026 booked at $1,672 host net a night on VRBO. Christmas is priced above that proof, not at it.
- Market: Sundance's top 10% of listings book at $1,708+ guest price a night (AirROI, Aug 2025–Jul 2026), and 6+ bedroom Park City homes average about $2,300 (Rabbu, Apr 2026). River is bigger than almost all of them. Price above the Sundance top tier.
- Christmas through New Year (Dec 19–Jan 2): $3,400 host net every night. 5-night minimum.
- Thanksgiving: $2,900, 4-night minimum. July 4 week $3,000 and Pioneer Day weekend $2,900, 4-night minimum. MLK, Presidents Day $2,800; Memorial Day, Labor Day $2,600; 3-night minimum.
- Summer peak (June 1–August 16): Friday and Saturday $2,700, 4-night minimum weekend stays. Weekdays $2,200, 3-night minimum.
- Ski season (January–March): Friday and Saturday $2,400, 3-night minimum. Weekdays $1,950, 2-night minimum. Early December before Christmas: $2,200 weekends, $1,875 weekdays.
- Shoulder (April–May, mid-August–November): $2,100 weekends, $1,875 weekdays, 2-night minimum.
- Weekends sell first at full rate. Weekday fill starts only after that week's Friday and Saturday are booked: then the 20% promotion goes on those weekdays and the minimum drops to 2 nights. Never 1 night at River.
- Holidays get no promotion until 14 days out. Summer and ski weekends get none until 21 days out.
- If a season sells its weekends more than 60 days out, raise the next open weekends in that season by 10% and tell Brandon.


The base rate stays high. Never lower the published nightly rate to chase a hole. Fill soft nights with a promotion on Airbnb and on VRBO, set in each site's own calendar. Those sites market the listing when the discount is a promotion: Airbnb shows a strikethrough at 10% off, a callout at 15% off, and can feature the listing in emails to recent searchers at 20% off. VRBO adds a badge at 5% off and extra member exposure at 10% off. Custom promotions are created on Airbnb and VRBO directly. Do not change the rate and do not create the promotion in Hospitable. Hospitable stays the calendar and the inbox. Before adding a promotion, read the ones already on that listing. A VRBO member deal stacks on top of other discounts. If one is already on, do not add a second cut that takes the night under the carrying floor.

The asking host net is 20% above the nightly average the remaining open nights must earn to hit the year. That average is sellOutHostNightly. The base we publish is that number times 1.20, or higher when an event or the comps clear it. Never lower the base. A 20% promotion off that base is the only discount, and only while the year is still short. Because the base is 20% high, 20% off lands about 4% under the bare goal rate, which is enough to fill and still near the number the year needs. The price after the promotion does not go under the carrying floor.

Fill order:
- Weekend nights are Friday and Saturday. Hold them at the +20% base while they are more than 21 days out.
- If a weekend night is still empty inside 21 days, add the 20% promotion on Airbnb and on VRBO. Do not cut the base.
- An event night waits until 14 days out before that same 20% promotion.
- Once Friday and Saturday of a week are both booked, put the 20% promotion on the open weekdays of that week immediately, even if they are months out. Drop the minimum stay to 1 night on those weekdays only. Leave the weekend rate alone.
- A 1- or 2-night hole uses the same 20% promotion, plus a /book offer at the host net after that promotion. /book has no platform fee.
- When the year is already on the books, stop promoting. Do not discount a full goal.

Event nights — hold a premium (about 15% over the comp median, more for Notre Dame and Christmas). Do not put these on sale early:
- BYU home, LaVell Edwards: Sep 5 2026 Utah Tech, Sep 12 Arizona, Oct 9 Iowa State (Friday night), Oct 17 Notre Dame, Oct 31 Arizona State, Nov 14 Baylor, Nov 28 Cincinnati. Price the weekend around the game. Oct 9 includes Thursday.
- Nov 7 2026 at Utah in Salt Lake: still a Utah weekend. A smaller premium, not a discount.
- Memorial Day weekend 2026 (May 22–25), July 4 weekend (Jul 2–5), Labor Day (Sep 4–7), Thanksgiving (Nov 25–29), Christmas through New Year (Dec 23 2026–Jan 2 2027), MLK (Jan 15–18 2027), Presidents Day (Feb 12–15 2027).
- Late April is BYU commencement. Confirm the exact week before you price it. Do not guess the day.

## Annual gross goals
Brandon's gross booking goals are host payout, the revenue line on this dashboard: what we keep from the stay, before mortgage, cleaning, and utilities. Not profit. Not the guest price before Airbnb or VRBO fees.
- Lindon: $40,000 each calendar year.
- Ranch: $140,000 each calendar year.
- River: $400,000 each operating year, November 1 through the following October 31. The first year is November 1, 2026 through October 31, 2027. Do not try to earn $400,000 in November and December 2026 alone.

suggest_rate_adjustment returns revenueGoal with booked, stillNeeded, open nights left, sellOutHostNightly, and the +20% ask. sellOutHostNightly is the host net if every remaining night sells at the bare goal. The published base is 20% above that. The 20% promotion is how a slow night gets filled. Weekends sell first. Weekdays get the promotion only after that weekend is booked, or inside 21 days if the night is still empty. Never go under the carrying floor. When the house is already ahead of the goal, hold the base and do not run the promotion.

Host payout on this dashboard is already net of Airbnb and VRBO fees. The number we have to hit is that net. The number typed into each site is higher, so the fee still leaves the net.

These listings run through Hospitable, so Airbnb uses the host-only fee: 15.5% of the nightly rate and the cleaning fee. Taxes are not included. The guest is not charged a separate Airbnb service fee. To keep $100, the Airbnb nightly has to be $119 ($100 / 0.845, rounded up).

VRBO pay-per-booking is a 5% commission on the rent and the cleaning fee, plus a 3% payment processing fee on what VRBO collects. Together that is 8% of the nightly rate. To keep $100, the VRBO nightly has to be $109 ($100 / 0.92, rounded up). The 3% also applies to tax VRBO collects, which the nightly markup does not recover. If a payout shows a software rate of 5% only, use that payout and say so. Do not guess a third fee.

A promotion percent comes off the listed price. The same percent comes off the host net, because the fee is a percent. Type the promotion on Airbnb and on VRBO. Do not put a markup or a promotion in Hospitable.

A comp page shows the guest nightly, not the host payout. Convert it before comparing it to what we keep: Airbnb comp times 0.845, VRBO comp times 0.92. /book has no platform fee, so that offer is not grossed up.

The same percents come out of the cleaning fee. A $350 cleaning fee set on Airbnb nets about $296. Do not raise the nightly to hide a cleaning fee that was set too low, and do not change cleaning inside Hospitable.

Comps: same market, similar sleep count, entire home. Refresh them before a recommendation if the last snapshot is stale. The base rate is set in the Airbnb host calendar and the VRBO owner calendar. The promotion is set in those same two calendars, on the dates that need it. This dashboard recommends both numbers. It does not push them. Hospitable does not get either change.

Every pricing answer includes: open nights, lead time, whether an event sits on them, comp median or "no comps", carrying floor, the base host nightly, and the promotion percent if one is due. One base number. The promotion is separate. No range that hides the decision.
suggest_rate_adjustment returns listingHostNightly as the host net that stays up. airbnbListNightly and vrboListNightly are the base rates to type in. A promotion uses the same percent on those listed rates. directOfferHostNightly is a /book offer with no platform fee. peakOpenNight is the single highest host net. Do not paste that peak onto the other nights, and do not type the host net into Airbnb or VRBO.

## The playbook — most booked, highest paid houses in Utah County
Goal: hit Lindon $40,000, Ranch $140,000, and River $400,000 in host payout, with the calendar as full as the rate allows. Four levers, in this order. Rate comes from the rules above. The other three decide whether that rate books.

1. Sell to the guest who pays the most for each house.
- Ranch and River are group houses. Market them to family reunions, wedding parties, church and youth groups, sports teams, and company offsites from the Lehi and Silicon Slopes tech campuses. Those groups book early and book weekends. They do not compare against a 4-bedroom.
- River (Vivian Park, Provo Canyon) sells the canyon: Sundance Mountain Resort ski days, Provo River tubing and fly fishing, and fall color. Winter holidays and summer weekends are the peak. The Sundance Film Festival moves to Boulder, Colorado starting in 2027. Do not price January 2027 for it.
- Lindon sells to families: parents visiting BYU and UVU students, families dropping off or picking up a missionary at the Provo MTC, and relatives at weddings and graduations. Weekdays can also sell to traveling medical staff, relocations, and insurance housing. Confirm a date before pricing it. Do not invent one.
- BYU Education Week (August), BYU Women's Conference (spring), and commencement (late April) move every year. Look up the dates before you treat them as events.

2. Make the stay easy to book.
- Weekends: 2-night minimum on Friday and Saturday. Do not accept a Saturday-only stay that strands the Friday unless it is inside 7 days.
- Once a weekend is booked, drop the minimum stay on that week's weekdays to 1 night and turn on the 20% promotion. Weekday guests are the business and family trips that fill the gap.
- Holidays: 3-night minimum on Thanksgiving and Christmas through New Year at Ranch and Lindon. River minimums come from its season table above.
- Keep the calendar open 12 months ahead. Ranch and River groups book 6 to 11 months out, and a closed calendar loses the booking before it starts.
- Instant Book on for Airbnb and VRBO. Stays of 7 and 28 nights get weekly and monthly discounts set on Airbnb and VRBO. Lindon from January through March can take a 30-night stay at the monthly rate before a night goes empty.

3. Rank high in search. Airbnb and VRBO show the listings guests click and book.
- Answer every inquiry within an hour, day or night. Accept or decline a request the same day.
- Keep 4.9 stars. After checkout, the thank-you asks for a review. A 4-star or lower review gets a calm public reply the same day and a fix recorded on the house.
- The title and first photo sell the sleep count and the best feature: Ranch — "Sleeps 20 · Hot Tub · Game Room" style; River — "Sleeps 25 · On the Provo River · 7 King Suites"; Lindon — "Sleeps 12 · Family Home near BYU". Draft title and photo-order changes. Brandon approves them before they post.
- Promotions are ranking tools. Run them on Airbnb and VRBO, never in Hospitable.

4. Fill every gap without teaching guests to wait for a sale.
- The 20% promotion starts only inside the fill window. Early bookers pay the high base. That is how the base stays believable.
- 1- and 2-night holes: promotion plus a /book offer to past guests. Draft those emails and texts. Brandon approves before anything goes out.
- Repeat guests get /book at the promoted host net. There is no platform fee.
- Past guests from the same season last year get a draft "your dates are open again" note 60 to 90 days before that season.

## Daily and weekly routine
Every morning, America/Denver:
1. POST manage_pricing action yield_plan. It returns each house's pace against the goal, the next 8 weekends, and the moves to make. Each move has a workKey.
2. POST shared_work action list. Skip any move whose taken.blocksRepeat is true. That agent already posted it or is posting it. Tell Brandon their name and what they did.
3. Claim the workKey, then make that move on Airbnb and on VRBO: set the base (airbnbListNightly and vrboListNightly), add the promotion on the listed dates, change minimum stays. Log in with pmutah@gmail.com. Then POST shared_work action done with that workKey and the prices you typed.
4. Report what you changed, and what the other agent already changed. Name the agent, the house, the dates, and the prices. Say "Amanda posted Lindon Sep 22–24 at 9:04 AM," not "handled."
5. Check the Hospitable inbox. Claim inquiry:<guest> before you answer. If that key is already done, do not send a second reply.

Every Monday:
1. Refresh comps: manage_pricing action refresh_comp_prices. Add a comp if a house has fewer than 5 similar homes.
2. Compare this week's yield plan to last Monday. A house that fell further behind gets a stronger push. A house ahead of pace gets a higher base.
3. Look 60 to 120 days ahead for events and holidays. Raise those bases before anyone books them.

First of every month:
1. Booked host payout versus each goal. Occupancy and the host net per booked night by house.
2. Which promotions filled nights and which did not. Keep the ones that worked.

Guardrails that never bend:
- Do not lower a base to fill a night. Promotions only.
- Do not go under the carrying floor.
- Do not change rates, promotions, or minimum stays in Hospitable.
- Do not sell River before November 1, 2026.
- Do not invent a comp, an event date, or a rate. Say what you looked up.
- Guest messages, emails, and texts are drafts until Brandon says send, except replies to an open inquiry.
- Do not repeat a job Muse or Amanda already marked done on shared_work.`;

/** What the host keeps. Keep web/src/lib/revenue-goals.ts in step with these rates. */
export const AIRBNB_HOST_FEE = 0.155;
export const AIRBNB_KEEP = 1 - AIRBNB_HOST_FEE;
export const VRBO_KEEP = 1 - 0.05 - 0.03;

export function listPriceForHostNet(hostNet: number, keep: number): number {
  return Math.ceil(hostNet / keep);
}

/** Host-payout gross for the year. Keep web/src/lib/revenue-goals.ts in step with these numbers. */
export const ANNUAL_GROSS_GOAL: Record<'ranch' | 'lindon' | 'river', number> = {
  lindon: 40_000,
  ranch: 140_000,
  river: 400_000,
};

export function grossGoalSnapshot(
  propertyId: PropertyId,
  stays: { propertyId: string; status?: string; checkIn: string; checkOut: string; payout: number }[],
  asOf: string,
  blocks: { start: string; end: string }[] = [],
) {
  const window = goalWindow(propertyId, asOf);
  const mine = stays.filter((stay) => stay.propertyId === propertyId && stay.status !== 'cancelled');
  const booked = mine
    .filter((stay) => stay.status !== 'blocked' && stay.checkIn >= window.start && stay.checkIn < window.end)
    .reduce((sum, stay) => sum + (Number(stay.payout) || 0), 0);
  const paceFrom = asOf > window.start ? asOf : window.start;
  const taken = nightsInRange(
    [
      ...mine.map((stay) => ({ start: stay.checkIn, end: stay.checkOut })),
      ...blocks.map((block) => ({ start: block.start, end: block.end })),
    ],
    addDays(paceFrom, -1),
    window.end,
  );
  const openNightsLeft = eachNight(paceFrom, window.end).filter(
    (iso) => !taken.has(iso) && (propertyId !== 'river' || iso >= '2026-11-01'),
  ).length;
  const target = ANNUAL_GROSS_GOAL[propertyId];
  const stillNeeded = Math.max(0, Math.round(target - booked));
  return {
    target,
    label: window.label,
    booked: Math.round(booked),
    stillNeeded,
    openNightsLeft,
    sellOutHostNightly: stillNeeded > 0 && openNightsLeft > 0 ? Math.round(stillNeeded / openNightsLeft) : null,
  };
}

export function goalWindow(propertyId: PropertyId, asOf: string): { start: string; end: string; label: string } {
  if (propertyId === 'river') {
    const year = Number(asOf.slice(0, 4));
    const novThisYear = `${year}-11-01`;
    const start = asOf < '2026-11-01' ? '2026-11-01' : asOf >= novThisYear ? novThisYear : `${year - 1}-11-01`;
    const endYear = Number(start.slice(0, 4)) + 1;
    return { start, end: `${endYear}-11-01`, label: `${start.slice(0, 7)} to ${endYear}-10` };
  }
  const year = asOf.slice(0, 4);
  return { start: `${year}-01-01`, end: `${Number(year) + 1}-01-01`, label: year };
}

type EventNight = { start: string; end: string; name: string; premium: number };

/** River never publishes a base under this host net. */
export const RIVER_FLOOR_HOST_NET = 1500;

type RiverSeason = {
  start: string;
  end: string;
  name: string;
  holiday: boolean;
  weekendHostNet: number;
  weekdayHostNet: number;
  minWeekend: number;
  minWeekday: number;
};

/** Host net per night. Dates run check-in night to the night before `end`. Holidays win over the season they sit in. */
const RIVER_HOLIDAYS: RiverSeason[] = [
  { start: '2026-11-24', end: '2026-11-30', name: 'Thanksgiving', holiday: true, weekendHostNet: 2900, weekdayHostNet: 2900, minWeekend: 4, minWeekday: 4 },
  { start: '2026-12-19', end: '2027-01-03', name: 'Christmas through New Year', holiday: true, weekendHostNet: 3400, weekdayHostNet: 3400, minWeekend: 5, minWeekday: 5 },
  { start: '2027-01-15', end: '2027-01-19', name: 'MLK weekend', holiday: true, weekendHostNet: 2800, weekdayHostNet: 2800, minWeekend: 3, minWeekday: 3 },
  { start: '2027-02-12', end: '2027-02-16', name: 'Presidents Day weekend', holiday: true, weekendHostNet: 2800, weekdayHostNet: 2800, minWeekend: 3, minWeekday: 3 },
  { start: '2027-05-28', end: '2027-06-01', name: 'Memorial Day weekend', holiday: true, weekendHostNet: 2600, weekdayHostNet: 2600, minWeekend: 3, minWeekday: 3 },
  { start: '2027-07-01', end: '2027-07-06', name: 'July 4 week', holiday: true, weekendHostNet: 3000, weekdayHostNet: 3000, minWeekend: 4, minWeekday: 4 },
  { start: '2027-07-22', end: '2027-07-26', name: 'Pioneer Day weekend', holiday: true, weekendHostNet: 2900, weekdayHostNet: 2900, minWeekend: 4, minWeekday: 4 },
  { start: '2027-09-03', end: '2027-09-07', name: 'Labor Day weekend', holiday: true, weekendHostNet: 2600, weekdayHostNet: 2600, minWeekend: 3, minWeekday: 3 },
  { start: '2027-11-23', end: '2027-11-29', name: 'Thanksgiving', holiday: true, weekendHostNet: 2900, weekdayHostNet: 2900, minWeekend: 4, minWeekday: 4 },
  { start: '2027-12-18', end: '2028-01-03', name: 'Christmas through New Year', holiday: true, weekendHostNet: 3400, weekdayHostNet: 3400, minWeekend: 5, minWeekday: 5 },
];

function riverSeasonOn(iso: string): RiverSeason {
  const holiday = RIVER_HOLIDAYS.find((season) => iso >= season.start && iso < season.end);
  if (holiday) return holiday;
  const monthDay = iso.slice(5);
  if (monthDay >= '06-01' && monthDay < '08-17') {
    return { start: iso, end: iso, name: 'Summer peak', holiday: false, weekendHostNet: 2700, weekdayHostNet: 2200, minWeekend: 4, minWeekday: 3 };
  }
  if (monthDay >= '01-01' && monthDay < '04-01') {
    return { start: iso, end: iso, name: 'Ski season', holiday: false, weekendHostNet: 2400, weekdayHostNet: 1950, minWeekend: 3, minWeekday: 2 };
  }
  if (monthDay >= '12-01') {
    return { start: iso, end: iso, name: 'Early ski season', holiday: false, weekendHostNet: 2200, weekdayHostNet: 1875, minWeekend: 3, minWeekday: 2 };
  }
  return { start: iso, end: iso, name: 'Shoulder', holiday: false, weekendHostNet: 2100, weekdayHostNet: 1875, minWeekend: 2, minWeekday: 2 };
}

function riverSeasonTable(from: string, to: string) {
  const rows: Array<{
    season: string;
    firstNight: string;
    lastNight: string;
    weekendHostNet: number;
    weekdayHostNet: number;
    weekendAirbnb: number;
    weekendVrbo: number;
    weekdayAirbnb: number;
    weekdayVrbo: number;
    minWeekend: number;
    minWeekday: number;
  }> = [];
  for (const iso of eachNight(from, to)) {
    if (iso < '2026-11-01') continue;
    const season = riverSeasonOn(iso);
    const last = rows[rows.length - 1];
    if (last && last.season === season.name && last.weekendHostNet === season.weekendHostNet && daysBetween(last.lastNight, iso) === 1) {
      last.lastNight = iso;
      continue;
    }
    rows.push({
      season: season.name,
      firstNight: iso,
      lastNight: iso,
      weekendHostNet: season.weekendHostNet,
      weekdayHostNet: season.weekdayHostNet,
      weekendAirbnb: listPriceForHostNet(season.weekendHostNet, AIRBNB_KEEP),
      weekendVrbo: listPriceForHostNet(season.weekendHostNet, VRBO_KEEP),
      weekdayAirbnb: listPriceForHostNet(season.weekdayHostNet, AIRBNB_KEEP),
      weekdayVrbo: listPriceForHostNet(season.weekdayHostNet, VRBO_KEEP),
      minWeekend: season.minWeekend,
      minWeekday: season.minWeekday,
    });
  }
  return rows;
}

const EVENTS: EventNight[] = [
  { start: '2026-05-22', end: '2026-05-25', name: 'Memorial Day weekend', premium: 0.12 },
  { start: '2026-07-02', end: '2026-07-05', name: 'July 4 weekend', premium: 0.12 },
  { start: '2026-09-04', end: '2026-09-07', name: 'Labor Day and BYU vs Utah Tech', premium: 0.15 },
  { start: '2026-09-11', end: '2026-09-13', name: 'BYU vs Arizona', premium: 0.15 },
  { start: '2026-10-08', end: '2026-10-11', name: 'BYU vs Iowa State (Friday)', premium: 0.18 },
  { start: '2026-10-16', end: '2026-10-18', name: 'BYU vs Notre Dame', premium: 0.25 },
  { start: '2026-10-30', end: '2026-11-01', name: 'BYU vs Arizona State', premium: 0.15 },
  { start: '2026-11-06', end: '2026-11-08', name: 'BYU at Utah', premium: 0.08 },
  { start: '2026-11-13', end: '2026-11-15', name: 'BYU vs Baylor', premium: 0.12 },
  { start: '2026-11-25', end: '2026-11-29', name: 'Thanksgiving and BYU vs Cincinnati', premium: 0.2 },
  { start: '2026-12-23', end: '2027-01-02', name: 'Christmas through New Year', premium: 0.25 },
  { start: '2027-01-15', end: '2027-01-18', name: 'MLK weekend', premium: 0.1 },
  { start: '2027-02-12', end: '2027-02-15', name: 'Presidents Day weekend', premium: 0.12 },
];

function denverToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

function eventOn(iso: string): EventNight | undefined {
  return EVENTS.find((event) => iso >= event.start && iso < event.end);
}

function nightsInRange(ranges: { start: string; end: string }[], from: string, to: string): Set<string> {
  const taken = new Set<string>();
  for (const range of ranges) {
    let cursor = range.start < from ? from : range.start;
    const stop = range.end < to ? range.end : to;
    while (cursor < stop) {
      taken.add(cursor);
      cursor = addDays(cursor, 1);
    }
  }
  return taken;
}

function eachNight(from: string, to: string): string[] {
  const nights: string[] = [];
  let cursor = from;
  while (cursor < to) {
    nights.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return nights;
}

type NightQuote = {
  date: string;
  leadDays: number;
  event: string | null;
  stance: 'hold' | 'raise' | 'promote' | 'direct-gap' | 'do-not-sell' | 'need-comps';
  listingHostNightly: number | null;
  promotionPercent: number | null;
  promotionHostNightly: number | null;
  directOfferHostNightly: number | null;
  season?: string | null;
  minStayNights?: number | null;
};

function bare(night: Omit<NightQuote, 'promotionPercent' | 'promotionHostNightly'>): NightQuote {
  return { ...night, promotionPercent: null, promotionHostNightly: null };
}

function applyPromotion(night: NightQuote, percent: number, floor: number): NightQuote {
  const base = night.listingHostNightly;
  if (base == null || percent <= 0) return night;
  const promo = Math.max(floor, Math.round(base * (1 - percent)));
  if (promo >= base) return night;
  return {
    ...night,
    stance: 'promote',
    promotionPercent: Math.round((1 - promo / base) * 100),
    promotionHostNightly: promo,
  };
}

function quoteNight(
  iso: string,
  today: string,
  propertyId: PropertyId,
  median: number,
  target: number,
  floor: number,
): NightQuote {
  const leadDays = daysBetween(today, iso);
  const event = eventOn(iso);
  const base = Math.max(median, target);
  if (propertyId === 'river' && iso < '2026-11-01') {
    return bare({
      date: iso,
      leadDays,
      event: event?.name ?? null,
      stance: 'do-not-sell',
      listingHostNightly: null,
      directOfferHostNightly: null,
    });
  }
  if (propertyId === 'river') {
    const season = riverSeasonOn(iso);
    const weekend = isWeekendNight(iso);
    const seasonRate = weekend ? season.weekendHostNet : season.weekdayHostNet;
    const name = season.holiday ? season.name : null;
    const eventRate = name && event ? Math.round(Math.max(median, target) * (1 + event.premium)) : 0;
    return {
      ...bare({
        date: iso,
        leadDays,
        event: name,
        stance: name ? 'raise' : 'hold',
        listingHostNightly: Math.max(RIVER_FLOOR_HOST_NET, seasonRate, eventRate),
        directOfferHostNightly: null,
      }),
      season: season.name,
      minStayNights: weekend ? season.minWeekend : season.minWeekday,
    };
  }
  if (median <= 0 && target <= 0) {
    return bare({
      date: iso,
      leadDays,
      event: event?.name ?? null,
      stance: 'need-comps',
      listingHostNightly: null,
      directOfferHostNightly: null,
    });
  }
  const premium = event?.premium ?? 0;
  const held = Math.round((median > 0 ? base : target) * (1 + premium));
  return bare({
    date: iso,
    leadDays,
    event: event?.name ?? null,
    stance: event ? 'raise' : 'hold',
    listingHostNightly: held,
    directOfferHostNightly: null,
  });
}

function weekdayIndex(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function isWeekendNight(iso: string): boolean {
  const day = weekdayIndex(iso);
  return day === 5 || day === 6;
}

function weekFriday(iso: string): string {
  const sinceMonday = (weekdayIndex(iso) + 6) % 7;
  return addDays(addDays(iso, -sinceMonday), 4);
}

function weekendIsBooked(iso: string, booked: Set<string>): boolean {
  const friday = weekFriday(iso);
  return booked.has(friday) && booked.has(addDays(friday, 1));
}

type GoalPace = ReturnType<typeof grossGoalSnapshot>;

function applyGoalPremium(quotes: NightQuote[], paceFor: (iso: string) => GoalPace) {
  for (const night of quotes) {
    if (night.stance === 'do-not-sell') continue;
    const sellOut = paceFor(night.date).sellOutHostNightly;
    if (!sellOut) continue;
    const aim = Math.round(sellOut * 1.2);
    if (night.listingHostNightly == null || night.listingHostNightly < aim) {
      night.listingHostNightly = aim;
      if (night.stance === 'need-comps') night.stance = night.event ? 'raise' : 'hold';
    }
  }
}

function applyFillPromotions(
  quotes: NightQuote[],
  booked: Set<string>,
  floor: number,
  paceFor: (iso: string) => GoalPace,
) {
  for (const night of quotes) {
    if (night.stance === 'do-not-sell' || night.listingHostNightly == null) continue;
    if (paceFor(night.date).stillNeeded <= 0) continue;
    if (night.event && night.leadDays > 14) continue;
    const weekdayPush = !isWeekendNight(night.date) && weekendIsBooked(night.date, booked);
    const closeIn = night.event ? night.leadDays <= 14 : night.leadDays <= 21;
    if (!weekdayPush && !closeIn) continue;
    const next = applyPromotion(night, 0.2, floor);
    if (next.promotionPercent == null) continue;
    night.promotionPercent = next.promotionPercent;
    night.promotionHostNightly = next.promotionHostNightly;
    night.stance = 'promote';
  }
}

function applyGapOffers(quotes: NightQuote[], taken: Set<string>, median: number, target: number, floor: number) {
  let index = 0;
  while (index < quotes.length) {
    let end = index;
    while (end + 1 < quotes.length && daysBetween(quotes[end]!.date, quotes[end + 1]!.date) === 1) end += 1;
    const run = quotes.slice(index, end + 1);
    const before = addDays(run[0]!.date, -1);
    const after = addDays(run[run.length - 1]!.date, 1);
    const bounded = taken.has(before) && taken.has(after);
    if (bounded && run.length <= 2 && median > 0 && run.every((night) => !night.event)) {
      for (const night of run) {
        if (night.leadDays <= 45 && night.stance !== 'do-not-sell' && night.listingHostNightly) {
          const baseRate = Math.max(night.listingHostNightly, Math.round(Math.max(median, target)));
          night.listingHostNightly = baseRate;
          const next = applyPromotion({ ...night, listingHostNightly: baseRate }, 0.2, floor);
          night.promotionPercent = next.promotionPercent;
          night.promotionHostNightly = next.promotionHostNightly;
          night.directOfferHostNightly = next.promotionHostNightly;
          night.stance = 'direct-gap';
        }
      }
    }
    index = end + 1;
  }
}

function achievedHostNightly(
  stays: { checkIn: string; checkOut: string; payout: number }[],
  today: string,
): number | null {
  const start = addDays(today, -90);
  let payout = 0;
  let nights = 0;
  for (const stay of stays) {
    const count = daysBetween(stay.checkIn, stay.checkOut);
    if (count <= 0 || stay.payout <= 0) continue;
    if (stay.checkOut < start || stay.checkOut > today) continue;
    payout += stay.payout;
    nights += count;
  }
  return nights > 0 ? Math.round(payout / nights) : null;
}

async function compHostNetMedian(env: SettingsEnv, propertyId: PropertyId, from: string, to: string) {
  const comps = await loadCompSet(env);
  const snaps = await loadPriceSnapshots(env);
  const relevant = new Map(
    comps
      .filter((comp) => !comp.propertyId || comp.propertyId === propertyId || comp.propertyId === 'both')
      .map((comp) => [comp.id, comp.platform]),
  );
  const hostNets: number[] = [];
  for (const snap of snaps) {
    const platform = relevant.get(snap.compId);
    if (!platform || snap.date < from || snap.date > to || snap.nightlyRate <= 0) continue;
    hostNets.push(snap.nightlyRate * (platform === 'vrbo' ? VRBO_KEEP : AIRBNB_KEEP));
  }
  return median(hostNets);
}

function withChannelPrices<T extends { listingHostNightly: number | null; promotionHostNightly: number | null }>(
  night: T,
) {
  return {
    ...night,
    airbnbListNightly:
      night.listingHostNightly == null ? null : listPriceForHostNet(night.listingHostNightly, AIRBNB_KEEP),
    vrboListNightly:
      night.listingHostNightly == null ? null : listPriceForHostNet(night.listingHostNightly, VRBO_KEEP),
    airbnbPromoListNightly:
      night.promotionHostNightly == null ? null : listPriceForHostNet(night.promotionHostNightly, AIRBNB_KEEP),
    vrboPromoListNightly:
      night.promotionHostNightly == null ? null : listPriceForHostNet(night.promotionHostNightly, VRBO_KEEP),
  };
}

type YieldMove = {
  house: string;
  propertyId: PropertyId;
  firstNight: string;
  lastNight: string;
  nights: number;
  action: string;
  promotionPercent: number | null;
  airbnbListNightly: number | null;
  vrboListNightly: number | null;
  airbnbPromoListNightly: number | null;
  vrboPromoListNightly: number | null;
  minStay: string | null;
  event: string | null;
  workKey: string;
};

function moveAction(stance: string, weekend: boolean) {
  if (stance === 'direct-gap') return 'Gap: 20% promotion on Airbnb and VRBO, plus a /book offer to a past guest';
  if (stance === 'promote') {
    return weekend
      ? 'Weekend still open inside 21 days: 20% promotion on Airbnb and VRBO'
      : 'Weekday fill: 20% promotion on Airbnb and VRBO';
  }
  if (stance === 'raise') return 'Event: hold the higher base, no promotion yet';
  return 'Hold the base, no promotion';
}

export async function buildYieldPlan(env: SettingsEnv, days = 90) {
  const today = denverToday();
  const to = addDays(today, days);
  const houses: PropertyId[] = ['lindon', 'ranch', 'river'];
  const plans = [];
  for (const propertyId of houses) {
    const quote = await suggestRateAdjustment(env, propertyId, today, to);
    const stays = (await getAllReservations(env)).filter(
      (stay) => stay.propertyId === propertyId && stay.status !== 'cancelled',
    );
    const blocks = (await loadCalendarBlocks(env)).filter((block) => block.propertyId === propertyId);
    const booked = nightsInRange(
      [
        ...stays.map((stay) => ({ start: stay.checkIn, end: stay.checkOut })),
        ...blocks.map((block) => ({ start: block.start, end: block.end })),
      ],
      today,
      to,
    );

    const moves: YieldMove[] = [];
    for (const night of quote.nights) {
      if (night.stance === 'do-not-sell' || night.stance === 'need-comps') continue;
      if (night.stance === 'hold' || night.stance === 'raise') {
        if (night.leadDays > 21 && !night.event) continue;
      }
      const weekend = isWeekendNight(night.date);
      const action = moveAction(night.stance, weekend);
      const holiday = /thanksgiving|christmas|new year/i.test(night.event ?? '');
      const riverMin =
        propertyId === 'river' && night.minStayNights
          ? night.stance === 'promote' && !weekend
            ? `${Math.min(2, night.minStayNights)} nights`
            : night.leadDays > 7
              ? `${night.minStayNights} nights`
              : null
          : undefined;
      const minStay = riverMin !== undefined
        ? riverMin
        : holiday && night.leadDays > 7
          ? '3 nights'
          : night.stance === 'promote' && !weekend
            ? '1 night'
            : weekend && night.leadDays > 7
              ? '2 nights'
              : null;
      const last = moves[moves.length - 1];
      if (
        last &&
        last.action === action &&
        last.airbnbListNightly === night.airbnbListNightly &&
        last.promotionPercent === night.promotionPercent &&
        daysBetween(last.lastNight, night.date) === 1
      ) {
        last.lastNight = night.date;
        last.nights += 1;
        last.workKey = `yield:${propertyId}:${last.firstNight}:${last.lastNight}`;
        continue;
      }
      moves.push({
        house: quote.house,
        propertyId,
        firstNight: night.date,
        lastNight: night.date,
        nights: 1,
        action,
        promotionPercent: night.promotionPercent,
        airbnbListNightly: night.airbnbListNightly,
        vrboListNightly: night.vrboListNightly,
        airbnbPromoListNightly: night.airbnbPromoListNightly,
        vrboPromoListNightly: night.vrboPromoListNightly,
        minStay,
        event: night.event,
        workKey: `yield:${propertyId}:${night.date}:${night.date}`,
      });
    }

    const weekends = [];
    let friday = weekFriday(today);
    if (friday < today) friday = addDays(friday, 7);
    for (let index = 0; index < 8; index += 1) {
      const saturday = addDays(friday, 1);
      const beforeOpening = propertyId === 'river' && friday < '2026-11-01';
      weekends.push({
        friday,
        status: beforeOpening
          ? 'not open yet'
          : booked.has(friday) && booked.has(saturday)
            ? 'booked'
            : booked.has(friday) || booked.has(saturday)
              ? 'half booked'
              : 'open',
        event: eventOn(friday)?.name ?? eventOn(saturday)?.name ?? null,
      });
      friday = addDays(friday, 7);
    }

    plans.push({
      propertyId,
      house: quote.house,
      seasonRates: propertyId === 'river' ? riverSeasonTable(today, addDays(today, 365)) : undefined,
      goal: quote.revenueGoal,
      openNightsNext90: quote.openNightCount,
      compHostNetMedian: quote.compHostNetMedian,
      needsComps: quote.nights.some((night) => night.stance === 'need-comps'),
      weekends,
      moves,
    });
  }

  return {
    asOf: today,
    days,
    houses: plans,
    howToUse:
      'Check shared_work before you post. Skip a move when taken.blocksRepeat is true and tell Brandon who already has it. Otherwise claim the workKey, type airbnbListNightly and vrboListNightly as the base on Airbnb and VRBO, add the promotion on those dates, set the minimum stay, then mark that workKey done with the prices and the time. Nothing changes in Hospitable.',
  };
}

export async function suggestRateAdjustment(
  env: SettingsEnv,
  propertyId: PropertyId,
  fromInput?: string,
  toInput?: string,
) {
  const today = denverToday();
  const from = fromInput && fromInput >= today ? fromInput : today;
  const to = toInput && toInput > from ? toInput : addDays(from, 14);
  const house = PROPERTIES[propertyId];
  const floor =
    propertyId === 'river'
      ? RIVER_FLOOR_HOST_NET
      : house.mortgage > 0
        ? Math.round(house.mortgage / 30)
        : 0;
  const stays = (await getAllReservations(env)).filter(
    (stay) => stay.propertyId === propertyId && stay.status !== 'cancelled',
  );
  const blocks = (await loadCalendarBlocks(env)).filter((block) => block.propertyId === propertyId);
  const taken = nightsInRange(
    [
      ...stays.map((stay) => ({ start: stay.checkIn, end: stay.checkOut })),
      ...blocks.map((block) => ({ start: block.start, end: block.end })),
    ],
    addDays(from, -1),
    addDays(to, 1),
  );
  const market = await compareMarket(env, propertyId, from, addDays(to, -1));
  const hostNetMedian =
    (await compHostNetMedian(env, propertyId, from, addDays(to, -1))) ||
    (market.compMedian > 0 ? Math.round(market.compMedian * AIRBNB_KEEP) : 0);
  const config = await loadListingConfig(env);
  const target = config[propertyId]?.targetMinNightly ?? 0;
  const open = eachNight(from, to).filter((iso) => !taken.has(iso));
  const nights = open.map((iso) => quoteNight(iso, today, propertyId, hostNetMedian, target, floor));
  const pace = grossGoalSnapshot(propertyId, stays, today, blocks);
  const booked = nightsInRange(
    [
      ...stays.map((stay) => ({ start: stay.checkIn, end: stay.checkOut })),
      ...blocks.map((block) => ({ start: block.start, end: block.end })),
    ],
    addDays(today, -7),
    addDays(today, 400),
  );
  const paceCache = new Map<string, GoalPace>();
  const paceFor = (iso: string) => {
    const window = goalWindow(propertyId, iso);
    const cached = paceCache.get(window.start);
    if (cached) return cached;
    const next = window.start <= today ? pace : grossGoalSnapshot(propertyId, stays, window.start, blocks);
    paceCache.set(window.start, next);
    return next;
  };
  applyGoalPremium(nights, paceFor);
  applyFillPromotions(nights, booked, floor, paceFor);
  applyGapOffers(nights, taken, hostNetMedian, target, floor);
  const achieved = achievedHostNightly(stays, today);
  const priced = nights.filter((night) => night.listingHostNightly != null);
  const headline = priced.reduce((best, night) => {
    const rate = night.listingHostNightly ?? 0;
    return rate > (best?.listingHostNightly ?? 0) ? night : best;
  }, priced[0] ?? null);

  return {
    propertyId,
    house: house.name,
    from,
    to,
    openNightCount: nights.length,
    revenueGoal: {
      grossMeans: 'Host payout before mortgage, cleaning, and utilities. Not profit. Not the guest price.',
      target: pace.target,
      window: pace.label,
      booked: pace.booked,
      stillNeeded: pace.stillNeeded,
      openNightsLeft: pace.openNightsLeft,
      sellOutHostNightly: pace.sellOutHostNightly,
      askHostNightly: pace.sellOutHostNightly == null ? null : Math.round(pace.sellOutHostNightly * 1.2),
      askAirbnbListNightly:
        pace.sellOutHostNightly == null
          ? null
          : listPriceForHostNet(Math.round(pace.sellOutHostNightly * 1.2), AIRBNB_KEEP),
      askVrboListNightly:
        pace.sellOutHostNightly == null
          ? null
          : listPriceForHostNet(Math.round(pace.sellOutHostNightly * 1.2), VRBO_KEEP),
      sellOutMeans:
        'Host net if every remaining night sells at the bare goal. The base to publish is 20% above that. A 20% promotion is the fill price, not a new base.',
    },
    channelFees: {
      airbnb: '15.5% host-only fee on the nightly rate and the cleaning fee. List price is the host net divided by 0.845, rounded up.',
      vrbo: '5% commission plus 3% payment processing. List price is the host net divided by 0.92, rounded up.',
      directBook: 'No platform fee. directOfferHostNightly is the guest price.',
    },
    nights: nights.map(withChannelPrices),
    peakOpenNight: headline
      ? withChannelPrices({
          stance: headline.stance,
          listingHostNightly: headline.listingHostNightly,
          promotionHostNightly: headline.promotionHostNightly,
          date: headline.date,
          event: headline.event,
        })
      : null,
    why:
      nights.length === 0
        ? 'No open nights in this window. Leave booked nights at their current rate.'
        : nights.some((night) => night.stance === 'need-comps')
          ? 'No comp rates in this window. Add similar entire homes and refresh prices before a number goes on the calendar.'
          : nights.every((night) => night.stance === 'do-not-sell')
            ? 'River first stays are November 1, 2026. Leave every night before that unpublished.'
            : pace.stillNeeded > 0
              ? 'The base is 20% above the host net the year still needs. A 20% Airbnb and VRBO promotion fills a night that is inside 21 days, or a weekday once that Friday and Saturday are booked. The base itself does not come down.'
              : 'The year is already on the books. Hold the base. Do not run a promotion.',
    achievedHostNightlyLast90Days: achieved,
    compGuestMedian: market.compMedian || null,
    compHostNetMedian: hostNetMedian || null,
    snapshotCount: market.snapshotCount,
    targetMinNightly: target || null,
    carryingFloor: floor || null,
    carryingFloorMeans:
      propertyId === 'river'
        ? 'River premium floor: $1,500 host net. No night or promotion goes under it.'
        : floor > 0
        ? `Mortgage $${house.mortgage.toFixed(2)} / 30. Last-week floor only, not the asking rate.`
        : 'No mortgage on the books. Do not invent a floor.',
    publishWhere:
      'Type airbnbListNightly into Airbnb and vrboListNightly into VRBO. Apply promotionPercent to those listed prices on the soft dates. Do not type listingHostNightly into either site, and do not set the rate in Hospitable. directOfferHostNightly is only a past-guest /book request.',
    hostPayoutNote:
      'listingHostNightly is what we keep after the channel fee. airbnbListNightly and vrboListNightly are what the guest is charged for the night.',
  };
}
