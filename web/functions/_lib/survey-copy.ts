export const SURVEY_FROM_NAME = 'Utah Mountain Luxury';
export const SURVEY_REPLY_EMAIL = 'utahmountainluxury@gmail.com';
export const SURVEY_PHONE = '801-787-4722';

export function surveyPublicUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/stay/${encodeURIComponent(token)}`;
}

export function surveyEmailSubject(guestName: string, propertyName: string): string {
  return `${propertyName} — a few preferences before you arrive`;
}

export function surveyEmailBody(input: {
  guestName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  link: string;
}): string {
  const first = input.guestName.split(' ')[0] || input.guestName;
  return [
    `Hi ${first},`,
    '',
    `We're glad you'll be at ${input.propertyName} ${input.checkIn}–${input.checkOut}.`,
    '',
    `This short form helps us set the house for your group — arrival, rooms, coffee, and a small welcome. It takes about ten minutes. Door codes and the house guide come a few days before check-in.`,
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
}): string {
  const first = input.guestName.split(' ')[0] || input.guestName;
  return `${first} — Utah Mountain Luxury here. A short preference form for your stay at ${input.propertyName}: ${input.link}`;
}
