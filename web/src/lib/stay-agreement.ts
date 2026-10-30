import type { HouseId } from './market/types';

function topics(house: string): string {
  if (house === 'river') return 'occupancy, damage, the river, and a release';
  if (house === 'ranch') return 'occupancy, damage, the hot tub, and a release';
  return 'occupancy, damage, and a release';
}

/** What the stay agreement covers. Reading the rules does not sign it. */
export function agreementLine(house: HouseId | string, where: 'page' | 'phone' | 'paper'): string {
  const close =
    where === 'phone'
      ? 'This phone does not sign it.'
      : where === 'paper'
        ? 'This paper does not sign it.'
        : 'This page does not create that agreement.';
  return `The stay agreement covers ${topics(house)}. Reading the house rules does not sign it. ${close}`;
}

/** A request note records that the agreement was not signed. This does not send the request. */
export function agreementNote(house: HouseId): string {
  return `Stay agreement not signed. It covers ${topics(house)}.`;
}

/** The nightly brief covers every house. Nothing here signs the agreement. */
export function agreementBrief(): string {
  return 'The stay agreement covers occupancy, damage, the hot tub, the river, and a release. Reading the house rules does not sign it. Nothing here signs it.';
}
