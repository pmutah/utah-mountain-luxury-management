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
