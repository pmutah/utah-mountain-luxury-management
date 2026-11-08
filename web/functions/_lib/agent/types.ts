export type PropertyId = 'ranch' | 'lindon' | 'river';

export type ReservationStatus = 'confirmed' | 'cancelled' | 'blocked' | 'pending';

export interface ReservationRecord {
  id: string;
  guestName: string;
  propertyId: PropertyId;
  checkIn: string;
  checkOut: string;
  /** Host net after Airbnb/VRBO taxes and fees — what we keep from the booking. */
  payout: number;
  /**
   * What the guest was quoted for this house, before tax, when it was known at booking time.
   *
   * Optional because a channel booking imported from an iCal feed never carries one, and an older row
   * predates the field. Absent means "not known", never zero: a zero would read as a comped stay.
   */
  guestTotal?: number;
  source: string;
  status?: ReservationStatus;
  note?: string;
  createdAt?: string;
  /** Stable id from Hospitable / OTA iCal VEVENT UID */
  icalUid?: string;
  guestEmail?: string;
  guestPhone?: string;
  /** Airbnb / Hospitable / VRBO confirmation code (e.g. HMB9PP5E8F). */
  confirmationCode?: string;
  surveyToken?: string;
  surveySentAt?: string;
  surveyChannel?: 'email' | 'sms' | 'none';
  surveyCompletedAt?: string;
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
  river?: string;
  lastSyncedAt?: string;
}

export interface ICalEvent {
  uid: string;
  propertyId?: PropertyId;
  start: string;
  end: string;
  summary?: string;
  description?: string;
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
  /** Guests the listing sleeps. Without it the comp cannot set the rate band. */
  sleeps?: number;
  /** Miles from this house. Without it the comp cannot set the rate band. */
  distanceMi?: number;
  area?: string;
  rating?: number;
  reviews?: number;
  guestFavorite?: boolean;
  /**
   * True when this listing is one of our own houses. A house must never be compared with itself: our
   * published ask would count as a market observation and the engine would read its own rate as the median.
   */
  isOwn?: boolean;
  /**
   * The shortest stay the listing will book. A listing with a 28-night minimum is a mid-term rental,
   * not a nightly competitor, so its rate is not an ask for a two- or seven-night stay.
   */
  minNights?: number;
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
  MUSE_BOT_SECRET?: string;
  AMANDA_BOT_SECRET?: string;
  GEMINI_API_KEY?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  OPENAI_API_KEY?: string;
  XAI_API_KEY?: string;
  HOME_ASSISTANT_URL?: string;
  HOME_ASSISTANT_TOKEN?: string;
  PRICELABS_API_KEY?: string;
  SETTINGS?: KVNamespace;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  UML_TWILIO_SMS_FROM?: string;
  TWILIO_SMS_FROM?: string;
  SURVEY_NOTIFY_EMAILS?: string;
}
