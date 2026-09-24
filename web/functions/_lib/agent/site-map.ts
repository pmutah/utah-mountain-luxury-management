/** Machine-readable dashboard map for browser agents (Grok / Cursor). */

export const AGENT_SITE_MAP = {
  name: 'Utah Mountain Luxury Management',
  live: 'https://wilhite-portfolio.pages.dev',
  llms: '/llms.txt',
  hashRoutes: {
    overview: '#/overview',
    report: '#/report',
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
    session: 'GET /api/auth/session',
    login: 'POST /api/auth/login { password }',
    portfolio: 'GET /api/portfolio/metrics?month=YYYY-MM',
    history: 'GET /api/portfolio/history?end=YYYY-MM&count=12',
    expenses: 'GET /api/expenses  POST /api/expenses  PATCH/DELETE /api/expenses/:id',
    constructionExpense:
      'POST /api/expenses { propertyId:"construction", month, category, amount, note, stage, paidBy:"brandon"|"todd", receiptBase64?, receiptMimeType? }',
    householdExpense:
      'POST /api/expenses { propertyId:"household", month, category:"Furnishings", amount, note, paidBy:"brandon", receiptBase64?, receiptMimeType? }',
    reservations: 'GET/POST /api/reservations  PATCH/DELETE /api/reservations/:id',
    calendarSync: 'POST /api/calendar/sync',
    cohost: 'POST /api/agent/chat { message, sessionId?, context?: { month, activeTab } }',
    constructionChat: 'POST /api/agent/construction/chat { message, sessionId? }',
    constructionProject: 'GET /api/construction/project',
    constructionDocuments: 'GET/POST /api/construction/documents',
    esignTemplates: 'GET /api/esign/templates',
    esignParseInvoice:
      'POST /api/esign/parse-invoice { type:"text"|"image"|"gmail"|"gmail-search", templateId, text?, imageBase64?, mimeType?, query?, messageId? }',
    thisMap: 'GET /api/agent/map',
    sharedWork:
      'GET/POST /api/agent/work — the job list Muse, Amanda, and the co-host share. list, claim, done, release. A done job is not done again.',
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
      'GET /api/guest-guide — each house guest app (codes, Wi-Fi, house sections, videos, area picks). POST { propertyId, guide } saves one house. Guests see it at /stay/:token; codes show from the day before check-in until noon on checkout day. Never paste codes into chat, SMS, or email.',
    publicStayGuide:
      'GET /api/stay-guide/:token — what the guest app shows. Add ?preview=1 with the owner cookie or bot bearer to see codes early. POST /api/stay-guide/:token/chat { text } is Nora, a text concierge for this stay only. When she needs Brandon she texts him a link to /stay/:token/host. POST /api/stay-guide/:token/thread (owner sign-in) is his reply, which the guest app shows. She has no access to the books.',
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
