/** Same-origin `/api` — Vite proxies to Pages in dev; Pages Functions handle it in prod. */
function resolveApiUrl(): string {
  const raw = import.meta.env.VITE_API_URL?.trim() ?? '';
  if (!raw) return '';
  // Old local .env pointed at NestJS (:8080), which is not the hosted app.
  if (/localhost:8080|127\.0\.0\.1:8080/.test(raw)) return '';
  return raw.replace(/\/$/, '');
}

const API_URL = resolveApiUrl();

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    let message = detail || `API ${path} failed: ${res.status}`;
    try {
      const parsed = JSON.parse(detail) as { error?: string; message?: string };
      if (parsed.error) message = parsed.error;
      else if (parsed.message) message = parsed.message;
    } catch {
      // use raw detail
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface Property {
  id: string;
  name: string;
  address: string;
  cleaningFee: number;
  accentColor: string;
  mortgage: number;
  status?: 'active' | 'under_construction';
}

export interface Reservation {
  id: string;
  guestName: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  /** Host net after Airbnb/VRBO taxes and fees. */
  payout: number;
  source: string;
  status?: string;
  note?: string;
  guestEmail?: string;
  guestPhone?: string;
  surveyToken?: string;
  surveySentAt?: string;
  surveyChannel?: 'email' | 'sms';
  surveyCompletedAt?: string;
}

export interface GuestPreferenceAnswers {
  leadName?: string;
  cell?: string;
  adults?: string;
  children?: string;
  childAges?: string;
  celebration?: string;
  celebrationDetail?: string;
  dogs?: string;
  accessibility?: string;
  arrivalWindow?: string;
  arrivingHow?: string;
  codeRecipients?: string;
  codeChannel?: string;
  earlyLate?: string;
  tripWhy?: string[];
  insideOutside?: string;
  evenings?: string;
  topAmenities?: string[];
  houseTemp?: string;
  scentNotes?: string;
  masterSuite?: string;
  guestSuite?: string;
  extraPillows?: string;
  kidsSleep?: string;
  quietRoom?: string;
  allergies?: string;
  doNotLeave?: string;
  favoriteFood?: string;
  favoriteSnack?: string;
  favoriteNaDrink?: string;
  favoriteAlcohol?: string;
  coffeeStyle?: string;
  coffeeMilk?: string;
  coffeeDecaf?: string;
  coffeeBrand?: string;
  kidsSnack?: string;
  smileItem?: string;
  anythingElse?: string;
  whyChose?: string;
}

export interface GuestSurveyRecord {
  token: string;
  reservationId: string;
  propertyId: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  createdAt: string;
  sentAt?: string;
  channel?: 'email' | 'sms';
  completedAt?: string;
  answers?: GuestPreferenceAnswers;
}

export type PaidBy = 'brandon' | 'todd';

export interface Expense {
  id: string;
  month: string;
  propertyId: string;
  category: string;
  amount: number;
  note?: string;
  vendor?: string;
  /** Who fronted the bill. Brandon & Stephanie share one side of the 50/50. */
  paidBy?: PaidBy;
  /** Construction phase (construction expenses only). */
  stage?: string;
  /** Calendar date the bill was paid (YYYY-MM-DD). */
  paidDate?: string;
  createdAt?: string;
  receiptStoragePath?: string | null;
  receiptContentType?: string | null;
  receiptUploadedAt?: string | null;
  receiptUrl?: string | null;
}

export type RentalPropertyId = 'ranch' | 'lindon' | 'river';

export interface ExpenseScanResult {
  amount: number;
  category: string;
  month: string;
  propertyId: RentalPropertyId | 'household' | null;
  vendor?: string;
  note?: string;
  confidence?: 'high' | 'low';
}

export interface BatchScannedExpense extends ExpenseScanResult {
  sourceFile?: string;
}

export type ExpensePropertyId = RentalPropertyId | 'construction' | 'household';

/** Brandon & Stephanie furnishings / house purchases — off the rental P&L. */
export const HOUSEHOLD_PROPERTY_ID = 'household' as const;

export interface BulkExpenseInput {
  propertyId: ExpensePropertyId;
  month: string;
  category: string;
  amount: number;
  note?: string;
  vendor?: string;
  stage?: string;
  paidBy?: PaidBy;
  paidDate?: string;
  receiptBase64?: string;
  receiptMimeType?: string;
}

export interface OwnerDistribution {
  brandon: number;
  todd: number;
  mgtFee: number;
}

export interface PropertyMetrics {
  propertyId: string;
  revenue: number;
  baseCleaning: number;
  extra: number;
  totalCleaning: number;
  mortgage: number;
  operationalExpenses: number;
  profit: number;
  occupancy: number;
  stayCount: number;
  dist: OwnerDistribution | null;
}

export interface PortfolioData {
  month: string;
  ranch: PropertyMetrics;
  lindon: PropertyMetrics;
  river: PropertyMetrics;
  totalRevenue: number;
  totalProfit: number;
  avgOccupancy: number;
  reservations: Reservation[];
  expenses: Expense[];
  extraCleaningFees: Record<string, number>;
  previousMonth?: string;
  previous?: {
    ranch: PropertyMetrics;
    lindon: PropertyMetrics;
    river: PropertyMetrics;
    totalRevenue: number;
    totalProfit: number;
    avgOccupancy: number;
  };
}

export interface MonthHistoryPoint {
  month: string;
  ranch: { revenue: number; profit: number; occupancy: number; stayCount: number };
  lindon: { revenue: number; profit: number; occupancy: number; stayCount: number };
  river: { revenue: number; profit: number; occupancy: number; stayCount: number };
  totalRevenue: number;
  totalProfit: number;
  avgOccupancy: number;
}

export interface HistoryData {
  endMonth: string;
  count: number;
  history: MonthHistoryPoint[];
  reservations: Reservation[];
}

export interface SessionInfo {
  authenticated: boolean;
  authRequired: boolean;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName?: string;
  timestamp?: string;
}

export interface ToolStep {
  tool: string;
  action: string;
  summary: string;
}

export interface AgentChatResponse {
  sessionId: string;
  reply: string;
  messages: AgentMessage[];
  toolSteps: ToolStep[];
}

export interface PricingAlert {
  id: string;
  propertyId: 'ranch' | 'lindon';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  suggestedAction?: string;
  createdAt: string;
  dismissed?: boolean;
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
  updatedAt?: string;
}

export interface ConstructionDocument {
  id: string;
  type: string;
  title: string;
  vendor?: string;
  amount?: number;
  documentDate?: string;
  trade?: string;
  stage?: string;
  storagePath?: string | null;
  contentType?: string | null;
  uploadedAt: string;
  extractedSummary?: string;
  extractedFields?: Record<string, unknown>;
  sourceFileName?: string;
}

export type VaultFolder = 'esign' | 'contractor' | 'important';
export type EsignStatus = 'stored' | 'pending' | 'completed' | 'cancelled';
export type SignerRole = 'contractor' | 'owner' | 'staff' | 'vendor' | 'other';
export type VaultPropertyScope = 'all' | 'ranch' | 'lindon' | 'river' | 'construction';
export type FormCategory = 'lien' | 'contractor' | 'vendor' | 'guest' | 'owner';
export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'tel'
  | 'number'
  | 'date'
  | 'select'
  | 'property';

export interface FormFieldDef {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  span?: 1 | 2;
}

export interface FormPreset {
  id: string;
  label: string;
  values: Record<string, string | number>;
}

export interface FormTemplate {
  id: string;
  title: string;
  category: FormCategory;
  categoryLabel: string;
  description: string;
  folder: VaultFolder;
  defaultSignerRole: SignerRole;
  defaultPropertyId: VaultPropertyScope;
  lockProperty: boolean;
  signerField: string;
  fields: FormFieldDef[];
  presets: FormPreset[];
}

export interface LienReleaseFields {
  contractorName: string;
  contractorAddress?: string;
  phone?: string;
  email?: string;
  invoiceNo?: string;
  invoiceDate?: string;
  description: string;
  amountUsd: number;
}

export interface VaultDocument {
  id: string;
  title: string;
  folder: VaultFolder;
  status: EsignStatus;
  sourceFileName: string;
  contentType: string;
  storagePath: string | null;
  signedStoragePath?: string | null;
  uploadedAt: string;
  notes?: string;
  propertyId?: VaultPropertyScope;
  signerName?: string;
  signerEmail?: string;
  signerPhone?: string;
  signerRole?: SignerRole;
  sentChannel?: 'email' | 'sms';
  kind?: 'upload' | 'lien-release' | 'form';
  lienRelease?: LienReleaseFields;
  formTemplateId?: string;
  formValues?: Record<string, string | number>;
  sessionId?: string;
  viewerToken?: string;
  sentAt?: string;
  completedAt?: string;
  cancelledAt?: string;
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
  dismissed?: boolean;
}

export interface ConstructionDecision {
  id: string;
  date: string;
  topic: string;
  decision: string;
  rationale: string;
  relatedDocIds?: string[];
}

export interface ConstructionChatResponse {
  sessionId: string;
  reply: string;
  messages: AgentMessage[];
  toolSteps: ToolStep[];
  briefing?: string;
}

export const api = {
  getSession: () => request<SessionInfo>('/api/auth/session'),
  login: (password: string) =>
    request<SessionInfo>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  syncCalendar: () =>
    request<{
      eventCount: number;
      fetchedAt: string;
      reservationSync: {
        created: number;
        updated: number;
        linkedToSeed: number;
        cancelled: number;
      };
      discrepancies: unknown[];
    }>('/api/calendar/sync', { method: 'POST' }),
  getPortfolio: (month: string, compare = true) =>
    request<PortfolioData>(
      `/api/portfolio/metrics?month=${encodeURIComponent(month)}${compare ? '&compare=1' : ''}`,
    ),
  getHistory: (endMonth: string, count = 12) =>
    request<HistoryData>(
      `/api/portfolio/history?end=${encodeURIComponent(endMonth)}&count=${count}`,
    ),
  updateExtraCleaning: (fees: Record<string, number | string>) =>
    request<Record<string, number>>('/api/portfolio/extra-cleaning', {
      method: 'PUT',
      body: JSON.stringify(fees),
    }),
  scanExpense: (body: {
    type: 'text' | 'image';
    text?: string;
    imageBase64?: string;
    mimeType?: string;
    propertyId?: RentalPropertyId | 'household';
    month?: string;
  }) =>
    request<ExpenseScanResult>('/api/expenses/scan', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  scanExpenseBatch: (body: { fileBase64: string; mimeType: string; fileName?: string }) =>
    request<{ expenses: ExpenseScanResult[]; sourceFile: string }>('/api/expenses/scan-batch', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  addExpensesBulk: (expenses: BulkExpenseInput[]) =>
    request<{
      saved: Expense[];
      skipped: Array<{ reason: string; expense: BulkExpenseInput }>;
      warnings?: string[];
    }>('/api/expenses/bulk', {
      method: 'POST',
      body: JSON.stringify({ expenses }),
    }),
  addExpense: (body: BulkExpenseInput) =>
    request<Expense & { receiptWarning?: string | null }>('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getExpenses: () => request<{ expenses: Expense[]; custom: Expense[] }>('/api/expenses'),
  deleteExpense: (id: string) =>
    request<{ ok: boolean }>(`/api/expenses/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  updateExpense: (
    id: string,
    body: { paidBy?: PaidBy | null; stage?: string | null; paidDate?: string | null },
  ) =>
    request<Expense>(`/api/expenses/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  expenseReceiptUrl: (expenseId: string) =>
    `${API_URL}/api/expenses/${encodeURIComponent(expenseId)}/receipt`,
  attachExpenseReceipt: (
    id: string,
    body: { receiptBase64: string; receiptMimeType: string },
  ) =>
    request<Expense & { receiptWarning?: string | null }>(
      `/api/expenses/${encodeURIComponent(id)}/attach-receipt`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),
  agentChat: (body: {
    message: string;
    sessionId?: string;
    context?: { month?: string; activeTab?: string };
  }) =>
    request<AgentChatResponse>('/api/agent/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  agentTranscribe: (body: { audioBase64: string; mimeType?: string }) =>
    request<{ text: string }>('/api/agent/transcribe', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getReservations: (params?: { propertyId?: string; when?: string }) => {
    const q = new URLSearchParams();
    if (params?.propertyId) q.set('propertyId', params.propertyId);
    if (params?.when) q.set('when', params.when);
    const qs = q.toString();
    return request<{ reservations: Reservation[] }>(
      `/api/reservations${qs ? `?${qs}` : ''}`,
    );
  },
  getGmailStatus: () =>
    request<{ connected: boolean; email: string | null }>('/api/integrations/gmail/status'),
  getPricingAlerts: () => request<{ alerts: PricingAlert[] }>('/api/pricing/alerts'),
  dismissPricingAlert: (id: string) =>
    request<{ ok: boolean }>('/api/pricing/alerts', {
      method: 'PATCH',
      body: JSON.stringify({ id }),
    }),
  refreshCompPrices: () =>
    request<{ refreshed: number; errors: string[] }>('/api/pricing/refresh', { method: 'POST' }),
  getConstructionProject: () =>
    request<ConstructionProject>('/api/construction/project'),
  updateConstructionProject: (body: Partial<ConstructionProject>) =>
    request<ConstructionProject>('/api/construction/project', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  getConstructionDocuments: () =>
    request<{
      documents: ConstructionDocument[];
      limits?: { maxMb: number; firebaseConfigured: boolean };
    }>('/api/construction/documents'),
  uploadConstructionDocument: (body: {
    fileBase64: string;
    mimeType: string;
    fileName?: string;
    type?: string;
  }) =>
    request<ConstructionDocument>('/api/construction/documents', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  constructionDocumentFileUrl: (id: string) =>
    `${API_URL}/api/construction/documents/${encodeURIComponent(id)}/file`,
  updateConstructionDocument: (
    id: string,
    body: Partial<Pick<ConstructionDocument, 'type' | 'amount' | 'title' | 'vendor'>>,
  ) =>
    request<ConstructionDocument>(`/api/construction/documents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  reanalyzeConstructionDocument: (id: string) =>
    request<ConstructionDocument>(
      `/api/construction/documents/${encodeURIComponent(id)}/reanalyze`,
      { method: 'POST' },
    ),
  deleteConstructionDocument: (id: string) =>
    request<{ ok: boolean }>(`/api/construction/documents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  getConstructionRecommendations: () =>
    request<{ recommendations: ConstructionRecommendation[] }>('/api/construction/recommendations'),
  dismissConstructionRecommendation: (id: string) =>
    request<{ ok: boolean }>(`/api/construction/recommendations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ dismissed: true }),
    }),
  constructionChat: (body: { message: string; sessionId?: string }) =>
    request<ConstructionChatResponse>('/api/agent/construction/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getGuestSurveys: () =>
    request<{
      surveys: GuestSurveyRecord[];
      reservations: Reservation[];
      gmail: { connected: boolean; email: string | null; oauthConfigured?: boolean };
      sms: { configured: boolean; from: string | null };
    }>('/api/surveys'),
  updateReservationContacts: (
    id: string,
    body: { guestEmail?: string; guestPhone?: string },
  ) =>
    request<Reservation>(`/api/reservations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  sendGuestSurvey: (body: {
    reservationId: string;
    channel: 'email' | 'sms';
    guestEmail?: string;
    guestPhone?: string;
  }) =>
    request<{ ok: boolean; token: string; link: string; channel: string }>('/api/surveys/send', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getPublicStayPreference: (token: string) =>
    request<{
      guestName: string;
      propertyName: string;
      checkIn: string;
      checkOut: string;
      completed: boolean;
      answers: GuestPreferenceAnswers | null;
    }>(`/api/stay-preferences/${encodeURIComponent(token)}`),
  submitPublicStayPreference: (token: string, answers: GuestPreferenceAnswers) =>
    request<{ ok: boolean }>(`/api/stay-preferences/${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify(answers),
    }),
  getVaultDocuments: () =>
    request<{
      documents: VaultDocument[];
      limits?: { maxMb: number; firebaseConfigured: boolean };
      gmail?: { connected: boolean; email: string | null; oauthConfigured?: boolean };
      sms?: { configured: boolean; from: string | null };
    }>('/api/esign/documents'),
  getFormTemplates: () =>
    request<{
      templates: FormTemplate[];
      categories: Array<{ id: FormCategory; label: string }>;
    }>('/api/esign/templates'),
  createFormFromTemplate: (
    templateId: string,
    body: {
      fields: Record<string, string | number>;
      sendChannel?: 'email' | 'sms' | 'none';
    },
  ) =>
    request<{
      document: VaultDocument;
      link?: string;
      emailed?: boolean;
      texted?: boolean;
      templateId: string;
    }>(`/api/esign/templates/${encodeURIComponent(templateId)}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createLienRelease: (
    body: LienReleaseFields & { sendEmail?: boolean; sendChannel?: 'email' | 'sms' | 'none'; preset?: 'jm-lt' },
  ) =>
    request<{
      document: VaultDocument;
      link?: string;
      emailed?: boolean;
      texted?: boolean;
      property: {
        jobSite: string;
        owners: string;
        propertyName: string;
      };
    }>('/api/esign/lien-release', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  uploadVaultDocument: (body: {
    fileBase64: string;
    mimeType: string;
    fileName?: string;
    title?: string;
    folder?: VaultFolder;
    notes?: string;
    propertyId?: VaultPropertyScope;
    signerName?: string;
    signerEmail?: string;
    signerPhone?: string;
    signerRole?: SignerRole;
  }) =>
    request<VaultDocument>('/api/esign/documents', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateVaultDocument: (
    id: string,
    body: Partial<
      Pick<
        VaultDocument,
        | 'title'
        | 'folder'
        | 'notes'
        | 'propertyId'
        | 'signerName'
        | 'signerEmail'
        | 'signerPhone'
        | 'signerRole'
        | 'status'
      >
    >,
  ) =>
    request<VaultDocument>(`/api/esign/documents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteVaultDocument: (id: string) =>
    request<{ ok: boolean }>(`/api/esign/documents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  vaultDocumentFileUrl: (id: string, kind: 'original' | 'signed' = 'original') =>
    `${API_URL}/api/esign/documents/${encodeURIComponent(id)}/file${kind === 'signed' ? '?kind=signed' : ''}`,
  sendVaultEsign: (
    id: string,
    body: {
      signerName?: string;
      signerEmail?: string;
      signerPhone?: string;
      channel?: 'email' | 'sms' | 'none';
      sendEmail?: boolean;
    },
  ) =>
    request<{ document: VaultDocument; link: string; emailed: boolean; texted: boolean }>(
      `/api/esign/documents/${encodeURIComponent(id)}/send`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  signVaultDocumentNow: (
    id: string,
    body: { signerName: string; signatureDataUrl: string; consentAccepted: boolean },
  ) =>
    request<VaultDocument>(`/api/esign/documents/${encodeURIComponent(id)}/sign-now`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getPublicEsign: (token: string) =>
    request<{
      title: string;
      folderLabel: string;
      signerName: string;
      completed: boolean;
      expired: boolean;
      cancelled: boolean;
    }>(`/api/esign/sign/${encodeURIComponent(token)}`),
  publicEsignFileUrl: (token: string) => `${API_URL}/api/esign/sign/${encodeURIComponent(token)}/file`,
  completePublicEsign: (
    token: string,
    body: { signerName: string; signatureDataUrl: string; consentAccepted: boolean },
  ) =>
    request<{ ok: boolean; completedAt?: string }>(`/api/esign/sign/${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export const PROPERTIES: Record<string, Property> = {
  ranch: {
    id: 'ranch',
    name: 'The Ranch House',
    address: '270 East Center Street, Lindon, Utah 84042',
    cleaningFee: 350,
    accentColor: 'bg-blue-500',
    mortgage: 3133.36,
    status: 'active',
  },
  lindon: {
    id: 'lindon',
    name: 'The Lindon House',
    address: '143 Harcliff Circle, Lindon, Utah 84042',
    cleaningFee: 160,
    accentColor: 'bg-emerald-500',
    mortgage: 1265.14,
    status: 'active',
  },
  river: {
    id: 'river',
    name: 'The River House',
    address: 'Vivian Park, Provo Canyon, Utah 84604',
    cleaningFee: 0,
    accentColor: 'bg-cyan-500',
    mortgage: 0,
    status: 'active',
  },
  construction: {
    id: 'construction',
    name: 'Construction Project',
    address: 'Lindon, Utah 84042',
    cleaningFee: 0,
    accentColor: 'bg-amber-500',
    mortgage: 0,
    status: 'under_construction',
  },
};

export const RANCH_MORTGAGE = 3133.36;
export const LINDON_MORTGAGE = 1265.14;
export const RIVER_MORTGAGE = 0;

export function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(val || 0);
}
