export type PropertyId = 'ranch' | 'lindon';

export type ReservationStatus = 'confirmed' | 'cancelled' | 'blocked' | 'pending';

export interface ReservationRecord {
  id: string;
  guestName: string;
  propertyId: PropertyId;
  checkIn: string;
  checkOut: string;
  payout: number;
  source: string;
  status?: ReservationStatus;
  note?: string;
  createdAt?: string;
  /** Stable id from Hospitable / OTA iCal VEVENT UID */
  icalUid?: string;
}

export interface CalendarBlock {
  id: string;
  propertyId: PropertyId;
  start: string;
  end: string;
  type: 'maintenance' | 'owner' | 'blocked';
  note?: string;
  createdAt?: string;
}

export interface ICalFeedConfig {
  ranch?: string;
  lindon?: string;
  lastSyncedAt?: string;
}

export interface ICalEvent {
  uid: string;
  propertyId?: PropertyId;
  start: string;
  end: string;
  summary?: string;
  source: 'ical';
}

export interface OpsTask {
  id: string;
  propertyId: PropertyId;
  reservationId?: string;
  dueDate: string;
  status: 'pending' | 'done' | 'cancelled';
  type: 'cleaning' | 'maintenance' | 'other';
  assignee?: string;
  notes?: string;
  createdAt?: string;
}

export interface PropertyOpsConfig {
  houseRules?: string;
  cleanerEmail?: string;
  cleanerPhone?: string;
  lockCodeTemplate?: string;
}

export interface GmailTokens {
  refreshToken: string;
  accessToken: string;
  expiry: number;
  email: string;
}

export interface EmailDraft {
  id: string;
  to?: string;
  subject: string;
  body: string;
  threadId?: string;
  status: 'pending' | 'sent' | 'dismissed';
  createdAt: string;
}

export interface ListingConfig {
  airbnbUrl?: string;
  vrboUrl?: string;
  targetMinNightly?: number;
  strategyNotes?: string;
}

export interface CompListing {
  id: string;
  platform: 'airbnb' | 'vrbo';
  url: string;
  label: string;
  bedrooms?: number;
  propertyId?: PropertyId | 'both';
  notes?: string;
  createdAt?: string;
}

export interface PriceSnapshot {
  compId: string;
  date: string;
  nightlyRate: number;
  cleaningFee?: number;
  totalStay?: number;
  fetchedAt: string;
  source: 'manual' | 'scrape' | 'pricelabs';
}

export interface PricingAlert {
  id: string;
  propertyId: PropertyId;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  suggestedAction?: string;
  createdAt: string;
  dismissed?: boolean;
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

export interface AgentChatContext {
  month?: string;
  activeTab?: string;
}

export interface AgentChatResponse {
  sessionId: string;
  reply: string;
  messages: AgentMessage[];
  toolSteps: ToolStep[];
}

export interface AgentEnv {
  GEMINI_API_KEY?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  OPENAI_API_KEY?: string;
  PRICELABS_API_KEY?: string;
  SETTINGS?: KVNamespace;
}
