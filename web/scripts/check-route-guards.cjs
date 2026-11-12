/**
 * A pre-deploy check for the two mistakes that already happened on this project:
 *
 *   1. A host route with no guard, so the ledger or a guest's details answer an anonymous caller.
 *   2. A public route that returns a door code or a Wi-Fi password.
 *
 * This reads the source, so it runs without a browser, a KV binding, or a deploy. It is meant to be
 * run before `wrangler pages deploy`.
 *
 *   node scripts/check-route-guards.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.join(process.cwd(), 'functions', 'api');

/** Routes that must never answer an anonymous caller. */
const HOST_ROUTES = [
  'portfolio/metrics.ts',
  'portfolio/history.ts',
  'portfolio/extra-cleaning.ts',
  'reservations/index.ts',
  'reservations/[id].ts',
  'expenses/index.ts',
  'expenses/archive.ts',
  'expenses/[id].ts',
  'expenses/bulk.ts',
  'expenses/scan.ts',
  'expenses/scan-batch.ts',
  'expenses/[id]/receipt.ts',
  'expenses/[id]/attach-receipt.ts',
  'expenses/[id]/photos/index.ts',
  'expenses/[id]/photos/[photoId].ts',
  'surveys/index.ts',
  'surveys/send.ts',
  'surveys/mint-links.ts',
  'surveys/reset.ts',
  'esign/documents/index.ts',
  'esign/documents/[id].ts',
  'esign/documents/[id]/file.ts',
  'esign/documents/[id]/send.ts',
  'esign/documents/[id]/sign-now.ts',
  'esign/templates/index.ts',
  'esign/templates/[id].ts',
  'esign/lien-release.ts',
  'esign/parse-invoice.ts',
  'construction/project.ts',
  'construction/documents/index.ts',
  'construction/documents/[id].ts',
  'construction/documents/[id]/file.ts',
  'construction/documents/[id]/reanalyze.ts',
  'construction/recommendations/index.ts',
  'construction/recommendations/[id].ts',
  'calendar/blocks.ts',
  'calendar/sync.ts',
  'agent/briefing.ts',
  'agent/work.ts',
  'automation/index.ts',
  'automation/run.ts',
  'integrations/gmail/status.ts',
  'integrations/gmail/connect.ts',
  'integrations/gmail/callback.ts',
  'operations/tasks.ts',
  'operations/config.ts',
  'pricing/alerts.ts',
  'pricing/snapshots.ts',
  'pricing/comp-set.ts',
  'pricing/comp-own.ts',
  'pricing/listings.ts',
  'pricing/refresh.ts',
  'pricing/snapshots.ts',
  'pricing/yield-plan.ts',
  'pricing/push-plan.ts',
  /*
   * The Riverhouse units. Host only, like every other pricing route: it writes the host's own unit prices and reports
   * which nights each unit can still be sold. It publishes nothing to another channel.
   */
  'pricing/river-units.ts',
  /*
   * The Riverhouse split decision. Host only: it reads unit prices and the calendar and answers which of whole or parts
   * to offer. It writes nothing, blocks nothing, and publishes nothing to another channel.
   */
  'pricing/river-split.ts',
  'guest-guide.ts',
  'clean/links.ts',
  'clean/progress.ts',
  'clean/photos.ts',
  'clean/photo.ts',
  'book/accept.ts',
  'book/decline.ts',
  'book/discard.ts',
  'book/requests.ts',
  'book/holds.ts',
  'book/payments.ts',
  'agent/chat.ts',
  'agent/construction/chat.ts',
  'agent/transcribe.ts',
  'stay-guide/[token]/stay-message.ts',
  'pricing/approved-rates.ts',
  'pricing/publish-rates.ts',
  'pricing/pause.ts',
  'pricing/changes.ts',
  'owner/links.ts',
  'pricing/shadow-days.ts',
  'platform/health.ts',
  'platform/registry.ts',
  'platform/status.ts',
  'platform/funnel.ts',
  'platform/audit.ts',
  /*
   * Live conditions. Host only: it names the forecast and the plow decision, and it is the same read the morning brief uses.
   * A guest gets a forecast through the stay token instead.
   */
  'platform/conditions.ts',
  /*
   * The agent switches. Host only, and it writes one KV key that decides what the morning run tells the host — never a guest
   * message and never a published rate.
   */
  'platform/switches.ts',
  /*
   * Refunds and guardrail overrides wait here. Host only. Marking a row sends no text and does not change a booking,
   * an expense, a receipt, or a published rate.
   */
  'platform/approvals.ts',
  /*
   * Add-ons a guest filed from the stay app. Host only. Marking a row sends no text and does not move a booking.
   * An owner does not receive Lindon.
   */
  'platform/stay-requests.ts',
  /*
   * Transfers recorded against Todd's Ranch and River share. Host only. An owner can read them on the statement
   * link and cannot record or void one. A row does not change the share, a booking, or an expense.
   */
  'platform/owner-transfers.ts',
  /*
   * The morning run. Host only, plus a `CRON_SECRET` bearer the worker uses for this one path. It records a shadow day, builds the
   * morning list, and sends at most one text to the host per date.
   */
  'platform/daily.ts',
  'mcp/index.ts',
];

/**
 * What counts as a guard on a host route.
 *
 * `isAuthenticated(` is deliberately NOT in this list. It returns true when DASHBOARD_PASSWORD is
 * unset, so a route that uses it is wide open on a deployment that has not set a password yet. That
 * is exactly how `/api/book/requests`, `/api/book/accept`, `/api/book/holds`, `/api/owner/links`, and
 * `/api/pricing/shadow-days` came to answer an anonymous caller and, in two cases, mint a credential.
 * A host route must fail closed, and only `hostOnly` does that.
 */
const GUARD = /hostOnly\(|hostDenied\(|unauthorized\(|isMuseAuthorized\(|requireMuse\(/;

/**
 * A route allowed to check the cookie directly, with the reason. Each is a read that leaks nothing
 * beyond what it already answers, or a path where `hostOnly` cannot be used.
 */
const COOKIE_OK = new Map([
  ['auth/session.ts', 'Reports whether a password is needed. Carries no data.'],
]);
const SECRET = /doorCode|wifiPassword/;

const problems = [];

for (const rel of HOST_ROUTES) {
  const file = path.join(root, ...rel.split('/'));
  if (!fs.existsSync(file)) {
    problems.push(`${rel}: listed as a host route but the file is missing`);
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  const re = /export const (onRequest(?!Options)\w+)[^=]*=\s*async/g;
  let match;
  let index = 0;
  while ((match = re.exec(text))) {
    index += 1;
    const body = text.slice(match.index, match.index + 800);
    // A weak cookie check is worse than none: it looks guarded and opens when no password is set.
    // This has to be checked first, because `unauthorized(` is itself part of a valid guard shape.
    const weak = /isAuthenticated\(/.test(body) && !COOKIE_OK.has(rel.replace(/\\/g, '/'));
    if (weak) {
      problems.push(
        `${rel}: ${match[1]} checks isAuthenticated, which passes when no password is set. Use hostOnly.`,
      );
    } else if (!GUARD.test(body)) {
      problems.push(`${rel}: ${match[1]} has no host guard`);
    }
  }
  if (index === 0) problems.push(`${rel}: no request handler found`);
}

// A route that serves guests must not hand back the way into the house.
const GUEST_ROUTES = [
  'guest-guide.ts',
  'stay-guide/[token]/index.ts',
  'stay-preferences/[token].ts',
  'book/availability.ts',
  'market/overview.ts',
  'clean/[token].ts',
  'clean/[token]/photos.ts',
  'clean/[token]/photo.ts',
  'owner/[token].ts',
  'book/request/[token].ts',
];

/**
 * Routes that are meant to answer anyone, with the reason. A bot or a guest needs these before it
 * has any credential, so they are declared rather than inferred.
 */
const PUBLIC_ROUTES = [
  'auth/login.ts', // The sign-in itself.
  'auth/session.ts', // Says whether a password is needed; carries no data.
  'agent/map.ts', // The route list itself. Names no ledger figure.
  'muse/enter.ts', // Trades the bot secret for a cookie. Refuses a bad secret.
  'muse/instructions.ts',
  'muse/openapi.ts',
  'muse/openapi.json.ts',
  'muse/tools.ts', // Bearer-gated inside the handler; listed here so the check reads it there.
  'muse/do.ts', // Same bearer gate as muse/tools.ts; refuses 503 when no bot secret is set.
  'amanda/do.ts', // Re-exports muse/do.ts, so the same gate applies.
  'amanda/enter.ts',
  'amanda/instructions.ts',
  'amanda/openapi.ts',
  'amanda/openapi.json.ts',
  'amanda/tools.ts',
  'amanda/do.ts',
  'esign/sign/[token].ts', // The token is the credential.
  'esign/sign/[token]/file.ts',
  'book/index.ts', // The public direct request form. A guest has no cookie before they ask.
  'book/quote.ts', // Tax estimate. No ledger, no card.
  'book/turnstile.ts', // The public site key and whether a bot check is enforced. Never the secret.
  'funnel.ts', // A public page's funnel step. Stores a step and a house, no identity.
  'hooks/hospitable.ts', // Signed webhook. Refuses a bad signature and does not write the books.
  'hooks/stripe.ts',
  'hooks/seam.ts',
  'stay-guide/[token]/chat.ts',
  'stay-guide/[token]/control.ts',
  'stay-guide/[token]/manifest.ts',
  'stay-guide/[token]/message.ts',
  'stay-guide/[token]/thread.ts',
  'stay-guide/[token]/voice.ts',
  // The forecast for the house this stay is at. The stay token is the credential; the answer is weather, never a code.
  'stay-guide/[token]/conditions.ts',
  // Public NWS weather and USGS Vivian Park river gauge for the house pages. No ledger, no guest, no code.
  'public/conditions.ts',
  // The stay token is the credential. Filing an add-on sends no text and does not move the booking.
  'stay-guide/[token]/requests.ts',
];
for (const rel of GUEST_ROUTES) {
  const file = path.join(root, ...rel.split('/'));
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const re = /export const (onRequest\w+)[^=]*=\s*async/g;
  let match;
  while ((match = re.exec(text))) {
    const body = text.slice(match.index, match.index + 2500);
    if (SECRET.test(body) && !GUARD.test(body)) {
      problems.push(`${rel}: ${match[1]} mentions a door code or Wi-Fi password with no guard in front of it`);
    }
  }
}

// A route file that nobody listed is the bug that let the Co-host chat and the approved-rate route
// sit outside this check. Every route must be named as a host route, a guest route, or a public one,
// so adding a file forces a decision about who may call it.
const CLASSIFIED = new Set(
  [...HOST_ROUTES, ...GUEST_ROUTES, ...PUBLIC_ROUTES].map((rel) => rel.replace(/\\/g, '/')),
);
const unclassified = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(file);
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    const rel = path.relative(root, file).replace(/\\/g, '/');
    if (!CLASSIFIED.has(rel)) unclassified.push(rel);
  }
})(root);
for (const rel of unclassified) {
  problems.push(`${rel}: not listed as a host, guest, or public route. Decide who may call it.`);
}

/**
 * A host route that hands back guest data must filter it by role.
 *
 * This is the third time the same defect has appeared. `/api/expenses` and `/api/reservations` filtered by role, so "Todd sees Ranch and
 * River" looked enforced — but the Overview tab called `/api/portfolio/metrics` and `/api/portfolio/history`, which never asked. One
 * request returned Lindon's revenue and all 34 of its bookings with the guest's name. Fixing those two would have left the booking
 * inbox, the guest list, the expense archive and the agent briefing with the same hole, because each is a separate route that returns
 * the same fields.
 *
 * So the rule is mechanical rather than remembered: a host route whose response carries a guest's name, email, phone, or the booking
 * rows themselves must either filter by role or be named below with the reason it never carries a house a role cannot see.
 */
const GUEST_DATA = /guestName|guestEmail|guestPhone/;
/*
 * Reading a store that carries guests is the same exposure **when the rows are returned**. `surveys/index.ts` returns `loadSurveys(...)` and
 * `getAllReservations(...)` and mentions no guest field at all, which is why the first version of this check passed it while it returned
 * every guest's name and every Lindon booking.
 *
 * A write route that reads the ledger to validate an edit is a different case: it returns the one row it wrote, at most. That is why the
 * check is limited to a `GET` handler below, and why the one-row routes ask `mayReadHouse` at the point they look a row up.
 */
const GUEST_STORE = /loadSurveys\(|getAllReservations\(|mergeAllExpenses\(|loadCustomExpenses\(/;
/*
 * What counts as filtering by role. A list route strips; a one-row route asks `mayReadHouse`, which is the more precise question and is
 * the same helper the rest of the codebase uses. Either is a decision about who may see the row.
 */
/*
 * What counts as filtering by role:
 *
 *   - `stripHouses` / `stripPortfolioHouses` — the shared helpers for a flat `propertyId`.
 *   - `mayReadHouse` — the precise question for a one-row lookup.
 *   - `allowedHouses` — the route reads the allowed list and filters a shape the helpers do not fit: an archive row whose house is nested
 *     inside `expense`, or an inbox row that carries `houses` as a list because one request can span two.
 *
 * The last one is the weakest of the three, because it only proves the route asked which houses are allowed. That is still a decision
 * rather than an oversight, and the routes that use it are covered by a behavioural test of their own.
 */
const ROLE_FILTER = /stripHouses\(|stripPortfolioHouses\(|mayReadHouse\(|allowedHouses\(/;
/*
 * Routes that carry guest data and may skip the role filter, with the reason. An entry here is a claim that has to survive review: the
 * list is short and each line says why.
 */
const GUEST_DATA_OK = new Map([
  [
    'book/index.ts',
    'A guest posting their own request. Public by design; it writes a row and returns the guest their own link, never another guest.',
  ],
  [
    'book/accept.ts',
    'Turns one named request into a booking. Host only, and it takes an id rather than returning a list of guests.',
  ],
  [
    'book/decline.ts',
    'Declines one named request. Host only, one id, no list.',
  ],
  [
    'book/discard.ts',
    'Clears one named request. Host only, one id, no list.',
  ],
  [
    'surveys/send.ts',
    'Sends to one named guest by id. It returns a send result, not a guest list.',
  ],
  [
    'surveys/mint-links.ts',
    'Mints stay links and returns tokens, not names.',
  ],
  [
    'surveys/reset.ts',
    'Resets one guest card by token. No list comes back.',
  ],
  [
    'clean/[token].ts',
    'A cleaner link. The token is the credential and the page carries no guest name by design.',
  ],
  [
    'stay-guide/[token]/index.ts',
    'One stay behind one token: the guest reading their own guide. It resolves the stay from the token, never from a request field.',
  ],
  [
    'stay-guide/[token]/chat.ts',
    'One stay behind one token. The concierge answers for that stay only.',
  ],
  [
    'stay-preferences/[token].ts',
    'One guest writing their own preferences through their own token.',
  ],
  [
    'stay-guide/[token]/stay-message.ts',
    'One stay behind one token. It lists the messages that stay could receive and sends one by hand; it returns no guest list and no house '
      + 'a role cannot see, because the stay comes from the token rather than from the request.',
  ],
  [
    'expenses/[id]/photos/[photoId].ts',
    'Serves one item photo for one expense id, checked with mayReadHouse before the bytes are read. It is a file, not a list.',
  ],
  [
    'clean/photos.ts',
    'A cleaner link, which is the credential. The rows are cleaner room photos grouped by turn; the page carries no guest name by design.',
  ],
  [
    'clean/progress.ts',
    'Cleaner tick state for a token or the host desk. It reports steps done against a turn, not a guest.',
  ],
  [
    'agent/briefing.ts',
    'The nightly brief as one line, built from the calendar. It names a house and a night count, not a guest, and it is cached.',
  ],
  [
    'pricing/approved-rates.ts',
    'The approved-rate sheet: house, date, and a guest price. It reads reservations only to refuse a booked night, and returns no guest.',
  ],
  [
    'pricing/push-plan.ts',
    'What a rate push would change, per house and night. It counts booked nights to exclude them; no name, email, or phone is in the answer.',
  ],
  [
    'pricing/river-split.ts',
    'Whole-versus-parts arithmetic for the Riverhouse. It compares expected value over the calendar and returns figures, not guests.',
  ],
  [
    'pricing/river-units.ts',
    'The three River parts and their prices. It reports free nights per part, which is availability rather than a person.',
  ],
  [
    'platform/daily.ts',
    'The morning run. It returns counts (arrivals, departures, nights at risk) and the composed text, never a guest row, and the text goes to '
      + 'the host rather than out to anyone.',
  ],
]);
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(file);
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    const rel = path.relative(root, file).replace(/\\/g, '/');
    if (!HOST_ROUTES.includes(rel)) continue;
    const text = fs.readFileSync(file, 'utf8');
    /*
     * Only a route that can be asked for rows is in scope. A POST that reads the ledger to validate one edit returns the row it wrote,
     * which the write guard and the audit log already cover; the exposure this check exists for is a **list of somebody else's guests**,
     * and that only comes out of a read handler.
     */
    const readable = /export const onRequestGet\b/.test(text);
    if (!readable) continue;
    if (!GUEST_DATA.test(text) && !GUEST_STORE.test(text)) continue;
    if (ROLE_FILTER.test(text)) continue;
    if (GUEST_DATA_OK.has(rel)) continue;
    problems.push(
      `${rel}: returns a guest's name, email, or phone and does not filter by role. Use stripHouses or stripPortfolioHouses, or add it to GUEST_DATA_OK with the reason.`,
    );
  }
})(root);

// A door-code preview must not lean on `isAuthenticated`, which passes when no password is set. The
// route files are covered above, but the shared concierge helper is where the guest guide actually
// decides, so it is checked here too.
const concierge = path.join(process.cwd(), 'functions', '_lib', 'guest-concierge.ts');
if (fs.existsSync(concierge)) {
  const text = fs.readFileSync(concierge, 'utf8');
  if (/isAuthenticated\(/.test(text)) {
    problems.push('_lib/guest-concierge.ts: checks isAuthenticated, which passes when no password is set. Use hostOnly.');
  }
}

// Nobody may reflect an arbitrary Origin back with credentials on. That is a cross-site read of the
// ledger using the host's cookie.
const reflected = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(file);
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (/Access-Control-Allow-Origin'\s*:\s*request\.headers\.get\('Origin'\)/.test(text)) {
      reflected.push(path.relative(process.cwd(), file));
    }
  }
})(path.join(process.cwd(), 'functions'));
for (const file of reflected) {
  problems.push(`${file}: reflects the caller's Origin directly. Use corsHeaders() from _lib/data.`);
}

if (problems.length > 0) {
  console.error('Route guard check failed:\n');
  for (const problem of problems) console.error('  - ' + problem);
  console.error(`\n${problems.length} problem(s). Do not deploy.`);
  process.exit(1);
}

console.log(`Route guard check passed: ${HOST_ROUTES.length} host routes guarded, ${GUEST_ROUTES.length} guest routes checked.`);
