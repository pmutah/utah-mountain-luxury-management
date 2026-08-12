import { RESERVATIONS } from './data';
import { resolveIcalPayout, findSeedStay } from './reservation-match';
import { parseIcalSummary, resolveIcalSource } from './ical-summary';
import { kvPut, newId } from './kv-json';
import type { SettingsEnv } from './kv';
import type { ICalEvent, PropertyId, ReservationRecord, ReservationStatus } from './agent/types';
import {
  getAllReservations,
  loadCustomReservations,
  loadReservationOverrides,
} from './reservations-store';
import { ensureTurnoverCleaningExpenses } from './expenses';

export interface IcalReservationSyncResult {
  created: number;
  updated: number;
  linkedToSeed: number;
  cancelled: number;
  cleaningExpenses: number;
}

function findSeedIdByIcalUid(
  overrides: Record<string, Partial<ReservationRecord>>,
  uid: string,
): string | undefined {
  return Object.entries(overrides).find(([, o]) => o.icalUid === uid)?.[0];
}

function findFuzzySeed(ev: ICalEvent, guestName: string) {
  if (!ev.propertyId) return undefined;
  return findSeedStay(ev.propertyId, guestName, ev.start, ev.end);
}

/** Apply Hospitable iCal events to the website reservation calendar. */
export async function syncReservationsFromIcal(
  env: SettingsEnv,
  events: ICalEvent[],
): Promise<IcalReservationSyncResult> {
  const stats: IcalReservationSyncResult = {
    created: 0,
    updated: 0,
    linkedToSeed: 0,
    cancelled: 0,
    cleaningExpenses: 0,
  };

  const custom = await loadCustomReservations(env);
  const overrides = await loadReservationOverrides(env);
  const activeUids = new Set(events.map((e) => e.uid));

  for (const ev of events) {
    if (!ev.propertyId) continue;

    const { guestName, blocked } = parseIcalSummary(ev.summary, ev.description);
    const seedHint = findFuzzySeed(ev, guestName);
    const source = resolveIcalSource(
      ev.summary,
      ev.description,
      undefined,
      seedHint?.source,
    );
    const status: ReservationStatus = blocked ? 'blocked' : 'confirmed';
    const patch: Partial<ReservationRecord> = {
      guestName,
      propertyId: ev.propertyId,
      checkIn: ev.start,
      checkOut: ev.end,
      source,
      status,
      icalUid: ev.uid,
    };

    const customIdx = custom.findIndex((r) => r.icalUid === ev.uid);
    if (customIdx >= 0) {
      const prev = custom[customIdx]!;
      custom[customIdx] = {
        ...prev,
        ...patch,
        source: resolveIcalSource(ev.summary, ev.description, prev.source, seedHint?.source),
        payout: resolveIcalPayout(ev, guestName, prev.payout),
      };
      stats.updated++;
      continue;
    }

    const linkedSeedId = findSeedIdByIcalUid(overrides, ev.uid);
    if (linkedSeedId) {
      const seedRow = RESERVATIONS.find((r) => r.id === linkedSeedId);
      overrides[linkedSeedId] = {
        ...overrides[linkedSeedId],
        ...patch,
        source: resolveIcalSource(
          ev.summary,
          ev.description,
          overrides[linkedSeedId]?.source,
          seedRow?.source,
        ),
        payout: resolveIcalPayout(
          ev,
          guestName,
          overrides[linkedSeedId]?.payout ?? seedRow?.payout,
        ),
      };
      stats.updated++;
      continue;
    }

    const seedMatch = findFuzzySeed(ev, guestName);
    if (seedMatch) {
      overrides[seedMatch.id] = {
        ...overrides[seedMatch.id],
        ...patch,
        source: resolveIcalSource(
          ev.summary,
          ev.description,
          overrides[seedMatch.id]?.source,
          seedMatch.source,
        ),
        payout: resolveIcalPayout(ev, guestName, seedMatch.payout),
      };
      stats.linkedToSeed++;
      continue;
    }

    custom.push({
      id: newId('res'),
      guestName,
      propertyId: ev.propertyId as PropertyId,
      checkIn: ev.start,
      checkOut: ev.end,
      payout: resolveIcalPayout(ev, guestName, 0),
      source,
      status,
      icalUid: ev.uid,
      createdAt: new Date().toISOString(),
    });
    stats.created++;
  }

  for (let i = 0; i < custom.length; i++) {
    const r = custom[i]!;
    if (r.icalUid && !activeUids.has(r.icalUid) && r.status !== 'cancelled') {
      custom[i] = { ...r, status: 'cancelled' };
      stats.cancelled++;
    }
  }

  for (const [id, o] of Object.entries(overrides)) {
    if (o.icalUid && !activeUids.has(o.icalUid) && o.status !== 'cancelled') {
      overrides[id] = { ...o, status: 'cancelled' };
      stats.cancelled++;
    }
  }

  await kvPut(env, 'reservations', custom);
  await kvPut(env, 'reservationOverrides', overrides);

  const all = await getAllReservations(env);
  stats.cleaningExpenses = await ensureTurnoverCleaningExpenses(env, all);
  return stats;
}
