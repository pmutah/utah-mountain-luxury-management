import type { Reservation } from './api';
import { doorCodesForStay, type PartDoorCodes } from './part-door-codes';
import { paymentLedger, isDirectSource } from './payment-ledger';
import { turnState, type CleanProgress } from './clean-progress';
import { addDays } from './market/dates';

export type Pill = { id: string; label: string; state: 'ready' | 'missing' | 'unknown' | 'na'; detail: string };

export type ArrivalStay = Pick<
  Reservation,
  'id' | 'guestName' | 'propertyId' | 'checkIn' | 'checkOut' | 'source' | 'status' | 'units' | 'surveyToken' | 'surveyCompletedAt' | 'guestTotal' | 'payments'
>;

export type ArrivalRow = {
  id: string;
  guest: string;
  house: string;
  checkIn: string;
  pills: Pill[];
};

type GuideCodes = { doorCode?: string; partDoorCodes?: PartDoorCodes };

export function arrivalBoard(input: {
  reservations: readonly ArrivalStay[];
  asOf: string;
  horizonDays?: number;
  guides?: Partial<Record<string, GuideCodes>> | null;
  progress?: readonly CleanProgress[] | null;
  photoCounts?: Record<string, number> | null;
  hideLindon?: boolean;
}): ArrivalRow[] {
  const horizon = addDays(input.asOf, input.horizonDays ?? 3);
  return input.reservations
    .filter((stay) => {
      const status = (stay.status ?? 'confirmed').toLowerCase();
      if (status === 'cancelled' || status === 'blocked') return false;
      if (input.hideLindon && stay.propertyId === 'lindon') return false;
      return stay.checkIn >= input.asOf && stay.checkIn <= horizon;
    })
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    .map((stay) => ({
      id: stay.id,
      guest: stay.guestName,
      house: stay.propertyId,
      checkIn: stay.checkIn,
      pills: pillsFor(stay, input.reservations, input),
    }));
}

function pillsFor(
  stay: ArrivalStay,
  reservations: readonly ArrivalStay[],
  input: {
    guides?: Partial<Record<string, GuideCodes>> | null;
    progress?: readonly CleanProgress[] | null;
    photoCounts?: Record<string, number> | null;
  },
): Pill[] {
  const turnDay = preparingCheckout(stay, reservations);
  const clean = cleanPill(stay, turnDay, input.progress, input.photoCounts);
  const door = doorPill(stay, input.guides);
  const portal: Pill = stay.surveyToken
    ? { id: 'portal', label: 'Portal', state: 'ready', detail: 'Stay link is minted.' }
    : { id: 'portal', label: 'Portal', state: 'missing', detail: 'No /stay link on this booking.' };
  const survey: Pill = stay.surveyCompletedAt
    ? { id: 'survey', label: 'Survey', state: 'ready', detail: 'Preference card is back.' }
    : { id: 'survey', label: 'Survey', state: 'missing', detail: 'Preference card is not completed.' };
  const pay = payPill(stay);
  const early: Pill = {
    id: 'early',
    label: 'Early',
    state: 'unknown',
    detail: 'Night-before is judged on the house calendar, not guessed here.',
  };
  return [clean, door, portal, survey, pay, early];
}

function preparingCheckout(stay: ArrivalStay, reservations: readonly ArrivalStay[]): string {
  const prior = reservations
    .filter((row) => {
      if (row.propertyId !== stay.propertyId || row.id === stay.id) return false;
      const status = (row.status ?? 'confirmed').toLowerCase();
      return status !== 'cancelled' && status !== 'blocked' && row.checkOut <= stay.checkIn;
    })
    .sort((a, b) => b.checkOut.localeCompare(a.checkOut))[0];
  return prior?.checkOut ?? stay.checkIn;
}

function cleanPill(
  stay: ArrivalStay,
  turnDay: string,
  progress: readonly CleanProgress[] | null | undefined,
  photos: Record<string, number> | null | undefined,
): Pill {
  if (!progress) return { id: 'clean', label: 'Clean', state: 'unknown', detail: 'Turn status could not be read.' };
  const house = stay.propertyId;
  if (house !== 'ranch' && house !== 'lindon' && house !== 'river') {
    return { id: 'clean', label: 'Clean', state: 'na', detail: 'No turnover on this row.' };
  }
  const state = turnState(house, turnDay, false, progress);
  const count = photos?.[`${house}:${turnDay}`];
  const photo = typeof count === 'number' ? `${count} photo${count === 1 ? '' : 's'}` : 'photo count not read';
  if (state === 'done') return { id: 'clean', label: 'Clean', state: 'ready', detail: `Turn is done. ${photo}.` };
  if (state === 'started') return { id: 'clean', label: 'Clean', state: 'missing', detail: `Turn is started. ${photo}.` };
  return { id: 'clean', label: 'Clean', state: 'missing', detail: `Turn is not started. ${photo}.` };
}

function doorPill(stay: ArrivalStay, guides: Partial<Record<string, GuideCodes>> | null | undefined): Pill {
  if (!guides) return { id: 'door', label: 'Door', state: 'unknown', detail: 'Door codes could not be read.' };
  const guide = guides[stay.propertyId];
  const plan = doorCodesForStay({
    house: stay.propertyId,
    units: stay.units,
    houseCode: guide?.doorCode ?? '',
    partCodes: guide?.partDoorCodes,
  });
  if (plan.missing) return { id: 'door', label: 'Door', state: 'missing', detail: plan.missing };
  if (plan.codes.length === 0) return { id: 'door', label: 'Door', state: 'missing', detail: 'No door code is set for this stay.' };
  return { id: 'door', label: 'Door', state: 'ready', detail: 'A code is set. It is not shown here.' };
}

function payPill(stay: ArrivalStay): Pill {
  const direct = isDirectSource(stay.source);
  if (!direct) return { id: 'pay', label: 'Balance', state: 'na', detail: 'The channel collects this stay.' };
  const ledger = paymentLedger({ source: stay.source, guestTotal: stay.guestTotal ?? null, payments: stay.payments });
  if (ledger.outstanding === null) return { id: 'pay', label: 'Balance', state: 'unknown', detail: ledger.line };
  if (ledger.paidInFull) return { id: 'pay', label: 'Balance', state: 'ready', detail: ledger.line };
  return { id: 'pay', label: 'Balance', state: 'missing', detail: ledger.line };
}
