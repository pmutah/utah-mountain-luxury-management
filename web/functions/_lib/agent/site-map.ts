/** Machine-readable dashboard map for browser agents (Grok / Cursor). */

export const AGENT_SITE_MAP = {
  name: 'Utah Mountain Luxury Management',
  live: 'https://wilhite-portfolio.pages.dev',
  llms: '/llms.txt',
  hashRoutes: {
    overview: '#/overview',
    market: '#/market',
    report: '#/report',
    owner: '#/owner',
    clean: '#/clean',
    agents: '#/agents',
    documents: '#/report/documents',
    guests: '#/guests',
    ranch: '#/ranch',
    lindon: '#/lindon',
    river: '#/river',
    riverLaunch: '#/river/launch',
    riverBuild: '#/river/build',
    ours: '#/ours',
    construction: '#/river/build',
  },
  browser: {
    prefer:
      'Call window.UML.navigate(tab) or open the hash URL. Do not rely on clicking nav chips if an overlay intercepts clicks.',
    global: 'window.UML — version, state(), navigate(tab), setMonth("YYYY-MM"), help(), selectors',
    dataBot: 'Every primary control has data-bot. Example: [data-bot="nav-construction"] on River → Build costs',
    documentDataset: 'html[data-uml-tab] [data-uml-month] [data-uml-report]',
  },
  properties: {
    ranch: 'The Ranch House - 50/50 after 20% mgmt fee to Brandon',
    lindon: 'The Lindon House - Brandon rental P&L',
    river: 'The River House - 50/50 after 20% mgmt fee to Brandon. Build costs spreadsheet is #/river/build',
    construction:
      'River House build costs (same as #/river/build) — partner spend Todd vs Brandon & Stephanie',
    household: 'Brandon & Stephanie furnishings and house purchases — tab Our expenses (#/ours)',
  },
  apis: {
    auth:
      'Every private route needs a configured DASHBOARD_PASSWORD and a matching cookie, or a Bearer MUSE_BOT_SECRET / AMANDA_BOT_SECRET. With no password set, private reads answer 401 with code "not-configured" and the site stays closed instead of open. A cookie response is only readable from the deployed origin or a local dev port (Access-Control-Allow-Origin is an allow-list, not a reflection).',
    session: 'GET /api/auth/session — { authenticated, authRequired, open }. open:true means no password is set and private data is closed.',
    login: 'POST /api/auth/login { password }',
    portfolio: 'GET /api/portfolio/metrics?month=YYYY-MM',
    history: 'GET /api/portfolio/history?end=YYYY-MM&count=12',
    expenses: 'GET /api/expenses  POST /api/expenses  PATCH/DELETE /api/expenses/:id',
    constructionExpense:
      'POST /api/expenses { propertyId:"construction", month, category, amount, note, stage, paidBy:"brandon"|"todd", receiptBase64?, receiptMimeType? }',
    householdExpense:
      'POST /api/expenses { propertyId:"household", month, category:"Furnishings", amount, note, paidBy:"brandon", receiptBase64?, receiptMimeType? }',
    reservations: 'GET/POST /api/reservations',
    calendarSync: 'POST /api/calendar/sync',
    cohost: 'POST /api/agent/chat { message, sessionId?, context?: { month, activeTab } }',
    constructionChat: 'POST /api/agent/construction/chat { message, sessionId? }',
    constructionProject: 'GET /api/construction/project',
    constructionDocuments: 'GET/POST /api/construction/documents',
    esignTemplates: 'GET /api/esign/templates',
    esignParseInvoice:
      'POST /api/esign/parse-invoice { type:"text"|"image"|"gmail"|"gmail-search", templateId, text?, imageBase64?, mimeType?, query?, messageId? }',
    thisMap: 'GET /api/agent/map',
    market:
      'GET /api/market/overview?house=river|ranch|lindon — top 10 sample comps and a 90-day shadow rate band. Does not change live rates.',
    publicHouses:
      'GET /houses and /houses/river|ranch|lindon — public pages from the guest guide. No door codes, no prices, no card. A group larger than the River House links to the two-house quote, which does not hold dates.',
    publicBook:
      'GET /book — guest quote preview from the season rates. GET /api/book/availability returns booked nights, closed nights, held nights, and host-approved guest prices with no guest names. POST /api/book saves a request, holds both houses it names for 30 minutes, and emails the team plus a receipt to the guest. A second guest is refused those nights with 409 and held:true. It does not charge a card. The receipt carries the guest their own /request/:token link.',
    guestRequest:
      'GET /api/book/request/:token — public, no sign-in. The guest sees where their own request stands: waiting, accepted, declined, expired, or cancelled, with the dates and the party. An expired hold does not mean nobody answered: the request is still acceptable and the page says so. A cancelled booking is its own state, never "nobody answered". The token is the whole credential and is the only thing this route accepts. It returns no name, email, phone, host note, internal id, or price, so a forwarded link exposes nothing that was not already on the booking page. An accepted request is matched by the request id in the stay note, not by dates. The page is /request/:token.',
    bookingInbox:
      'GET /api/book/requests — host only. The saved direct requests with a taken flag, an accepted flag, and a summary. GET/POST /api/book/holds — host only; list live holds or release one by id or requestId. POST /api/book/accept { id, payout, source? } turns a request into a booking, refuses a second accept or a clashing night, mints the guest /stay/:token link, and emails the confirmation. It never charges a card.',
    cleanLinks:
      'GET/POST/DELETE /api/clean/links — host only. A cleaner link is the credential for GET /api/clean/:token, which needs no login and returns the next two weeks of turns (house, day, steps, how to get in, house rules) with no door code, guest name, or rate. POST /api/clean/:token { house, checkout, done:[stepIds] } ticks a step; only ids that turn has are kept and only a turn on the list can be ticked. GET /api/clean/progress — host only; what cleaners have ticked, with a summary.',
    ownerPortal:
      'GET/POST /api/owner/links — host only. Mints a read-only link for Todd. GET /api/owner/:token needs no login and returns the Ranch and River share after the fee, per house and per month, with no Lindon, household, construction, or guest names. It never books or sends.',
    marketComps:
      'GET /api/pricing/snapshots — saved comps and the asks they carry. POST /api/pricing/comp-set { platform, url, label, sleeps, distanceMi, area?, rating?, reviews?, guestFavorite?, isOwn?, minNights? } saves a real comp; a comp without sleeps or a distance is refused. POST /api/pricing/comp-own { id, isOwn?, minNights? } corrects the two facts that decide whether a saved comp may set a band: a comp marked isOwn is one of our own listings and never sets its own band, because a house compared with itself would read its own ask as the market; a comp whose minNights is longer than a week only books mid-term stays, so its rate is not a nightly ask. Only the fields sent are changed. POST /api/pricing/snapshots { compId, asks:[{ date, nightlyRate }] } records the guest ask a comp actually lists, up to 120 nights per save. A comp sets the band only on a night that carries a recorded ask, so that POST is what activates the live band.',
    approvedRates:
      'GET/POST/DELETE /api/pricing/approved-rates — host only. POST { house, date, guest } approves one night, and that night is then quoted at that price on our own booking page and in the guest month grid. It is the only path from the pricing engine to a guest. Refused on a booked, closed, held, or paused night, and outside the floor, the ceiling, the 8% raise cap, and the published 20% promotion. DELETE ?house=&date= returns the night to the published card. It sends nothing to Airbnb, VRBO, or Hospitable.',
    ratePushPlan:
      'GET /api/pricing/push-plan — host only. What a rate push would change, built from the shadow run: booked, closed, paused, locked, and held nights are never in it. It answers sends:false and has no writer, so no price can leave from it. **A rate is never set in Hospitable** — the doctrine says "Do not change the rate and do not create the promotion in Hospitable. Hospitable stays the calendar and the inbox", and a promotion only earns Airbnb/VRBO badge and email exposure when it is typed on those sites directly. Setting HOSPITABLE_WRITE_TOKEN changes nothing: the token is only read to compute the gate, and no outbound price call exists. `gate.send` names this. GET/POST /api/pricing/shadow-days is the durable seven-day clock; the write token is never returned.',
    sharedWork:
      'GET/POST /api/agent/work — the job list Muse, Amanda, and the co-host share. list, claim, done, release. A done job is not done again.',
    houseSettings:
      'GET/POST /api/operations/config — host only. The house rules and check-in line the guest and cleaner messages are built from, plus the cleaner contact. It merges rather than replaces, so saving one house leaves the other two alone, and a field left blank keeps what is already saved. A malformed cleaner email is refused. These lines go into the check-in draft a guest receives.',
    operationsTasks:
      'GET/POST/PATCH /api/operations/tasks — host only. The shared operations task list with a due date, a house, and an optional reservation. It records the job; it does not send a text or change a booking.',
    agentBriefing:
      'GET /api/agent/briefing — host only. The nightly brief as one line, built from the calendar and the shadow run. It is cached, and a cached answer is marked so a caller can tell a fresh read from a stored one. It never sends and never raises a rate.',
    agentTranscribe:
      'POST /api/agent/transcribe — host only. Turns a recorded voice note into text for the chat. It writes no ledger row and books nothing; the text goes back to the caller only.',
    calendarBlocks:
      'GET/POST/DELETE /api/calendar/blocks — host only. Calendar blocks: a closed stretch with a reason. A block is not a booked night, so it stays out of the booked count and the rate band, and the booking page refuses a night inside one. Deleting a block reopens those nights, so it is refused while a stay covers them.',
    pricingAlerts:
      'GET/PATCH /api/pricing/alerts — host only. Price alerts the engine raised: what moved, why, and whether it has been dismissed. PATCH dismisses one. An alert is a note to the host; it is not a rate change and nothing is sent to Airbnb or VRBO.',
    pricingListings:
      'GET/PUT /api/pricing/listings — host only. The per-house listing config the market board reads. PUT merges what it is given, so a caller that sends one house leaves the others alone; a read that cannot be had refuses the write rather than saving defaults over it.',
    pricingRefresh:
      'POST /api/pricing/refresh — host only. Re-runs the market snapshot. It records what it observed and returns the result; it does not publish a rate and has no writer to Airbnb or VRBO.',
    pricingYieldPlan:
      'GET /api/pricing/yield-plan — host only. The yield plan for the coming nights, house by house: what the engine would move and the guard that would stop it. It is a plan only. Nothing is sent.',
    constructionRecommendations:
      'GET /api/construction/recommendations — host only. The build recommendations saved against the construction project. PATCH /api/construction/recommendations/:id updates one. These are build-chat records; they never touch the rental ledger.',
    esignDocuments:
      'GET/POST /api/esign/documents — host only. Documents in the signing vault: the title, who it is for, and its state. Detail routes: GET/PATCH /api/esign/documents/:id, GET /api/esign/documents/:id/file, POST /api/esign/documents/:id/send, POST /api/esign/documents/:id/sign-now. A signed copy is served only through the session token.',
    esignLienRelease:
      'GET/POST /api/esign/lien-release — host only. Prepares and sends a lien release for a partner payment. It sends through the same signing flow as any other document and stores the signed copy; it does not pay anyone.',
    cleanPhotosHost:
      'GET /api/clean/photos — host only; every uploaded cleaner room photo grouped by turn, listing only turns that are on the desk. GET /api/clean/photo?path= — host only; one photo, by a path this app would have written, so a guessed path cannot reach the receipt folder.',
    museDo:
      'POST /api/muse/do — bearer only (MUSE_BOT_SECRET or AMANDA_BOT_SECRET). Runs one Muse turn and returns its messages. Refuses 503 when no bot secret is set and 401 on a bad one. It takes only the actions the tools allow, so every rule in manage_operations and the booking desk applies.',
    amandaOpenapi:
      'GET /api/amanda/openapi.json (and /api/amanda/openapi) — public. The tool description Amanda reads. It names routes and refusals; it carries no secret and no guest data.',
    amandaDo:
      'POST /api/amanda/do — the same handler as /api/muse/do, reached under Amanda name so her bearer works there. Bearer only; 503 with no secret, 401 on a bad one.',
    esignSign:
      'GET/POST /api/esign/sign/:token — public, and the token is the whole credential. The signer reads the document and signs it; nothing else is exposed. GET /api/esign/sign/:token/file serves the PDF for that session only, so one token cannot read another document. A cancelled or completed session stops accepting a signature.',
    extraCleaning:
      'PUT /api/portfolio/extra-cleaning — host only. The per-house, per-month extra cleaning fee the P&L uses. It merges what it is given and returns the saved map. There is no GET: the fees arrive with the metrics payload, so the desk never reads them twice.',
    automation:
      'GET/PUT /api/automation — host only. The automation switches: which scheduled chores are on, and their settings. POST /api/automation/run — host only; runs the due chores now. It records what it did; it does not send a rate to Airbnb or VRBO.',
    gmail:
      'GET /api/integrations/gmail/status — host only; whether a Gmail account is connected and whose. GET /api/integrations/gmail/connect — host only; starts the OAuth consent for the mailbox the team sends from. GET /api/integrations/gmail/callback — the OAuth return target; it stores the tokens and redirects back to the dashboard. No token is ever returned by any of these.',
    museOpenApi: 'GET /api/muse/openapi.json (or /api/muse/openapi) — public',
    museInstructions: 'GET /api/muse/instructions — public standing rules',
    museTools:
      'GET/POST /api/muse/tools — Bearer MUSE_BOT_SECRET or AMANDA_BOT_SECRET. Runs co-host tools, construction tools, and dashboard_request for every other /api route. Same bearer unlocks all /api/* REST routes.',
    amandaOpenApi: 'GET /api/amanda/openapi.json — same full control as Muse, for the Grok bot Amanda',
    amandaInstructions: 'GET /api/amanda/instructions — public standing rules (same authority as Muse)',
    amandaTools:
      'GET/POST /api/amanda/tools — Bearer MUSE_BOT_SECRET or AMANDA_BOT_SECRET. Same tools as Muse, including dashboard_request for every other /api route.',
    amandaEnter:
      'GET /api/amanda/enter?token=SECRET — 30-day dashboard cookie for Amanda. Same pass as /api/muse/enter.',
    museEnter:
      'GET /api/muse/enter?token=MUSE_BOT_SECRET — sets a 30-day dashboard cookie and redirects. Muse or Amanda can also type the API key in the Sign in box.',
    guestSurveys: 'GET /api/surveys',
    sendGuestSurvey:
      'POST /api/surveys/send { reservationId? , confirmationCode?, channel:"email"|"sms"|"none", guestEmail?, guestPhone? } — none mints a /stay/:token link without sending',
    publicStaySurvey: 'GET/POST /api/stay-preferences/:token — public River VIP / classic preference form',
    guestApp:
      'GET /api/guest-guide — each house guest app (house sections, videos, area picks). A caller who is not signed in gets the published facts with doorCode, wifiName, wifiPassword, and doorNotes blanked; a host cookie or a bot bearer gets the whole guide to edit. POST { propertyId, guide } needs the host and saves one house. Guests see the real codes only at /stay/:token, from the day before check-in until noon on checkout day. Never paste codes into chat, SMS, or email.',
    publicStayGuide:
      'GET /api/stay-guide/:token — what the guest app shows. The door code and Wi-Fi are **time-gated by the server**: withheld until the day before check-in and after checkout, which the route decides from the stay dates and cannot be talked around. `?ready=1` is **not** a server-side check — it is how the guest app reports that the guest read the house rules, and that acknowledgement lives in the browser (sessionStorage), so a caller holding a valid token can assert it without reading anything. Add ?preview=1 with the owner cookie or bot bearer to see codes early. POST /api/stay-guide/:token/chat { text } is Nora, a text concierge for this stay only. When she needs Brandon she texts him a link to /stay/:token/host. POST /api/stay-guide/:token/thread (owner sign-in) is his reply, which the guest app shows. She has no access to the books.',
    stayMessages:
      'GET/POST /api/stay-guide/:token/stay-message — host only. GET lists the stay messages that are right to send today; POST { id, to } sends exactly one, by hand. Nothing is scheduled, so no message goes out on its own. Each message has a window measured from check-in or checkout, a message already sent for that stay is refused, and no price, door code, or password goes out. The stay comes from the guest record behind the token, never from the request body.',
  },
  partnerSpend: {
    onlyOn: 'construction',
    paidBy: { brandon: 'Brandon & Stephanie', todd: 'Todd' },
    stages: [
      'Planning',
      'Permits',
      'Site / Foundation',
      'Framing',
      'Rough MEP',
      'Insulation / Dry-in',
      'Drywall',
      'Finishes',
      'Furnishings',
      'Punch',
      'Certificate of Occupancy',
    ],
  },
} as const;
