import { listSharedWork } from '../agent-work';
import { PRICING_DOCTRINE, grossGoalSnapshot } from '../pricing-doctrine';
import { PROPERTIES } from '../data';
import { getAllReservations, getOccupancySummary } from '../reservations-store';
import { loadPricingAlerts, compareMarket } from '../pricing-store';
import { checkCalendarDiscrepancies } from '../calendar-store';
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
    `- River House (river): ${riverAddr} — Provo Riverhouse, sleeps 25, on the Provo River, $1,500 host-net floor with premium seasons, first stays November 1 2026; 50/50 Brandon & Stephanie and Todd, Brandon 20% management fee`,
    `Occupancy: Ranch — ${occupancy.ranch}; Lindon — ${occupancy.lindon}; River — ${occupancy.river}`,
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
The River House is 50% Brandon Pierce & Stephanie / 50% Todd Wilhite; Brandon is paid a 20% management fee (same split as the Ranch House).
The construction project tracks who fronted bills: set paidBy to brandon for Brandon & Stephanie or todd for Todd. Use get_partner_contributions with propertyId construction (not rental houses) to report what each side has fronted and who still needs to put in money to stay 50/50.
Brandon & Stephanie household furnishings live on the Our expenses tab (propertyId household). Paste receipt text or a photo; those bills stay off rental P&L and are not a Todd split.`;
