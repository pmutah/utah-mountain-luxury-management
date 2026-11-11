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
    expenseArchive:
      'GET/POST/DELETE /api/expenses/archive — host only. The archive of removed expenses and the way back. GET lists what can be restored; POST { id } puts one row back exactly as it was, with its receipt; DELETE removes an archived row for good. Nothing here is a total: an archived row is in no report, statement, or P&L while it sits. A delete used to be permanent, so this is the only recovery path for a mistaken one.',
    expenseBulk:
      'POST /api/expenses/bulk { expenses: [...] } — host only. Saves many expenses in one write, which is how a stack of PDFs is imported. The same shape and validation as POST /api/expenses, one row at a time: a row with a bad property, month, amount, or missing category is skipped and named in `skipped` rather than failing the batch. A row whose property, month, vendor, and amount match one already saved is skipped as a duplicate, so re-importing the same statement adds nothing. Returns 201 when anything saved, 200 when everything was skipped.',
    expenseScan:
      'POST /api/expenses/scan and POST /api/expenses/scan-batch — host only. Read a bill PDF or photo into expense fields for a host to check. These only read: neither one saves an expense, and a scanned row still has to be posted through /api/expenses or /api/expenses/bulk. Treat a scan as a draft that can be wrong, not as a posted cost.',
    expenseReceipt:
      'GET /api/expenses/:id/receipt — host only; streams the saved bill for this expense as it was stored, inline for a PDF. Read-only: it cannot change or delete a receipt. POST /api/expenses/:id/attach-receipt { receiptBase64, receiptMimeType } adds a bill to an expense saved without one and is the way to fix a missing scan. **It replaces**: when the expense already had a bill, the old file is deleted before the new one is stored, so attaching is for a wrong bill, not an addition. GET/DELETE /api/expenses/:id/photos and /api/expenses/:id/photos/:photoId are the itemised photos on one expense; DELETE removes that photo from storage for good and there is no archive for a photo.',
    requestDecline:
      'POST /api/book/decline — host only. { id, reason, note?, notify? } declines a saved request. It records the decision so the inbox shows it, lets the hold go, and tells the guest the dates are not available. Reasons come from a fixed list, the same six the desk offers. It books nothing and touches no expense.',
    requestDiscard:
      'POST /api/book/discard — host only. { id } clears a saved request **without answering the guest**, for a duplicate, a test, or one already handled by phone. `sent` is always 0: this is the one way to empty an inbox row that mails nobody, and picking it when you meant decline leaves a guest unanswered. Refused 409 for a request that became a booking, so the audit trail and the guest confirmation link survive, and refused 409 while the 30-minute hold is live, because discarding would free nights a guest is still asking for — decline, or wait the hold out. An unreadable hold store is read as "a hold may exist" and refuses, so it never frees nights blind.',
    bookPayments:
      'GET/POST/DELETE /api/book/payments — host only. The money actually received against a **direct** booking, and the balance that follows from it. GET ?id= returns the ledger: what the guest was quoted, what arrived, what is outstanding, and one line to read instead of doing arithmetic. POST { id, payment: { amount, receivedOn, method?, reference?, note? } } records money that landed; the row is appended, never overwritten, and repeating a payment id returns the same answer instead of recording it twice. DELETE ?id=&paymentId= removes a mistyped row. **A refund is a negative payment, not a delete**, so the payment it reverses stays visible. Refused 409 for a channel booking (Airbnb, VRBO, Hospitable collect from the guest and remit a payout, so a payment typed here would count the same money twice), for a cancelled booking, and for a booking with no guest total, because a payment against no total reduces nothing. It never charges a card, never sends an invoice, and mails the guest nothing. **A booking with no recorded total reports its balance as unknown, never as $0.**',
    stayMessage:
      'GET/POST /api/stay-guide/:token/stay-message — host only, and the token is the credential for the stay. GET shows the messages this stay could receive; POST sends exactly one, on a day it is appropriate for, and records that it went. **Nothing is scheduled** — a sender that fired on its own would email a guest at the wrong moment with nobody watching. The stay comes from the record behind the token, never from the request body, so the dates a message is judged against cannot be spoofed.',
    reservations:
      'GET/POST /api/reservations — the bookings on the calendar. GET/PATCH /api/reservations/:id — host only; PATCH { status?, note?, payout?, guestName?, guestEmail?, guestPhone?, confirmationCode?, source? } edits one stay. Payout must be a number ≥ 0, and source must not be blank. This is the one route that edits a real booking in place: a changed status moves the night on the calendar and a changed payout moves the owner split, so it is not a place to experiment. It sends nothing to the guest and does not touch any expense.',
    calendarSync: 'POST /api/calendar/sync',
    cohost: 'POST /api/agent/chat { message, sessionId?, context?: { month, activeTab } }',
    constructionChat: 'POST /api/agent/construction/chat { message, sessionId? }',
    constructionProject: 'GET /api/construction/project',
    constructionDocuments: 'GET/POST /api/construction/documents',
    constructionDocumentDetail:
      'GET/PATCH/DELETE /api/construction/documents/:id, GET /api/construction/documents/:id/file. A build-cost document kept against the project. POST /api/construction/documents/:id/reanalyze re-reads a stored PDF with the build assistant and returns a fresh reading; it saves no expense and changes no cost line, so a bad reading is discarded by not posting it.',
    esignTemplates: 'GET /api/esign/templates',
    esignTemplateSave:
      'POST /api/esign/templates/:id — host only; saves the body and fields of one reusable template. It writes the template only: no document is created and nothing is sent.',
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
      'GET/POST/DELETE /api/clean/links — host only. A cleaner link is the credential for GET /api/clean/:token, which needs no login and returns the next two weeks of turns (house, day, steps, how to get in, house rules). **The door code is included** from the day before the checkout through the checkout day — the owner decided on 2026-11-10 that the cleaner gets it, the way a Hospitable task note carries it, because she is the person who has to get inside. The window is by **day**, not the guest phone\'s noon close, so a turn that runs into the afternoon does not lose the code mid-job. A Riverhouse part turn carries only the codes for the parts it covers. **No guest name and no money ever appear** on this page. POST /api/clean/:token { house, checkout, done:[stepIds] } ticks a step; only ids that turn has are kept and only a turn on the list can be ticked. GET /api/clean/progress — host only; what cleaners have ticked, with a summary.',
    ownerPortal:
      'GET/POST /api/owner/links — host only. Mints a read-only link for Todd. GET /api/owner/:token needs no login and returns the Ranch and River share after the fee, per house and per month, with no Lindon, household, construction, or guest names. It never books or sends.',
    marketComps:
      'GET /api/pricing/snapshots — saved comps and the asks they carry. POST /api/pricing/comp-set { platform, url, label, sleeps, distanceMi, area?, rating?, reviews?, guestFavorite?, isOwn?, minNights? } saves a real comp; a comp without sleeps or a distance is refused. POST /api/pricing/comp-own { id, isOwn?, minNights? } corrects the two facts that decide whether a saved comp may set a band: a comp marked isOwn is one of our own listings and never sets its own band, because a house compared with itself would read its own ask as the market; a comp whose minNights is longer than a week only books mid-term stays, so its rate is not a nightly ask. Only the fields sent are changed. POST /api/pricing/snapshots { compId, asks:[{ date, nightlyRate }] } records the guest ask a comp actually lists, up to 120 nights per save. A comp sets the band only on a night that carries a recorded ask, so that POST is what activates the live band.',
    approvedRates:
      'GET/POST/DELETE /api/pricing/approved-rates — host only. POST { house, date, guest } approves one night, and that night is then quoted at that price on our own booking page and in the guest month grid. It is the only path from the pricing engine to a guest. Refused on a booked, closed, held, or paused night, and outside the floor, the ceiling, the 8% raise cap, and the published 20% promotion. DELETE ?house=&date= returns the night to the published card. It sends nothing to Airbnb, VRBO, or Hospitable.',
    ratePublish:
      'GET/POST /api/pricing/publish-rates - host only. **The only route in this app that can send a price anywhere, and it is OFF by default.** The switch is `HOSPITABLE_RATE_PUSH=on` and it also needs `HOSPITABLE_PAT` and `HOSPITABLE_PRICE_UNIT` (`cents` or `dollars`, never defaulted — the wrong one prices every night 100x off). GET reads the switch and says what would happen; it sends nothing. POST sends the host\'s **approved** prices only — never a proposed, shadow, or promotion figure — and refuses 409 with the reason when the switch is off. The Ranch House has **no property in this Hospitable account**, so a Ranch night is refused rather than given a guessed uuid; Lindon, the River whole house, and the three parts all have verified uuids. **A rate written here changes the nightly price only.** It does not create an Airbnb or VRBO promotion badge, and the discount will not appear in their marketing — the doctrine keeps promotions on those sites because that is where the badge and the email exposure come from. Every response repeats that.',
    ratePushPlan:      'GET /api/pricing/push-plan — host only. What a rate push would change, built from the shadow run: booked, closed, paused, locked, and held nights are never in it. **This route has no writer and never sends**, and its gate answers `sends:false`. The sending lives in `/api/pricing/publish-rates`, which is off by default and requires an explicit switch. **A rate is never set in Hospitable** — the doctrine says "Do not change the rate and do not create the promotion in Hospitable. Hospitable stays the calendar and the inbox", and a promotion only earns Airbnb/VRBO badge and email exposure when it is typed on those sites directly. Setting HOSPITABLE_WRITE_TOKEN changes nothing here: the token is only read to compute the gate. `gate.send` names this. GET/POST /api/pricing/shadow-days is the durable seven-day clock; the write token is never returned.',
    riverUnits:
      'GET/PUT /api/pricing/river-units - host only. The Provo Riverhouse can be rented whole (the default, sleeps 22, 9 bedrooms and 7 full baths) or as three units: River Garage Suite (sleeps 4, 1BR), River Recreation Wing (sleeps 8, 4BR — three king suites plus a loft with two single beds, which counts as a bedroom), River Main Lodge (sleeps 10, 4BR — four king suites, one of which is the bunk room and also holds a bunk bed; 3 full baths). The three sum to 22, the same as the house. **A night is only ever sold once across all four listings.** A whole-house booking blocks all three units; a booking of any one unit blocks the whole house for those nights and leaves the other two sellable; two units can be booked together as one reservation, which blocks the house and both units and leaves the third. Cancelling reopens everything it held. Nothing is hidden in advance: all four are sellable at once, and blocking happens when a booking lands. GET returns each unit with its price, whether it is sellable, and its free nights. PUT takes unit, nightly, cleaning, and minNights, merges one unit, and refuses a nightly that is not a whole number above zero. **A unit with no price is not sellable and never renders a rate to a guest** - the three units carry the owner\'s published prices (Garage Suite $265 a night and $120 cleaning, Recreation Wing $535 and $180, Main Lodge $745 and $300, 2-night minimum each), given 2026-11-10. Those are flat for every occupancy: no weekend uplift, no seasonal table, no extra-guest fee, no discounts. The whole-house season table and its $1,500 host-net floor apply **only** to the whole house and must never be painted onto a unit. This route publishes nothing: blocks and prices stay in this app, and a booking taken on another channel is not reflected here.',
    riverSplit:
      'GET/PUT /api/pricing/river-split?from=&until=&mode= - host only. Whether to sell the Provo Riverhouse whole or in its three parts for a date range, answered from real unit prices and the real calendar. It compares the expected value of each: a whole stay weighted by the chance it books at that lead time and day kind, against the free parts weighted by theirs, both after cleaning and the extra turnover a split adds. A peak weekend is held whole before the arithmetic, because a whole-house booking is worth more than the parts together. It returns choice (whole, split, or both), the two expected figures, the units it would offer, and one line naming the money it compared. **A part with no price is never offered** - the decision is made from priced parts only, so a split can never be built from a rate nobody set. `decision: null` means no part has a price yet, and the response says so rather than inventing a split. The host mode is **stored**, not a query preference: GET uses the saved mode when the query names none, and PUT { mode } saves it. auto acts on the decision, suggest-only keeps the answer but says it is advice, and off forces the house whole with `overridden:true` while keeping `engineChoice` visible so the host can see what the setting costs. Both methods answer publishes:false: this route blocks no night, publishes no rate, and sends nothing to Airbnb or Vrbo.',
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
    amandaOpenApi:
      'GET /api/amanda/openapi.json (and /api/amanda/openapi) — public. The tool description Amanda reads. It names routes and refusals; it carries no secret and no guest data. Same full control as Muse, for the Grok bot Amanda.',
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
    amandaInstructions: 'GET /api/amanda/instructions — public standing rules (same authority as Muse)',
    amandaTools:
      'GET/POST /api/amanda/tools — Bearer MUSE_BOT_SECRET or AMANDA_BOT_SECRET. Same tools as Muse, including dashboard_request for every other /api route.',
    amandaEnter:
      'GET /api/amanda/enter?token=SECRET — 30-day dashboard cookie for Amanda. Same pass as /api/muse/enter.',
    museEnter:
      'GET /api/muse/enter?token=MUSE_BOT_SECRET — sets a 30-day dashboard cookie and redirects. Muse or Amanda can also type the API key in the Sign in box.',
    guestSurveys: 'GET /api/surveys',
    surveyLinks:
      'POST /api/surveys/mint-links — host only. Gives every upcoming stay a guest portal link and **sends nothing**: channel is recorded as none, so the guest list shows a link for the host to copy and no message goes out. Safe to run again — a stay that already has a link keeps it, and a repeat run mints no duplicate and moves nobody\'s page. Cancelled, blocked, and finished stays are skipped unless ?include=all. It is the backfill for bookings that arrived from Airbnb or VRBO, which got no link any other way. POST /api/surveys/reset { token } — host only; empties one guest\'s preference card so it can be filled again, for a card submitted by mistake. The token, the stay, and the send history are kept, so the guest\'s link still opens, and the stay stops counting the card as done. Scoped to the one token; it clears no other guest.',
    sendGuestSurvey:
      'POST /api/surveys/send { reservationId? , confirmationCode?, channel:"email"|"sms"|"none", guestEmail?, guestPhone? } — none mints a /stay/:token link without sending',
    publicStaySurvey: 'GET/POST /api/stay-preferences/:token — public River VIP / classic preference form',
    guestApp:
      'GET /api/guest-guide — each house guest app (house sections, videos, area picks). A caller who is not signed in gets the published facts with doorCode, wifiName, wifiPassword, and doorNotes blanked; a host cookie or a bot bearer gets the whole guide to edit. POST { propertyId, guide } needs the host and saves one house. Guests see the real codes only at /stay/:token, from the day before check-in until noon on checkout day. Never paste codes into chat, SMS, or email. **Door codes are per part at the Riverhouse**: `partDoorCodes` holds a code for each of the three parts, and a part guest is shown only the code for the part they booked. A part whose code is not set is told to call and is **never** given the whole-house code, because that one opens every part. A whole-house booking still uses the single `doorCode`, so every stay recorded before the split reads exactly as it did.',
    publicStayGuide:
      'GET /api/stay-guide/:token — what the guest app shows. The door code and Wi-Fi are **time-gated by the server**: withheld until the day before check-in and after checkout, which the route decides from the stay dates and cannot be talked around. `?ready=1` is **not** a server-side check — it is how the guest app reports that the guest read the house rules, and that acknowledgement lives in the browser (sessionStorage), so a caller holding a valid token can assert it without reading anything. Add ?preview=1 with the owner cookie or bot bearer to see codes early. POST /api/stay-guide/:token/chat { text } is Nora, a text concierge for this stay only. When she needs Brandon she texts him a link to /stay/:token/host. POST /api/stay-guide/:token/thread (owner sign-in) is his reply, which the guest app shows. She has no access to the books.',
    stayMessages:
      'GET/POST /api/stay-guide/:token/stay-message — host only. GET lists the stay messages that are right to send today; POST { id, to } sends exactly one, by hand. Nothing is scheduled, so no message goes out on its own. Each message has a window measured from check-in or checkout, a message already sent for that stay is refused, and no price, door code, or password goes out. The stay comes from the guest record behind the token, never from the request body.',
    stayGuestTools:
      'Four more routes take the guest token as their whole credential, and none of them needs a sign-in: GET /api/stay-guide/:token/manifest is the app manifest that lets a guest install the guide to a phone home screen; POST /api/stay-guide/:token/message { note } delivers "I need the host" to the host with the stay attached, so a guest can reach a person without anyone\'s phone number; POST /api/stay-guide/:token/control { name, action, brightness? } operates the connected device in that house, which is a real action on a real building and is refused unless the stay behind the token allows it; POST /api/stay-guide/:token/voice returns a short-lived Nora voice session for that stay only, and answers 503 with a plain "text or call us" line when no voice key is configured. All four act strictly for the one stay the token names.',
    platform:
      'GET /api/platform/health, GET /api/platform/registry, and GET /api/platform/status are host only. Health names which bindings exist and never returns a secret. The registry is the feature catalog, and POST /api/platform/registry seeds it into D1 with an upsert that deletes nothing. Status is the morning list of missing keys. GET /api/platform/funnel is host-only counts. POST /api/funnel is public and records one funnel step (view, quote, checkout, paid) with a house and an optional random visit id — no address, name, phone, or device — in D1, and refuses a full day rather than filling the table. The market database is D1 `uml-market` and holds only new tables: comps, comp nights, rate changes, the feature catalog, funnel events, and A/B assignments. Expenses, bookings, receipts, construction, e-sign, guides, and calendar state stay in KV. GET /api/book/quote is public and returns an unconfirmed Utah tax estimate that is not added to the quoted stay and does not charge a card. GET /api/book/turnstile is public and returns the Turnstile site key and whether a bot check is enforced, never the secret. POST /api/book sends the form and, when a Turnstile secret exists, is refused 403 with a reason on a missing or failed token; with no secret it records that no bot check ran and still accepts the request. GET/POST /api/pricing/pause is the per-house pricing kill switch, host only: the plan reads it, so a paused house is never raised or promoted, and a switch that cannot be read is treated as paused rather than off. GET /api/pricing/changes is the rate change log, host only: one row per night whose rate moved, with the reason, in D1 `rate_changes`. Every row is a shadow row and says nothing was sent. A failed read says the log could not be read rather than showing an empty log. POST /api/hooks/hospitable, POST /api/hooks/stripe, and POST /api/hooks/seam accept a signed webhook, refuse a bad signature, and do not write expenses, bookings, or receipts. GET/POST /api/mcp lists and runs read-only tools. Bulk delete is refused. Nothing on these routes sends a rate or a guest message.',
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
