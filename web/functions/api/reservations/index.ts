import { corsJson } from '../../_lib/data';
import {
  getAllReservations,
  createReservation,
  filterReservations,
} from '../../_lib/reservations-store';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const propertyId = url.searchParams.get('propertyId') as 'ranch' | 'lindon' | 'river' | null;
  const when = url.searchParams.get('when') as 'upcoming' | 'current' | 'past' | null;

  let list = await getAllReservations(env);
  if (propertyId || when) {
    list = filterReservations(list, {
      propertyId: propertyId ?? undefined,
      when: when ?? undefined,
    });
  }
  return corsJson(request, { reservations: list });
};

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const body = (await request.json()) as {
    guestName: string;
    propertyId: 'ranch' | 'lindon' | 'river';
    checkIn: string;
    checkOut: string;
    payout?: number;
    source?: string;
    note?: string;
    status?: 'confirmed' | 'blocked';
  };

  if (!body.propertyId || !body.checkIn || !body.checkOut) {
    return corsJson(request, { error: 'propertyId, checkIn, checkOut required' }, 400);
  }

  const item = await createReservation(env, {
    guestName: body.guestName ?? 'Guest',
    propertyId: body.propertyId,
    checkIn: body.checkIn,
    checkOut: body.checkOut,
    payout: Number(body.payout ?? 0),
    source: body.source ?? 'Direct',
    note: body.note,
    status: body.status ?? 'confirmed',
  });
  return corsJson(request, item, 201);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
