/**
 * Competitor feature registry.
 *
 * Status words are the plan's four: match, beat, planned, skip.
 * `planned` always carries a reason. Live keys that are absent stay planned, and the fixture path is a separate match.
 */

export type FeatureStatus = 'match' | 'beat' | 'planned' | 'skip';

export type FeatureRow = {
  id: string;
  area: string;
  title: string;
  status: FeatureStatus;
  competitor: string;
  reason: string;
};

export const FEATURE_CATALOG: FeatureRow[] = [
  { id: 'kv-backup', area: 'M0', title: 'Read-only KV backup and integrity baseline', status: 'match', competitor: 'Internal', reason: 'The script lists and reads keys, refuses a destination inside the repo, and will not save a failed read as an empty ledger.' },
  { id: 'd1-market', area: 'M0', title: 'D1 market database', status: 'match', competitor: 'Internal', reason: 'Created 2026-11-10 as `uml-market` with a preview database, and the migration is applied to both. Only new tables live there: comps, comp nights, rate changes, the feature catalog, funnel events, and A/B assignments. Expenses, bookings, and receipts stay in KV.' },
  { id: 'r2-photos', area: 'M0', title: 'R2 photo bucket', status: 'planned', competitor: 'Breezeway', reason: 'The account answers "please enable R2 through the Cloudflare Dashboard", so the binding stays commented. Cleaner photos stay unstored until R2 is on, and the desk already says so.' },
  { id: 'cron-shadow', area: 'M0', title: 'Shadow cron at 5am and 1pm Mountain', status: 'match', competitor: 'PriceLabs', reason: 'The worker cron logs a shadow run and does not read or write expenses, bookings, or receipts. It sends nothing.' },
  { id: 'webhooks', area: 'M0', title: 'Signed webhooks for Hospitable, Stripe, and Seam', status: 'match', competitor: 'Hospitable', reason: 'A bad or missing signature is refused. A good one is acknowledged and not written onto the books.' },
  { id: 'deep-health', area: 'M0', title: 'Deep health check', status: 'match', competitor: 'Internal', reason: 'Host-only. Reports which bindings and keys exist. It never returns a secret value.' },
  { id: 'error-boundary', area: 'M0', title: 'Per-tab error boundary', status: 'match', competitor: 'Internal', reason: 'A render crash on one tab shows a retry instead of a blank dashboard.' },
  { id: 'structured-log', area: 'M0', title: 'Structured JSON logs', status: 'match', competitor: 'Internal', reason: 'Log lines are JSON and drop secret, token, password, and key fields.' },
  { id: 'feature-registry', area: 'M0', title: 'Feature registry', status: 'match', competitor: 'Internal', reason: 'This catalog is the list the night run and the radar read. D1 storage waits on the binding.' },
  { id: 'alpine-noir', area: 'M1', title: 'Alpine Noir tokens, season accent, grain', status: 'match', competitor: 'Airbnb', reason: 'Charcoal, gold, and glacier are the tokens. Season changes the accent. Particles stay off on the data screens. Reduced motion is respected.' },
  { id: 'mission-control', area: 'M1', title: 'Today desk with pace, arrivals, nights at risk, and a terrain sketch', status: 'match', competitor: 'Guesty', reason: 'Overview opens on the next seven days, counts nights no stay can book inside 14 days, and places the three houses on a sketch. Road and snow are labeled unconnected rather than invented.' },
  { id: 'maplibre-tiles', area: 'M1', title: 'MapLibre live terrain tiles', status: 'skip', competitor: 'MapLibre', reason: 'The tile library would blow the route size budget for three houses. The sketch covers the desk until a style URL is worth the weight.' },
  { id: 'cmd-k', area: 'M1', title: 'Command palette', status: 'match', competitor: 'Guesty', reason: 'Cmd+K already navigates the dashboard.' },
  { id: 'mobile-dock', area: 'M1', title: 'Mobile bottom nav', status: 'match', competitor: 'Hospitable', reason: 'The phone dock uses the same navigate path as the chips, with data-bot attributes.' },
  { id: 'airroi-fixture', area: 'M2', title: 'Fixture comp adapter', status: 'match', competitor: 'AirDNA', reason: 'With no AirROI key the adapter returns labeled sample comps and spends nothing.' },
  { id: 'airroi-live', area: 'M2', title: 'AirROI live comp pull', status: 'planned', competitor: 'AirDNA', reason: 'Needs an AirROI key and a daily budget. Over the cap, the adapter refuses and stays on the fixture.' },
  { id: 'comp-picker', area: 'M2', title: 'Top 10 comp picker with pin and exclude', status: 'match', competitor: 'AirDNA', reason: 'Scores sleeps, rating, distance, and Guest Favorite. Pinned comps stay, excluded comps leave, and the week key re-picks.' },
  { id: 'analytics', area: 'M2', title: 'Bands, pace, and trailing RevPAR', status: 'match', competitor: 'PriceLabs', reason: 'p25, median, and p75, pace at 30/60/90, and trailing ADR, occupancy, and RevPAR are computed from the nights they are given.' },
  { id: 'rate-engine', area: 'M2', title: 'Guarded rate engine in shadow', status: 'match', competitor: 'PriceLabs', reason: 'Floors, an 8% daily cap, holiday lock, booked nights, River never at one night, and a stored per-house kill switch. The result is always send:false from this module.' },
  { id: 'kill-switch', area: 'M2', title: 'Per-house pricing kill switch', status: 'match', competitor: 'PriceLabs', reason: 'Stored in D1 `house_pause`. The authoritative plan reads it, so a paused house proposes nothing and carries no payload. A switch that cannot be read reports every house paused rather than off.' },
  { id: 'change-log', area: 'M2', title: 'Rate change log', status: 'match', competitor: 'PriceLabs', reason: 'The plan writes one D1 row per night whose rate moved, with the reason, replaced rather than appended on a re-run. `GET /api/pricing/changes` reads it and the market tab shows it. Every row is a shadow row and says nothing was sent.' },
  { id: 'live-rate-push', area: 'M2', title: 'Publishing a rate', status: 'match', competitor: 'PriceLabs', reason: 'The publish switch exists and defaults off. Seven shadow days and an explicit switch are required. Promotions stay on Airbnb and VRBO.' },
  { id: 'listing-optimizer', area: 'M2', title: 'Opportunity list', status: 'match', competitor: 'Guesty', reason: 'Amenities the comps list and we do not become opportunities with an estimated lift marked as an estimate. Nothing is posted.' },
  { id: 'market-tab', area: 'M2', title: 'Market tab', status: 'match', competitor: 'AirDNA', reason: '#/market already shows the band, the plan, the what-if, and the shadow clock.' },
  { id: 'pricing-tools', area: 'M2', title: 'Agent pricing tools', status: 'match', competitor: 'Guesty', reason: 'market_overview, top_comps, pin_comp, pricing_run, set_guardrails, pause_house, and opportunities answer and do not send.' },
  { id: 'public-houses', area: 'M3', title: 'Public house pages', status: 'match', competitor: 'Hospitable', reason: 'House pages, schema, and the booking page already ship. They do not charge a card.' },
  { id: 'tax-estimate', area: 'M3', title: 'Utah tax lines on the quote', status: 'match', competitor: 'Hospitable', reason: 'The lines are estimates. Ben Campbell has not confirmed the rates, so they are not added to the amount the guest is quoted and nothing is charged.' },
  { id: 'stripe-checkout', area: 'M3', title: 'Stripe checkout', status: 'planned', competitor: 'Hospitable', reason: 'No Stripe test secret is wired. Live keys are refused. The checkout hold is designed at 15 minutes and is not armed.' },
  { id: 'group-split', area: 'M3', title: 'Group split-pay math', status: 'beat', competitor: 'Hospitable', reason: 'A stay total splits across named payers and the shares add back to the cent. It does not charge anyone.' },
  { id: 'sales-drafts', area: 'M3', title: 'Nora quote drafts and abandoned-quote copy', status: 'match', competitor: 'Enso', reason: 'Drafts stay in the app. Nothing is emailed until a person sends it.' },
  { id: 'dns-cutover', area: 'M3', title: 'DNS cutover off Hospitable Direct', status: 'planned', competitor: 'Hospitable', reason: 'The redirect map and the checklist exist. DNS stays where it is until a tested booking and a 30-day rollback window.' },
  { id: 'trip-gate', area: 'M4', title: 'Check-in steps before the door', status: 'match', competitor: 'Enso', reason: 'Details, agreement, ID, and deposit are listed. ID and the deposit are not collected here, and the existing time window still decides the code.' },
  { id: 'seam-unlock', area: 'M4', title: 'One-tap Seam unlock', status: 'planned', competitor: 'Hospitable', reason: 'No Seam key. The desk does not pretend a lock opened.' },
  { id: 'wallet-pass', area: 'M4', title: 'Wallet pass', status: 'planned', competitor: 'Duve', reason: 'A pass payload can be described. It is not a signed pkpass.' },
  { id: 'auto-translate', area: 'M4', title: 'Auto-translate into 200 languages', status: 'skip', competitor: 'Enso', reason: 'Three houses. The cleaner desk already has Spanish. A 200-language vendor is not worth it.' },
  { id: 'journey', area: 'M4', title: 'Stay message timeline and add-ons', status: 'match', competitor: 'Enso', reason: 'The timeline is previewed and sends only when a host sends one message by hand.' },
  { id: 'cleaner-desk', area: 'M5', title: 'Cleaner turns, pay, and Spanish', status: 'match', competitor: 'Turno', reason: 'Turns come from bookings. April Jenson is $160 at Lindon and $350 at the Ranch. River has no published cleaner pay, so none is invented.' },
  { id: 'cleaner-offline', area: 'M5', title: 'Offline cleaner ticks', status: 'match', competitor: 'Breezeway', reason: 'A tick is written to the phone before the request. A queued turn reads "not sent yet", never "saved", and sends when the signal returns. The shell and the built bundle are precached, so the link opens with no network.' },
  { id: 'snow-dispatch', area: 'M5', title: 'Snow dispatch from a forecast', status: 'planned', competitor: 'Breezeway', reason: 'Two inches or more would dispatch. No forecast is connected, so the recommendation says it is not live.' },
  { id: 'vision-checklist', area: 'M5', title: 'Photo checklist inspection', status: 'match', competitor: 'Breezeway', reason: 'Missing rooms are flagged from the checklist. No vision model is called.' },
  { id: 'vision-model', area: 'M5', title: 'Vision model damage comparison', status: 'planned', competitor: 'Breezeway', reason: 'Needs a vision key. Claim packets are not built from guessed damage.' },
  { id: 'inbox-drafts', area: 'M5', title: 'Inbox drafts with a confidence gate', status: 'match', competitor: 'Guesty', reason: 'Below 0.85, or against a house guideline, the reply is held. This module never sends.' },
  { id: 'inbox-autosend', area: 'M5', title: 'AutoReply to real guests', status: 'planned', competitor: 'Guesty', reason: 'Off until it is switched on per house. No new automation messages a guest.' },
  { id: 'owner-portal', area: 'M6', title: 'Owner statement', status: 'match', competitor: 'Hospitable', reason: 'Todd sees Ranch and River after the 20% fee, then half. Lindon, household, and construction stay off.' },
  { id: 'roles', area: 'M6', title: 'Roles', status: 'match', competitor: 'Guesty', reason: 'Admin, owner, cleaner, and vendor. The owner role is read-only and does not see Lindon.' },
  { id: 'audit-log', area: 'M6', title: 'Append-only audit', status: 'match', competitor: 'Guesty', reason: 'Entries append. A bulk delete of expenses or reservations is refused.' },
  { id: 'lodging-tax-report', area: 'M6', title: 'Lodging tax report', status: 'match', competitor: 'Hospitable', reason: 'Direct stays are estimated. Channel stays are marked collected by the channel. The rates are unconfirmed.' },
  { id: 'sch-e', area: 'M6', title: 'Schedule E export', status: 'match', competitor: 'Internal', reason: 'The 2025 filed locks are not included in anything this export builds.' },
  { id: 'agents-hub', area: 'M7', title: 'Named agents with risky ones off', status: 'match', competitor: 'Guesty', reason: 'Revenue, listing, guest, ops, finance, owner, and growth sit beside Muse, Amanda, Nora, and the co-host. Risky switches default off and nothing sends.' },
  { id: 'approval-queue', area: 'M7', title: 'Approval by text', status: 'planned', competitor: 'Guesty', reason: 'Refunds and guardrail overrides wait. No text is sent from the queue.' },
  { id: 'mcp', area: 'M7', title: 'UML MCP-style tool endpoint', status: 'match', competitor: 'Hospitable', reason: 'Host-only tools/list and tools/call for read-only pricing and integrity. It cannot bulk-delete the books.' },
  { id: 'growth', area: 'Growth', title: 'Funnel events and A/B assignment', status: 'match', competitor: 'Internal', reason: 'A public step is recorded in the market database with a house and a random visit id — no address, name, phone, or device. A day at its ceiling is refused rather than filling the table. No third-party tracker.' },
  { id: 'security-headers', area: 'Security', title: 'Security headers', status: 'match', competitor: 'Internal', reason: 'nosniff, referrer, frame, and a report-only content security policy. Enforcing CSP waits until Google sign-in and the fonts are listed from a real report.' },
  { id: 'turnstile', area: 'Security', title: 'Turnstile on the booking form', status: 'planned', competitor: 'Internal', reason: 'The server check is written and refuses a missing or failed token once a secret exists. The account cannot create a widget yet: the Wrangler token has no Turnstile scope. Until then the booking route records that no bot check ran.' },
  { id: 'pii-identity', area: 'Security', title: 'ID images stay at Stripe', status: 'planned', competitor: 'Enso', reason: 'Stripe Identity is not connected. This app stores no ID image.' },
  { id: 'radar', area: 'Loop', title: 'Competitive radar', status: 'match', competitor: 'Guesty', reason: 'A fixture changelog diffs against this catalog and files a backlog line with why it matters for three houses. It does not scrape on a timer.' },
  { id: 'one-system', area: 'Beat', title: 'Construction, taxes, and the bots in the same desk', status: 'beat', competitor: 'Guesty', reason: 'The rental desk, the River build, the filed-return locks, and Muse and Amanda are one system. A general PMS does not do that for three houses.' },
];

export function catalogIds(): string[] {
  return FEATURE_CATALOG.map((row) => row.id);
}

export function morningBlockers(): { id: string; need: string }[] {
  return [
    { id: 'airroi', need: 'An AirROI key. Until then comps are the fixture adapter and are labeled that way.' },
    { id: 'stripe', need: 'A Stripe test secret. Checkout does not charge, and a live secret would be refused.' },
    { id: 'seam', need: 'A Seam account before any lock is commanded.' },
    { id: 'tax', need: 'Ben Campbell to confirm Utah lodging tax rates before a direct stay collects them.' },
    { id: 'dns', need: 'The domain stays on Hospitable Direct until a test booking and the rollback window.' },
    { id: 'vision', need: 'A vision key before completion photos are compared as pictures.' },
    { id: 'turnstile', need: 'A Turnstile widget and secret. The booking form accepts a request and records that no bot check ran until then.' },
  ];
}
