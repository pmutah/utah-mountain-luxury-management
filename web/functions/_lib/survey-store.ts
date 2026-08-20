import { kvGet, kvPut, newId } from './kv-json';
import type { SettingsEnv } from './kv';
import type { PropertyId } from './agent/types';

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
  propertyId: PropertyId;
  guestName: string;
  checkIn: string;
  checkOut: string;
  createdAt: string;
  sentAt?: string;
  channel?: 'email' | 'sms';
  completedAt?: string;
  answers?: GuestPreferenceAnswers;
}

const KV_KEY = 'guestSurveys';

export async function loadSurveys(env: SettingsEnv): Promise<GuestSurveyRecord[]> {
  return kvGet<GuestSurveyRecord[]>(env, KV_KEY, []);
}

export async function saveSurveys(env: SettingsEnv, items: GuestSurveyRecord[]): Promise<GuestSurveyRecord[]> {
  return kvPut(env, KV_KEY, items);
}

export async function findSurveyByToken(
  env: SettingsEnv,
  token: string,
): Promise<GuestSurveyRecord | null> {
  const list = await loadSurveys(env);
  return list.find((s) => s.token === token) ?? null;
}

export async function findSurveyByReservation(
  env: SettingsEnv,
  reservationId: string,
): Promise<GuestSurveyRecord | null> {
  const list = await loadSurveys(env);
  return list.find((s) => s.reservationId === reservationId) ?? null;
}

export async function upsertSurveyForStay(
  env: SettingsEnv,
  stay: {
    id: string;
    propertyId: PropertyId;
    guestName: string;
    checkIn: string;
    checkOut: string;
  },
): Promise<GuestSurveyRecord> {
  const list = await loadSurveys(env);
  const existing = list.find((s) => s.reservationId === stay.id);
  if (existing) return existing;
  const item: GuestSurveyRecord = {
    token: newId('pref').replace(/^pref-/, ''),
    reservationId: stay.id,
    propertyId: stay.propertyId,
    guestName: stay.guestName,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    createdAt: new Date().toISOString(),
  };
  list.push(item);
  await saveSurveys(env, list);
  return item;
}

export async function markSurveySent(
  env: SettingsEnv,
  token: string,
  channel: 'email' | 'sms',
): Promise<GuestSurveyRecord | null> {
  const list = await loadSurveys(env);
  const idx = list.findIndex((s) => s.token === token);
  if (idx < 0) return null;
  list[idx] = { ...list[idx]!, sentAt: new Date().toISOString(), channel };
  await saveSurveys(env, list);
  return list[idx]!;
}

export async function saveSurveyAnswers(
  env: SettingsEnv,
  token: string,
  answers: GuestPreferenceAnswers,
): Promise<GuestSurveyRecord | null> {
  const list = await loadSurveys(env);
  const idx = list.findIndex((s) => s.token === token);
  if (idx < 0) return null;
  list[idx] = {
    ...list[idx]!,
    answers,
    completedAt: new Date().toISOString(),
  };
  await saveSurveys(env, list);
  return list[idx]!;
}
