/**
 * The REST routes a bot can call with its bearer. This is the source the OpenAPI spec, the agent
 * map, and `/llms.txt` all describe, so a route that exists here is discoverable in one place.
 *
 * Keep this list honest: a route that is not in it will not appear in the spec, and a bot that reads
 * only the spec will never call it.
 */
export type BotRoute = {
  path: string;
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  operationId: string;
  summary: string;
  /** True when the response can change a rate, a booking, or money. Most routes are false. */
  writes: boolean;
  /** True when the route is reachable without a bearer, usually a token in the path. */
  public?: boolean;
  /** The path parameter name, when the route takes one. */
  param?: string;
  /** A short note an agent needs before calling it. */
  note?: string;
};

const ok = { '200': { description: 'OK' } };
const guarded = {
  '200': { description: 'OK' },
  '401': { description: 'Missing or wrong bearer, or no dashboard password configured' },
};
const written = {
  '200': { description: 'OK' },
  '201': { description: 'Created' },
  '400': { description: 'The request was refused; the error says why' },
  '401': { description: 'Missing or wrong bearer, or no dashboard password configured' },
  '409': { description: 'Refused because of a current state, such as a clashing night' },
  '503': { description: 'Storage could not be read; nothing was written over it' },
};

/** Readable responses that carry no write. */
export const READ_ROUTES: BotRoute[] = [
  {
    path: '/api/portfolio/metrics',
    method: 'get',
    operationId: 'getPortfolioMetrics',
    summary: 'Monthly metrics for Ranch, Lindon, and River, with the expense and booking lists',
    writes: false,
  },
  {
    path: '/api/portfolio/history',
    method: 'get',
    operationId: 'getPortfolioHistory',
    summary: 'Month-by-month history for the report chart',
    writes: false,
  },
  {
    path: '/api/expenses/archive',
    method: 'get',
    operationId: 'listExpenseArchive',
    summary: 'Removed expenses that can be restored',
    writes: false,
    note: 'An archived row is not in any total, report, or statement. This is not a second ledger.',
  },
  {
    path: '/api/expenses/archive',
    method: 'post',
    operationId: 'restoreExpense',
    summary: 'Put one removed expense back exactly as it was',
    writes: true,
    note: 'Needs ?restore=<id>. The row returns with its receipt still readable, because a delete no longer touches storage. A row already on the books is refused rather than duplicated.',
  },
  {
    path: '/api/expenses/archive',
    method: 'delete',
    operationId: 'purgeExpense',
    summary: 'Drop an archived expense and its files for good',
    writes: true,
    note: 'Needs ?purge=<id>. The only path that deletes a receipt. Refuses a live expense, so nothing can skip the archive. Cannot be undone.',
  },
  { path: '/api/expenses', method: 'get', operationId: 'listExpenses', summary: 'The expense ledger', writes: false },
  { path: '/api/reservations', method: 'get', operationId: 'listReservations', summary: 'Saved stays', writes: false },
  { path: '/api/surveys', method: 'get', operationId: 'listSurveys', summary: 'Guest surveys and their tokens', writes: false },
  {
    path: '/api/book/requests',
    method: 'get',
    operationId: 'listBookingRequests',
    summary: 'Direct requests with taken and accepted flags',
    writes: false,
    note: 'A request that is already a booking shows accepted: true. Accepting it again is refused.',
  },
  {
    path: '/api/book/holds',
    method: 'get',
    operationId: 'listBookingHolds',
    summary: 'Date holds that still block a guest',
    writes: false,
  },  {
    path: '/api/clean/links',
    method: 'get',
    operationId: 'listCleanLinks',
    summary: 'Cleaner links and how often each was opened',
    writes: false,
  },
  {
    path: '/api/clean/progress',
    method: 'get',
    operationId: 'getCleanProgress',
    summary: 'What cleaners have ticked, with a summary',
    writes: false,
  },
  {
    path: '/api/clean/photos',
    method: 'get',
    operationId: 'getCleanPhotoTurns',
    summary: 'Room photos cleaners uploaded, grouped by turn',
    writes: false,
    note: 'Only a turn that is on the desk is listed. A photo carries a time and no guest name.',
  },
  {
    path: '/api/owner/links',
    method: 'get',
    operationId: 'listOwnerLinks',
    summary: "Todd's read-only links",
    writes: false,
  },
  {
    path: '/api/pricing/snapshots',
    method: 'get',
    operationId: 'listCompSnapshots',
    summary: 'Saved comps and the asks they carry',
    writes: false,
  },
  {
    path: '/api/stay-guide/{token}/stay-message',
    method: 'get',
    operationId: 'listStayMessages',
    summary: 'Which stay messages are right to send today',
    writes: false,
  },
  {
    path: '/api/stay-guide/{token}/stay-message',
    method: 'post',
    operationId: 'sendStayMessage',
    summary: 'Send one stay message to the guest, by hand',
    writes: true,
    note: 'Needs { id, to }. Sends exactly one message, only on a day it is appropriate for, never twice, and never with a price, door code, or password. A message that points at the stay page is refused while the guest app is off for that house. Nothing is scheduled: no message goes out on its own.',
  },
  {
    path: '/api/pricing/approved-rates',
    method: 'get',
    operationId: 'listApprovedRates',
    summary: 'Guest prices the host approved',
    writes: false,
  },
  {
    path: '/api/pricing/approved-rates',
    method: 'post',
    operationId: 'approveRate',
    summary: 'Approve one night so this site quotes that price',
    writes: true,
    note: 'Needs { house, date, guest }. This is the only path by which a comp-driven price reaches a guest. Refused on a booked, closed, held, or paused night, and refused outside the floor, the ceiling, the daily raise cap, and the published 20% promotion. It writes the price this site quotes; it does not send anything to Airbnb, VRBO, or Hospitable.',
  },
  {
    path: '/api/pricing/approved-rates',
    method: 'delete',
    operationId: 'clearApprovedRate',
    summary: 'Take one approved night back',
    writes: true,
    note: 'Needs ?house=&date=. The night returns to the published card.',
  },
  {
    path: '/api/pricing/push-plan',
    method: 'get',
    operationId: 'getRatePushPlan',
    summary: 'What a rate push would change, with sends:false',
    writes: false,
    note: 'This route has no writer. A booked, closed, paused, locked, or held night is never in the plan.',
  },
  {
    path: '/api/pricing/shadow-days',
    method: 'get',
    operationId: 'getShadowDays',
    summary: 'The durable seven-day shadow clock',
    writes: false,
    note: 'The Hospitable write token is never returned.',
  },
  {
    path: '/api/guest-guide',
    method: 'get',
    operationId: 'getGuestGuides',
    summary: 'Each house guest app',
    writes: false,
    note: 'For a caller with the bearer: the whole guide. For anyone else: doorCode, wifiName, wifiPassword, and doorNotes are blanked.',
  },
  {
    path: '/api/market/overview',
    method: 'get',
    operationId: 'getMarketOverview',
    summary: 'The sample comp board and shadow rate band for one house',
    writes: false,
  },
  {
    path: '/api/auth/session',
    method: 'get',
    operationId: 'getSession',
    summary: 'Whether the caller is authenticated, and whether the site has a password at all',
    writes: false,
  },
  {
    path: '/api/agent/map',
    method: 'get',
    operationId: 'getAgentMap',
    summary: 'This machine-readable map',
    writes: false,
  },
  {
    path: '/api/platform/health',
    method: 'get',
    operationId: 'getPlatformHealth',
    summary: 'Which bindings and keys exist. No secret values.',
    writes: false,
  },
  {
    path: '/api/platform/registry',
    method: 'get',
    operationId: 'getFeatureRegistry',
    summary: 'The competitor feature catalog, plus how many rows the market database holds. POST seeds it with an upsert that deletes nothing.',
    writes: false,
  },
  {
    path: '/api/platform/funnel',
    method: 'get',
    operationId: 'getFunnelCounts',
    summary: 'Funnel counts from the market database. Counts only, no identity.',
    writes: false,
  },
  {
    path: '/api/funnel',
    method: 'post',
    operationId: 'recordFunnelStep',
    summary: 'Record one funnel step with a house. No address, name, phone, or device. Refuses a step outside the four or a full day.',
    writes: true,
    public: true,
  },
  {
    path: '/api/platform/status',
    method: 'get',
    operationId: 'getPlatformStatus',
    summary: 'The morning list of missing keys. Checkout is not armed and nothing is sent.',
    writes: false,
  },
  {
    path: '/api/book/quote',
    method: 'get',
    operationId: 'getTaxQuote',
    summary: 'An unconfirmed Utah tax estimate. It is not added to the quoted stay and nothing is charged.',
    writes: false,
    public: true,
  },
  {
    path: '/api/book/turnstile',
    method: 'get',
    operationId: 'getTurnstileConfig',
    summary: 'The public Turnstile site key, and whether a bot check is enforced. Never the secret.',
    writes: false,
    public: true,
  },
  {
    path: '/api/pricing/pause',
    method: 'get',
    operationId: 'getPricingPause',
    summary: 'The per-house pricing kill switch. A switch that cannot be read reports every house paused, never off.',
    writes: false,
  },
  {
    path: '/api/pricing/changes',
    method: 'get',
    operationId: 'getRateChanges',
    summary: 'The rate change log, newest first, with the reason each night moved. Shadow rows only; nothing was sent.',
    writes: false,
  },
  {
    path: '/api/platform/audit',
    method: 'get',
    operationId: 'getAuditLog',
    summary: 'Who changed what, and when. Admin only. No amount, guest name, phone, or receipt body is recorded.',
    writes: false,
  },
  {
    path: '/api/mcp',
    method: 'get',
    operationId: 'listMcpTools',
    summary: 'Read-only tool names for the MCP-style endpoint.',
    writes: false,
    note: 'POST runs one of them. Bulk delete is refused. Expenses, bookings, and receipts are not changed.',
  },
];

/** Responses that change a record. Listed apart so a reader sees the difference at a glance. */
export const WRITE_ROUTES: BotRoute[] = [
  {
    path: '/api/book/accept',
    method: 'post',
    operationId: 'acceptBookingRequest',
    summary: 'Turn a saved request into a booking',
    writes: true,
    note: 'Needs { id, payout }. Refuses a second accept and a night already on that house. Mints the guest /stay/:token link and emails the confirmation — the route itself sends that mail with no confirm step, so a direct caller books and emails in one call. Never charges a card.',
  },
  {
    path: '/api/book/holds',
    method: 'post',
    operationId: 'releaseBookingHold',
    summary: 'Let a hold go by id or requestId',
    writes: true,
  },
  {
    path: '/api/book/decline',
    method: 'post',
    operationId: 'declineBookingRequest',
    summary: 'Decline a saved request with a reason',
    writes: true,
    note: 'Needs { id, reason } where reason is dates-taken, too-many-guests, minimum-stay, maintenance, owner-stay, or other. Records the decision, lets the hold go, and tells the guest the dates are not available. Refuses a request that is already a booking. Books nothing.',
  },
  {
    path: '/api/clean/links',
    method: 'post',
    operationId: 'mintCleanLink',
    summary: 'Make a cleaner link',
    writes: true,
    note: 'Needs { label }. It is not texted from here.',
  },
  {
    path: '/api/clean/links',
    method: 'delete',
    operationId: 'revokeCleanLink',
    summary: 'Take a cleaner link back',
    writes: true,
  },
  {
    path: '/api/owner/links',
    method: 'post',
    operationId: 'mintOwnerLink',
    summary: "Make Todd's read-only link",
    writes: true,
  },
  {
    path: '/api/pricing/comp-set',
    method: 'post',
    operationId: 'saveComp',
    summary: 'Save a real comp',
    writes: true,
    note: 'Needs sleeps and distanceMi. A comp without them cannot set the rate band.',
  },
  {
    path: '/api/pricing/snapshots',
    method: 'post',
    operationId: 'saveCompAsks',
    summary: 'Record the asks a saved comp lists',
    writes: true,
    note: 'Needs { compId, asks: [{ date, nightlyRate }] }, up to 120 nights per save. A comp sets the band only on a night that carries a saved ask, so without this the live band never activates. Every row is checked before any is written.',
  },
  {
    path: '/api/pricing/shadow-days',
    method: 'post',
    operationId: 'saveShadowDay',
    summary: 'Save one Denver shadow day',
    writes: true,
    note: 'A digest that could be sent is refused. A day that could not read the calendar removes its date.',
  },
  {
    path: '/api/expenses',
    method: 'post',
    operationId: 'createExpense',
    summary: 'Save one expense',
    writes: true,
  },
  {
    path: '/api/mcp',
    method: 'post',
    operationId: 'callMcpTool',
    summary: 'Run one read-only tool. Refuses a bulk delete.',
    writes: true,
    note: 'Does not change expenses, bookings, or receipts.',
  },
  {
    path: '/api/hooks/hospitable',
    method: 'post',
    operationId: 'hookHospitable',
    summary: 'Hospitable webhook. A bad signature is refused and the books are not written.',
    writes: true,
    public: true,
  },
  {
    path: '/api/hooks/stripe',
    method: 'post',
    operationId: 'hookStripe',
    summary: 'Stripe webhook. A bad signature is refused and the books are not written.',
    writes: true,
    public: true,
  },
  {
    path: '/api/hooks/seam',
    method: 'post',
    operationId: 'hookSeam',
    summary: 'Seam webhook. A bad signature is refused and the books are not written.',
    writes: true,
    public: true,
  },
];

const SORTED = (routes: BotRoute[]) =>
  [...routes].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));

/** Every documented bot route, reads first then writes. */
export function botRoutes(): BotRoute[] {
  return [...SORTED(READ_ROUTES), ...SORTED(WRITE_ROUTES)];
}

/** Just the paths, for a map or a doc that lists them. */
export function botRoutePaths(): string[] {
  return [...new Set(botRoutes().map((route) => route.path))];
}

/** Paths for which a parameterised, token-in-the-path variant exists and needs no bearer. */
export const PUBLIC_TOKEN_ROUTES = [
  '/api/owner/{token}',
  '/api/clean/{token}',
  '/api/clean/{token}/photos',
  '/api/stay-guide/{token}',
  '/api/stay-preferences/{token}',
  '/api/book/request/{token}',
];

export { ok, guarded, written };
