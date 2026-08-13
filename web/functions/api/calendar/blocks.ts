import { corsJson } from '../../_lib/data';
import { loadCalendarBlocks, addCalendarBlock, deleteCalendarBlock } from '../../_lib/calendar-store';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const blocks = await loadCalendarBlocks(env);
  return corsJson(request, { blocks });
};

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const body = (await request.json()) as {
    propertyId: 'ranch' | 'lindon' | 'river';
    start: string;
    end: string;
    type?: 'maintenance' | 'owner' | 'blocked';
    note?: string;
  };
  if (!body.propertyId || !body.start || !body.end) {
    return corsJson(request, { error: 'propertyId, start, end required' }, 400);
  }
  const block = await addCalendarBlock(env, {
    propertyId: body.propertyId,
    start: body.start,
    end: body.end,
    type: body.type ?? 'blocked',
    note: body.note,
  });
  return corsJson(request, block, 201);
};

export const onRequestDelete: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return corsJson(request, { error: 'id query param required' }, 400);
  const ok = await deleteCalendarBlock(env, id);
  if (!ok) return corsJson(request, { error: 'Not found' }, 404);
  return corsJson(request, { ok: true });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
