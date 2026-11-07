import { PROPERTIES } from './api';
import { arriveReadyExtra } from './arrive-ready';
import { houseStay } from './house-stay';
import type { HouseId } from './market/types';

export type StayIcs = { filename: string; text: string };

function icsClock(label: string): string | null {
  const match = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem = match[3]!.toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}${minute}00`;
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

/** A calendar file for these dates. It does not hold the nights or quote a price. */
export function stayIcs(house: HouseId, checkIn: string, checkOut: string): StayIcs | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) return null;
  const stay = houseStay(house);
  const start = icsClock(stay.checkIn);
  const end = icsClock(stay.checkOut);
  if (!start || !end) return null;
  const name = PROPERTIES[house].name;
  const address = PROPERTIES[house].address;
  const extra = arriveReadyExtra(house);
  const leaving = stay.checkout.filter((step) => step.trim().length > 0 && !/door\s*code|wi-?fi|password|\$/i.test(step)).join(' ');
  const description = `Check-in is ${stay.checkIn}. Checkout is ${stay.checkOut}. ${extra ? `${extra} These steps are from the published guide. ` : ''}${leaving ? `Before leaving: ${leaving} ` : ''}This does not hold the dates. This does not say the house is open. Nothing is sent.`;
  if (description.includes('$') || /door\s*code|wi-?fi|password/i.test(`${description} ${address}`)) return null;
  const stamp = `${checkIn.replace(/-/g, '')}T000000Z`;
  const text = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Utah Mountain Luxury//Stay//EN',
    'BEGIN:VEVENT',
    `UID:uml-${house}-${checkIn}-${checkOut}@wilhite`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=America/Denver:${checkIn.replace(/-/g, '')}T${start}`,
    `DTEND;TZID=America/Denver:${checkOut.replace(/-/g, '')}T${end}`,
    `SUMMARY:${icsEscape(`${name} is not booked`)}`,
    'STATUS:TENTATIVE',
    `LOCATION:${icsEscape(address)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  return { filename: `${house}-${checkIn}.ics`, text };
}

/** A calendar file for the stay already on this phone. It does not change the reservation. */
export function phoneStayIcs(house: HouseId, checkIn: string, checkOut: string): StayIcs | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut) || checkOut <= checkIn) return null;
  const stay = houseStay(house);
  const start = icsClock(stay.checkIn);
  const end = icsClock(stay.checkOut);
  if (!start || !end) return null;
  const name = PROPERTIES[house].name;
  const address = PROPERTIES[house].address;
  const extra = arriveReadyExtra(house);
  const leaving = stay.checkout.filter((step) => step.trim().length > 0 && !/door\s*code|wi-?fi|password|\$/i.test(step)).join(' ');
  const description = `Check-in is ${stay.checkIn}. Checkout is ${stay.checkOut}. ${extra ? `${extra} These steps are from the published guide. ` : ''}${leaving ? `Before leaving: ${leaving} ` : ''}This file is the stay on this phone. It does not change the reservation. Nothing is sent.`;
  if (description.includes('$') || /door\s*code|wi-?fi|password/i.test(`${description} ${address}`) || /\bis open\b/i.test(description)) return null;
  const stamp = `${checkIn.replace(/-/g, '')}T000000Z`;
  const text = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Utah Mountain Luxury//Stay//EN',
    'BEGIN:VEVENT',
    `UID:uml-phone-${house}-${checkIn}-${checkOut}@wilhite`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=America/Denver:${checkIn.replace(/-/g, '')}T${start}`,
    `DTEND;TZID=America/Denver:${checkOut.replace(/-/g, '')}T${end}`,
    `SUMMARY:${icsEscape(name)}`,
    `LOCATION:${icsEscape(address)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  return { filename: `${house}-${checkIn}-stay.ics`, text };
}
