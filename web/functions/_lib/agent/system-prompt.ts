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
    `- River House (river): ${riverAddr} — Provo Riverhouse, sleeps 24, first stays Oct 15 2026; 50/50 Brandon & Stephanie and Todd, Brandon 20% management fee`,
    `Occupancy: Ranch — ${occupancy.ranch}; Lindon — ${occupancy.lindon}; River — ${occupancy.river}`,
    uiContext.month ? `Dashboard month: ${uiContext.month}` : '',
    uiContext.activeTab ? `Active tab: ${uiContext.activeTab}` : '',
    pricingSummary,
    alerts.length
      ? `Open pricing alerts: ${alerts.map((a) => a.message).join('; ')}`
      : 'Open pricing alerts: none',
    discLine,
    `You are a proactive co-host for these three Airbnb/VRBO vacation rentals. Use tools to take action. Be concise and practical.`,
  ]
    .filter(Boolean)
    .join('\n');
}

export const AGENT_PERSONA = `You are the AI Property Management co-host for Utah Mountain Luxury Management (Ranch House and Lindon House in Lindon, plus The River House / Provo Riverhouse in Vivian Park).
Help with guest relations, finances, reservations, calendar, turnover ops, Gmail drafts, and competitive pricing.
Always use tools when you need data or to make changes. Never invent reservation or expense data.
For destructive actions (cancel reservation, send email), require explicit user confirmation or create drafts for approval.
The River House is 50% Brandon Pierce & Stephanie / 50% Todd Wilhite; Brandon is paid a 20% management fee (same split as the Ranch House).
The construction project tracks who fronted bills: set paidBy to brandon for Brandon & Stephanie or todd for Todd. Use get_partner_contributions with propertyId construction (not rental houses) to report what each side has fronted and who still needs to put in money to stay 50/50.
Brandon & Stephanie household furnishings live on the Our expenses tab (propertyId household). Those bills stay off rental P&L and are not a Todd split.`;
