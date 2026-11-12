import type { GeminiFunctionDeclaration } from './gemini-agent';

export const AGENT_TOOLS: GeminiFunctionDeclaration[] = [
  {
    name: 'manage_finances',
    description:
      'Log expenses, list expenses, get a profit/revenue summary, prepare a Schedule E / §469 / 1099-NEC tax summary, simulate engineering cost-segregation & bonus depreciation, or reconcile pasted bank/card statement lines against logged bills. **This is the tool for any money, accounting, or tax question about a house** — revenue, costs, profit, the 20% management fee, owner share, Schedule E lines, the §469 7-day stay test, 1099-NEC vendor candidates, cost-segregation, or statement reconciliation. get_profit_summary answers P&L and partner shares; get_partner_contributions is construction only.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'log_expense',
            'list_expenses',
            'get_profit_summary',
            'get_partner_contributions',
            'get_tax_packet',
            'simulate_cost_seg',
            'reconcile_statement',
          ],
        },
        propertyId: { type: 'string', enum: ['ranch', 'lindon', 'river', 'construction', 'household'] },
        month: { type: 'string', description: 'YYYY-MM for log/list' },
        startMonth: { type: 'string', description: 'YYYY-MM range start for profit summary' },
        endMonth: { type: 'string', description: 'YYYY-MM range end for profit summary' },
        year: { type: 'number', description: 'Tax year for get_tax_packet (default 2026; <=2025 is locked to filed Ben Campbell return)' },
        grossBasisUsd: { type: 'number', description: 'Total build/property basis in USD for simulate_cost_seg (defaults to logged River build spend when omitted)' },
        landValuePct: { type: 'number', description: 'Non-depreciable land fraction 0..0.5 for simulate_cost_seg (default 0.18)' },
        costSegProfile: { type: 'string', enum: ['conservative', 'luxury-lodge', 'high-amenity'], description: 'Engineering cost-segregation profile' },
        bonusRate: { type: 'number', description: 'IRC §168(k) bonus depreciation fraction: 1, 0.8, 0.6, 0.4, or 0 (default 1)' },
        placedInServiceMonth: { type: 'number', description: 'Month placed in service 1..12 (default 11 for Nov River opening)' },
        marginalFedRate: { type: 'number', description: 'Federal marginal bracket e.g. 0.32 or 0.37 (default 0.32)' },
        ownershipShare: { type: 'number', description: '1 for sole ownership or 0.5 for 50/50 partner share (default 0.5)' },
        statementText: { type: 'string', description: 'Pasted CSV or tab-separated bank/card statement lines for reconcile_statement' },
        amount: { type: 'number' },
        category: { type: 'string' },
        vendor: { type: 'string' },
        note: { type: 'string', description: 'What the expense was (required for a useful manual log)' },
        stage: {
          type: 'string',
          description: 'Construction phase for construction expenses (e.g. Framing, Permits).',
        },
        paidBy: {
          type: 'string',
          enum: ['brandon', 'todd'],
          description:
            'Who fronted the bill. brandon = Brandon & Stephanie. todd = Todd. Use on the construction project.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_reservations',
    description:
      'List, get, create, update status, or block dates for reservations. A create is refused when those nights are already on that house\'s calendar or blocked, and nothing is written.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'get', 'create', 'update_status', 'create_block'],
        },
        id: { type: 'string' },
        propertyId: { type: 'string', enum: ['ranch', 'lindon', 'river'] },
        when: { type: 'string', enum: ['upcoming', 'current', 'past', 'checkout_today'] },
        guestName: { type: 'string' },
        checkIn: { type: 'string' },
        checkOut: { type: 'string' },
        payout: { type: 'number' },
        source: { type: 'string' },
        status: { type: 'string', enum: ['confirmed', 'cancelled', 'blocked', 'pending'] },
        note: { type: 'string' },
        confirm: { type: 'boolean' },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_calendar',
    description:
      'Calendar blocks, Hospitable iCal sync (imports VRBO/Airbnb/Booking.com into reservations), find gaps, check discrepancies.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list_blocks', 'create_block', 'sync_ical', 'find_gaps', 'check_discrepancies', 'set_ical_feed'],
        },
        propertyId: { type: 'string', enum: ['ranch', 'lindon', 'river'] },
        start: { type: 'string' },
        end: { type: 'string' },
        type: { type: 'string', enum: ['maintenance', 'owner', 'blocked'] },
        note: { type: 'string' },
        icalUrl: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_operations',
    description:
      'Cleaning tasks, guest messages, cleaner notifications, and the direct booking desk: list the saved requests, and accept or decline one. Accepting a request needs a host payout, which the request line names.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'create_cleaning_task',
            'list_tasks',
            'draft_guest_message',
            'notify_cleaner',
            'list_requests',
            'accept_request',
            'decline_request',
          ],
        },
        propertyId: { type: 'string', enum: ['ranch', 'lindon', 'river'] },
        reservationId: { type: 'string' },
        dueDate: { type: 'string' },
        guestName: { type: 'string' },
        checkIn: { type: 'string' },
        lockCode: { type: 'string' },
        notes: { type: 'string' },
        /** The request to accept or decline. */
        requestId: { type: 'string' },
        /** The host payout to record when accepting. Copy it from the request line. */
        payout: { type: 'number' },
        /** Required to accept: true. Without it the agent is told what would happen and nothing runs. */
        confirm: { type: 'boolean' },
        /** One of the decline reasons, when declining. */
        reason: {
          type: 'string',
          enum: ['dates-taken', 'too-many-guests', 'minimum-stay', 'maintenance', 'owner-stay', 'other'],
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'gmail_service',
    description:
      'Search the connected pmutah@gmail.com mailbox, including Airbnb login codes, or draft a reply. Search returns subject and snippet.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['search', 'draft_reply', 'status'] },
        query: { type: 'string' },
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_pricing',
    description:
      'Yield pricing. yield_plan is the daily to-do list for all three houses. suggest_rate_adjustment prices one house and date range. The rate engine owns the base: market_overview, top_comps, pricing_run, and opportunities preview and do not send. pin_comp, pause_house, and set_guardrails do not save. Do not lower the base. Do not set anything in Hospitable.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'list_comp_set',
            'add_comp',
            'refresh_comp_prices',
            'compare_market',
            'get_pricing_alerts',
            'record_manual_snapshot',
            'suggest_rate_adjustment',
            'yield_plan',
            'market_overview',
            'top_comps',
            'pin_comp',
            'pricing_run',
            'set_guardrails',
            'pause_house',
            'opportunities',
          ],
        },
        days: { type: 'number', description: 'yield_plan horizon in days (default 90)' },
        /**
         * The house. One field for the whole tool: it is the house to price, and for add_comp it is
         * the house the comp competes with. A comp with no house sets no band, so add_comp requires it.
         */
        propertyId: {
          type: 'string',
          enum: ['ranch', 'lindon', 'river', 'both'],
          description:
            'The house. For add_comp this is the house the comp competes with and is required; use both for a house that competes with the Ranch and River together.',
        },
        platform: { type: 'string', enum: ['airbnb', 'vrbo'] },
        url: { type: 'string' },
        label: { type: 'string' },
        /** How many the listing sleeps. The band cannot compare a comp without it. */
        sleeps: { type: 'number', description: 'How many guests the listing sleeps. Required for add_comp.' },
        /** Miles from our house. The band cannot compare a comp without it. */
        distanceMi: { type: 'number', description: 'Miles from our house. Required for add_comp.' },
        area: { type: 'string', description: 'Neighbourhood or town the listing is in.' },
        compId: { type: 'string' },
        date: { type: 'string' },
        nightlyRate: { type: 'number' },
        from: { type: 'string' },
        to: { type: 'string' },
      },
      required: ['action'],
    },
  },
  {
    name: 'shared_work',
    description:
      'The job list Muse, Amanda, and the co-host share. list before you start. If the job is done, or another agent claimed it in the last 3 hours, stop and tell Brandon who has it. claim before you start. done when you finish, with what you did. Do not repeat their work.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'claim', 'done', 'release'] },
        key: {
          type: 'string',
          description:
            'Stable id both agents would pick. Yield moves use the workKey on the plan, like yield:lindon:2026-09-22:2026-09-24. An inquiry is inquiry:guest-name.',
        },
        title: { type: 'string', description: 'One line saying what the job is. Required when claiming.' },
        result: {
          type: 'string',
          description: 'What you did, with house, dates, prices, and time. Required when marking done.',
        },
        sinceDays: { type: 'number', description: 'list: how many days of finished jobs to return (default 14)' },
      },
      required: ['action'],
    },
  },
];
