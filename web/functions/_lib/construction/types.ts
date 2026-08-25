export type ConstructionDocType =
  | 'plan'
  | 'invoice'
  | 'estimate'
  | 'bid'
  | 'contract'
  | 'engineering'
  | 'other';

export type ConstructionStage =
  | 'Planning'
  | 'Permits'
  | 'Site / Foundation'
  | 'Framing'
  | 'Rough MEP'
  | 'Insulation / Dry-in'
  | 'Drywall'
  | 'Finishes'
  | 'Furnishings'
  | 'Punch'
  | 'Certificate of Occupancy';

export const DEFAULT_CONSTRUCTION_STAGES: ConstructionStage[] = [
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
];

export function parseConstructionStage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export interface ConstructionProject {
  id: string;
  name: string;
  address: string;
  jurisdiction: string;
  currentStage: string;
  stages: string[];
  budgetTarget: number;
  scopeNotes?: string;
  projectType?: string;
  contacts?: Array<{ name: string; role: string; phone?: string; email?: string }>;
  updatedAt: string;
}

export interface ConstructionDocument {
  id: string;
  type: ConstructionDocType;
  title: string;
  vendor?: string;
  amount?: number;
  documentDate?: string;
  trade?: string;
  stage?: string;
  storagePath: string | null;
  contentType: string | null;
  uploadedAt: string;
  extractedSummary: string;
  extractedFields: {
    disciplines?: string[];
    trades?: string[];
    codeRefs?: string[];
    openIssues?: string[];
    lineItems?: Array<{ description: string; amount?: number }>;
    exclusions?: string[];
    alternates?: string[];
    [key: string]: unknown;
  };
  sourceFileName?: string;
}

export interface ConstructionDecision {
  id: string;
  date: string;
  topic: string;
  decision: string;
  rationale: string;
  relatedDocIds?: string[];
}

export interface ConstructionRecommendation {
  id: string;
  stage: string;
  priority: 'low' | 'medium' | 'high';
  category: string;
  title: string;
  body: string;
  savingsEstimate?: number;
  createdAt: string;
  dismissed: boolean;
}

export interface ConstructionAgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  timestamp?: string;
}

export interface ConstructionToolStep {
  tool: string;
  action: string;
  summary: string;
}

export interface ConstructionChatResponse {
  sessionId: string;
  reply: string;
  messages: ConstructionAgentMessage[];
  toolSteps: ConstructionToolStep[];
  briefing?: string;
}

export interface ConstructionEnv {
  GEMINI_API_KEY?: string;
  SETTINGS?: KVNamespace;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_STORAGE_BUCKET?: string;
}
