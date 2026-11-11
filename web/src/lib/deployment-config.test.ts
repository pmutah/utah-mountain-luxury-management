/**
 * What this deployment is configured with, and what each gap actually costs.
 *
 * Last turn I found the rate-push gate asking for `HOSPITABLE_WRITE_TOKEN` while the project held `HOSPITABLE_PAT` — a gate
 * pointing at a secret that already existed. That came from comparing the code against the deployed configuration, which nothing
 * had done. This file records the whole comparison so the next gap is visible without re-deriving it.
 *
 * Every env var the code reads is listed here with its disposition. A var that is neither configured nor explained fails this test,
 * so a missing credential shows up as a decision rather than as a feature that quietly does nothing.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/** Names configured on the Cloudflare Pages project `wilhite-portfolio`, from `wrangler pages secret list`. Never values. */
const CONFIGURED = new Set([
  'ALLOWED_EMAILS',
  'AMANDA_BOT_SECRET',
  'DASHBOARD_PASSWORD',
  'GEMINI_API_KEY',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'HOSPITABLE_PAT',
  'MUSE_BOT_SECRET',
  'SESSION_SECRET',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_SMS_FROM',
  'UML_TWILIO_SMS_FROM',
  'XAI_API_KEY',
]);

/**
 * Vars the code reads that are not secrets, or not set, and what happens without them.
 *
 * Each reason says whether the app is broken or merely unconfigured — the difference matters, because one needs a fix and the
 * other needs an owner decision.
 */
const NOT_CONFIGURED: Record<string, string> = {
  HOSPITABLE_RATE_PUSH:
    'the rate-publish switch. Off is the intended state: the owner asked for the sender to exist and stay off until they flip it.',
  HOSPITABLE_PRICE_UNIT:
    'which unit the calendar write expects. Never defaulted, because the wrong one prices every night 100x off. Only read when the switch is on.',
  HOSPITABLE_WRITE_TOKEN:
    'the older name for the same credential. The code now accepts either, so the PAT is what counts.',
  HOME_ASSISTANT_URL:
    'the light controls. No guide defines any control, so no guest is offered one; the concierge answers "the lights are not connected yet" rather than pretending.',
  HOME_ASSISTANT_TOKEN: 'same as the URL — needed only once a guide defines a control.',
  FIREBASE_SERVICE_ACCOUNT_JSON:
    'large receipt storage. Without it receipts fall back to KV, which works up to the KV size limit — a documented fallback, not a break.',
  FIREBASE_STORAGE_BUCKET: 'only read when a service account is set.',
  FIREBASE_PROJECT_ID: 'only read when a service account is set.',
  OPENAI_API_KEY:
    'a Whisper fallback for voice notes on browsers without the Web Speech API. Transcription still works where the API exists.',
  VITE_ALLOWED_EMAILS: 'a build-time duplicate of ALLOWED_EMAILS; the runtime var is the one that decides access.',
  PROD: 'set by the platform, not by us.',
  SETTINGS: 'the KV binding, configured in wrangler.toml rather than as a secret.',
  AIRROI_API_KEY:
    'comp calendars. Without it the market uses the fixture adapter and spends nothing. A present key still does not call AirROI until a client exists.',
  HOOK_SECRET:
    'the shared webhook signature. A hook with no secret is refused, so an unsigned body cannot change a stay.',
  STRIPE_WEBHOOK_SECRET:
    'the Stripe signature. Missing, the Stripe hook is refused. Stripe test mode is the only mode that would be accepted later.',
  STRIPE_SECRET_KEY:
    'card charges. A live key is refused. No test key means checkout names the gap and creates no charge.',
  SEAM_API_KEY:
    'lock buttons. Without it the trip portal never offers unlock, and the door code rules stay as they are.',
  MARKET_DB:
    'the D1 binding for comps and analytics. It is bound as `uml-market` with a preview database. High-volume rows are not written to KV.',
  TURNSTILE_SECRET:
    'the bot check on the booking form. Without it the route records that no bot check ran and still accepts a guest request, rather than refusing every guest until a widget exists.',
  TURNSTILE_SITE_KEY:
    'the public half of the same widget. Only read to draw it; a missing one means the widget cannot render, which is not the same as "not enforced".',
  TURNSTILE_HOSTNAMES:
    'the hosts siteverify may report. Empty means the hostname is not compared; set it to the deployment hosts before enforcing.',
  PHOTOS:
    'the R2 bucket for cleaner proof and galleries. It is commented in wrangler until a bucket exists. Receipts stay where they are.',
};

/** Every `env.X` the runtime actually reads. */
function envVarsRead(): string[] {
  const roots = ['functions', 'src'];
  const out = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry) || /\.test\.ts$/.test(entry)) continue;
      const text = readFileSync(full, 'utf8');
      for (const match of text.matchAll(/\benv\.([A-Z][A-Z0-9_]{3,})/g)) out.add(match[1]!);
    }
  };
  for (const root of roots) walk(root);
  return [...out].sort();
}

test('every env var the code reads is either configured or explained', () => {
  const unaccounted = envVarsRead().filter((name) => !CONFIGURED.has(name) && !(name in NOT_CONFIGURED));
  assert.deepEqual(
    unaccounted,
    [],
    `these variables are read but neither configured nor explained, so a missing credential would look like a silent failure:\n  ${unaccounted.join('\n  ')}`,
  );
});

test('the explanations are reasons, not placeholders', () => {
  for (const [name, reason] of Object.entries(NOT_CONFIGURED)) {
    assert.ok(reason.trim().length > 30, `${name} has no real explanation`);
  }
});

test('the published switch names are the ones the code reads', () => {
  /*
   * The defect that produced this file. `HOSPITABLE_PAT` is configured; a gate reading only `HOSPITABLE_WRITE_TOKEN` would say "no
   * token" while the credential sat there. Asserted from the code side so renaming one fails here.
   */
  const sender = readFileSync('src/lib/market/rate-publish.ts', 'utf8');
  assert.match(sender, /HOSPITABLE_PAT/, 'the sender no longer uses the configured credential');
  assert.ok(CONFIGURED.has('HOSPITABLE_PAT'), 'the credential the sender uses is not the one configured');
});

test('the publish switch is off in this configuration', () => {
  // The owner's instruction: build it, leave it off. A deployment that had it on without their say-so would fail here.
  assert.equal(CONFIGURED.has('HOSPITABLE_RATE_PUSH'), false, 'the rate-publish switch is configured on this project');
  assert.equal(CONFIGURED.has('HOSPITABLE_PRICE_UNIT'), false, 'the price unit is configured, which implies publishing may be on');
});
