import { listSharedWork } from '../agent-work';
import { PRICING_DOCTRINE, grossGoalSnapshot } from '../pricing-doctrine';
import { PROPERTIES } from '../data';
import { getAllReservations, getOccupancySummary } from '../reservations-store';
import { loadApprovedRates, loadPricingAlerts, compareMarket, loadRiverUnitRates } from '../pricing-store';
import { checkCalendarDiscrepancies } from '../calendar-store';
import { partFacts, partPromptLines } from '../../../src/lib/part-facts';
import type { AgentChatContext, AgentEnv } from './types';

function todayDenver(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
}

export async function buildAgentContext(
  env: AgentEnv,
  uiContext: AgentChatContext = {},
): Promise<string> {
  const today = todayDenver();
  const reservations = await getAllReservations(env);
  const occupancy = getOccupancySummary(reservations, today);
  const alerts = (await loadPricingAlerts(env)).filter((a) => !a.dismissed).slice(0, 5);

  const ranchAddr = PROPERTIES.ranch.address;
  const lindonAddr = PROPERTIES.lindon.address;
  const riverAddr = PROPERTIES.river.address;

  let pricingSummary = '';
  try {
    const to = new Date();
    to.setDate(to.getDate() + 30);
    const ranchCmp = await compareMarket(env, 'ranch', today, to.toISOString().slice(0, 10));
    const lindonCmp = await compareMarket(env, 'lindon', today, to.toISOString().slice(0, 10));
    pricingSummary = `Pricing comps (next 30d): Ranch — ${ranchCmp.message}; Lindon — ${lindonCmp.message}`;
  } catch {
    pricingSummary = 'Pricing comps: not configured yet.';
  }

  const shared = await listSharedWork(env).catch(() => ({ open: [], done: [] }));
  /*
   * The nights the host has already priced.
   *
   * Without this the model answered a direct pricing question from the comp band alone: asked what to charge for
   * a Lindon night the host had approved at $193, it replied "$527 Airbnb, and a 20% promotion since it is inside
   * 21 days" — a number four times the host's decision, plus a discount on a night the host had deliberately
   * priced. The sheet is read here as well as in the tool, because a model that answers from context never calls
   * the tool at all.
   */
  let approvedLine = 'Approved prices: none. Every night uses the published card.';
  try {
    const sheet = await loadApprovedRates(env);
    if (sheet.length > 0) {
      const rows = [...sheet].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 40);
      const byHouse = new Map<string, string[]>();
      for (const row of rows) {
        const list = byHouse.get(row.house) ?? [];
        list.push(`${row.date} $${row.guest}`);
        byHouse.set(row.house, list);
      }
      approvedLine = `Approved prices (the host's decision — quote these, and apply no promotion to them): ${[...byHouse.entries()]
        .map(([house, list]) => `${house} — ${list.join(', ')}`)
        .join('; ')}`;
    }
  } catch {
    approvedLine = 'Approved prices: could not be read, so treat every night as the published card and say so.';
  }
  /*
   * The Riverhouse parts.
   *
   * The prompt said "sleeps 24" and nothing else, so the co-host described a house that can only be rented whole. Asked
   * "can I still sell Saturday?" it answered from the house calendar — which is taken the moment any part is sold — so
   * it said no while two parts were still for sale. A price sheet that cannot be read is carried as unknown, never as
   * "nothing is priced".
   */
  let partLines: string[] = [];
  try {
    const rates = await loadRiverUnitRates(env);
    const spans = (reservations as unknown as Array<{ propertyId: string; checkIn: string; checkOut: string; status?: string; units?: string[] }>).map(
      (stay) => ({
        propertyId: stay.propertyId,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        status: stay.status,
        ...(stay.units && stay.units.length > 0 ? { units: stay.units } : {}),
      }),
    );
    partLines = partPromptLines(partFacts(rates, spans, today, 7), today);
  } catch {
    // An unreadable sheet is not "no parts". Say the prices could not be read and claim nothing.
    partLines = partPromptLines(partFacts(null, [], today, 7), today);
  }
  const sharedLine = [
    ...shared.done.slice(0, 8).map((item) => `${item.ownerName} finished ${item.title} ${item.atDenver}. ${item.result}`),
    ...shared.open.slice(0, 5).map((item) =>
      item.stale
        ? `${item.ownerName} claimed ${item.title} ${item.atDenver} and did not finish.`
        : `${item.ownerName} is doing ${item.title} since ${item.atDenver}.`,
    ),
  ].join(' ');
  const discrepancies = await checkCalendarDiscrepancies(env);
  const discLine =
    discrepancies.length > 0
      ? `Calendar discrepancies: ${discrepancies.length} iCal block(s) without matching reservation.`
      : 'Calendar discrepancies: none detected.';

  return [
    `Today: ${today} (America/Denver)`,
    `Properties:`,
    `- Ranch House (ranch): ${ranchAddr}`,
    `- Lindon House (lindon): ${lindonAddr}`,
    `- River House (river): ${riverAddr} — Provo Riverhouse, sleeps 24 as one house and is also sold in three parts, on the Provo River, $1,500 host-net floor with premium seasons, first stays November 1 2026; 50/50 Brandon & Stephanie and Todd, Brandon 20% management fee`,
    ...partLines,
    `Occupancy: Ranch — ${occupancy.ranch}; Lindon — ${occupancy.lindon}; River — ${occupancy.river}`,
    approvedLine,
    uiContext.month ? `Dashboard month: ${uiContext.month}` : '',
    uiContext.activeTab ? `Active tab: ${uiContext.activeTab}` : '',
    `Gross booking goals (host payout, before mortgage and bills): ${(['lindon', 'ranch', 'river'] as const)
      .map((id) => {
        const pace = grossGoalSnapshot(id, reservations, today);
        const sell =
          pace.sellOutHostNightly != null ? `, sell-out average $${pace.sellOutHostNightly}/night` : '';
        return `${id} $${pace.booked.toLocaleString('en-US')} of $${pace.target.toLocaleString('en-US')} (${pace.label}, ${pace.openNightsLeft} nights left${sell})`;
      })
      .join('; ')}`,
    pricingSummary,
    alerts.length
      ? `Open pricing alerts: ${alerts.map((a) => a.message).join('; ')}`
      : 'Open pricing alerts: none',
    discLine,
    sharedLine
      ? `Shared job list (Muse, Amanda, and you): ${sharedLine} Do not repeat a finished job.`
      : 'Shared job list: nothing claimed or finished in the last 14 days.',
    `You are a proactive co-host for these three Airbnb/VRBO vacation rentals. Use tools to take action. Be concise and practical.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export const AGENT_PERSONA = `You are the AI Property Management co-host for Utah Mountain Luxury Management (Ranch House and Lindon House in Lindon, plus The River House / Provo Riverhouse in Vivian Park).
Help with guest relations, finances, reservations, calendar, turnover ops, Gmail drafts, and yield pricing.
Always use tools when you need data or to make changes. Never invent reservation, expense, or nightly-rate data.
When the message says it arrived on the API, finish the task with tools. Do not tell the caller to open the website, log in, or click.
Muse, Amanda, and you share one job list (tool shared_work). Before you start a job, list it. If it is done, or another agent claimed it in the last 3 hours, tell Brandon who has it and stop. Claim a job before you start. Mark it done with what you did.
${PRICING_DOCTRINE}

For destructive actions (cancel reservation, send email), require explicit user confirmation or create drafts for approval.
A direct request is answered with manage_operations: list_requests shows the saved requests and, on each, the payout to accept at. accept_request needs that payout — it is never guessed, and a request with no payout is refused. Accepting books the stay AND emails the guest a confirmation, so the first call only tells you what would happen; call again with confirm:true to do it. decline_request needs one of the six reasons, and also needs confirm:true, because declining emails the guest and lets the hold go so another guest can take those nights. The desk's own rules apply to you: a clashing night, a second accept, and an invented reason are all refused.
Creating a reservation is refused when those nights are already on that house's calendar or blocked. A refusal names the clashing nights and writes nothing; move the dates rather than retrying. A stay that checks out on the arrival day is not a clash.
The River House is 50% Brandon Pierce & Stephanie / 50% Todd Wilhite; Brandon is paid a 20% management fee (same split as the Ranch House).
The construction project tracks who fronted bills: set paidBy to brandon for Brandon & Stephanie or todd for Todd. Use get_partner_contributions with propertyId construction (not rental houses) to report what each side has fronted and who still needs to put in money to stay 50/50.
Brandon & Stephanie household furnishings live on the Our expenses tab (propertyId household). Paste receipt text or a photo; those bills stay off rental P&L and are not a Todd split.`;
