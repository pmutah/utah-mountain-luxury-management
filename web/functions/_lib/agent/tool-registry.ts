import type { GeminiFunctionDeclaration } from './gemini-agent';

export const AGENT_TOOLS: GeminiFunctionDeclaration[] = [
  {
    name: 'manage_finances',
    description: 'Log expenses, list expenses, or get profit/revenue summary for date ranges.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['log_expense', 'list_expenses', 'get_profit_summary'],
        },
        propertyId: { type: 'string', enum: ['ranch', 'lindon'] },
        month: { type: 'string', description: 'YYYY-MM for log/list' },
        startMonth: { type: 'string', description: 'YYYY-MM range start for profit summary' },
        endMonth: { type: 'string', description: 'YYYY-MM range end for profit summary' },
        amount: { type: 'number' },
        category: { type: 'string' },
        vendor: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_reservations',
    description: 'List, get, create, update status, or block dates for reservations.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'get', 'create', 'update_status', 'create_block'],
        },
        id: { type: 'string' },
        propertyId: { type: 'string', enum: ['ranch', 'lindon'] },
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
    description: 'Calendar blocks, iCal sync, find gaps, check discrepancies.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list_blocks', 'create_block', 'sync_ical', 'find_gaps', 'check_discrepancies', 'set_ical_feed'],
        },
        propertyId: { type: 'string', enum: ['ranch', 'lindon'] },
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
    description: 'Cleaning tasks, guest messages, cleaner notifications.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create_cleaning_task', 'list_tasks', 'draft_guest_message', 'notify_cleaner'],
        },
        propertyId: { type: 'string', enum: ['ranch', 'lindon'] },
        reservationId: { type: 'string' },
        dueDate: { type: 'string' },
        guestName: { type: 'string' },
        checkIn: { type: 'string' },
        lockCode: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['action'],
    },
  },
  {
    name: 'gmail_service',
    description: 'Search Gmail, draft replies (requires Gmail OAuth connection).',
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
    description: 'Comp set, refresh comp prices, compare market, pricing alerts.',
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
          ],
        },
        propertyId: { type: 'string', enum: ['ranch', 'lindon'] },
        platform: { type: 'string', enum: ['airbnb', 'vrbo'] },
        url: { type: 'string' },
        label: { type: 'string' },
        compId: { type: 'string' },
        date: { type: 'string' },
        nightlyRate: { type: 'number' },
        from: { type: 'string' },
        to: { type: 'string' },
      },
      required: ['action'],
    },
  },
];
