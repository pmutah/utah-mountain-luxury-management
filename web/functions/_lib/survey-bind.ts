import type { PropertyId, ReservationRecord } from './agent/types';
import { confirmationCodeInHaystack, normalizeConfirmationCode } from './survey-fields';
import { createReservation, getAllReservations, updateReservation } from './reservations-store';
import type { SettingsEnv } from './kv';

/** Hospitable can resolve these codes even when UML seed is missing the stay. */
export const KNOWN_CONFIRMATION_STAYS: Array<{
  confirmationCode: string;
  id: string;
  guestName: string;
  propertyId: PropertyId;
  checkIn: string;
  checkOut: string;
  payout: number;
  source: string;
  note: string;
}> = [
  {
    confirmationCode: 'HMB9PP5E8F',
    id: 'rh-trisha',
    guestName: 'Trisha Jones',
    propertyId: 'river',
    checkIn: '2026-12-28',
    checkOut: '2027-01-02',
    payout: 0,
    source: 'Airbnb',
    /*
     * The guest's phone number used to sit here as a literal. This repository is **public**, so that put a
     * real guest's number on GitHub — and it bought nothing: the stay is booked in production, so the
     * number is already on the reservation row in the store, which is where a contact belongs.
     *
     * The fallback below now reads the phone from the stored stay and never invents one for a stay that
     * does not exist. A host adds the number on the booking when it is missing; this file does not carry it.
     */
    note: 'HMB9PP5E8F · 16 adults · River VIP · Dec 28 2026–Jan 2 2027',
  },
];

export function reservationMatchesCode(stay: ReservationRecord, code: string): boolean {
  const needle = normalizeConfirmationCode(code);
  if (!needle) return false;
  if (normalizeConfirmationCode(stay.confirmationCode) === needle) return true;
  if (normalizeConfirmationCode(stay.id) === needle) return true;
  return confirmationCodeInHaystack(
    [stay.confirmationCode, stay.note, stay.id, stay.guestName].filter(Boolean).join(' '),
    needle,
  );
}

export function findReservationByCode(
  stays: ReservationRecord[],
  code: string,
): ReservationRecord | undefined {
  const needle = normalizeConfirmationCode(code);
  if (!needle) return undefined;
  return (
    stays.find((s) => normalizeConfirmationCode(s.confirmationCode) === needle) ??
    stays.find((s) => reservationMatchesCode(s, needle))
  );
}

function knownStayForCode(code: string) {
  const needle = normalizeConfirmationCode(code);
  return KNOWN_CONFIRMATION_STAYS.find((s) => normalizeConfirmationCode(s.confirmationCode) === needle);
}

function matchesKnownStay(stay: ReservationRecord, known: (typeof KNOWN_CONFIRMATION_STAYS)[number]) {
  return (
    stay.id === known.id ||
    (stay.propertyId === known.propertyId &&
      stay.checkIn === known.checkIn &&
      stay.checkOut === known.checkOut &&
      stay.guestName.toLowerCase().includes(known.guestName.split(' ')[0]!.toLowerCase()))
  );
}

export async function resolveStayForSurvey(
  env: SettingsEnv,
  input: {
    reservationId?: string;
    confirmationCode?: string;
  },
): Promise<ReservationRecord | null> {
  const all = await getAllReservations(env);
  if (input.reservationId) {
    const byId = all.find((r) => r.id === input.reservationId);
    if (byId) {
      const code = normalizeConfirmationCode(input.confirmationCode || byId.confirmationCode);
      if (code && normalizeConfirmationCode(byId.confirmationCode) !== code) {
        return updateReservation(env, byId.id, { confirmationCode: code });
      }
      return byId;
    }
  }

  const code = normalizeConfirmationCode(input.confirmationCode);
  if (code) {
    const existing = findReservationByCode(all, code);
    if (existing) {
      if (normalizeConfirmationCode(existing.confirmationCode) !== code) {
        return updateReservation(env, existing.id, { confirmationCode: code });
      }
      return existing;
    }

    const known = knownStayForCode(code);
    if (known) {
      const fuzzy = all.find((s) => matchesKnownStay(s, known));
      if (fuzzy) {
        /*
         * The stored phone is kept; nothing is filled in from this file. If the stay has no number, it stays
         * that way and a host adds it on the booking — better than a hardcoded number in a public repository.
         */
        return updateReservation(env, fuzzy.id, {
          confirmationCode: known.confirmationCode,
          ...(fuzzy.guestPhone ? { guestPhone: fuzzy.guestPhone } : {}),
          note: fuzzy.note || known.note,
        });
      }
      return createReservation(env, {
        guestName: known.guestName,
        propertyId: known.propertyId,
        checkIn: known.checkIn,
        checkOut: known.checkOut,
        payout: known.payout,
        source: known.source,
        // No phone: this file does not hold guest contacts, and a stay can be created without one.
        note: known.note,
        confirmationCode: known.confirmationCode,
        status: 'confirmed',
      });
    }
  }

  return null;
}
