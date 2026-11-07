import type { CleanLang } from './clean';
import type { HouseId } from './luxury';
import { turnWindow, type TurnClock } from './turn-clock';

export type LoadJob = {
  house: HouseId;
  houseName: string;
  checkout: string;
  clock: TurnClock;
};

const ORDER: HouseId[] = ['river', 'ranch', 'lindon'];

function shortDate(iso: string, lang: CleanLang): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function listNames(names: string[], lang: CleanLang): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return lang === 'es' ? `${names[0]} y ${names[1]}` : `${names[0]} and ${names[1]}`;
  const head = names.slice(0, -1).join(', ');
  const last = names[names.length - 1];
  return lang === 'es' ? `${head} y ${last}` : `${head}, and ${last}`;
}

function overlaps(left: { start: number; end: number }, right: { start: number; end: number }): boolean {
  return left.start < right.end && right.start < left.end;
}

function dayLine(
  when: string,
  label: string,
  houses: number,
  locked: number,
  clash: boolean,
  canyon: boolean,
  lang: CleanLang,
): string {
  const tail = lang === 'es' ? 'No se reservó ni se envió nada.' : 'Nothing was booked or sent.';
  if (lang === 'es') {
    if (locked >= 2 && clash) {
      return `${when}: ${label} salen el mismo día, y las limpiezas del mismo día se cruzan. Una persona no puede cubrir esas limpiezas. ${tail}`;
    }
    if (locked >= 2 && canyon) {
      return `${when}: ${label} salen el mismo día. Esas limpiezas no son una sola ruta. El camino por el cañón de Provo no está en el reloj. ${tail}`;
    }
    if (locked >= 2) {
      return `${when}: ${label} salen el mismo día. Las limpiezas del mismo día caben una después de la otra. ${tail}`;
    }
    if (locked === 1) {
      const other = houses === 2 ? 'La otra limpieza puede esperar.' : 'Las otras limpiezas pueden esperar.';
      return `${when}: ${label} salen el mismo día. Una es el mismo día. ${other} ${tail}`;
    }
    return `${when}: ${label} salen el mismo día. Ningún huésped regresa ese día, así que esas limpiezas pueden esperar. ${tail}`;
  }
  if (locked >= 2 && clash) {
    return `${when}: ${label} check out the same day, and the same-day turns overlap. One person cannot cover those turns. ${tail}`;
  }
  if (locked >= 2 && canyon) {
    return `${when}: ${label} check out the same day. Those turns are not one route. The drive up Provo Canyon is not in the clock. ${tail}`;
  }
  if (locked >= 2) {
    return `${when}: ${label} check out the same day. The same-day turns fit one after the other. ${tail}`;
  }
  if (locked === 1) {
    const other = houses === 2 ? 'The other clean can wait.' : 'The other cleans can wait.';
    return `${when}: ${label} check out the same day. One is a same-day turn. ${other} ${tail}`;
  }
  return `${when}: ${label} check out the same day. No guest returns that day, so those cleans can wait. ${tail}`;
}

/** Days when two houses check out together. Names of guests stay off the line. */
export function turnLoad(jobs: readonly LoadJob[], lang: CleanLang = 'en'): { date: string; line: string }[] {
  const byDate = new Map<string, Map<HouseId, LoadJob>>();
  for (const job of jobs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(job.checkout)) continue;
    const day = byDate.get(job.checkout) ?? new Map<HouseId, LoadJob>();
    const kept = day.get(job.house);
    if (!kept || (job.clock.sameDay && !kept.clock.sameDay)) day.set(job.house, job);
    byDate.set(job.checkout, day);
  }
  const lines: { date: string; line: string }[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const houses = [...byDate.get(date)!.values()].sort((a, b) => ORDER.indexOf(a.house) - ORDER.indexOf(b.house));
    if (houses.length < 2) continue;
    const windows = houses.map((job) => turnWindow(job.clock)).filter((window) => window != null);
    const canyon = houses.some((job) => job.house === 'river') && houses.some((job) => job.house !== 'river');
    let clash = false;
    for (let i = 0; i < windows.length; i += 1) {
      for (let j = i + 1; j < windows.length; j += 1) {
        if (overlaps(windows[i]!, windows[j]!)) clash = true;
      }
    }
    lines.push({
      date,
      line: dayLine(
        shortDate(date, lang),
        listNames(houses.map((job) => job.houseName), lang),
        houses.length,
        windows.length,
        clash,
        canyon,
        lang,
      ),
    });
  }
  return lines;
}

function canyonLine(when: string, lang: CleanLang): string {
  if (lang === 'es') {
    return `${when}: La Casa del Río es un viaje aparte por el cañón de Provo. De noviembre a abril ese camino se puede helar de noche. El reloj no incluye ese camino. No se reservó ni se envió nada.`;
  }
  return `${when}: The River House is a separate trip up Provo Canyon. From November to April that canyon road can ice up at night. The clock does not include that drive. Nothing was booked or sent.`;
}

const CANYON_NAME: Record<HouseId, { en: string; es: string }> = {
  river: { en: 'The River House', es: 'La Casa del Río' },
  ranch: { en: 'The Ranch House', es: 'La Casa del Rancho' },
  lindon: { en: 'The Lindon House', es: 'La Casa de Lindon' },
};

/** Canyon days from checkout mornings. An unread list does not claim there is no such day. */
export function canyonFromTurns(
  turns: readonly { house: string; checkOut: string }[] | null,
  lang: CleanLang = 'en',
): { date: string; line: string }[] {
  if (!turns) return canyonDesk([], lang, true);
  const jobs: LoadJob[] = [];
  for (const turn of turns) {
    if (turn.house !== 'river' && turn.house !== 'ranch' && turn.house !== 'lindon') continue;
    jobs.push({
      house: turn.house,
      houseName: CANYON_NAME[turn.house][lang],
      checkout: turn.checkOut,
      clock: { sameDay: false, leaveAt2: false, arriveAt1: false },
    });
  }
  return canyonDesk(jobs, lang);
}

/** A day that mixes the canyon with Lindon. An unread list does not claim there is no such day. The clock line is unchanged. */
export function canyonDesk(jobs: readonly LoadJob[], lang: CleanLang = 'en', unread = false): { date: string; line: string }[] {
  if (unread) {
    const line =
      lang === 'es'
        ? 'No se pudo leer la lista de salidas. Esta línea no dice si el cañón de Provo y Lindon comparten un día. No se reservó ni se envió nada.'
        : 'The turnover list could not be read. This line does not say whether Provo Canyon and Lindon share a day. Nothing was booked or sent.';
    return [{ date: '', line }];
  }
  const byDate = new Map<string, Set<HouseId>>();
  for (const job of jobs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(job.checkout)) continue;
    const day = byDate.get(job.checkout) ?? new Set<HouseId>();
    day.add(job.house);
    byDate.set(job.checkout, day);
  }
  const rows: { date: string; line: string }[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const houses = [...(byDate.get(date) ?? [])];
    if (!houses.includes('river') || !houses.some((house) => house !== 'river')) continue;
    rows.push({ date, line: canyonLine(shortDate(date, lang), lang) });
  }
  if (rows.length > 0) return rows;
  const standing =
    lang === 'es'
      ? 'Ningún día de esta lista mezcla el cañón de Provo con Lindon. El reloj dice si dos limpiezas caben. No se reservó ni se envió nada.'
      : 'No day on this desk mixes Provo Canyon with Lindon. The clock is what says whether two turns fit. Nothing was booked or sent.';
  return [{ date: '', line: standing }];
}
