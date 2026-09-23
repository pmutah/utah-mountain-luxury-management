import { kvGet, kvPut } from './kv-json';
import type { SettingsEnv } from './kv';

const KV_WORK = 'agentWork';
const CLAIM_HOLD_MS = 3 * 60 * 60 * 1000;
const KEEP_DONE_MS = 45 * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 200;

export type WorkOwner = 'muse' | 'amanda' | 'co-host';

export type WorkItem = {
  key: string;
  title: string;
  status: 'claimed' | 'done';
  owner: WorkOwner;
  claimedAt: string;
  doneAt: string | null;
  result: string;
};

const OWNER_NAME: Record<WorkOwner, string> = {
  muse: 'Muse',
  amanda: 'Amanda',
  'co-host': 'Co-host',
};

export function ownerName(owner: WorkOwner): string {
  return OWNER_NAME[owner];
}

export function denverWhen(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Denver',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function normalizeWorkKey(raw: string): string {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9:._-]/g, '')
    .slice(0, 120);
  if (!key) throw new Error('key is required. Use the workKey from the yield plan, or a short slug like inquiry:guest-name.');
  return key;
}

function parseYieldKey(key: string): { propertyId: string; first: string; last: string } | null {
  const match = /^yield:(ranch|lindon|river):(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(key);
  if (!match) return null;
  return { propertyId: match[1], first: match[2], last: match[3] };
}

function isStale(item: WorkItem, now = Date.now()): boolean {
  return item.status === 'claimed' && now - new Date(item.claimedAt).getTime() > CLAIM_HOLD_MS;
}

function present(item: WorkItem) {
  const at = item.doneAt ?? item.claimedAt;
  return {
    key: item.key,
    title: item.title,
    status: item.status,
    owner: item.owner,
    ownerName: ownerName(item.owner),
    result: item.result,
    claimedAt: item.claimedAt,
    doneAt: item.doneAt,
    atDenver: denverWhen(at),
    stale: isStale(item),
  };
}

async function load(env: SettingsEnv): Promise<WorkItem[]> {
  const items = await kvGet<WorkItem[]>(env, KV_WORK, []);
  return Array.isArray(items) ? items : [];
}

async function save(env: SettingsEnv, items: WorkItem[]): Promise<void> {
  const cutoff = Date.now() - KEEP_DONE_MS;
  const kept = items
    .filter((item) => item.status === 'claimed' || (item.doneAt != null && new Date(item.doneAt).getTime() >= cutoff))
    .slice(0, MAX_ITEMS);
  await kvPut(env, KV_WORK, kept);
}

export async function listSharedWork(env: SettingsEnv, sinceDays = 14) {
  const since = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const items = await load(env);
  const open = items.filter((item) => item.status === 'claimed').map(present);
  const done = items
    .filter((item) => item.status === 'done' && item.doneAt != null && new Date(item.doneAt).getTime() >= since)
    .map(present);
  return { open, done };
}

function stopBecauseDone(item: WorkItem) {
  const who = ownerName(item.owner);
  const when = denverWhen(item.doneAt ?? item.claimedAt);
  return {
    alreadyDone: true,
    item: present(item),
    summary: `${who} already finished this ${when}.`,
    instruction: `Stop. ${who} already finished this on ${when}. ${item.result} Tell Brandon that, and do not do it again.`,
  };
}

function stopBecauseHeld(item: WorkItem) {
  const who = ownerName(item.owner);
  const when = denverWhen(item.claimedAt);
  return {
    heldByOther: true,
    item: present(item),
    summary: `${who} is already doing this.`,
    instruction: `Stop. ${who} claimed this at ${when} and is still on it. Tell Brandon ${who} has it. Do not start a second copy.`,
  };
}

export async function applySharedWork(
  env: SettingsEnv,
  actor: WorkOwner,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const action = String(args.action ?? 'list');
  const you = ownerName(actor);
  if (action === 'list') {
    const sinceDays = Math.min(45, Math.max(1, Number(args.sinceDays) || 14));
    const board = await listSharedWork(env, sinceDays);
    const key = args.key ? normalizeWorkKey(String(args.key)) : '';
    const match = key
      ? [...board.open, ...board.done].find((item) => item.key === key) ?? null
      : null;
    return {
      you,
      ...board,
      match,
      summary: board.done.length
        ? `${board.done.length} finished recently, ${board.open.length} still claimed.`
        : board.open.length
          ? `${board.open.length} claimed and not finished.`
          : 'No shared jobs yet.',
      instruction:
        'If a job is done, or another agent claimed it in the last 3 hours, do not do it. Tell Brandon who has it. Claim a job before you start, and mark it done with what you did.',
    };
  }

  const key = normalizeWorkKey(String(args.key ?? ''));
  const items = await load(env);
  const index = items.findIndex((item) => item.key === key);
  const existing = index >= 0 ? items[index] : undefined;
  const now = new Date().toISOString();

  if (action === 'claim') {
    const title = String(args.title ?? existing?.title ?? '').trim();
    if (!title) return { error: 'title is required. Say what the job is, in one line.' };
    if (existing?.status === 'done') return { you, ...stopBecauseDone(existing) };
    if (existing?.status === 'claimed' && existing.owner !== actor && !isStale(existing)) {
      return { you, ...stopBecauseHeld(existing) };
    }
    const tookOver = existing?.status === 'claimed' && existing.owner !== actor;
    const item: WorkItem = {
      key,
      title,
      status: 'claimed',
      owner: actor,
      claimedAt: now,
      doneAt: null,
      result: '',
    };
    if (index >= 0) items.splice(index, 1);
    items.unshift(item);
    await save(env, items);
    const other = existing ? ownerName(existing.owner) : '';
    return {
      you,
      claimed: true,
      item: present(item),
      summary: tookOver ? `${you} took this over from ${other}.` : `${you} claimed this.`,
      instruction: tookOver
        ? `${other} claimed this ${denverWhen(existing!.claimedAt)} and did not finish. You have it now. Mark it done with the same key when you finish.`
        : 'You have this job. When you finish, call shared_work action done with the same key and what you did.',
    };
  }

  if (action === 'done') {
    const result = String(args.result ?? '').trim();
    if (result.length < 8) {
      return { error: 'result is required. Say what you did, with the house, dates, prices, and time.' };
    }
    if (existing?.status === 'done' && existing.owner !== actor) return { you, ...stopBecauseDone(existing) };
    if (existing?.status === 'claimed' && existing.owner !== actor && !isStale(existing)) {
      return { you, ...stopBecauseHeld(existing) };
    }
    const title = String(args.title ?? existing?.title ?? key).trim();
    const item: WorkItem = {
      key,
      title,
      status: 'done',
      owner: actor,
      claimedAt: existing?.claimedAt ?? now,
      doneAt: now,
      result,
    };
    if (index >= 0) items.splice(index, 1);
    items.unshift(item);
    await save(env, items);
    return {
      you,
      done: true,
      item: present(item),
      summary: `${you} finished this ${denverWhen(now)}.`,
      instruction: 'Recorded. Muse and Amanda will both see this as done and will not repeat it.',
    };
  }

  if (action === 'release') {
    if (!existing) {
      return { you, released: false, summary: 'Nothing to release.', instruction: 'No job on that key.' };
    }
    if (existing.owner !== actor) {
      return existing.status === 'done' ? { you, ...stopBecauseDone(existing) } : { you, ...stopBecauseHeld(existing) };
    }
    items.splice(index, 1);
    await save(env, items);
    return {
      you,
      released: true,
      summary: `${you} released this claim.`,
      instruction: 'The other agent can take it now.',
    };
  }

  return { error: 'action must be list, claim, done, or release.' };
}

type YieldMoveLike = {
  propertyId: string;
  firstNight: string;
  lastNight: string;
  workKey?: string;
  taken?: ReturnType<typeof present> & { blocksRepeat: boolean } | null;
};

function coversMove(item: WorkItem, move: YieldMoveLike): boolean {
  const parsed = parseYieldKey(item.key);
  if (!parsed || parsed.propertyId !== move.propertyId) return false;
  return parsed.first <= move.firstNight && parsed.last >= move.lastNight;
}

export async function annotateYieldPlan<T extends { houses: Array<{ moves: YieldMoveLike[] }> }>(
  env: SettingsEnv,
  plan: T,
): Promise<T> {
  const items = await load(env);
  for (const house of plan.houses) {
    for (const move of house.moves) {
      const key = move.workKey || `yield:${move.propertyId}:${move.firstNight}:${move.lastNight}`;
      move.workKey = key;
      const exact = items.find((item) => item.key === key);
      const covered = items.filter((item) => coversMove(item, move));
      const match =
        exact ?? covered.find((item) => item.status === 'done') ?? covered.find((item) => item.status === 'claimed');
      if (!match) {
        move.taken = null;
        continue;
      }
      const shown = present(match);
      move.taken = { ...shown, blocksRepeat: match.status === 'done' || !shown.stale };
    }
  }
  return plan;
}
