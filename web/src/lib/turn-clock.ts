import type { CleanLang } from './clean';

export type TurnClock = {
  sameDay: boolean;
  /** The checkout named a 2:00 PM leave. */
  leaveAt2: boolean;
  /** The next stay named a 1:00 PM arrival. */
  arriveAt1: boolean;
};

/** Hours on the clean. A same-day 1:00 PM arrival blocks a 2:00 PM leave. */
export function turnHours(input: TurnClock, lang: CleanLang = 'en'): { hours: number | null; text: string } {
  if (!input.sameDay) {
    if (input.leaveAt2) {
      return {
        hours: null,
        text:
          lang === 'es'
            ? 'La limpieza empieza a las 2:00 PM. El siguiente huésped no llega el mismo día.'
            : 'The clean starts at 2:00 PM. The next guest is not the same day.',
      };
    }
    return {
      hours: null,
      text: lang === 'es' ? 'El siguiente huésped no llega el mismo día.' : 'The next guest is not the same day.',
    };
  }
  const early = input.arriveAt1;
  const late = input.leaveAt2 && !input.arriveAt1;
  const hours = early || late ? 2 : 5;
  if (lang === 'es') {
    if (early) return { hours, text: '2 horas, de 11:00 AM a 1:00 PM.' };
    if (late) return { hours, text: '2 horas, de 2:00 PM a 4:00 PM.' };
    return { hours, text: '5 horas, de 11:00 AM a 4:00 PM.' };
  }
  if (early) return { hours, text: '2 hours, from 11:00 AM to 1:00 PM.' };
  if (late) return { hours, text: '2 hours, from 2:00 PM to 4:00 PM.' };
  return { hours, text: '5 hours, from 11:00 AM to 4:00 PM.' };
}

/** Minutes from midnight for a same-day clean. A later guest has no locked window. */
export function turnWindow(input: TurnClock): { start: number; end: number } | null {
  if (!input.sameDay) return null;
  const early = input.arriveAt1;
  const late = input.leaveAt2 && !input.arriveAt1;
  if (early) return { start: 11 * 60, end: 13 * 60 };
  if (late) return { start: 14 * 60, end: 16 * 60 };
  return { start: 11 * 60, end: 16 * 60 };
}

/** A booking note names the 1:00 PM arrival. The rest of the note stays off the clock. */
export function noteArrivesAt1(note: string | null | undefined): boolean {
  return (note ?? '').includes('Arrive at 1:00 PM');
}

/** A booking note names the 2:00 PM leave. The rest of the note stays off the clock. */
export function noteLeavesAt2(note: string | null | undefined): boolean {
  return (note ?? '').includes('Leave at 2:00 PM');
}

/** A preference card that names 11:00 AM or 2:00 PM wins. Otherwise the booking note counts. */
export function jobLeaveAt2(preference: string | null | undefined, noteSays2: boolean): boolean {
  if (preference === '2:00 PM') return true;
  if (preference === '11:00 AM') return false;
  return noteSays2;
}

/** The same-day checkbox uses the clock. Other steps keep their own label. */
export function stepText(stepId: string, langLabel: string, clockText: string): string {
  return stepId === 'window' ? clockText : langLabel;
}

/** The standing clock when no stay can be read. It does not say anyone asked. */
export function standingTurnLine(lang: CleanLang): string {
  const standard = turnHours({ sameDay: true, leaveAt2: false, arriveAt1: false }, lang);
  const early = turnHours({ sameDay: true, leaveAt2: false, arriveAt1: true }, lang);
  const late = turnHours({ sameDay: true, leaveAt2: true, arriveAt1: false }, lang);
  if (lang === 'es') {
    return `Una limpieza el mismo día: ${standard.text} Una llegada a la 1:00 PM la deja en ${early.hours} horas. Una salida a las 2:00 PM antes de una llegada a las 4:00 PM la deja en ${late.hours} horas. Esta tarjeta no dice que alguien lo pidió.`;
  }
  return `A same-day turn is ${standard.text} A 1:00 PM arrival makes it ${early.hours} hours. A 2:00 PM leave before a 4:00 PM arrival makes it ${late.hours} hours. This card does not say that anyone asked.`;
}
