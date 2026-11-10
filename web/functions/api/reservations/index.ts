import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { RIVER_UNITS } from '../../../src/lib/river-units';
import { readJsonBody } from '../../_lib/json-body';
import { storageReadPaused } from '../../_lib/kv-json';
import {
  getAllReservations,
  createReservation,
  filterReservations,
} from '../../_lib/reservations-store';
import type { AgentEnv } from '../../_lib/agent/types';
import { readOrRefuse } from '../../_lib/read-guard';
import { refreshIcalInBackground } from '../../_lib/ical-refresh';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env, waitUntil }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  /*
   * Keep the calendar fresh on a page load. Airbnb and VRBO deliveries only arrived when someone
   * pressed sync, so a host who did not press it read a calendar that could be days old â€” and a
   * booked night that still reads open is a double booking. This runs after the response, never
   * before it, and never twice in one request.
   */
  refreshIcalInBackground(env, { waitUntil });
  const url = new URL(request.url);
  const propertyId = url.searchParams.get('propertyId') as 'ranch' | 'lindon' | 'river' | null;
  const when = url.searchParams.get('when') as 'upcoming' | 'current' | 'past' | null;

  let list;
  try {
    list = await getAllReservations(env);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, {
        reservations: [],
        storageReads: 'paused',
        error: 'Saved bookings could not be read. Nothing was written over them.',
      });
    }
    const message = err instanceof Error ? err.message : 'Bookings failed';
    return corsJson(request, { error: message }, 500);
  }
  if (propertyId || when) {
    list = filterReservations(list, {
      propertyId: propertyId ?? undefined,
      when: when ?? undefined,
    });
  }
  return corsJson(request, { reservations: list, storageReads: 'ok' });
};

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const parsed = await readJsonBody<{
    guestName: string;
    propertyId: 'ranch' | 'lindon' | 'river';
    checkIn: string;
    checkOut: string;
    payout?: number;
    /** What the guest paid for this house, before tax. Absent when it is not known. */
    guestTotal?: number;
    source?: string;
    note?: string;
    status?: 'confirmed' | 'blocked';
    guestEmail?: string;
    guestPhone?: string;
    confirmationCode?: string;
    /**
     * Which parts of the Riverhouse this stay occupies.
     *
     * Absent means the whole house — the conservative reading every existing stay relies on. But a host who is
     * recording a part sale has to be able to say which part, because a booking with no `units` blocks all three.
     */
    units?: string[];
  }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  if (!body.propertyId || !body.checkIn || !body.checkOut) {
    return corsJson(request, { error: 'propertyId, checkIn, checkOut required' }, 400);
  }

  const read = await readOrRefuse(
    request,
    () =>
      createReservation(env, {
        guestName: body.guestName ?? 'Guest',
        propertyId: body.propertyId,
        checkIn: body.checkIn,
        checkOut: body.checkOut,
        payout: Number(body.payout ?? 0),
        // Only when it is a real figure. A missing or zero value records nothing rather than
        // claiming the guest paid nothing.
        ...(typeof body.guestTotal === 'number' && Number.isFinite(body.guestTotal) && body.guestTotal > 0
          ? { guestTotal: body.guestTotal }
          : {}),
        source: body.source ?? 'Direct',
        note: body.note,
        status: body.status ?? 'confirmed',
        guestEmail: body.guestEmail,
        guestPhone: body.guestPhone,
        confirmationCode: body.confirmationCode,
        /*
         * Parts, when the host names real ones and this is the Riverhouse. A stray unit on the Ranch would be a
         * booking for a part that does not exist, so only names we actually sell survive. An empty list is omitted
         * entirely, because absent is what "the whole house" means everywhere else — and dropping the field silently
         * is how a part sale used to block all three parts.
         */
        ...(body.propertyId === 'river' && Array.isArray(body.units)
          ? {
              units: body.units.filter((unit): unit is string => RIVER_UNITS.includes(unit as never)),
            }
          : {}),
      }),
    'Saved bookings',
  );
  if (!read.ok) return read.response;
  return corsJson(request, read.value, 201);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);

