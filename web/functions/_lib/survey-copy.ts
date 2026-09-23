import type { SurveyVariant } from './survey-fields';

export const SURVEY_FROM_NAME = 'Utah Mountain Luxury';
export const SURVEY_REPLY_EMAIL = 'utahmountainluxury@gmail.com';
export const SURVEY_PHONE = '801-787-4722';

/** Amanda + Brandon ops notify. Extra addresses via SURVEY_NOTIFY_EMAILS (comma-separated). */
export const SURVEY_STAFF_NOTIFY_EMAILS = [
  'utahmountainluxury@gmail.com',
  'pmutah@gmail.com',
] as const;

export function surveyPublicUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/stay/${encodeURIComponent(token)}`;
}

export function surveyEmailSubject(guestName: string, propertyName: string, guideOn = false): string {
  return guideOn ? `${propertyName} — your stay guide` : `${propertyName} — a few preferences before you arrive`;
}

export function surveyEmailBody(input: {
  guestName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  link: string;
  variant?: SurveyVariant;
  guideOn?: boolean;
}): string {
  const first = input.guestName.split(' ')[0] || input.guestName;
  const minutes = input.variant === 'vip' ? 'about two minutes' : 'about ten minutes';
  return [
    `Hi ${first},`,
    '',
    `We're glad you'll be at ${input.propertyName} ${input.checkIn}–${input.checkOut}.`,
    '',
    input.guideOn
      ? `This link is your stay guide: the house, the area, restaurants, and how to reach us. Start with the short preference form (${minutes}) so we can set the house for your group. Your door code and Wi-Fi appear at the same link the day before check-in.`
      : `This short form helps us set the house for your group. It takes ${minutes}. Door codes and the house guide come a few days before check-in.`,
    '',
    input.link,
    '',
    `Reply anytime.`,
    `${SURVEY_FROM_NAME}`,
    `${SURVEY_REPLY_EMAIL} · ${SURVEY_PHONE}`,
  ].join('\n');
}

export function surveySmsBody(input: {
  guestName: string;
  propertyName: string;
  link: string;
  guideOn?: boolean;
}): string {
  const first = input.guestName.split(' ')[0] || input.guestName;
  return input.guideOn
    ? `${first} — Utah Mountain Luxury here. Your stay guide for ${input.propertyName}, with a short preference form. Door code and Wi-Fi show up here the day before check-in: ${input.link}`
    : `${first} — Utah Mountain Luxury here. A short preference form for your stay at ${input.propertyName}: ${input.link}`;
}

export function staffSurveyNotifySubject(guestName: string, propertyName: string): string {
  return `Stay card ready — ${guestName} · ${propertyName}`;
}

export function staffSurveyNotifyBody(input: {
  guestName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  cardText: string;
}): string {
  return [
    'Amanda & Brandon —',
    '',
    `${input.guestName} submitted the guest survey for ${input.propertyName} (${input.checkIn}–${input.checkOut}).`,
    '',
    'Arrival ops stay card:',
    '',
    input.cardText,
    '',
    'Open Guests → Answers in the UML dashboard to see the same card.',
  ].join('\n');
}

export function staffNotifyRecipients(env?: { SURVEY_NOTIFY_EMAILS?: string }): string[] {
  const extra = (env?.SURVEY_NOTIFY_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  return [...new Set([...SURVEY_STAFF_NOTIFY_EMAILS, ...extra])];
}
