import { kvGet, kvPut } from './kv-json';
import type { SettingsEnv } from './kv';
import type { PropertyId } from './agent/types';
import type { SurveyChannel, SurveyVariant } from './survey-fields';
import { surveyVariantForProperty } from './survey-fields';

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
  propertyId: PropertyId;
  guestName: string;
  checkIn: string;
  checkOut: string;
  createdAt: string;
  sentAt?: string;
  channel?: SurveyChannel;
  completedAt?: string;
  variant?: SurveyVariant;
  confirmationCode?: string;
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
    confirmationCode?: string;
  },
): Promise<GuestSurveyRecord> {
  const list = await loadSurveys(env);
  const existing = list.find((s) => s.reservationId === stay.id);
  if (existing) {
    const next = {
      ...existing,
      variant: existing.variant ?? surveyVariantForProperty(stay.propertyId),
      confirmationCode: stay.confirmationCode || existing.confirmationCode,
    };
    if (next.variant !== existing.variant || next.confirmationCode !== existing.confirmationCode) {
      const idx = list.findIndex((s) => s.token === existing.token);
      list[idx] = next;
      await saveSurveys(env, list);
    }
    return next;
  }
  const item: GuestSurveyRecord = {
    token: crypto.randomUUID().replace(/-/g, ''),
    reservationId: stay.id,
    propertyId: stay.propertyId,
    guestName: stay.guestName,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    createdAt: new Date().toISOString(),
    variant: surveyVariantForProperty(stay.propertyId),
    confirmationCode: stay.confirmationCode,
  };
  list.push(item);
  await saveSurveys(env, list);
  return item;
}

/**
 * Make surveys for many stays in **one** write.
 *
 * `upsertSurveyForStay` saves the whole survey list every time it changes anything, so calling it in a
 * loop is one write to the same KV key per stay. Cloudflare allows one write per key per second: on
 * 2026-11-08 the first production backfill tried 25 stays, minted 11, and the other 14 failed with
 * `KV PUT failed: 429 Too Many Requests`. The loop was the bug, not the storage.
 *
 * This does the same work against a single loaded list and saves once. Existing surveys keep their
 * token, which is what makes a repeat run safe: a guest's live link is never moved.
 */
export async function upsertSurveysForStays(
  env: SettingsEnv,
  stays: ReadonlyArray<{
    id: string;
    propertyId: PropertyId;
    guestName: string;
    checkIn: string;
    checkOut: string;
    confirmationCode?: string;
  }>,
): Promise<GuestSurveyRecord[]> {
  if (stays.length === 0) return [];
  const list = await loadSurveys(env);
  const byStay = new Map(list.map((survey) => [survey.reservationId, survey]));
  const out: GuestSurveyRecord[] = [];
  let dirty = false;

  for (const stay of stays) {
    const existing = byStay.get(stay.id);
    if (existing) {
      const variant = existing.variant ?? surveyVariantForProperty(stay.propertyId);
      const confirmationCode = stay.confirmationCode || existing.confirmationCode;
      if (variant !== existing.variant || confirmationCode !== existing.confirmationCode) {
        const idx = list.findIndex((survey) => survey.token === existing.token);
        list[idx] = { ...existing, variant, confirmationCode };
        dirty = true;
        out.push(list[idx]!);
      } else {
        out.push(existing);
      }
      continue;
    }
    const item: GuestSurveyRecord = {
      token: crypto.randomUUID().replace(/-/g, ''),
      reservationId: stay.id,
      propertyId: stay.propertyId,
      guestName: stay.guestName,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      createdAt: new Date().toISOString(),
      variant: surveyVariantForProperty(stay.propertyId),
      confirmationCode: stay.confirmationCode,
    };
    list.push(item);
    byStay.set(stay.id, item);
    dirty = true;
    out.push(item);
  }

  if (dirty) await saveSurveys(env, list);
  return out;
}

export async function markSurveySent(
  env: SettingsEnv,
  token: string,
  channel: SurveyChannel,
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

/**
 * Clear one card, so it can be filled again.
 *
 * `saveSurveyAnswers` stamps `completedAt` unconditionally, and `preferencesDone` keys off exactly that — so once a
 * card is submitted there is no way back, for a guest who submitted by mistake or for a card entered in error.
 *
 * I needed it myself: verifying this write path put a probe card on a **real** guest's stay, and the only way to
 * undo it was to delete her whole survey, which would also have destroyed her token and her link.
 *
 * Scoped to one token. `answers` and `completedAt` are removed; the token, the stay, and the sent history stay, so
 * the guest's link still opens the form.
 */
export async function clearSurveyAnswers(
  env: SettingsEnv,
  token: string,
): Promise<{ cleared: GuestSurveyRecord; reservationId: string } | null> {
  const list = await loadSurveys(env);
  const idx = list.findIndex((s) => s.token === token);
  if (idx < 0) return null;
  const existing = list[idx]!;
  const next: GuestSurveyRecord = { ...existing };
  delete (next as { answers?: unknown }).answers;
  delete (next as { completedAt?: unknown }).completedAt;
  list[idx] = next;
  await saveSurveys(env, list);
  return { cleared: next, reservationId: existing.reservationId };
}
