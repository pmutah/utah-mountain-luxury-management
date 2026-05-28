import type { GeminiFunctionDeclaration } from '../gemini-agent';

export const CONSTRUCTION_TOOLS: GeminiFunctionDeclaration[] = [
  {
    name: 'manage_construction',
    description: 'Project state, documents, bids, spend, decisions.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'get_project_summary',
            'update_project',
            'list_documents',
            'search_documents',
            'get_document',
            'compare_bids',
            'spend_summary',
            'log_decision',
          ],
        },
        currentStage: { type: 'string' },
        budgetTarget: { type: 'number' },
        scopeNotes: { type: 'string' },
        projectType: { type: 'string' },
        name: { type: 'string' },
        address: { type: 'string' },
        docId: { type: 'string' },
        docType: { type: 'string' },
        query: { type: 'string', description: 'Search documents by keyword' },
        includeLineItems: { type: 'boolean' },
        topic: { type: 'string' },
        decision: { type: 'string' },
        rationale: { type: 'string' },
      },
      required: ['action'],
    },
  },
  {
    name: 'construction_advisor',
    description:
      'Expert foreman advice: methods, code guidance, value engineering, products, stage review, cross-trade impacts, knowledge lookup.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: [
            'recommend_next_steps',
            'advise_on_task',
            'code_guidance',
            'value_engineering',
            'product_recommendation',
            'stage_review',
            'cross_trade_coordination',
            'plan_discipline_review',
            'lookup_knowledge',
            'dismiss_recommendation',
          ],
        },
        task: { type: 'string' },
        topic: { type: 'string' },
        trade: { type: 'string' },
        changeDescription: { type: 'string' },
        category: { type: 'string' },
        constraints: { type: 'string' },
        recommendationId: { type: 'string' },
        query: { type: 'string' },
      },
      required: ['action'],
    },
  },
];
