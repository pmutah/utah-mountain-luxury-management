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
    construction: '#/construction',
  },
  browser: {
    prefer:
      'Call window.UML.navigate(tab) or open the hash URL. Do not rely on clicking nav chips if an overlay intercepts clicks.',
    global: 'window.UML — version, state(), navigate(tab), setMonth("YYYY-MM"), help(), selectors',
    dataBot: 'Every primary control has data-bot. Example: [data-bot="nav-construction"]',
    documentDataset: 'html[data-uml-tab] [data-uml-month] [data-uml-report]',
  },
  properties: {
    ranch: 'The Ranch House - 50/50 after 20% mgmt fee to Brandon',
    lindon: 'The Lindon House - Brandon rental P&L',
    river: 'The River House - 50/50 after 20% mgmt fee to Brandon',
    construction:
      'Construction project - partner spend (Todd vs Brandon & Stephanie), documents, phases',
  },
  apis: {
    session: 'GET /api/auth/session',
    login: 'POST /api/auth/login { password }',
    portfolio: 'GET /api/portfolio/metrics?month=YYYY-MM',
    history: 'GET /api/portfolio/history?end=YYYY-MM&count=12',
    expenses: 'GET /api/expenses  POST /api/expenses  PATCH/DELETE /api/expenses/:id',
    constructionExpense:
      'POST /api/expenses { propertyId:"construction", month, category, amount, note, stage, paidBy:"brandon"|"todd", receiptBase64?, receiptMimeType? }',
    reservations: 'GET/POST /api/reservations',
    calendarSync: 'POST /api/calendar/sync',
    cohost: 'POST /api/agent/chat { message, sessionId?, context?: { month, activeTab } }',
    constructionChat: 'POST /api/agent/construction/chat { message, sessionId? }',
    constructionProject: 'GET /api/construction/project',
    constructionDocuments: 'GET/POST /api/construction/documents',
    esignTemplates: 'GET /api/esign/templates',
    thisMap: 'GET /api/agent/map',
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
      'Punch',
      'Certificate of Occupancy',
    ],
  },
} as const;
