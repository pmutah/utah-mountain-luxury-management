import { PROPERTIES } from './api';
import type { CleanLang } from './clean';
import type { HouseId } from './luxury';

const NAME: Record<HouseId, { en: string; es: string }> = {
  river: { en: 'The River House', es: 'La Casa del Río' },
  ranch: { en: 'The Ranch House', es: 'La Casa del Rancho' },
  lindon: { en: 'The Lindon House', es: 'La Casa de Lindon' },
};

function isHouse(value: string): value is HouseId {
  return value === 'river' || value === 'ranch' || value === 'lindon';
}

function canyon(house: HouseId): boolean {
  return /provo canyon|vivian park/i.test(PROPERTIES[house]?.address ?? '');
}

function joinNames(houses: readonly HouseId[], lang: CleanLang): string {
  const names = houses.map((house) => NAME[house][lang]);
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return lang === 'es' ? `${names[0]} y ${names[1]}` : `${names[0]} and ${names[1]}`;
  return lang === 'es'
    ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
    : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/** Houses with a checkout in the next two weeks. An unread list keeps the fallback. */
export function cleanRouteForTurns(
  turns: readonly { house: string }[] | null,
  fallback: readonly string[],
  lang: CleanLang = 'en',
): string {
  return cleanRoute(turns ? turns.map((turn) => turn.house) : fallback, lang);
}

/** Lindon houses share a trip. The canyon house is its own trip. No price and no guest name. */
export function cleanRoute(houses: readonly string[], lang: CleanLang = 'en'): string {
  const unique = [...new Set(houses.filter(isHouse))];
  const tail = lang === 'es' ? 'No se reservó ni se envió nada.' : 'Nothing was booked or sent.';
  if (unique.length === 0) {
    return lang === 'es' ? `No hay casas en esta ruta. ${tail}` : `No houses are on this route. ${tail}`;
  }
  const valley = unique.filter((house) => !canyon(house));
  const peak = unique.filter(canyon);
  const parts: string[] = [];
  if (valley.length >= 2) {
    const names = joinNames(valley, lang);
    parts.push(
      lang === 'es'
        ? `${names} están en Lindon, así que son un solo viaje.`
        : `${names} are both in Lindon, so they are one trip.`,
    );
  } else if (valley.length === 1) {
    const house = valley[0]!;
    parts.push(lang === 'es' ? `${NAME[house].es} está en Lindon.` : `${NAME[house].en} is in Lindon.`);
  }
  if (peak.length > 0) {
    const names = joinNames(peak, lang);
    const ice =
      lang === 'es'
        ? 'De noviembre a abril ese camino se puede helar de noche.'
        : 'From November to April that canyon road can ice up at night.';
    parts.push(
      lang === 'es'
        ? `${names} es un viaje aparte por el cañón de Provo. ${ice}`
        : `${names} is a separate trip up Provo Canyon. ${ice}`,
    );
  }
  return `${parts.join(' ')} ${tail}`;
}
