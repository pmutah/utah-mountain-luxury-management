import { PROPERTIES, calculateMetrics, portfolioAvgOccupancy } from './data';
import { mergeAllExpenses, withReceiptUrls } from './expenses';
import { gmailSend } from './gmail-store';
import { kvGet, kvPut } from './kv-json';
import { loadExtraCleaningFees, type SettingsEnv } from './kv';
import { addMonths } from './months';
import { getAllReservations } from './reservations-store';
import { upsertSurveyForStay, markSurveySent, findSurveyByReservation } from './survey-store';
import { surveyEmailBody, surveyEmailSubject, surveyPublicUrl, surveySmsBody } from './survey-copy';
import { surveyVariantForProperty } from './survey-fields';
import { sendTwilioSms } from './twilio-sms';
import type { PropertyId } from './agent/types';

export interface AutomationSettings {
  guestPrep: boolean;
  monthlyLetter: boolean;
  letterTo: string;
  cleanerPhone: string;
}

export const DEFAULT_AUTOMATION: AutomationSettings = {
  guestPrep: false,
  monthlyLetter: false,
  letterTo: '',
  cleanerPhone: '',
};

const SETTINGS_KEY = 'automation:settings';
const PREP_DAY_KEY = 'automation:prep-day';
const LETTER_MONTH_KEY = 'automation:letter-month';
const THANKED_KEY = 'automation:thanked';

function denverToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    value || 0,
  );
}

export async function loadAutomation(env: SettingsEnv): Promise<AutomationSettings> {
  return { ...DEFAULT_AUTOMATION, ...(await kvGet(env, SETTINGS_KEY, DEFAULT_AUTOMATION)) };
}

export async function saveAutomation(env: SettingsEnv, next: Partial<AutomationSettings>) {
  const saved = { ...(await loadAutomation(env)), ...next };
  saved.guestPrep = Boolean(saved.guestPrep);
  saved.monthlyLetter = Boolean(saved.monthlyLetter);
  saved.letterTo = String(saved.letterTo ?? '');
  saved.cleanerPhone = String(saved.cleanerPhone ?? '');
  return kvPut(env, SETTINGS_KEY, saved);
}

type Stay = {
  id: string;
  propertyId: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  status?: string;
  guestEmail?: string;
  guestPhone?: string;
  confirmationCode?: string;
};

function active(stay: Stay) {
  return stay.status !== 'cancelled' && stay.status !== 'blocked';
}

export async function runAutomation(env: SettingsEnv, origin: string) {
  const settings = await loadAutomation(env);
  const today = denverToday();
  const notes: string[] = [];
  if (!settings.guestPrep && !settings.monthlyLetter) {
    return { settings, ran: false, notes: ['Both switches are off.'] };
  }

  if (settings.guestPrep) {
    const last = await kvGet(env, PREP_DAY_KEY, '');
    if (last === today) {
      notes.push('Guest prep already ran today.');
    } else {
      const reservations = (await getAllReservations(env)) as Stay[];
      const thanked = await kvGet<string[]>(env, THANKED_KEY, []);
      const arriveOn = addDays(today, 3);
      for (const stay of reservations.filter((item) => active(item) && item.checkIn === arriveOn)) {
        const existing = await findSurveyByReservation(env, stay.id);
        const propertyName = PROPERTIES[stay.propertyId]?.name ?? stay.propertyId;
        if (!existing?.sentAt && (stay.guestEmail || stay.guestPhone)) {
          const survey = await upsertSurveyForStay(env, {
            id: stay.id,
            propertyId: stay.propertyId as PropertyId,
            guestName: stay.guestName,
            checkIn: stay.checkIn,
            checkOut: stay.checkOut,
            confirmationCode: stay.confirmationCode,
          });
          const link = surveyPublicUrl(origin, survey.token);
          const variant = survey.variant ?? surveyVariantForProperty(stay.propertyId);
          if (stay.guestEmail) {
            const sent = await gmailSend(
              env,
              stay.guestEmail,
              surveyEmailSubject(stay.guestName, propertyName),
              surveyEmailBody({
                guestName: stay.guestName,
                propertyName,
                checkIn: stay.checkIn,
                checkOut: stay.checkOut,
                link,
                variant,
              }),
            );
            if (!sent.error) {
              await markSurveySent(env, survey.token, 'email');
              notes.push(`Survey emailed for ${stay.guestName}.`);
            } else notes.push(sent.error);
          } else if (stay.guestPhone) {
            const sent = await sendTwilioSms(
              env,
              stay.guestPhone,
              surveySmsBody({ guestName: stay.guestName, propertyName, link }),
            );
            if (!sent.error) {
              await markSurveySent(env, survey.token, 'sms');
              notes.push(`Survey texted for ${stay.guestName}.`);
            } else notes.push(sent.error);
          }
        }
        if (settings.cleanerPhone) {
          const sent = await sendTwilioSms(
            env,
            settings.cleanerPhone,
            `Prep ${propertyName} for ${stay.guestName}, arriving ${stay.checkIn}.`,
          );
          notes.push(sent.error ?? `Cleaner texted for ${stay.guestName}.`);
        }
      }
      for (const stay of reservations.filter((item) => active(item) && item.checkOut === today)) {
        if (!stay.guestEmail || thanked.includes(stay.id)) continue;
        const propertyName = PROPERTIES[stay.propertyId]?.name ?? stay.propertyId;
        const sent = await gmailSend(
          env,
          stay.guestEmail,
          `Thank you for staying at ${propertyName}`,
          `Dear ${stay.guestName},\n\nThank you for staying at ${propertyName}. When you want the house again, tell us the dates: ${origin}/book\n\nWith care,\nUtah Mountain Luxury`,
        );
        if (!sent.error) {
          thanked.push(stay.id);
          notes.push(`Thank-you sent to ${stay.guestName}.`);
        } else notes.push(sent.error);
      }
      await kvPut(env, THANKED_KEY, thanked.slice(-400));
      await kvPut(env, PREP_DAY_KEY, today);
    }
  }

  if (settings.monthlyLetter) {
    const month = today.slice(0, 7);
    const sentMonth = await kvGet(env, LETTER_MONTH_KEY, '');
    const recipients = settings.letterTo
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter((item) => item.includes('@'));
    if (sentMonth === month) notes.push('This month’s letter already went out.');
    else if (recipients.length === 0) notes.push('Monthly letter is on, but no recipient email is saved.');
    else {
      const previous = addMonths(month, -1);
      const fees = await loadExtraCleaningFees(env);
      const reservations = await getAllReservations(env);
      const expenses = withReceiptUrls(await mergeAllExpenses(env));
      const ranch = calculateMetrics('ranch', previous, fees, expenses, reservations);
      const lindon = calculateMetrics('lindon', previous, fees, expenses, reservations);
      const river = calculateMetrics('river', previous, fees, expenses, reservations);
      const revenue = ranch.revenue + lindon.revenue + river.revenue;
      const profit = ranch.profit + lindon.profit + river.profit;
      const body = [
        `Utah Mountain Luxury — ${previous}`,
        '',
        `Host payouts ${money(revenue)}. Net after costs ${money(profit)}. Occupancy ${portfolioAvgOccupancy(previous, ranch.occupancy, lindon.occupancy, river.occupancy).toFixed(0)}%.`,
        `Ranch ${money(ranch.revenue)} · Lindon ${money(lindon.revenue)} · River ${money(river.revenue)}.`,
        '',
        'The full letter is on the dashboard under Report.',
        'Brandon',
      ].join('\n');
      for (const to of recipients) {
        const sent = await gmailSend(env, to, `Utah Mountain Luxury — ${previous}`, body);
        notes.push(sent.error ?? `Letter emailed to ${to}.`);
      }
      await kvPut(env, LETTER_MONTH_KEY, month);
    }
  }

  return { settings, ran: true, notes };
}
