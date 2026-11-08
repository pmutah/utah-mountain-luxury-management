import { calculateMetrics, isExpenseProperty, PROPERTIES } from '../data';
import { mergeAllExpenses, saveCustomExpenses, loadCustomExpenses, newExpenseId } from '../expenses';
import { parsePaidBy, summarizePartnerContributions, tracksPartnerContributions } from '../paid-by';
import { parseConstructionStage } from '../construction/types';
import { loadExtraCleaningFees } from '../kv';
import { kvGet, storageReadPaused } from '../kv-json';
import { authCookieHeader } from '../auth';
import { occupiedNights } from '../../../src/lib/availability';
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
import { buildYieldPlan, suggestRateAdjustment } from '../pricing-doctrine';
import { annotateYieldPlan, applySharedWork, type WorkOwner } from '../agent-work';
import type { AgentEnv, PropertyId, ToolStep } from './types';
import { bookingInbox } from '../../../src/lib/booking-inbox';
import { suggestedPayoutLine, suggestedPayouts } from '../../../src/lib/payout-suggest';
import { isDeclineReason } from '../../../src/lib/booking-decline';
import { denverToday } from '../../../src/lib/market/dates';
import { isCompHouse } from '../../../src/lib/market/comp-house';
import type { StaySpan } from '../../../src/lib/availability';
import { onRequestPost as acceptRoute } from '../../api/book/accept';
import { onRequestPost as declineRoute } from '../../api/book/decline';

export async function executeAgentTool(
  env: AgentEnv,
  name: string,
  args: Record<string, unknown>,
  actor: WorkOwner = 'co-host',
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
    case 'shared_work': {
      const result = await applySharedWork(env, actor, args);
      return { result, step: { tool: name, action, summary: String(result.summary ?? result.error ?? 'Shared work') } };
    }
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
  /*
   * The cleaning fees are read up front, and a store at its read limit now raises instead of quietly
   * returning defaults. An unhandled throw here would end the whole chat turn, so it becomes a result
   * the agent can read and report.
   */
  let fees;
  try {
    fees = await loadExtraCleaningFees(env);
  } catch (err) {
    if (storageReadPaused(err)) {
      return {
        error:
          'Saved fees and expenses could not be read just now, so no figure is reported. Nothing was written over them. Try again shortly.',
        refused: true,
      };
    }
    throw err;
  }
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
    /*
     * Mortgage rows used to be dropped here, silently, and `count` described the filtered list as
     * though it were the whole month. Asked "what are the Ranch House expenses for November 2026", the
     * agent summed the cleaning row, answered **$350**, and the mortgage's $3,133.36 was never in front
     * of it. The books hold $3,483.36 for that month.
     *
     * A tool that withholds rows from a total is not a filter, it is a wrong answer waiting to happen.
     * Everything is returned now, and the mortgage is flagged so the model can talk about it separately
     * if it wants to — a mortgage is a real cash cost and the biggest line on most months.
     */
    const list = allExpenses.filter((e) => {
      if (propertyId && e.propertyId !== propertyId) return false;
      if (month && e.month !== month) return false;
      if (paidBy && e.paidBy !== paidBy) return false;
      return true;
    });
    const total = list.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    return {
      expenses: list.slice(0, 50),
      count: list.length,
      /** The sum of every row returned above, so a total never depends on the model adding up. */
      total: Math.round(total * 100) / 100,
      /** Said explicitly, because these rows are the ones that used to vanish. */
      mortgageIncluded: list.some((e) => e.category === 'Mortgage'),
      ...(list.length > 50 ? { truncated: true, note: `Showing the first 50 of ${list.length} rows; total covers all ${list.length}.` } : {}),
    };
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
    /*
     * The owner share is computed by `calculateMetrics` and returned here, because the model cannot be
     * trusted to derive it. Asked for Todd's share on the Ranch, the agent took the house profit and
     * applied "20% fee then 50/50" to *it* — `$5,288.72 × 0.8 × 0.5 = $2,115.49`. The real figure is
     * **−$3,090.13**, a $5,205 error, because the fee is taken off revenue *before* cleaning and the
     * mortgage is subtracted after. Arithmetic that looks reasonable is worse than none.
     */
    const owner: Record<string, { todd: number | null; brandon: number | null; mgtFee: number | null }> = {};
    for (const month of months) {
      for (const pid of ['ranch', 'lindon', 'river'] as PropertyId[]) {
        const metrics = calculateMetrics(pid, month, fees, allExpenses, reservations);
        totalRevenue += metrics.revenue;
        totalProfit += metrics.profit;
        byProperty[pid] = byProperty[pid] ?? { revenue: 0, profit: 0 };
        byProperty[pid]!.revenue += metrics.revenue;
        byProperty[pid]!.profit += metrics.profit;
        // A house with no split has `dist: null`; that is reported as null, not as zero money.
        owner[pid] = owner[pid] ?? { todd: null, brandon: null, mgtFee: null };
        if (metrics.dist) {
          owner[pid]!.todd = Math.round(((owner[pid]!.todd ?? 0) + metrics.dist.todd) * 100) / 100;
          owner[pid]!.brandon = Math.round(((owner[pid]!.brandon ?? 0) + metrics.dist.brandon) * 100) / 100;
          owner[pid]!.mgtFee = Math.round(((owner[pid]!.mgtFee ?? 0) + metrics.dist.mgtFee) * 100) / 100;
        }
      }
    }
    /*
     * `profit` here is the **house's** profit: revenue minus mortgage, cleaning, and operating costs.
     * It is not what a partner takes home. On the Ranch, 2026 year-to-date sums to `totalProfit`
     * +$5,288.72 while Todd's statement shows **−$3,090.13**, because the owner share is struck after the
     * 20% management fee and then split 50/50.
     *
     * Both are correct and they answer different questions. Returned bare, "profit $5,288.72" reads as
     * "what I made", which is the wrong number for a partner by $8,378.96. The response now names which
     * one it is and carries the owner split beside it, so the model does not have to guess.
     */
    return {
      startMonth: start,
      endMonth: end,
      totalRevenue,
      totalProfit,
      byProperty,
      months,
      /** The owner share, computed here so it is never derived by the model. */
      ownerShare: owner,
      /** What these figures are, and what they are not. */
      basis:
        'totalProfit is the house profit: revenue minus mortgage, cleaning, and operating costs. It is not a partner share. ownerShare carries the real partner split — 20% management fee off revenue less cleaning, then the mortgage and operating costs come out, then what remains is halved.',
      ownerSplitNote:
        'Ranch and River: 20% management fee to Brandon, then 50/50 Todd vs Brandon & Stephanie. Lindon is Brandon only, so its ownerShare is null. Quote ownerShare for a partner question; never multiply totalProfit by 0.8 and halve it, which is a different and smaller number.',
    };
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
    /*
     * A create from the agent used to save a confirmed stay with no clash check at all, so it could
     * double-book a house that the human accept path would refuse. The calendar is the authority, so
     * overlapping nights on that house are refused here too.
     */
    const propertyId = args.propertyId as PropertyId;
    const checkIn = String(args.checkIn ?? '');
    const checkOut = String(args.checkOut ?? '');
    const blocks = await loadCalendarBlocks(env).catch(() => []);
    const clash = occupiedNights(
      [
        ...all.map((stay) => ({
          propertyId: stay.propertyId,
          checkIn: stay.checkIn,
          checkOut: stay.checkOut,
          status: stay.status,
        })),
        ...blocks.map((block) => ({
          propertyId: block.propertyId,
          checkIn: block.start,
          checkOut: block.end,
          status: 'blocked',
        })),
      ],
      propertyId,
      checkIn,
      checkOut,
    );
    if (clash.length > 0) {
      return {
        error: `Those nights are already on the calendar at that house: ${clash.slice(0, 5).join(', ')}. Nothing was booked.`,
        refused: true,
        nights: clash,
      };
    }
    const item = await createReservation(env, {
      guestName: String(args.guestName ?? 'Guest'),
      propertyId,
      checkIn,
      checkOut,
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

/**
 * Run a real desk route on the agent's behalf and hand back its answer as a tool result.
 *
 * The alternative — reimplementing accept and decline inside the tool — would let the agent's rules
 * drift from the desk's, and a host would see two different answers to the same request. This way
 * every refusal a person gets, the agent gets too.
 *
 * The desk routes are host-only, so the call carries the host cookie the agent is acting as. Without
 * it every accept would be refused 401, and the tool would look present and do nothing. The cookie is
 * built from the deployment's own password, never from the caller, so the agent gets exactly the
 * host's authority and no more. When no password is set there is no cookie, the route refuses, and
 * that refusal is reported rather than hidden.
 */
async function deskCall(
  route: (context: never) => Response | Promise<Response>,
  env: AgentEnv,
  body: Record<string, unknown>,
  what: 'accept' | 'decline',
): Promise<Record<string, unknown>> {
  const password = typeof (env as { DASHBOARD_PASSWORD?: string }).DASHBOARD_PASSWORD === 'string'
    ? (env as { DASHBOARD_PASSWORD?: string }).DASHBOARD_PASSWORD
    : '';
  const cookie = password ? authCookieHeader(password, 'Strict').split(';')[0]! : '';
  const res = await route({
    request: new Request(`https://internal/api/book/${what}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
    env,
    params: {},
  } as never);
  const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    return {
      refused: true,
      status: res.status,
      error: String(payload?.error ?? `The ${what} was refused.`),
    };
  }
  // The route's answer is already free of prices on the guest side; the desk side carries them.
  return { ok: true, ...(payload ?? {}) };
}

async function handleOperations(
  env: AgentEnv,
  action: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const config = await loadPropertyConfig(env);

  /*
   * The direct booking desk. The Co-host could create a stay directly but could not see or answer a
   * saved request, which is the job a person actually does here. These three actions reuse the same
   * inbox, accept, and decline code the desk runs on, so the agent cannot do anything a host could
   * not, and every refusal the desk gives applies to it too.
   */
  if (action === 'list_requests') {
    const requests = await kvGet<Array<Record<string, unknown>>>(env, 'booking-requests', []);
    const stays = await getAllReservations(env);
    const blocks = await loadCalendarBlocks(env);
    const spans: StaySpan[] = [
      ...stays.map((stay) => ({
        propertyId: stay.propertyId,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        status: stay.status,
      })),
      ...blocks.map((block) => ({
        propertyId: block.propertyId,
        checkIn: block.start,
        checkOut: block.end,
        status: 'blocked',
      })),
    ];
    const taken: Partial<Record<'ranch' | 'lindon' | 'river', readonly string[]>> = {};
    for (const house of ['river', 'ranch', 'lindon'] as const) {
      taken[house] = occupiedNights(spans, house, denverToday(), '2099-12-31');
    }
    const rows = bookingInbox(requests as never, taken, denverToday());
    const accepted = new Set(
      stays.map((stay) => (stay.note ?? '').match(/Direct request (\S+)\./)?.[1]).filter((id): id is string => Boolean(id)),
    );
    return {
      requests: rows.map((row) => {
        const saved = requests.find((item) => item.id === row.id);
        const payouts = saved
          ? suggestedPayouts({
              propertyId: saved.propertyId as string,
              ...(typeof saved.alsoPropertyId === 'string' ? { alsoPropertyId: saved.alsoPropertyId } : {}),
              checkIn: String(saved.checkIn ?? ''),
              checkOut: String(saved.checkOut ?? ''),
              ...(typeof saved.guests === 'number' ? { guests: saved.guests } : {}),
              ...(typeof saved.children === 'number' ? { children: saved.children } : {}),
            })
          : [];
        return {
          id: row.id,
          line: row.line,
          taken: row.taken,
          accepted: accepted.has(row.id),
          /** What to accept it for. Empty when the stay cannot be priced. */
          payout: payouts.reduce((sum, entry) => sum + entry.hostNet, 0) || null,
          payoutLine: suggestedPayoutLine(payouts),
        };
      }),
    };
  }

  if (action === 'accept_request') {
    /*
     * A payout is required here and is never invented. The request line names one; an agent that has
     * not read it gets a refusal telling it to list the requests first, rather than a booking at zero.
     *
     * Accepting is also the one action here that writes a booking AND emails the guest a confirmation.
     * The desk route sends that mail itself, so a mistake reaches a real person before anyone sees it.
     * The agent therefore has to confirm, the same way a cancellation does: one call to see what would
     * happen, a second to do it.
     *
     * The real desk route does the work, so every refusal it gives a person applies to the agent too:
     * a clashing night, a second accept, a bad payout. The agent cannot do more than a host.
     */
    const requestId = String(args.requestId ?? '').trim();
    const payout = Number(args.payout);
    if (!requestId) return { error: 'Name the request to accept: requestId.' };
    if (!Number.isFinite(payout) || payout <= 0) {
      return {
        error:
          'A host payout above zero is required. Call list_requests first and copy the payout from the request line. Nothing was booked.',
        refused: true,
      };
    }
    if (args.confirm !== true) {
      return {
        pendingApproval: true,
        message:
          'Accepting books the stay and emails the guest a confirmation. Nothing has been done yet. Call again with confirm:true to accept.',
        requestId,
        payout,
      };
    }
    return deskCall(acceptRoute, env, { id: requestId, payout }, 'accept');
  }

  if (action === 'decline_request') {
    /*
     * Declining also emails the guest and lets the hold go, so the dates can be taken by someone else
     * before anyone notices. It gets the same confirm gate as accepting: one call to see what would
     * happen, a second to do it.
     */
    const requestId = String(args.requestId ?? '').trim();
    const reason = String(args.reason ?? '').trim();
    if (!requestId) return { error: 'Name the request to decline: requestId.' };
    if (!isDeclineReason(reason)) {
      return {
        error:
          'Name a reason: dates-taken, too-many-guests, minimum-stay, maintenance, owner-stay, or other.',
        refused: true,
      };
    }
    if (args.confirm !== true) {
      return {
        pendingApproval: true,
        message:
          'Declining emails the guest that the dates are not available and lets the hold go, so another guest can take those nights. Nothing has been done yet. Call again with confirm:true to decline.',
        requestId,
        reason,
      };
    }
    return deskCall(
      declineRoute,
      env,
      { id: requestId, reason, ...(args.notes ? { note: String(args.notes) } : {}) },
      'decline',
    );
  }

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
    /*
     * A comp is only usable when it names a house and carries the two facts the band compares:
     * how many it sleeps and how far it sits. This handler used to pass only the URL and a label,
     * so every comp the agent added was house-less and had no size or distance — it could never
     * enter a band, and a house-less comp also used to count for every house. Refusing here means
     * the agent is told what is missing instead of quietly saving a comp that prices nothing.
     */
    const propertyId = String(args.propertyId ?? '');
    if (!isCompHouse(propertyId)) {
      return { ok: false, error: 'Choose the house this comp competes with: ranch, lindon, river, or both.' };
    }
    const sleeps = Number(args.sleeps);
    const distanceMi = Number(args.distanceMi);
    if (!Number.isInteger(sleeps) || sleeps < 1) {
      return { ok: false, error: 'Say how many guests the comp sleeps. The rate band cannot use it without that.' };
    }
    if (!Number.isFinite(distanceMi) || distanceMi < 0) {
      return { ok: false, error: 'Say how many miles the comp sits from our house.' };
    }
    const comp = await addCompListing(env, {
      platform: args.platform === 'vrbo' ? 'vrbo' : 'airbnb',
      url: String(args.url),
      label: String(args.label ?? 'Comp'),
      propertyId,
      sleeps,
      distanceMi,
      ...(args.area ? { area: String(args.area) } : {}),
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
    const propertyId = (args.propertyId as PropertyId) || 'ranch';
    return suggestRateAdjustment(
      env,
      propertyId,
      args.from ? String(args.from) : undefined,
      args.to ? String(args.to) : undefined,
    );
  }

  if (action === 'yield_plan') {
    const days = Math.min(365, Math.max(14, Number(args.days) || 90));
    return annotateYieldPlan(env, await buildYieldPlan(env, days));
  }

  if (action === 'dismiss_alert' && args.id) {
    await dismissPricingAlert(env, String(args.id));
    return { ok: true };
  }

  return { error: `Unknown action: ${action}` };
}
