/** Same-origin `/api` — Vite proxies to Pages in dev; Pages Functions handle it in prod. */
import type { InboxRow } from './booking-inbox';
import type { CleanProgress } from './clean-progress';
import type { LiveComp, LiveSnap } from './market/live';

function resolveApiUrl(): string {
  const raw = import.meta.env?.VITE_API_URL?.trim() ?? '';
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
  // `credentials` is a browser fetch option. Typed here as a plain record so this module also
  // compiles in the server graph, where Workers' RequestInit does not carry that field.
  const browserInit = { credentials: 'include' } as Record<string, unknown>;
  const res = await fetch(`${API_URL}${path}`, {
    ...(browserInit as RequestInit),
    ...init,
    headers,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    let message = detail || `API ${path} failed: ${res.status}`;
    if (/<!doctype html/i.test(detail) || /error code:\s*1101/i.test(detail)) {
      message = 'The dashboard could not load. Storage writes are paused for the rest of the day.';
    }
    /*
     * The whole body rides on the error, not only its message.
     *
     * A failed send returns the guest link it already built, so a host whose email is broken can still deliver it. That
     * was invisible: this threw a bare `Error`, so callers could read the sentence and nothing else. Fields the caller
     * might act on are copied across rather than dropped.
     */
    const failure = new Error(message) as Error & Record<string, unknown>;
    try {
      const parsed = JSON.parse(detail) as Record<string, unknown>;
      if (parsed.error) message = String(parsed.error);
      else if (parsed.message) message = String(parsed.message);
      failure.message = message;
      for (const [key, value] of Object.entries(parsed)) {
        if (key === 'error' || key === 'message') continue;
        failure[key] = value;
      }
    } catch {
      // use raw detail
    }
    throw failure;
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
  /**
   * What the guest paid for this house, before tax, when it was known at booking time.
   *
   * Absent means "not recorded", never zero: a channel booking imported from an iCal feed carries
   * none, and neither does a stay booked before this was stored. Showing it beside the payout is the
   * point — a lone figure on a stay cannot tell a host whether it is the guest price or their own cut.
   */
  guestTotal?: number;
  /**
   * Money actually received against this booking, one row per payment.
   *
   * A refund is a **negative** row, never a deletion or an edit of the payment it reverses, so the history of what
   * arrived survives. Absent means nothing has been recorded — not that nothing was paid — which is why a balance is
   * only stated when `guestTotal` is known. Channel bookings (Airbnb, VRBO, Hospitable) do not use this: the platform
   * collects and remits a payout, so `payout` is the money and there is no guest balance here.
   */
  payments?: Array<{
    id: string;
    /** What arrived. Negative for a refund. */
    amount: number;
    /** `YYYY-MM-DD` the money landed. */
    receivedOn: string;
    method?: string;
    reference?: string;
    note?: string;
  }>;
  source: string;
  status?: string;
  note?: string;
  guestEmail?: string;
  guestPhone?: string;
  confirmationCode?: string;
  surveyToken?: string;
  surveySentAt?: string;
  surveyChannel?: 'email' | 'sms' | 'none';
  /**
   * When the host marked the preference card done on the stay itself.
   *
   * `null` is meaningful: it clears the stamp so the guests page stops calling the card "Completed". `undefined` would
   * be dropped by JSON and the stamp would survive, which is exactly the bug a reset button would otherwise have.
   */
  surveyCompletedAt?: string | null;
  /**
   * Which parts of the Riverhouse this stay occupies.
   *
   * Absent means the whole house, which is what every stay recorded before the house was sold in parts means. Only a
   * part bookable through our own site carries this today, so a channel booking still reads as the whole house — the
   * conservative reading, because it blocks every part rather than freeing one by mistake.
   */
  units?: string[];
}

/** A payment to record. The route assigns the id when one is not given. */
export type NewPayment = {
  amount: number;
  /** `YYYY-MM-DD` the money landed. A refund is a negative amount. */
  receivedOn: string;
  method?: string;
  reference?: string;
  note?: string;
};

/**
 * What one direct booking is owed and what has arrived.
 *
 * `outstanding` and `total` are `null` when the booking carries no guest total — the balance is unknown, not zero.
 */
export type BookingLedger = {
  payments: Array<NewPayment & { id: string }>;
  received: number;
  total: number | null;
  outstanding: number | null;
  paidInFull: boolean;
  /** Rows that could not be read, named rather than dropped. */
  rejected: Array<{ id: string; reason: string }>;
  /** One line to read instead of doing the arithmetic. */
  line: string;
};

export type SurveyVariant = 'vip' | 'classic';
export interface GuestPreferenceAnswers {
  surveyVariant?: SurveyVariant;
  leadName?: string;
  cell?: string;
  adults?: string;
  children?: string;
  childAges?: string;
  partyNames?: string;
  occasions?: string[];
  occasionNote?: string;
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
  indoorOutdoor?: string;
  insideOutside?: string;
  evenings?: string;
  activities?: string[];
  fishingGuide?: string;
  bikeSource?: string;
  skiResort?: string;
  skiFirstTimer?: string;
  amenities?: string[];
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
  foodVibe?: string;
  favoriteFood?: string;
  snacks?: string;
  favoriteSnack?: string;
  drinksAlcohol?: string;
  alcoholPrefs?: string;
  naDrinkPrefs?: string;
  favoriteNaDrink?: string;
  favoriteAlcohol?: string;
  coffeeStyle?: string;
  coffeeMilk?: string;
  coffeeDecaf?: string;
  coffeeBrand?: string;
  kidsSnack?: string;
  smileItem?: string;
  favoriteMovie?: string;
  popcornStyle?: string;
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
  channel?: 'email' | 'sms' | 'none';
  completedAt?: string;
  variant?: SurveyVariant;
  confirmationCode?: string;
  answers?: GuestPreferenceAnswers;
}

export interface PublicStayPreference {
  guestName: string;
  propertyId?: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  confirmationCode?: string | null;
  variant?: SurveyVariant;
  completed: boolean;
  answers: GuestPreferenceAnswers | null;
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
  itemPhotos?: Array<{
    id: string;
    storagePath: string;
    contentType: string;
    uploadedAt: string;
    url?: string;
  }>;
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
  storageReads?: 'ok' | 'paused';
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
  storageReads?: 'ok' | 'paused';
}

export interface SessionInfo {
  authenticated: boolean;
  authRequired: boolean;
  /** The verified address, when signed in by email rather than password. */
  email?: string;
  name?: string | null;
  code?: string;
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

export interface AutomationSettings {
  guestPrep: boolean;
  monthlyLetter: boolean;
  letterTo: string;
  cleanerPhone: string;
}

export interface SharedWorkItem {
  key: string;
  title: string;
  status: 'claimed' | 'done';
  ownerName: string;
  result: string;
  atDenver: string;
  stale: boolean;
}

export interface YieldMove {
  house: string;
  propertyId: string;
  firstNight: string;
  lastNight: string;
  nights: number;
  action: string;
  promotionPercent: number | null;
  airbnbListNightly: number | null;
  vrboListNightly: number | null;
  airbnbPromoListNightly: number | null;
  vrboPromoListNightly: number | null;
  minStay: string | null;
  event: string | null;
  workKey?: string;
  taken?: {
    ownerName: string;
    status: 'claimed' | 'done';
    atDenver: string;
    result: string;
    blocksRepeat: boolean;
    stale: boolean;
  } | null;
}

export interface GuidePlace {
  name: string;
  kind: 'ski' | 'food' | 'outdoors' | 'family' | 'rentals' | 'essentials';
  note: string;
  area?: string;
  url?: string;
}

export interface HouseGuide {
  enabled: boolean;
  headline: string;
  address: string;
  checkInTime: string;
  checkOutTime: string;
  wifiName: string;
  wifiPassword: string;
  doorCode: string;
  doorNotes: string;
  parking: string;
  arrival: string;
  checkout: string;
  houseRules: string;
  contactPhone: string;
  contactEmail: string;
  emergency: string;
  sections: Array<{ title: string; body: string }>;
  videos: Array<{ title: string; url: string }>;
  places: GuidePlace[];
  controls: Array<{ name: string; entityId: string; kind: 'light' }>;
  updatedAt?: string;
}

export interface StayThreadMessage {
  id: string;
  from: 'guest' | 'host';
  text: string;
  at: string;
}

export interface ConciergeChatMessage {
  id: string;
  from: 'guest' | 'nora';
  text: string;
  at: string;
}

export interface StayGuide {
  enabled: boolean;
  guestName: string;
  propertyId: 'ranch' | 'lindon' | 'river';
  propertyName: string;
  /**
   * Which parts of the Riverhouse this stay occupies.
   *
   * Absent or empty means the whole house, which is every stay recorded before the house was sold in parts. A part
   * guest must be told which part, and that the rest of the house may be someone else's — without this the portal reads
   * as a whole-house booking.
   */
  units?: string[];
  checkIn: string;
  checkOut: string;
  /** Overnight guests for this stay when known from preferences or the booking note. */
  partyGuests?: number;
  partyChildren?: number;
  preferencesDone: boolean;
  /** True when the preference survey was submitted. It can be submitted with no answers. */
  hasSurvey?: boolean;
  /** Paused when saved bookings could not be read. The phone does not call a night free. */
  storageReads?: 'ok' | 'paused';
  /** True when the night before check-in is empty. Omitted by older servers. Null when the calendar was not read. */
  nightBeforeFree?: boolean | null;
  /** True when nobody is arriving on checkout day. Omitted by older servers. Null when the calendar was not read. */
  checkoutNightFree?: boolean | null;
  access: {
    phase: 'before' | 'during' | 'after';
    opensOn: string;
    preview: boolean;
    unlocked: boolean;
    wifiName: string | null;
    wifiPassword: string | null;
    doorCode: string | null;
    doorNotes: string | null;
  };
  guide: Omit<HouseGuide, 'enabled' | 'wifiName' | 'wifiPassword' | 'doorCode' | 'doorNotes' | 'updatedAt'>;
}

export type StayGuideResponse = StayGuide | { enabled: false; guestName?: undefined };

export interface YieldPlan {
  asOf: string;
  days: number;
  howToUse: string;
  houses: Array<{
    propertyId: string;
    house: string;
    goal: { target: number; window: string; booked: number; stillNeeded: number; askHostNightly: number | null };
    openNightsNext90: number;
    needsComps: boolean;
    weekends: Array<{ friday: string; status: 'booked' | 'half booked' | 'open' | 'not open yet'; event: string | null }>;
    moves: YieldMove[];
    seasonRates?: Array<{
      season: string;
      firstNight: string;
      lastNight: string;
      weekendHostNet: number;
      weekdayHostNet: number;
      weekendAirbnb: number;
      weekendVrbo: number;
      weekdayAirbnb: number;
      weekdayVrbo: number;
      minWeekend: number;
      minWeekday: number;
    }>;
  }>;
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
  /**
   * Sign in with a Google ID token from the browser.
   *
   * The token is verified on the server against Google's published keys, then the address is checked
   * against the allowlist. Nothing about access is decided here.
   */
  loginWithGoogle: (credential: string) =>
    request<SessionInfo>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    }),
  /** What the login screen needs: whether Google sign-in exists, and the client id for the button. */
  getLoginOptions: () =>
    request<{
      emailSignIn: boolean;
      passwordSignIn: boolean;
      googleClientId: string | null;
      summary: string;
      allowedCount: number;
    }>('/api/auth/login'),
  signOut: () => request<{ ok: boolean }>('/api/auth/login', { method: 'DELETE' }),
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
  /** A delete is archived first, so `archived` says the row can be put back. */
  deleteExpense: (id: string, reason?: string) =>
    request<{ ok: boolean; archived?: boolean; restore?: string }>(
      `/api/expenses/${encodeURIComponent(id)}${reason ? `?reason=${encodeURIComponent(reason)}` : ''}`,
      { method: 'DELETE' },
    ),
  /** Removed expenses that can be restored. Not a total: see the line it returns. */
  getExpenseArchive: () =>
    request<{
      archived: Array<{
        id: string;
        removedAt: string;
        reason?: string;
        description: string;
        amount: number;
        propertyId: string | null;
        date: string | null;
        hasReceipt: boolean;
      }> | null;
      line: string | null;
      storageReads?: 'ok' | 'paused';
    }>('/api/expenses/archive'),
  /** Put one removed expense back exactly as it was. */
  restoreExpense: (id: string) =>
    request<{ ok: boolean; restored: string; line: string }>(
      `/api/expenses/archive?restore=${encodeURIComponent(id)}`,
      { method: 'POST' },
    ),
  /** Drop an archived row and its files for good. The only path that deletes a receipt now. */
  purgeExpense: (id: string) =>
    request<{ ok: boolean; purged: string; line: string }>(
      `/api/expenses/archive?purge=${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    ),
  updateExpense: (
    id: string,
    body: {
      paidBy?: PaidBy | null;
      stage?: string | null;
      paidDate?: string | null;
      note?: string | null;
      vendor?: string | null;
      category?: string;
      amount?: number;
    },
  ) =>
    request<Expense>(`/api/expenses/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  expenseReceiptUrl: (expenseId: string) =>
    `${API_URL}/api/expenses/${encodeURIComponent(expenseId)}/receipt`,
  expensePhotoUrl: (expenseId: string, photoId: string) =>
    `${API_URL}/api/expenses/${encodeURIComponent(expenseId)}/photos/${encodeURIComponent(photoId)}`,
  addExpensePhoto: (id: string, body: { imageBase64: string; mimeType: string }) =>
    request<Expense & { photoWarning?: string | null }>(
      `/api/expenses/${encodeURIComponent(id)}/photos`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    ),
  deleteExpensePhoto: (id: string, photoId: string) =>
    request<Expense>(
      `/api/expenses/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}`,
      { method: 'DELETE' },
    ),
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
  /** Saved comps and the asks they carry. Read only. */
  getCompSnapshots: (house?: string) =>
    request<{
      liveComps: LiveComp[] | null;
      snaps: LiveSnap[] | null;
      storageReads?: 'ok' | 'paused';
      /** Comps saved before a house was required. They set no band until a house is set. */
      needsHouse?: number;
    }>(`/api/pricing/snapshots${house ? `?house=${house}` : ''}`),
  saveComp: (body: {
    platform: 'airbnb' | 'vrbo';
    url: string;
    label: string;
    propertyId?: 'ranch' | 'lindon' | 'river' | 'both';
    sleeps: number;
    distanceMi: number;
    area?: string;
    rating?: number;
    reviews?: number;
    guestFavorite?: boolean;
  }) =>
    request<{ id: string; label: string }>('/api/pricing/comp-set', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /** Record the asks a saved comp lists. Without one the live band cannot activate. */
  saveCompAsks: (body: { compId: string; asks: Array<{ date: string; nightlyRate: number }> }) =>
    request<{ ok: boolean; saved: number; compId: string }>('/api/pricing/snapshots', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /** The house settings a check-in draft and a cleaner notice are built from. Host only. */
  getHouseSettings: () =>
    request<{
      config: Record<string, { houseRules?: string; lockCodeTemplate?: string; cleanerEmail?: string; cleanerPhone?: string }>;
      storageReads?: string;
    }>('/api/operations/config'),
  /** Save one house's settings. Merges, so another house's rules are never overwritten. */
  saveHouseSettings: (body: {
    house: string;
    houseRules?: string;
    lockCodeTemplate?: string;
    cleanerEmail?: string;
    cleanerPhone?: string;
  }) =>
    request<{ ok: boolean; house: string }>('/api/operations/config', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /** The host-approved guest rates. This is the only comp-driven price a guest can be charged. */
  getApprovedRates: (house?: string) =>
    request<{
      approved: Array<{ house: string; date: string; guest: number; approvedAt: string }> | null;
      line: string;
      storageReads?: 'ok' | 'paused';
    }>(`/api/pricing/approved-rates${house ? `?house=${encodeURIComponent(house)}` : ''}`),
  /** Approve one night's guest price. Refused on a booked or closed night, and outside the cap. */
  approveRate: (body: { house: string; date: string; guest: number }) =>
    request<{
      ok: boolean;
      approved: { house: string; date: string; guest: number; approvedAt: string };
      nights: number;
      /** Nights the sheet cap evicted to make room. Non-zero means the desk should say so. */
      dropped: number;
      line: string;
    }>('/api/pricing/approved-rates', { method: 'POST', body: JSON.stringify(body) }),
  /** Take one approval back, so the night returns to the published card. */
  clearApprovedRate: (house: string, date: string) =>
    request<{ ok: boolean; nights: number; line: string }>(
      `/api/pricing/approved-rates?house=${encodeURIComponent(house)}&date=${encodeURIComponent(date)}`,
      { method: 'DELETE' },
    ),
  /**
   * Approve a whole plan in one write.
   *
   * The 8% cap needs one approval per night per day, so a two-week climb on a seven-night plan was ~100
   * single-night calls. Each night still carries its own outcome, so a refused night is visible rather than
   * swallowed.
   */
  approveRateBatch: (body: { house: string; nights: Array<{ date: string; guest: number }> }) =>
    request<{
      ok: boolean;
      approved: number;
      refused: number;
      dropped: number;
      line: string;
      nights: Array<{ date: string; ok: boolean; written: number; reason: string | null }>;
    }>('/api/pricing/approved-rates', { method: 'PUT', body: JSON.stringify(body) }),
  /**
   * The three Riverhouse units: price, whether each is sellable, and its free nights.
   *
   * `units: null` means the sheet could not be read, which is not the same as three unpriced units.
   */
  getRiverUnits: () =>
    request<{
      units:
        | Array<{
            id: string;
            name: string;
            sleeps: number;
            bedrooms: number;
            beds: number;
            baths: number;
            rate: { nightly: number | null; cleaning: number | null; minNights: number | null };
            rateState: 'unset' | 'partial' | 'ready';
            rateLine: string;
            sellable: boolean;
            freeNights: number;
          }>
        | null;
      wholeHouse: { freeNights: number } | null;
      storageReads?: 'ok' | 'paused';
      publishes?: boolean;
      publishNote?: string;
    }>('/api/pricing/river-units'),
  /** Set one unit's price. Merges, so the other two units keep their rates. */
  saveRiverUnit: (body: { unit: string; nightly?: number; cleaning?: number; minNights?: number }) =>
    request<{
      ok: boolean;
      unit: string;
      rate: { nightly: number | null; cleaning: number | null; minNights: number | null };
      rateLine: string;
      sellable: boolean;
      publishes?: boolean;
    }>('/api/pricing/river-units', { method: 'PUT', body: JSON.stringify(body) }),
  /**
   * Whether to sell the Riverhouse whole or in parts for a range.
   *
   * `decision: null` is a real answer, not an error: it means no part has a price, so there is nothing to split and the
   * route says which part is missing.
   */
  getRiverSplit: (from: string, until: string, mode?: 'auto' | 'suggest-only' | 'off') =>
    request<{
      decision: {
        choice: 'whole' | 'split' | 'both';
        reason: string;
        wholeExpected: number;
        splitExpected: number;
        units: string[];
        heldWholeForPeak?: boolean;
      } | null;
      mode?: string;
      /** True when the answer used the saved setting rather than one named in the URL. */
      modeFromStorage?: boolean;
      /** What the engine chose before the mode, and whether the mode overrode it. */
      engineChoice?: string;
      overridden?: boolean;
      modeLine?: string | null;
      from?: string;
      until?: string;
      nights?: number;
      wholeNightly?: number;
      pricedUnits?: string[];
      publishes?: boolean;
      writeNote?: string;
      reason?: string;
      storageReads?: 'ok' | 'paused';
    }>(
      `/api/pricing/river-split?from=${encodeURIComponent(from)}&until=${encodeURIComponent(until)}${
        mode ? `&mode=${encodeURIComponent(mode)}` : ''
      }`,
    ),
  /** Save the whole-versus-split setting, so it survives a reload. */
  saveRiverSplitMode: (mode: 'auto' | 'suggest-only' | 'off') =>
    request<{ ok: boolean; mode: 'auto' | 'suggest-only' | 'off'; publishes?: boolean; note: string }>(
      '/api/pricing/river-split',
      { method: 'PUT', body: JSON.stringify({ mode }) },
    ),
  getBookingRequests: () =>
    request<{
      rows:
        | Array<
            InboxRow & {
              /** What to accept this request for, so the host is not typing a payout blind. */
              payouts?: Array<{
                house: string;
                guestTotal: number;
                cleaning: number;
                hostNet: number;
                nights: number;
              }>;
              payoutLine?: string;
            }
          >
        | null;
      summary: string | null;
      /** Why requests were declined recently, so a repeated reason is visible. */
      declineTally?: { total: number; line: string } | null;
      storageReads?: 'ok' | 'paused';
      /** Set only by the local dev fixture. The saved list is on the deployed route. */
      source?: 'dev-preview';
    }>('/api/book/requests'),
  /** The durable shadow clock. A saved day is server-side, so a cleared tab cannot reset the week. */
  getShadowDays: () =>
    request<{
      clock: { days: number; required: number; ready: boolean; dates: string[] } | null;
      hasWriteToken: boolean;
      days: Array<{ date: string }> | null;
      storageReads?: 'ok' | 'paused';
      source?: 'dev-preview';
    }>('/api/pricing/shadow-days'),
  saveShadowDay: (body: { date: string; digest: string }) =>
    request<{
      clock: { days: number; required: number; ready: boolean; dates: string[] };
      days: Array<{ date: string }>;
    }>('/api/pricing/shadow-days', { method: 'POST', body: JSON.stringify(body) }),
  /** Take a saved request and make it a booking. Host only. It sends nothing. */
  /**
   * The money received against one direct booking, and the balance that follows.
   *
   * A booking with no recorded total answers `outstanding: null`, never `0` — the balance is unknown, and a
   * zero would read as settled.
   */
  bookingPayments: (id: string) =>
    request<BookingLedger & { id: string; propertyId: string; checkIn: string; checkOut: string; source: string; direct: boolean }>(
      `/api/book/payments?id=${encodeURIComponent(id)}`,
    ),
  recordBookingPayment: (body: { id: string; payment: NewPayment }) =>
    request<
      BookingLedger & {
        ok: boolean;
        id: string;
        payment?: NewPayment & { id: string };
        /** True when this payment id was already recorded, so a retry did not count it twice. */
        duplicate?: boolean;
        sent: number;
        note: string;
      }
    >('/api/book/payments', { method: 'POST', body: JSON.stringify(body) }),
  removeBookingPayment: (id: string, paymentId: string) =>
    request<
      BookingLedger & { ok: boolean; id: string; removed: string; note: string }
    >(`/api/book/payments?id=${encodeURIComponent(id)}&paymentId=${encodeURIComponent(paymentId)}`, {
      method: 'DELETE',
    }),
  acceptBookingRequest: (body: { id: string; payout: number; source?: string }) =>
    request<{
      ok: boolean;
      reservationId: string;
      /** One entry per house. A two-house request returns two. */
      reservations: Array<{ id: string; propertyId: string }>;
      /** One entry per house, so a two-house booking shows both pages. */
      portalLinks: Array<{ propertyId: string; link: string | null }>;
      line: string;
      /**
       * A second party in the building on these nights, when the booking is one part of the Riverhouse.
       *
       * The building has a single door code, so two guests behind one code is a decision the host should see at the
       * moment they accept. Null when nobody else is there.
       */
      sharedHouse?: string | null;
      portalLink: string | null;
      portalError: string | null;
      portalNote: string | null;
      /**
       * Set when the hold on the request had already ended, so the nights were never actually
       * reserved. Null when the hold was live.
       */
      holdLine?: string | null;
      guideOn: boolean;
      guestEmailed: boolean;
      guestEmailError: string | null;
      guestLine: string | null;
    }>('/api/book/accept', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /** Decline a saved request with a reason. Host only. It records the decision and books nothing. */
  /**
   * Remove a request without answering the guest. For a duplicate, a test, or one already handled by
   * phone. Nothing is emailed; `declineBookingRequest` is the one that tells the guest.
   */
  discardBookingRequest: (id: string) =>
    request<{ ok: boolean; id: string; remaining: number; sent: number; note: string }>('/api/book/discard', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),
  declineBookingRequest: (body: { id: string; reason: string; note?: string; notify?: boolean }) =>
    request<{
      ok: boolean;
      line: string;
      reason: string;
      guestEmailed: boolean;
      guestEmailError: string | null;
    }>('/api/book/decline', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /** Cleaner links. Host only, and making one does not text it. */
  getCleanLinks: () =>
    request<{
      links:
        | Array<{ token: string; label: string; path: string; createdAt: string; lastViewedAt: string | null; views: number }>
        | null;
      storageReads?: 'ok' | 'paused';
    }>('/api/clean/links'),
  mintCleanLink: (label: string) =>
    request<{ token: string; label: string; path: string; createdAt: string }>('/api/clean/links', {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),
  revokeCleanLink: (token: string) =>
    request<{ ok: boolean }>(`/api/clean/links?token=${encodeURIComponent(token)}`, { method: 'DELETE' }),
  /** The ticks cleaners made on their own links. Host only. */
  getCleanProgress: () =>
    request<{
      progress: CleanProgress[] | null;
      summary: string | null;
      storageReads?: 'ok' | 'paused';
      /** False when this site cannot store a room photo, so the photo step must not demand one. */
      photosAvailable?: boolean;
    }>('/api/clean/progress'),
  /**
   * Tick a step from the host's desk, into the **same** store the cleaner writes to.
   *
   * The desk's boxes used to write to `sessionStorage`, so ticking one changed nothing that the count or the line
   * beside it could see — measured on production, `0 of 7` before and after a click.
   */
  saveCleanProgress: (body: { house: string; checkout: string; done: string[] }) =>
    request<{ ok: boolean; progress: CleanProgress[] }>('/api/clean/progress', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /** Room photos cleaners uploaded from their own links, grouped by turn. Host only. */
  getCleanPhotoTurns: () =>
    request<{
      turns: Record<string, Array<{ path: string; label: string; url: string }>>;
      counts: Record<string, string>;
      storageReads?: 'ok' | 'paused';
    }>('/api/clean/photos'),
  /** What a rate push would change. Host only, and it never sends. */
  getPushPlan: () =>
    request<{
      plans:
        | Array<{
            house: string;
            allowed: boolean;
            hold: string | null;
            nights: Array<{ date: string; from: number; to: number; kind: string }>;
            line: string;
            lines: string[];
          }>
        | null;
      summary: string | null;
      gate: { shadowReady: boolean; hasToken: boolean; paused: boolean; calendarReady: boolean };
      shadowDays: { days: number; required: number; ready: boolean };
      storageReads?: 'ok' | 'paused';
    }>('/api/pricing/push-plan'),
  /** Todd's read-only links. Host only, and making one does not send it. */
  getOwnerLinks: () =>
    request<{
      links:
        | Array<{ token: string; path: string; createdAt: string; lastViewedAt: string | null; views: number }>
        | null;
      storageReads?: 'ok' | 'paused';
    }>('/api/owner/links'),
  mintOwnerLink: () =>
    request<{ token: string; path: string; createdAt: string }>('/api/owner/links', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  getGmailStatus: () =>
    request<{ connected: boolean; email: string | null }>('/api/integrations/gmail/status'),
  getBriefing: (month: string) =>
    request<{ line: string; cached?: boolean }>(`/api/agent/briefing?month=${encodeURIComponent(month)}`),
  getAutomation: () =>
    request<{
      guestPrep: boolean;
      monthlyLetter: boolean;
      letterTo: string;
      cleanerPhone: string;
    }>('/api/automation'),
  saveAutomation: (body: {
    guestPrep: boolean;
    monthlyLetter: boolean;
    letterTo: string;
    cleanerPhone: string;
  }) =>
    request<{
      guestPrep: boolean;
      monthlyLetter: boolean;
      letterTo: string;
      cleanerPhone: string;
    }>('/api/automation', { method: 'PUT', body: JSON.stringify(body) }),
  runAutomation: () =>
    request<{ ran: boolean; notes: string[] }>('/api/automation/run', { method: 'POST' }),
  getPricingAlerts: () => request<{ alerts: PricingAlert[] }>('/api/pricing/alerts'),
  getYieldPlan: (days = 90) => request<YieldPlan>(`/api/pricing/yield-plan?days=${days}`),
  getSharedWork: () =>
    request<{
      open: SharedWorkItem[];
      done: SharedWorkItem[];
    }>('/api/agent/work'),
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
      documents: ConstructionDocument[] | null;
      storageReads?: 'ok' | 'paused';
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
      gmail: { connected: boolean; email: string | null; oauthConfigured?: boolean } | null;
      sms: { configured: boolean; from: string | null } | null;
      storageReads?: 'ok' | 'paused';
    }>('/api/surveys'),
  updateReservationContacts: (
    id: string,
    body: { guestEmail?: string; guestPhone?: string; confirmationCode?: string },
  ) =>
    request<Reservation>(`/api/reservations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  sendGuestSurvey: (body: {
    reservationId?: string;
    confirmationCode?: string;
    channel: 'email' | 'sms' | 'none';
    guestEmail?: string;
    guestPhone?: string;
  }) =>
    request<{
      ok: boolean;
      token: string;
      link: string;
      channel: string;
      reservationId?: string;
      confirmationCode?: string | null;
    }>('/api/surveys/send', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /**
   * Give every upcoming stay a portal link. Sends nothing — `sent` comes back 0 on purpose.
   * Safe to press twice: a stay that already has a link keeps the one it has.
   */
  mintGuestLinks: () =>
    request<{
      ok: boolean;
      sent: number;
      minted: number;
      skipped: number;
      byHouse: Record<string, number>;
      guideOff: string[];
      links: Array<{ reservationId: string; propertyId: string; checkIn: string; link: string }>;
    }>('/api/surveys/mint-links', { method: 'POST' }),
  getStayGuide: (token: string, preview = false, ready = false) => {
    const params = new URLSearchParams();
    if (preview) params.set('preview', '1');
    if (ready) params.set('ready', '1');
    const query = params.toString();
    return request<StayGuideResponse>(`/api/stay-guide/${encodeURIComponent(token)}${query ? `?${query}` : ''}`);
  },
  getConciergeChat: (token: string, preview = false) =>
    request<{ messages: ConciergeChatMessage[] }>(
      `/api/stay-guide/${encodeURIComponent(token)}/chat${preview ? '?preview=1' : ''}`,
    ),
  askConcierge: (token: string, text: string, preview = false) =>
    request<{ reply: string; messages: ConciergeChatMessage[] }>(
      `/api/stay-guide/${encodeURIComponent(token)}/chat${preview ? '?preview=1' : ''}`,
      { method: 'POST', body: JSON.stringify({ text }) },
    ),
  conciergeTextHost: (token: string, note: string, preview = false) =>
    request<{ sent: boolean; tellGuest: string }>(
      `/api/stay-guide/${encodeURIComponent(token)}/message${preview ? '?preview=1' : ''}`,
      { method: 'POST', body: JSON.stringify({ note }) },
    ),
  getStayThread: (token: string, preview = false) =>
    request<{ messages: StayThreadMessage[] }>(
      `/api/stay-guide/${encodeURIComponent(token)}/thread${preview ? '?preview=1' : ''}`,
    ),
  replyStayThread: (token: string, text: string) =>
    request<{ message: StayThreadMessage }>(
      `/api/stay-guide/${encodeURIComponent(token)}/thread?preview=1`,
      { method: 'POST', body: JSON.stringify({ text }) },
    ),
  conciergeControl: (
    token: string,
    body: { name: string; action: string; brightness?: number },
    preview = false,
  ) =>
    request<{ ok: boolean; tellGuest: string }>(
      `/api/stay-guide/${encodeURIComponent(token)}/control${preview ? '?preview=1' : ''}`,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  getGuestGuides: () => request<{ guides: Record<'ranch' | 'lindon' | 'river', HouseGuide> }>('/api/guest-guide'),
  saveGuestGuide: (propertyId: 'ranch' | 'lindon' | 'river', guide: Partial<HouseGuide>) =>
    request<{ ok: boolean; guide: HouseGuide }>('/api/guest-guide', {
      method: 'POST',
      body: JSON.stringify({ propertyId, guide }),
    }),
  getPublicStayPreference: (token: string) =>
    request<PublicStayPreference>(`/api/stay-preferences/${encodeURIComponent(token)}`),
  submitPublicStayPreference: (token: string, answers: GuestPreferenceAnswers) =>
    request<{ ok: boolean }>(`/api/stay-preferences/${encodeURIComponent(token)}`, {
      method: 'POST',
      body: JSON.stringify(answers),
    }),
  getVaultDocuments: () =>
    request<{
      documents: VaultDocument[] | null;
      storageReads?: 'ok' | 'paused';
      limits?: { maxMb: number; firebaseConfigured: boolean };
      gmail?: { connected: boolean; email: string | null; oauthConfigured?: boolean } | null;
      sms?: { configured: boolean; from: string | null } | null;
    }>('/api/esign/documents'),
  getFormTemplates: () =>
    request<{
      templates: FormTemplate[];
      categories: Array<{ id: FormCategory; label: string }>;
    }>('/api/esign/templates'),
  parseInvoiceForForm: (body: {
    type: 'text' | 'image' | 'gmail' | 'gmail-search';
    text?: string;
    imageBase64?: string;
    mimeType?: string;
    templateId?: string;
    query?: string;
    messageId?: string;
  }) =>
    request<{
      fields?: Record<string, string | number>;
      missing?: string[];
      parsed?: Record<string, unknown>;
      templateId?: string;
      messages?: Array<{ id: string; subject: string; from: string; date: string }>;
    }>('/api/esign/parse-invoice', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
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
    cleaningFee: 600,
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
