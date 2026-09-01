import { calculateMetrics, isExpenseProperty, PROPERTIES } from '../data';
import { mergeAllExpenses, saveCustomExpenses, loadCustomExpenses, newExpenseId } from '../expenses';
import { parsePaidBy, summarizePartnerContributions, tracksPartnerContributions } from '../paid-by';
import { parseConstructionStage } from '../construction/types';
import { loadExtraCleaningFees } from '../kv';
import {
  getAllReservations,
  filterReservations,
  createReservation,
  updateReservationStatus,
} from '../reservations-store';
import {
  loadCalendarBlocks,
  addCalendarBlock,
  syncIcalAndReservations,
  findCalendarGaps,
  checkCalendarDiscrepancies,
  loadIcalFeeds,
  saveIcalFeeds,
} from '../calendar-store';
import {
  loadOpsTasks,
  createOpsTask,
  loadPropertyConfig,
  draftGuestCheckInMessage,
  draftCleanerNotification,
  createEmailDraft,
} from '../operations-store';
import { gmailSearch, gmailCreateDraft, loadGmailTokens } from '../gmail-store';
import {
  loadCompSet,
  addCompListing,
  refreshCompPrices,
  compareMarket,
  loadPricingAlerts,
  addPriceSnapshot,
  dismissPricingAlert,
  runPricingAlertCheck,
} from '../pricing-store';
import type { AgentEnv, PropertyId, ToolStep } from './types';

export async function executeAgentTool(
  env: AgentEnv,
  name: string,
  args: Record<string, unknown>,
): Promise<{ result: Record<string, unknown>; step: ToolStep }> {
  const action = String(args.action ?? '');

  switch (name) {
    case 'manage_finances':
      return { result: await handleFinances(env, action, args), step: step(name, action) };
    case 'manage_reservations':
      return { result: await handleReservations(env, action, args), step: step(name, action) };
    case 'manage_calendar':
      return { result: await handleCalendar(env, action, args), step: step(name, action) };
    case 'manage_operations':
      return { result: await handleOperations(env, action, args), step: step(name, action) };
    case 'gmail_service':
      return { result: await handleGmail(env, action, args), step: step(name, action) };
    case 'manage_pricing':
      return { result: await handlePricing(env, action, args), step: step(name, action) };
    default:
      return {
        result: { error: `Unknown tool: ${name}` },
        step: { tool: name, action, summary: 'Unknown tool' },
      };
  }
}

function step(tool: string, action: string): ToolStep {
  const labels: Record<string, string> = {
    log_expense: 'Logging expense',
    list_expenses: 'Listing expenses',
    get_profit_summary: 'Calculating profit',
    get_partner_contributions: 'Checking partner contributions',
    list: 'Checking reservations',
    get: 'Fetching reservation',
    create: 'Creating reservation',
    update_status: 'Updating reservation',
    create_block: 'Creating block',
    sync_ical: 'Syncing iCal feeds',
    find_gaps: 'Finding calendar gaps',
    check_discrepancies: 'Checking calendar discrepancies',
    refresh_comp_prices: 'Refreshing comp prices',
    compare_market: 'Comparing market rates',
    draft_guest_message: 'Drafting guest message',
    notify_cleaner: 'Drafting cleaner notification',
    search: 'Searching Gmail',
    draft_reply: 'Creating email draft',
  };
  return { tool, action, summary: labels[action] ?? `${tool}.${action}` };
}

async function handleFinances(
  env: AgentEnv,
  action: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const fees = await loadExtraCleaningFees(env);
  const allExpenses = await mergeAllExpenses(env);
  const reservations = await getAllReservations(env);

  if (action === 'log_expense') {
    const propertyIdRaw = String(args.propertyId ?? '');
    if (!isExpenseProperty(propertyIdRaw)) {
      return { error: 'propertyId must be ranch, lindon, river, construction, or household' };
    }
    const month = String(args.month ?? new Date().toISOString().slice(0, 7));
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: 'propertyId and positive amount required' };
    }
    const paidBy = parsePaidBy(args.paidBy);
    const item = {
      id: newExpenseId(),
      propertyId: propertyIdRaw,
      month,
      category: String(args.category ?? (propertyIdRaw === 'household' ? 'Furnishings' : 'Other')),
      amount,
      vendor: args.vendor ? String(args.vendor) : undefined,
      note: args.note ? String(args.note) : undefined,
      stage: parseConstructionStage(args.stage),
      paidBy:
        propertyIdRaw === 'household'
          ? 'brandon'
          : tracksPartnerContributions(propertyIdRaw)
            ? (paidBy ?? 'brandon')
            : paidBy,
      createdAt: new Date().toISOString(),
    };
    const custom = await loadCustomExpenses(env);
    custom.push(item);
    await saveCustomExpenses(env, custom);
    return { ok: true, expense: item };
  }

  if (action === 'list_expenses') {
    const propertyId = args.propertyId as PropertyId | undefined;
    const month = args.month ? String(args.month) : undefined;
    const paidBy = parsePaidBy(args.paidBy);
    const list = allExpenses.filter((e) => {
      if (propertyId && e.propertyId !== propertyId) return false;
      if (month && e.month !== month) return false;
      if (paidBy && e.paidBy !== paidBy) return false;
      if (e.category === 'Mortgage') return false;
      return true;
    });
    return { expenses: list.slice(0, 50), count: list.length };
  }

  if (action === 'get_partner_contributions') {
    const propertyId = String(args.propertyId ?? 'construction');
    if (!tracksPartnerContributions(propertyId)) {
      return { error: 'Partner contributions are tracked on the construction project only' };
    }
    const month = args.month ? String(args.month) : undefined;
    const summary = summarizePartnerContributions(allExpenses, propertyId, month);
    return {
      propertyId,
      month: month ?? 'all-time',
      labels: { brandon: 'Brandon & Stephanie', todd: 'Todd' },
      ...summary,
    };
  }

  if (action === 'get_profit_summary') {
    const start = String(args.startMonth ?? args.month ?? new Date().toISOString().slice(0, 7));
    const end = String(args.endMonth ?? start);
    const months: string[] = [];
    let [y, m] = start.split('-').map(Number);
    const [ey, em] = end.split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
      months.push(`${y}-${String(m).padStart(2, '0')}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    let totalRevenue = 0;
    let totalProfit = 0;
    const byProperty: Record<string, { revenue: number; profit: number }> = {};
    for (const month of months) {
      for (const pid of ['ranch', 'lindon', 'river'] as PropertyId[]) {
        const metrics = calculateMetrics(pid, month, fees, allExpenses, reservations);
        totalRevenue += metrics.revenue;
        totalProfit += metrics.profit;
        byProperty[pid] = byProperty[pid] ?? { revenue: 0, profit: 0 };
        byProperty[pid]!.revenue += metrics.revenue;
        byProperty[pid]!.profit += metrics.profit;
      }
    }
    return { startMonth: start, endMonth: end, totalRevenue, totalProfit, byProperty, months };
  }

  return { error: `Unknown action: ${action}` };
}

async function handleReservations(
  env: AgentEnv,
  action: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const all = await getAllReservations(env);

  if (action === 'list') {
    const list = filterReservations(all, {
      propertyId: args.propertyId as PropertyId | undefined,
      when: args.when as 'upcoming' | 'current' | 'past' | 'checkout_today' | undefined,
    });
    return { reservations: list.slice(0, 30), count: list.length };
  }

  if (action === 'get') {
    const id = String(args.id ?? '');
    const r = all.find((x) => x.id === id);
    return r ? { reservation: r } : { error: 'Not found' };
  }

  if (action === 'create') {
    const item = await createReservation(env, {
      guestName: String(args.guestName ?? 'Guest'),
      propertyId: args.propertyId as PropertyId,
      checkIn: String(args.checkIn),
      checkOut: String(args.checkOut),
      payout: Number(args.payout ?? 0),
      source: String(args.source ?? 'Direct'),
      note: args.note ? String(args.note) : undefined,
      status: 'confirmed',
    });
    return { ok: true, reservation: item };
  }

  if (action === 'update_status') {
    if (args.status === 'cancelled' && !args.confirm) {
      return { pendingApproval: true, message: 'Confirm cancellation with confirm:true' };
    }
    const updated = await updateReservationStatus(
      env,
      String(args.id),
      args.status as 'confirmed' | 'cancelled' | 'blocked' | 'pending',
    );
    return updated ? { ok: true, reservation: updated } : { error: 'Not found' };
  }

  if (action === 'create_block') {
    const item = await createReservation(env, {
      guestName: args.note ? String(args.note) : 'Blocked',
      propertyId: args.propertyId as PropertyId,
      checkIn: String(args.checkIn),
      checkOut: String(args.checkOut),
      payout: 0,
      source: 'Block',
      status: 'blocked',
      note: args.note ? String(args.note) : undefined,
    });
    return { ok: true, block: item };
  }

  return { error: `Unknown action: ${action}` };
}

async function handleCalendar(
  env: AgentEnv,
  action: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (action === 'list_blocks') {
    const blocks = await loadCalendarBlocks(env);
    const propertyId = args.propertyId as PropertyId | undefined;
    return { blocks: propertyId ? blocks.filter((b) => b.propertyId === propertyId) : blocks };
  }

  if (action === 'create_block') {
    const block = await addCalendarBlock(env, {
      propertyId: args.propertyId as PropertyId,
      start: String(args.start),
      end: String(args.end),
      type: (args.type as 'maintenance' | 'owner' | 'blocked') ?? 'blocked',
      note: args.note ? String(args.note) : undefined,
    });
    return { ok: true, block };
  }

  if (action === 'set_ical_feed') {
    const feeds = await loadIcalFeeds(env);
    const propertyId = args.propertyId as PropertyId;
    if (propertyId && args.icalUrl) {
      feeds[propertyId] = String(args.icalUrl);
      await saveIcalFeeds(env, feeds);
    }
    return { ok: true, feeds };
  }

  if (action === 'sync_ical') {
    const result = await syncIcalAndReservations(env);
    return {
      ok: true,
      eventCount: result.events.length,
      fetchedAt: result.fetchedAt,
      reservationSync: result.reservationSync,
      discrepancyCount: result.discrepancies.length,
    };
  }

  if (action === 'find_gaps') {
    const reservations = await getAllReservations(env);
    const blocks = await loadCalendarBlocks(env);
    const from = String(args.from ?? new Date().toISOString().slice(0, 10));
    const toDate = new Date(from);
    toDate.setDate(toDate.getDate() + 60);
    const to = String(args.to ?? toDate.toISOString().slice(0, 10));
    const propertyId = (args.propertyId as PropertyId) ?? 'ranch';
    const gaps = findCalendarGaps(reservations, blocks, propertyId, from, to);
    return { propertyId, from, to, gaps };
  }

  if (action === 'check_discrepancies') {
    const issues = await checkCalendarDiscrepancies(env);
    return { count: issues.length, issues };
  }

  return { error: `Unknown action: ${action}` };
}

async function handleOperations(
  env: AgentEnv,
  action: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const config = await loadPropertyConfig(env);

  if (action === 'list_tasks') {
    const tasks = await loadOpsTasks(env);
    const propertyId = args.propertyId as PropertyId | undefined;
    return { tasks: propertyId ? tasks.filter((t) => t.propertyId === propertyId) : tasks };
  }

  if (action === 'create_cleaning_task') {
    const task = await createOpsTask(env, {
      propertyId: args.propertyId as PropertyId,
      reservationId: args.reservationId ? String(args.reservationId) : undefined,
      dueDate: String(args.dueDate ?? new Date().toISOString().slice(0, 10)),
      type: 'cleaning',
      notes: args.notes ? String(args.notes) : undefined,
    });
    return { ok: true, task };
  }

  if (action === 'draft_guest_message') {
    const propertyId = args.propertyId as PropertyId;
    const prop = PROPERTIES[propertyId];
    const body = draftGuestCheckInMessage(
      String(args.guestName ?? 'Guest'),
      prop.name,
      String(args.checkIn ?? ''),
      config[propertyId],
      args.lockCode ? String(args.lockCode) : '****',
    );
    const draft = await createEmailDraft(env, {
      subject: `Check-in info — ${prop.name}`,
      body,
    });
    return { ok: true, draft, message: body };
  }

  if (action === 'notify_cleaner') {
    const propertyId = args.propertyId as PropertyId;
    const prop = PROPERTIES[propertyId];
    const body = draftCleanerNotification(
      prop.name,
      String(args.dueDate ?? new Date().toISOString().slice(0, 10)),
      config[propertyId],
    );
    const draft = await createEmailDraft(env, {
      subject: `Cleaning turnover — ${prop.name}`,
      body,
    });
    return { ok: true, draft, notification: body };
  }

  return { error: `Unknown action: ${action}` };
}

async function handleGmail(
  env: AgentEnv,
  action: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (action === 'status') {
    const tokens = await loadGmailTokens(env);
    return { connected: Boolean(tokens?.email), email: tokens?.email ?? null };
  }

  if (action === 'search') {
    const messages = await gmailSearch(env, String(args.query ?? ''), 5);
    return { messages };
  }

  if (action === 'draft_reply') {
    const result = await gmailCreateDraft(
      env,
      String(args.to ?? ''),
      String(args.subject ?? 'Reply'),
      String(args.body ?? ''),
    );
    return result;
  }

  return { error: `Unknown action: ${action}` };
}

async function handlePricing(
  env: AgentEnv,
  action: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (action === 'list_comp_set') {
    return { comps: await loadCompSet(env) };
  }

  if (action === 'add_comp') {
    const comp = await addCompListing(env, {
      platform: args.platform as 'airbnb' | 'vrbo',
      url: String(args.url),
      label: String(args.label ?? 'Comp'),
      propertyId: args.propertyId as PropertyId | undefined,
    });
    return { ok: true, comp };
  }

  if (action === 'refresh_comp_prices') {
    const result = await refreshCompPrices(env, env.GEMINI_API_KEY);
    await runPricingAlertCheck(env);
    return result;
  }

  if (action === 'compare_market') {
    const propertyId = args.propertyId as PropertyId;
    const from = String(args.from ?? new Date().toISOString().slice(0, 10));
    const toDate = new Date(from);
    toDate.setDate(toDate.getDate() + 14);
    const to = String(args.to ?? toDate.toISOString().slice(0, 10));
    return compareMarket(env, propertyId, from, to);
  }

  if (action === 'get_pricing_alerts') {
    const alerts = (await loadPricingAlerts(env)).filter((a) => !a.dismissed);
    return { alerts };
  }

  if (action === 'record_manual_snapshot') {
    const snap = await addPriceSnapshot(env, {
      compId: String(args.compId),
      date: String(args.date ?? new Date().toISOString().slice(0, 10)),
      nightlyRate: Number(args.nightlyRate),
      source: 'manual',
    });
    return { ok: true, snapshot: snap };
  }

  if (action === 'suggest_rate_adjustment') {
    const propertyId = args.propertyId as PropertyId;
    const from = String(args.from ?? new Date().toISOString().slice(0, 10));
    const toDate = new Date(from);
    toDate.setDate(toDate.getDate() + 14);
    const cmp = await compareMarket(env, propertyId, from, toDate.toISOString().slice(0, 10));
    return {
      propertyId,
      ...cmp,
      recommendation:
        cmp.compMedian > 0
          ? `Review rates for ${propertyId} against comp median $${cmp.compMedian.toFixed(0)}/night. Adjust in Airbnb/VRBO host dashboard.`
          : 'Add comp listings and refresh prices first.',
    };
  }

  if (action === 'dismiss_alert' && args.id) {
    await dismissPricingAlert(env, String(args.id));
    return { ok: true };
  }

  return { error: `Unknown action: ${action}` };
}
